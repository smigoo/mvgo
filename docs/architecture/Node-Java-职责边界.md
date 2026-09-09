# 后端双运行时职责边界（Node ↔ Java）

> 版本：v1.0 ｜ 日期：2026-08-12
> 适用范围：mvgo 后端迁移至 Java 后的双运行时架构（Spring Boot + NestJS 共存）

---

## 1. 总体架构

mvgo 后端目前由 **两个运行时共存**：

- **Java（Spring Boot）**：`:8080`，作为**统一 API 网关 + 业务 CRUD 层**
- **Node（NestJS）**：`:13030`，作为 **AI 生成引擎 + 内存态任务执行节点**

```
┌─────────────┐
│   前端       │  :2610 (vite dev) / :80 (nginx prod)
└──────┬──────┘
       │  /api/*  （除 progress 直连 Node）
       ▼
┌─────────────────────────────────────┐
│   Java :8080  （统一入口）            │
│                                       │
│  ├─ 鉴权拦截器  SessionGuardInterceptor│
│  ├─ 统一响应信封  Result<T>            │
│  ├─ 原生 Controller（直接处理）        │
│  └─ NodeProxyController（字节级转发）  │
│            │                          │
│            │ /api/tasks, /api/config,│
│            │ /api/phase2, ...         │
│            ▼                          │
│     Node :13030                       │
└─────────────────────────────────────┘
```

### 设计原则

| 职责 | 归属 | 原因 |
|------|------|------|
| 统一入口 / 路由分发 | Java | 所有前端请求先到 Java，便于鉴权、CORS、日志、限流集中处理 |
| 请求鉴权（Token 校验） | Java | `SessionGuardInterceptor` 校验 `Token` 头并写入 `userId` |
| 统一响应格式 | Java | 所有响应包裹 `Result<T> = {code, success, data, message}` |
| 业务 CRUD（用户/组/项目/会话/技能/文档） | Java | 纯 Mongo 持久化，无 AI 依赖 |
| AI 生成管线（phase2/vue3/demo/preview） | Node | 调 LLM、文件系统落地、运行时编译，强耦合 Node 生态 |
| 内存态任务执行（tasks 运行时） | Node | 任务状态在 Node 进程内存 `Map` 中，与执行生命周期绑定 |
| SSE 进度推送（progress） | Node | 长连接流式输出，前端直连 Node |

> **关键认知**：Java 对 `tasks/config/workflows/user/...` 等模块采用**反向代理**而非**原生重写**，
> 不等于"没迁移"。这些接口的流量、鉴权、CORS、响应信封全部经过 Java，Node 只是 Java 后面的一个执行节点。
> 前端与运维视角下，API 网关是 Java。

---

## 2. Java（Spring Boot :8080）职责

### 2.1 原生处理（直接落库 / 本地逻辑）

由显式 Controller 直接处理，不经过 Node。

| Controller | 路径前缀 | 职责 |
|------------|---------|------|
| `AuthController` | `/api/auth` | 登录 / 注册 / 当前用户 / 登出 / 改密（密码 PBKDF2，零外部依赖） |
| `AdminController` | `/api/admin` | 后台用户管理 + 组件基础 CRUD（详情/创建/更新/删除/批量删除） |
| `GroupController` | `/api/group` | 业务组管理（9 端点） |
| `ProjectController` | `/api/projects` | AI 项目管理（5 端点） |
| `SessionController` | `/api/sessions` | AI 工作台会话 |
| `SkillController` | `/api/skills` | 技能管理 |
| `DocumentController` | `/api/documents` | 文档管理 |
| `ModelsController` | `/api/models` (GET) | AI 模型下拉列表（硬编码，详见 §4 边界说明） |
| `ComponentSplitController` | `/api/component-split` | 需求文档 + HTML 原型 → 组件 MD 交付包 |
| `OperationLogController` | `/api/operation-log` | 操作审计日志 |
| `HealthController` | `/api/health` | 健康检查 |

### 2.2 反向代理（转发到 Node）

由 `NodeProxyController` 做字节级转发（含请求头 / 请求体 / SSE flush），
自动剥离 `node.base-url` 的 `/api` 后缀避免路径重复。

| 代理前缀 | 落地（Node 侧） | 备注 |
|---------|----------------|------|
| `/api/tasks` | tasks 模块 | 内存 `Map` 存储，运行态 |
| `/api/config` | config 模块 | 含 AES-256-GCM 加密配置 |
| `/api/workflows` | workflows 模块 | 文件 JSON 存储 |
| `/api/user` | user 模块 | Git 凭证等（含 AES 加密） |
| `/api/token-usage` | token-usage 模块 | 聚合统计查询 |
| `/api/apifox` | apifox 模块 | OpenAPI → 代码生成 |
| `/api/screen-layout` | screen-layout 模块 | 大屏布局 |
| `/api/chat` | chat 模块 | AI 对话 |
| `/api/lite` | lite 模块 | 轻量生成（含批量） |
| `/api/page-generator` | page-generator 模块 | 页面级批量生成 |
| `/api/microcode` | microcode 模块 | 微码组件 |
| `/api/component` | component 模块 | 文件端点（本地磁盘依赖） |
| `/api/phase2` | phase2 管线 | AI 生成 |
| `/api/vue3` | vue3 管线 | AI 生成 |
| `/api/demo` | demo 管线 | AI 生成 |
| `/api/preview` | preview 管线 | AI 生成 |
| `/api/models/*` | models 模块 | 除 GET 列表外的子路径（见 §4） |
| `/api/progress` | progress 模块 | SSE 进度（经由 Java 代理转发） |

> 配置项：`mvgo.node.base-url`（默认 `http://localhost:13030`）。

---

## 3. Node（NestJS :13030）职责

Node 当前**仅作为 Java 后面的执行节点**，不再直接对前端暴露（除 dev 下 `progress` 直连）。

| 职责类别 | 模块 | 说明 |
|---------|------|------|
| AI 生成管线 | phase2 / vue3 / demo / preview | 调 LLM、组件落地、运行时编译 |
| 内存态任务执行 | tasks | 任务状态 `Map<string, Task>` + `abortControllers`，与进程绑定 |
| SSE 进度流 | progress | 生成进度实时推送 |
| 被代理的业务模块 | config / workflows / user / token-usage / apifox / screen-layout / chat / lite / page-generator / microcode / component | Java 转发，Node 实际处理（多依赖内存态 / 文件 / 加密） |

### 为什么不原生迁移这些模块到 Java

| 模块 | 技术瓶颈 | 结论 |
|------|---------|------|
| tasks | 任务状态在 Node 内存 `Map`，与执行生命周期绑定 | 代理最优；强行落 Mongo 引入双写一致性风险 |
| config / user | 含 AES-256-GCM 加密，密钥管理在 Node | 代理；重写需迁移密钥体系 |
| workflows | 文件 JSON 存储，非 Mongo | 代理；转为 Mongo 需重写存储层 |
| token-usage | 多集合聚合统计查询 | 代理；Java 重写需重建聚合管道 |
| component | 本地磁盘文件读写 | 代理；文件 IO 与 Node workspace 耦合 |

> 仅当未来需要**任务历史跨重启持久化**或**多 Node 实例负载均衡**时，才值得把 `tasks` 等重构为 Java 原生 + Mongo。

---

## 4. 路由分发矩阵（完整）

| 路径前缀 | 处理方式 | 实际落地 | 是否经 Java 鉴权 |
|---------|---------|---------|----------------|
| `/api/auth` | 原生 | Java | 登录/注册/登出/改密豁免拦截，其余校验 |
| `/api/admin` | 原生 | Java | 是 |
| `/api/group` | 原生 | Java | 是 |
| `/api/projects` | 原生 | Java | 是 |
| `/api/sessions` | 原生 | Java | 是 |
| `/api/skills` | 原生 | Java | 是 |
| `/api/documents` | 原生 | Java | 是 |
| `/api/component-split` | 原生 | Java | 是 |
| `/api/operation-log` | 原生 | Java | 是 |
| `/api/models` (GET) | 原生 | Java | 是 |
| `/api/tasks` | 代理 | Node | 是（经 Java 转发，Token 透传） |
| `/api/config` | 代理 | Node | 是 |
| `/api/workflows` | 代理 | Node | 是 |
| `/api/user` | 代理 | Node | 是 |
| `/api/token-usage` | 代理 | Node | 是 |
| `/api/apifox` | 代理 | Node | 是 |
| `/api/screen-layout` | 代理 | Node | 是 |
| `/api/chat` | 代理 | Node | 是 |
| `/api/lite` | 代理 | Node | 是 |
| `/api/page-generator` | 代理 | Node | 是 |
| `/api/microcode` | 代理 | Node | 是 |
| `/api/component` | 代理 | Node | 是 |
| `/api/phase2` | 代理 | Node | 是 |
| `/api/vue3` | 代理 | Node | 是 |
| `/api/demo` | 代理 | Node | 是 |
| `/api/preview` | 代理 | Node | 是 |
| `/api/models/*` | 代理 | Node | 是 |
| `/api/progress` | 代理（dev 直连） | Node | 是（Token 透传） |

### Spring MVC 路由优先级规则

- **精确 Controller 优先于通配代理**：`ModelsController` 的 `GET /api/models` 命中原生；
  其余 `/api/models/*` 子路径由 `NodeProxyController` 的 `/api/models/**` 代理到 Node。
- 显式 Controller（`/api/admin`、`/api/auth` 等）永远高于 `/api/**` 兜底代理。
- 新增原生端点时，若路径前缀与 `NodeProxyController.PROXY_PREFIXES` 冲突，需从代理列表移除该前缀。

---

## 5. 前端代理配置（dev 环境）

`frontend/vite.config.js` 中 `/api/*` 默认全部打到 `:8080`（Java），仅 `/api/progress` 直连 `:13030`（Node），
与"Java 统一入口"原则一致。

```
/api/progress  → :13030 (Node, SSE)
/api/*         → :8080 (Java)  → 原生 or 代理 Node
```

---

## 6. 已知问题 / 待办

| 项 | 说明 | 优先级 |
|----|------|--------|
| ~~`docker/nginx/nginx.conf` 路由过时~~ | **已修复（2026-08-12）**：已移除 `phase2/vue3/demo/preview/models` 直连 Node 的 location 块，现仅 `/api/progress` 直连 Node，其余 `/api` 全量走 Java（与 dev 一致） | 已解决 |
| `ModelsController` 与代理重叠 | `GET /api/models` 原生、其余代理，虽功能正常但易混淆，建议前端统一只调 GET 列表 | 低 |
| `tasks` 响应带 `source: "node"` | 因经代理，Node 在响应体写入来源标记。属正常现象，非漏迁 | 信息项 |
| Node 进程被沙箱回收 | 后台进程约 6 分钟回收，需手动重启 Node/Java/vite | 运维项 |

---

## 7. 一句话总结

**Java 是门面与业务层，Node 是 AI 引擎与内存态执行节点。**
除 AI 生成管线与任务运行时外，所有 `/api` 请求均由 Java 统一接管（原生或代理），前端无需感知 Node 存在。

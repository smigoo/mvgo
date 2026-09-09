# backend-node — 感智晓界 AI 引擎后端

> NestJS 11 + LangGraph + AI Engine
> 端口：**13030**
> 在 mvgo Polyrepo 架构中负责：Figma 管线、微码 / Vue3 / Lite / Max 组件生成、AI 工作区、预览渲染、SSE 进度、权限与会话。

## 技术栈

| 维度 | 选型 |
|------|------|
| 框架 | NestJS 11（`@nestjs/core`、`@nestjs/mongoose`、`@nestjs/platform-express`） |
| 语言 | TypeScript（`.ts` 编译） + 大量运行时 `.js` 模块（AI Engine，ESM 直跑） |
| AI / 编排 | LangChain（`@langchain/core`、`@langchain/openai`、`@langchain/anthropic`）+ LangGraph（`@langchain/langgraph`） |
| 数据库 | MongoDB via Mongoose；审计流水用 MongoDB |
| HTTP | Express 5 |
| 渲染 / 图像处理 | Puppeteer（高保真渲染比对）、Sharp（图片处理）、jsdom |
| 会话 / 鉴权 | express-session + connect-mongo、bcrypt |
| 其他 | axios、archiver、winston（日志）、zod、sqlite-vec、https-proxy-agent |

> **AI Engine 是 TS + JS 混合项目**：`src/ai-engine/` 下有 **113 个 `.js` 运行时模块**（全部 ESM `import/export` + `.js` 扩展名，由 Node 运行时直接 `import()` 执行，不在 `tsc` 编译范围）。这是构建脚本必须特殊处理的根本原因（见下）。

## 构建（必须用专用脚本）

```bash
cd backend-node
bash build-backend.sh
```

`build-backend.sh` 做了三件 `npx tsc` 单独做不了的事：

1. `tsc -p tsconfig.build.json` 编译所有 `.ts` → `dist/`（逐文件产物）
2. **同步 `src/**/*.js` 到 `dist/`**（AI Engine 运行时模块，Node 直接执行，不经 tsc）
3. 同步 `src/**/*.md`（Prompt 模板）到 `dist/`，并跑 **JS 语法门禁（acorn）** 拦截坏 `.js`

> ⚠️ **禁止** `npx tsc` / `nest build` 直接重建 dist：若只编 `.ts` 不同步 `.js`，运行时 `import('ai-engine/...')` 会 `ERR_MODULE_NOT_FOUND` 导致进程崩溃。
> ⚠️ **tsc 增量缓存陷阱**：`tsconfig.build.tsbuildinfo` 在 `backend-node/` 根目录。沙箱/手动清掉 `dist/` 后若不删此文件，tsc 增量模式判定"无变更"会跳过 emit、不生成 `dist/main.js`。清缓存：`rm -f tsconfig.build.tsbuildinfo && bash build-backend.sh`。

## 启动

```bash
# 方式一（推荐，setsid + 双 fork，彻底脱离 shell 会话，避免被工具回收 SIGKILL）
bash .start-server.sh

# 方式二（前台，便于看日志 / 调试）
NODE_ENV=development DEV_AUTO_LOGIN=true PORT=13030 node dist/main.js
```

- `process.cwd()` 即 `backend-node/` 目录，代码中所有相对路径以此为根。
- 管理 Node：`lsof -ti:13030` 查占用；`.start-server.sh` 启动前会强杀 13030 旧进程。
- 日志：`.start-server.sh` 写到 `server.log`；运行时业务日志按日滚动在 `logs/app-YYYY-MM-DD.log`。

## 环境变量

配置文件（`.gitignore` 忽略，严禁入库）：`.env`（基础）→ `.env.development` / `.env.production`（按 `NODE_ENV` 覆盖）。提供了 `.env.example` / `.env.development.example` / `.env.production.example` 模板。

| 变量 | 说明 |
|------|------|
| `NODE_ENV` | `development` / `production` |
| `MONGODB_URI` | MongoDB 连接串（本地产 `mongodb://localhost:27017/langgraph-server`） |
| `JAVA_BACKEND_URL` | Java 后端地址（审计日志 fire-and-forget 上报目标），如 `http://localhost:8080/api` |
| `SESSION_SECRET` | Session 密钥 |
| `DEV_AUTO_LOGIN` | 开发态免登录旁路（`true` 时任意 `Token` 头自动建本地身份 `dev-local`）；`production` 强制忽略 |
| `DEFAULT_ADMIN_UIDS` | 系统管理员白名单（逗号分隔门户 uid），如 `dev-local`；仅白名单/用户 `isAdmin` 可进管理视图 |
| `FRONTEND_WORKSPACE` | 前端 workspace 绝对路径；生产需设，开发默认 `../frontend/workspace` |
| `PERMISSION_SOURCE` | `node`（默认，本地 GroupMember 权限）/ `qs`（QS 门户权限中心） |
| `PORTAL_BASE_URL` | 门户 API 基准地址（token 校验 / 权限中心拼接） |
| `FIGMA_MIN_INTERVAL_MS` / `FIGMA_MAX_CONCURRENCY` / `FIGMA_COOLDOWN_BASE_SEC` | Figma API 速率限制（避免 429 限流） |
| `MAX_ITERATIONS` / `MIN_ITERATIONS` / `QUALITY_SCORE_THRESHOLD` / `VISUAL_SIMILARITY_THRESHOLD` | Phase2 Max 档高保真还原调优（生成→Puppeteer 渲染→比对→refiner 修正） |
| `OPERATION_LOG_ENABLED` / `OPERATION_LOG_SKIP_PATHS` | 操作日志审计开关与跳过路径 |

> 安全红线：`DEV_AUTO_LOGIN=true`、明文密钥**绝不**进入 `production` 配置或提交。

## 项目结构

```
backend-node/
├── src/
│   ├── main.ts                 # 入口（全局拦截器：响应信封 / source / 操作日志审计）
│   ├── app.module.ts           # 根模块（装配所有子模块）
│   ├── ai-engine/              # AI 引擎（113 个 .js 运行时模块，ESM 直跑）
│   │   ├── roles/              #   管线角色：figma-connector / visual-parser / microcode-engineer / vue3-engineer / ...
│   │   ├── agents/             #   base-agent 及 doc-analyzer / config-generator 等（加载 backend-node/prompts/*.md）
│   │   ├── graphs/             #   LangGraph 管线图
│   │   ├── validators/         #   declare-json-schema-validator 等确定性校验
│   │   └── utils/              #   工具函数
│   ├── ai-engine-v2/           # v2 管线（/api/v2 流水线式组件生成，含 code-structure-validator 节点）
│   ├── phase2/                 # Phase2 微码生成管线（/api/phase2）
│   ├── vue3/                   # Vue3 组件生成（/api/vue3）
│   ├── lite/                   # Lite 档批量生成（/api/lite）
│   ├── microcode-doc/          # 微码文档解析（/api/microcode/doc）
│   ├── page-generator/         # 页面批量生成（/api/page-generator）
│   ├── preview/                # 组件预览渲染（/api/preview，Puppeteer）
│   ├── auth/                   # 认证 / 会话（/api/auth）
│   ├── group/                  # 组 / 成员 / 加组申请（/api/group）
│   ├── admin/                  # 管理与权限（/api/admin → Java）
│   ├── component/              # 组件 CRUD（/api/component）
│   ├── models/                 # AI 模型管理（/api/models）
│   ├── document/              # 文档（/api/documents）
│   ├── tasks/                  # 任务中心（/api/tasks）
│   ├── progress/               # SSE 进度推送（/api/progress）
│   ├── config/                 # 运行时配置（/api/config）
│   ├── screen-layout/          # 大屏布局（/api/screen-layout）
│   ├── workflow/               # 工作流（/api/workflows）
│   ├── apifox/                 # Apifox 接口（/api/apifox）
│   ├── token-usage/            # Token 用量（/api/token-usage）
│   ├── operation-log/          # 操作日志拦截器（审计流水写入）
│   ├── ai-workspace/           # AI 工作区（chat/sessions/skills/projects/documents/user-git）
│   ├── common/                 # 公共拦截器 / 过滤器 / 守卫（响应信封、SessionGuard 等）
│   ├── database/               # Mongoose 连接与 Schema
│   ├── schemas/                # 全局 DTO / Schema
│   └── ...
├── prompts/                    # AI Engine 的 Prompt 模板（.md，构建同步进 dist）
├── references/                 # 参考文档（构建脚本拷贝进 dist）
├── scripts/                    # js-gate.mjs 等构建/迁移脚本
├── data/                       # 任务持久化等运行时数据（tasks.json 等）
├── logs/                       # 按日滚动运行日志
├── workspace/                  # 生成产物输出（部分运行时写回）
└── build-backend.sh / .start-server.sh
```

## 路由分发（前端视角）

前端 `vite.config.js` 的 `proxy` 将 `/api/*` 转发到本服务（13030），少数路径（如 `/api/admin`、`/api/component-split`）转发到 Java（8080）。本服务内部各 NestJS 控制器按 `@Controller` 前缀挂载，主要前缀见上表。

## 全局响应信封

所有成功响应经 `ResponseEnvelopeInterceptor` 包裹为：

```json
{ "success": true, "code": 200, "message": "ok", "data": { ... }, "source": "node" }
```

错误经 `HttpExceptionFilter` → `ApiResponse.error`，形状同上、`success:false`。前端消费点统一读 `res.data.xxx`。

## 本地联调依赖

- **MongoDB**：`mongod` 本地 27017（审计流水、任务、权限等）。
- **Java 后端（8080）**：`/api/admin` 由 Java 接管；操作日志 fire-and-forget 上报到 `JAVA_BACKEND_URL`。
- **前端（2610）**：`FRONTEND_WORKSPACE` 指向其 `workspace/` 以读预览产物（开发默认 `../frontend/workspace`）。

## 常见问题

- **`ERR_MODULE_NOT_FOUND: ai-engine/...`**：dist 缺 `.js` 运行时模块 → 用 `build-backend.sh` 重建（它会同步 `.js` + `.md`）。
- **`Cannot find module 'dist/main.js'` / tsc 静默成功却不编译**：增量缓存陷阱 → `rm -f tsconfig.build.tsbuildinfo` 后重 build。
- **改了代码接口不生效**：旧进程仍占 13030 → 启动前强杀旧进程（`lsof -ti:13030 | xargs kill -9`）。
- **dev 下 `/api/auth/current` 仍 401**：确认 Node 以 `NODE_ENV=development DEV_AUTO_LOGIN=true` 启动（`.start-server.sh` 已默认设）。
- **后端进程约 6 分钟被沙箱回收一次**：属环境常态，重跑启动命令即可。

## Polyrepo 迁移注意事项

- `process.cwd()` 即 `backend-node/` 目录，路径引用以此为根。
- 不再跨仓库写入 `../frontend/`，前端经 API 获取预览产物。
- `temp-components/` 已从仓库根移至本仓库内（并被 `.gitignore` 忽略）。

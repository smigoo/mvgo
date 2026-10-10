# 感智晓界（mvgo）产品需求文档

> 版本：v1.0
> 日期：2026-10-10
> 范围：前端 `frontend/`（Vue 3 + Vite，端口 2610）、Node 后端 `backend-node/`（NestJS + LangGraph，端口 13030）、Java 后端 `backend-java/`（Spring Boot 3.2，端口 8080）
> 定位依据：本文档所有功能点、接口路径、枚举值均以代码实现为准，非设想稿。

---

## 目录

- [第一部分 产品概述](#第一部分-产品概述)
- [第二部分 系统架构与请求路由](#第二部分-系统架构与请求路由)
- [第三部分 公共机制（贯穿所有模块）](#第三部分-公共机制贯穿所有模块)
- [第四部分 功能模块需求](#第四部分-功能模块需求)
  - [M1 组件生成（v4 主页面）](#m1-组件生成v4-主页面)
  - [M2 轻量生成](#m2-轻量生成)
  - [M3 页面生成](#m3-页面生成)
  - [M4 工作台（对话式）](#m4-工作台对话式)
  - [M5 任务中心](#m5-任务中心)
  - [M6 任务详情](#m6-任务详情)
  - [M7 组件库](#m7-组件库)
  - [M8 组件详情](#m8-组件详情)
  - [M9 组件预览](#m9-组件预览)
  - [M10 Playground（AI 对话式组件修改器）](#m10-playgroundai-对话式组件修改器)
  - [M11 接口生成](#m11-接口生成)
  - [M12 API 目录详情](#m12-api-目录详情)
  - [M13 API 绑定向导](#m13-api-绑定向导)
  - [M14 工作流编排](#m14-工作流编排)
  - [M15 页面骨架生成](#m15-页面骨架生成)
  - [M16 大屏布局开发](#m16-大屏布局开发)
  - [M17 文档设计](#m17-文档设计)
  - [M18 管理后台](#m18-管理后台)
  - [M19 系统公告](#m19-系统公告)
  - [M20 帮助与文档页](#m20-帮助与文档页)
  - [M21 更新日志](#m21-更新日志)
  - [M22 质量检测与规范检查体系](#m22-质量检测与规范检查体系)
- [第五部分 附录](#第五部分-附录)

---

## 第一部分 产品概述

### 1.1 产品定位

感智晓界是一个 **AI 驱动的可视化组件交付平台**。核心命题：把「设计稿 / 截图 / 需求文档 / 接口定义」这些非结构化输入，通过多智能体管线自动转成**可运行、可预览、可下载、可交付的组件代码**。

产品形态上，它不是「代码编辑器」，而是**生成 + 验收 + 交付的中枢**。用户提交素材 → 平台跑 AI 管线 → 用户在任务详情页验收 → 满意则下载/发布/对接接口/推 GitLab。

### 1.2 四条核心业务链路

| 链路 | 输入 | 输出 | 入口 |
|------|------|------|------|
| **组件生成** | 截图 / Figma 链接 / HTML+需求文档 | 微码组件或 Vue3 组件 | `/generator/components` |
| **页面生成** | Figma 页面链接 | 页面内全部 `cp-` 组件批量生成 | `/generator/page` |
| **接口生成** | Apifox 项目 ID + Token | 前端 API 模块代码 + API 目录 | `/generator/api` |
| **布局开发** | 大屏截图 / Figma | 响应式页面骨架；或可视化布局 JSON + HTML | `/generator/page-skeleton`、`/screen` |

四条链路共享同一套底座：任务中心（SSE 进度 + 版本快照）、组件库（资产沉淀）、配额与队列、成本与统计。

### 1.3 目标用户与角色

| 角色 | 主要诉求 | 主要使用模块 |
|------|---------|-------------|
| 前端开发 | 快速把设计稿变成可维护代码，减少手写 | 组件生成、工作台、Playground、接口生成 |
| 项目负责人 | 看团队产出与质量，决定是否推广 | 管理后台（概览 / 任务统计 / 异常监控） |
| 平台管理员 | 开通权限、处理异常、发布公告 | 管理后台（用户管理）、系统公告 |
| 外部协作者 | 免登录查看生成结果 | 组件预览页（`noAuth`） |

### 1.4 权限模型

| 层级 | 判定方式 | 说明 |
|------|---------|------|
| 免登录（noAuth） | 路由 `meta.noAuth: true`，当前仅 `/preview/:componentId` | 便于 iframe 嵌入与直接分享 |
| 登录即可 | `SessionGuard` 通过 | 默认态 |
| 功能开关 | `meta.feature` + `feature-flags.js` + 路由守卫 | 关闭的功能菜单置灰、直访 URL 被拦回首页 |
| 管理员 | `resolveAdminRole()`：用户表 `isAdmin` → `DEFAULT_ADMIN_UIDS` 环境变量白名单 → QS 权限码（仅 `PERMISSION_SOURCE=qs` 时信任） | 管理后台全部页面与只读接口 |

登录态识别三级链路：静态资源（`?raw=1`）放行 → session cookie 优先（24h）→ `token` 请求头或 `?token=` 查询参数兜底（用于 SSE，因为浏览器原生 EventSource 不能自定义请求头）。

### 1.5 核心概念词表

| 术语 | 含义 |
|------|------|
| **微码组件（microcode）** | 平台自研组件形态，产物为 `component.js` + `declare.json` + `common.less` + `index.vue` |
| **Vue3 组件（vue3）** | 标准 Vue3 SFC 组件，产物含 `package/index.vue` 等 |
| **档位 Lite / Max** | 生成档位。Lite 走轻量管线（截图友好），Max 走完整管线（Figma 深度解析） |
| **源来源（sourceType）** | `screenshot` 截图 / `figma` Figma / `html` HTML |
| **componentId（组件 ID）** | **组件唯一标识，`c-` 前缀**。由 `component-naming.js` 统一生成 `c-<语义段>-<任务号尾 8 hex>`（如 `c-monitor-43e7fe45`），或用户指定的不带随机段的 `c-<kebab>`（如 `c-sales-dashboard`） |
| **sessionId（任务号）** | 任务唯一 ID，**内部编码，`mc-` / `mv-` / `page-` / `lr-` 前缀**。`mc-` 表示「一次 microcode 生成任务」，**不是组件命名前缀**，出现在用户界面属于缺陷 |
| **class 前缀** | `c-` 前缀 = componentId 去掉尾 8 hex（如 `c-monitor`）。根容器额外挂实例类 `c-mc-max-{sessionId}`，这是 `mc-` 唯一合法出现在 class 的位置 |
| **代码快照（code-snapshot）** | 生成过程中每次写盘产生的代码版本，含 `candidate`/`validating`/`last-good`/`rejected`/`partial` 五种状态 |
| **公共组件池** | 组件可见性 `visibility = public` 的集合，全平台可读 |
| **配额（quota）** | 每用户每小时 5 个 / 每天 15 个成功组件（失败不扣） |
| **功能开关（feature flag）** | 前端 `feature-flags.js` 5 分组（routes/subRoutes/pages/workspace/features），支持 HMR 热更新 |

### 1.6 命名契约（三层分层，不可混用）

这是全平台最容易混淆的一处，**必须严格区分**：

```
sessionId（任务号）        mc-max-1788500607-a1b2    ← 任务身份，13 位时间戳是灵魂
        │ 剥尾 8 hex
        ▼
componentId（组件 ID）      c-monitor-43e7fe45          ← 组件身份，语义段是灵魂
        │
        ├──► declare.json 的 componentId
        ├──► workspace 目录名  custom-components/<componentId>/
        ├──► 数据库 components.componentId
        ▼
class 前缀                 c-monitor                   ← 样式命名空间，剥掉尾 8 hex
```

| 层 | 前缀 | 用户可见性 | 说明 |
|----|------|-----------|------|
| 任务号 sessionId | `mc-` / `mv-` / `page-` / `lr-` | **不应可见**（界面应显示中文组件名） | 内部编码，含 13 位时间戳 |
| 组件 ID componentId | **`c-`** | ✅ 可见、可自定义 | = 目录名 = 数据库主键 |
| class 前缀 | **`c-`** | 半可见（开发者工具） | = componentId 去掉尾 8 hex |

**两层的唯一耦合点是尾 8 位 hex**，这也是目录反查的机制基础。

#### 用户填写组件 ID 的规则

| 规则 | 值 |
|------|-----|
| 格式 | 小写字母 / 数字 / 短横线，**必须以 `c-` 开头**，≤64 字符 |
| 服务端归一化 | 自动补 `c-` 前缀、过滤非法字符、折叠连续短横线、截断到 64 |
| 保留字（静默拒收回退自动生成） | `component` / `unknown-component` / `test` / `temp` |
| 纯 8 位 hex（拒收） | 会与 class 前缀剥离规则撞车 |
| 非法值处理 | **静默回退自动生成，不报错** |
| 长度 < 4 时 | 拒收 |

> **已知缺口**：组件 ID **不做重名查重**（`check-id` 接口已于 2026-10-09 移除）。用户填已存在的 ID 会静默覆盖既有组件目录。

#### 命名污染的两道自愈

| 问题 | 检测 | 处理 |
|------|------|------|
| LLM 把上个任务号当组件名 | 组件名含 **13 位连续数字**即判定污染 | 组件名清空回退任务号 + 警告日志 |
| 目录名与 declare 内容不一致 | componentId 落盘闸门统一重建 | 目录名按 declare 归一 + class 前缀按契约剥离 |

---

## 第二部分 系统架构与请求路由

### 2.1 仓库结构（Polyrepo）

| 仓库 | 技术栈 | 端口 | 职责 |
|------|--------|------|------|
| `frontend/` | Vue 3 + Vite + Ant Design Vue | 2610 | 用户界面 |
| `backend-node/` | NestJS + LangGraph + AI 引擎 | 13030 | 生成管线、SSE、任务编排 |
| `backend-java/` | Spring Boot 3.2 + Maven 多模块 | 8080 | 认证、用户、审计、组件拆分 |
| `docs/` | Markdown | — | 技术文档与本需求文档 |

### 2.2 请求路由（生产 Nginx 分发）

```
/api/progress | phase2 | vue3 | demo | preview | models   → Node.js :13030
/api/admin | component-split | operation-log | auth | group | documents  → Java :8080
其余 /api/*                                     → Java :8080
/                                                → 前端 :2610
```

**模块归属的三个要点**：

1. **接口生成（Apifox）实现在 Node**（`backend-node/src/apifox/`），Java 侧的 `/api/apifox/**` 只是字节级反向代理。
2. **管理端接口双后端并存**：开发环境 Vite 代理按路径优先级裁决，`users`/`components`/`user-stats`/`usage-export`/`dept-report` 优先打到 Node，兜底才到 Java。
3. **Java 已迁移范围**：认证（auth）、用户管理（admin）、操作日志审计（operation-log）、组件拆分（component-split）四块。Node 侧 auth/group/document/models 四个 Controller 已从 Nest 注册中移除。

### 2.3 后端模块清单（Node，29 个业务模块）

| 模块 | 职责一句话 |
|------|-----------|
| `tasks` | 任务内存表 + 磁盘持久化 + 代码快照版本管理 + 队列（全局） |
| `progress` | 全站唯一 SSE 推送中枢 + 事件历史重放 |
| `quota` | 组件生成配额（每小时 5 / 每天 15） |
| `queue` | 并发闸门（单用户 2 / 全局 10）+ 排队调度 |
| `phase2` | Figma → 微码组件主流程 |
| `vue3` | Figma → Vue3 组件 + 数据槽分析 + API 绑定 |
| `lite` | 轻量生成 + 批量生成 + HTML 大屏拆分 |
| `page-generator` | 页面级批量生成（页面内所有 `cp-` 组件） |
| `page-skeleton` | 大屏页面骨架生成（磁盘目录型资产） |
| `screen-layout` | 大屏布局空间分析 + 响应式生成 + ZIP 导出 |
| `workflow` | 节点注册表元数据 + 原始图拓扑 + 自定义工作流编排运行 |
| `agent-builder` | 智能体动态注册（写入 `config/agents/*.json`） |
| `recipes` | 场景配方库（内置 + 用户另存） |
| `apifox` | Apifox OpenAPI → 前端 API 代码 + API 目录 |
| `workbench` | 对话全生命周期 + 分组 + 工具凭据 + 反馈闭环 |
| `ai-workspace` | 项目 / 会话 / 文档 / 技能四实体 CRUD |
| `component` | 组件资产 CRUD + 公共池发布 + 文件读写 + GitLab 推送代理 |
| `preview` | 预览 iframe 的只读静态资源服务（免登录） |
| `demo` | Playground AI 对话式修改器（SSE 流式） |
| `models` | 模型列表（Controller 已迁 Java） |
| `document` | 文档 CRUD（Controller 已迁 Java） |
| `auth` | Session/权限守卫（HTTP 登录注册已迁 Java） |
| `group` | 项目组与成员（Controller 已迁 Java） |
| `config` | AI 配置读写 + 连通性测试 + 模型能力验证 |
| `mc-spec` | 微码组件规范检查 + 质量评分 |
| `token-usage` | Token 用量追踪与成本估算 |
| `task-stats` | 任务统计（管理员视角 + 我的统计） |
| `admin` | 管理后台只读接口 |
| `operation-log` | 全局拦截器写操作日志（读接口已迁 Java） |
| `announcement` | 系统公告 |
| `ai-engine-v2` | v2 可配管线（**仅非生产环境注册**） |

### 2.4 Java 模块清单

`mvgo-app`（启动）→ `mvgo-api`（Controller）→ `mvgo-business`（Service）→ `mvgo-common` / `mvgo-data` / `mvgo-node`。

| 模块 | 路由前缀 | 职责 | 关键集合 |
|------|---------|------|---------|
| 健康检查 | `/api` | `GET /health` | — |
| 认证 | `/api/auth` | 门户 token 校验、登录登出改密 | `users` |
| 用户管理 | `/api/admin` | 用户列表、设/取消管理员、组件管理 | `users`、`components` |
| 操作日志 | `/api/operation-log` | Node 上报写入 + 分页读（含 user 富化） | `operation_logs` |
| 组件拆分 | `/api/component-split` | 需求 docx + HTML 原型 → 组件 MD 交付包 | — |
| 项目组 | `/api/group` | 组 CRUD、成员邀请移除、权限 | `groups`、`group_members` |
| 项目 / 会话 / 技能 / 文档 / 模型 | `/api/projects` 等 | AI 编程协作实体 | `ai_projects`、`ai_sessions`、`ai_skills`、`documents`、`user_ai_configs` |
| Node 反向代理 | 20+ 前缀 | 未迁移端点字节级转发 | — |

---

## 第三部分 公共机制（贯穿所有模块）

### 3.1 统一响应信封

后端全局 `ResponseEnvelopeInterceptor` 包裹所有响应：

```json
{ "success": true, "code": 200, "message": "ok", "data": { }, "source": "node" }
```

**前端必须统一读 `res.data.xxx` 取业务字段。** 例外（跳过信封）：SSE 流、`@Res()` 直写、文件下载（StreamableFile / Buffer / string）。

### 3.2 SSE 进度协议

**唯一订阅端点**：`GET /api/progress/:sessionId?token=<token>`

> Token 走 query 而非请求头，因为浏览器原生 `EventSource` 不支持自定义请求头。

**帧格式**：`id: {seq}\ndata: {json}\n\n`，`seq` 单调递增。

**13 种事件类型**：

| type | 载荷要点 | 前端用途 |
|------|---------|---------|
| `connected` | `{sessionId, isReconnect, timestamp}` | 连接成功 / 重连成功（含缓冲条数） |
| `snapshot-resync` | `{reason:'event-gap', lastEventId, oldestAvailableSeq}` | 事件缺口 → 前端重拉快照 |
| `task-status` | `{status, progressCount}` | 重连时的任务快照 |
| `keep-alive` | `{timestamp}` | 5 秒心跳，防断连 |
| `progress` | `{stage, status:'running'\|'completed', message}` | **推进阶段进度条**；批量场景兼作 `{status:'queued'\|'running'\|'rate_limited'}` |
| `log` | `{level, message, meta}` | **推进日志流**；`meta.model` 自动补全会话模型 |
| `code-snapshot` | `{revision, status, stage, fileCount, changedFiles, lastGoodRevision}` | 代码版本变化（只发元数据，不传源码） |
| `file-lifecycle` | `{phase, summary, files[]}` | 文件写入瞬态，不进历史 |
| `complete` | 任务结果（密钥脱敏） | 结束进度、渲染产物 |
| `error` | `{message, stack}` | 失败态 |
| `batch_complete` | `{batchId, status, completedItems, failedItems, attentionItems}` | 批量任务汇总 |

**可靠性设计**：

- 每个 session 多连接广播（Set 存储），双页面订阅互不覆盖
- 事件历史保留 120 条，支持断线重连后重放
- 循环安全序列化 + 广播前密钥脱敏，异常降级为最小载荷
- 前端侧配套三种重连策略：指数退避（Lite，1s/2s/4s 最多 3 次）、15s 轮询兜底（page/SSE Recovery）、35 秒看门狗（独立日志页）

### 3.3 任务状态机

**8 种状态**：`queued`（排队中）、`rate_limited`（配额不足）、`retry_scheduled`（等待重试）、`running`（运行中）、`paused`（已暂停）、`completed`（已完成）、`failed`（失败）、`cancelled`（已取消）。

**状态流转**：

```
提交
 ├─ 配额不足 ─────→ rate_limited ──配额恢复/手动──→ queued
 ├─ 并发满 ───────→ queued ──调度器──→ running
 └─ 有空位 ───────→ running
running ──完成──→ completed
running ──异常──→ failed ──重试（有缓存复用）──→ running
running ──用户──→ paused ⇄ running
任意非终态 ──用户──→ cancelled
rate_limited ──退避计时──→ retry_scheduled → running
```

### 3.4 配额与并发

| 维度 | 规则 |
|------|------|
| 每小时配额 | 5 个**成功**组件（失败不扣） |
| 每日配额 | 15 个成功组件，次日 00:00 重置 |
| 超限行为 | **不报错，转排队**：返回 `queued: true` + `queue:{position, quotaResetAt, waitMinutes}` |
| 单用户并发 | 2（`TASK_MAX_CONCURRENT`，可配 1–10） |
| 全局并发 | 10（`TASK_GLOBAL_MAX_CONCURRENT`） |
| 队列上限 | 100 |
| 幽灵任务 | 10 分钟强制释放槽位 |
| 批量预检 | `POST /lite/batch/pre-check` 返回 `all_now` / `partial` / `all_wait` 三档建议 |

### 3.5 代码快照版本模型

生成过程中每次写盘产生一个 revision，五种状态：

| 状态 | 中文标签 | 含义 |
|------|---------|------|
| `candidate` | 候选代码 · 暂不执行 | 最新生成中，尚未过门禁 |
| `validating` | 正在验证 | 门禁校验中 |
| `last-good` | 可预览快照 | 已过门禁，**预览优先选它** |
| `rejected` | 验证未通过 | 阻断，不入预览队列 |
| `partial` | 部分产物 · 可继续编辑 | 骨架已落盘，主文件未完成 |

**预览源优先级**：`last-good` > `candidate` > `partial` > workspace。
> 设计原因：生成刚完成时直接预览 candidate，可能命中「修复器还没补齐 CSS 变量」的坏版本。

**双槽位安全换帧**：新 revision 先挂到隐藏的 pending 槽位，加载完成并回报 `MVGO_PREVIEW_READY` 后才 swap 为 active；失败时保留旧活动帧。

### 3.6 质量门禁与诊断

**三级严重度**：`BLOCK`（阻断）/ `WARN`（警告）/ `INFO`（提示）。

**四类诊断源**（合并去重后按 `id|file|line|column|message` 排序）：

| sourceType | 检查内容 |
|-----------|---------|
| `shared-less` | 公共样式表编译 |
| `standalone-less` | 组件独立样式编译 |
| `sfc-style` | SFC style 块 |
| `sfc-semantics` | SFC 语义（模板引用未声明变量、import 白名单等） |
| `structure` | 结构完整性（缺入口文件、悬空引用等） |

**每条诊断携带**：`severity` / `file` / `line` / `column` / `message` / `code snippet`（含当前行高亮）/ `hint.suggestion` / `healApplied`（是否已被自愈器修复）。

### 3.7 降级与提示语义

平台严格区分四种「不完美」，文案不得混用：

| 字段 | 文案 | 语义 |
|------|------|------|
| `visualDegraded` | 视觉分析降级，布局可能偏离设计稿 | 视觉分析没做完就继续了 |
| `visualQualityWarning` | 内容可能不完整，属模型识别能力问题 | 能生成但内容可能缺，**归因视觉模型而非设计稿** |
| `degradedScriptParts` | 生成不完整，可二次生成 | 部分脚本没写全 |
| `missingFiles` / `degradedFiles` | 缺失关键文件 | 关键文件没落盘（含门禁跳过 + 静默失败降级合并） |

### 3.8 前端功能开关

配置文件 `frontend/src/config/feature-flags.js`，5 个分组：`routes` / `subRoutes` / `pages` / `workspace` / `features`。

三种生效路径：
1. **导航置灰**：`AppHeader` 计算 `enabled` 决定菜单是否可点
2. **模板指令**：`v-feature="'key'"` 置灰 + 点击提示「暂不开放」
3. **路由守卫**：`ROUTE_FEATURE_MAP` 拦截直访 URL，跳回首页并提示

支持 HMR 热更新，改开关无需重启前端。

### 3.9 前端请求层

| 层 | 文件 | 职责 |
|----|------|------|
| 自研 fetch 封装 | `core/http.js` | 注入 `Token` 头、同源带 cookie、非 2xx 抛统一 `HttpError`、401 防抖提示、下载与 SSE 流支持 |
| axios 实例 | `api/*.ts` | 生成/任务/组件接口，401 时清 localStorage 并刷新门户父窗口 |
| microvideo axios | `core/request.js` | 遗留 microvideo 框架调用，与上面职责隔离 |

**下载统一约定**：所有文件下载走 `downloadByUrl`（fetch + Blob），**禁止原生 `<a download>`** —— 原生方式不带 Token 头，生产环境返回 401。

### 3.10 全局布局模式

`App.vue` 三种互斥渲染模式：

| 模式 | 触发路径 | 表现 |
|------|---------|------|
| 预览页 | `/preview/*`、`/mc-component/*` | 裸 router-view，无任何公共布局 |
| 工作台 | `/workbench/*` | 独立全屏，自带三栏 |
| 常规 | 其余全部 | `AppHeader`（fixed 64px）+ 内容区 + `AppFooter` + 全局 `ConfigPanel` + `WorkflowMonitor` 悬浮球 + 全局 `ApiBindingWizard` 抽屉 |

---

## 第四部分 功能模块需求
---

## M1 组件生成（v4 主页面）

| 项 | 值 |
|----|-----|
| 路由 | `/generator/components`（name: `UnifiedGenerate`） |
| 旧路径 | `/generate`、`/generate-component` → 重定向至此 |
| 文件 | `frontend/src/views/generate/components.vue` |

### M1.1 用户目标

选素材来源（截图 / Figma / HTML+需求文档）→ 选技术栈与档位 → 一键提交 AI 生成 Vue3 或微码组件，同屏看到近期生成概况。

### M1.2 页面布局

**两栏结构**（左主栏 + 右侧 340px 概览栏）：

```
主栏（flex:1，滚动）
├── 页头：标题 + 副标题
├── 来源 Tab ×3（等分）
├── 画布区：随 Tab 切换内容（三块常驻 DOM，v-show 切换不销毁，状态保留）
├── 操作行：技术栈 + 档位 + 面板主题 + 主 CTA
├── 高级选项折叠条
└── 配额条
右侧概览栏（340px）
├── 今日概览：4 张统计卡（可点击跳转任务中心并带筛选）
└── 最近生成：任务列表（15s 自动刷新）
```

> **关键设计**：本页**不渲染 SSE 进度**。提交成功后立即 `router.replace` 跳到任务详情页，由 M6 承接进度展示。本页的阶段数组、日志、计时器等变量不参与模板渲染。

### M1.3 输入项

#### 来源 Tab（`sourceMode`）

| 值 | 标签 | 可选档位 | 说明 |
|----|------|---------|------|
| `screenshot` | 上传截图 | 仅 Lite | 默认值 |
| `figma` | Figma 链接 | Lite + Max | **唯一允许 Max 的来源** |
| `docx-html` | HTML + 需求文档 | 仅 Lite | 不持久化，刷新回默认 |

切换副作用：切到非 Figma 来源时若当前是 Max，自动回落 Lite。

#### 截图输入

- **三种上传方式**：拖拽、点击选择（隐藏 input，`accept="image/png,image/jpeg,image/webp"`）、**全局 Ctrl+V 粘贴**
- **校验**：仅接受 `image/*` 类型；**单张**（再次上传直接覆盖）；无大小上限校验
- 已上传态：文件名 + 宽×高 + 大小，可「替换」或「删除」

#### Figma 链接（核心交互）

**URL 正则校验**（实时反馈）：
```
^https?://(?:www\.)?figma\.com/(?:file|design|proto)/
```

**URL 历史**：localStorage `mvgo_figma_url_history`，最多 10 条、最新在前。支持点选回填 / 单条删除 / 清空；**仅在成功提交生成时写入**。

**防抖自动预览**：URL 变化时立即废弃旧请求（AbortController + 请求序号），防抖 700ms 后自动请求预览。

**两段式确认（强制）**：

```
① 输入 URL
   ↓ 自动/手动请求 POST /phase2/figma-preview
   ↓ 返回 {imageUrl, previewToken, width, height}
② 插入隐藏探针 <img> 加载校验（必须浏览器真实加载成功）
   ↓ 成功 → 状态 ready；失败 → image-load 错误态
③ 点主 CTA「确认此预览」
   ↓ 卸载输入区，翻状态为 confirmed
④ 再点主 CTA「生成 Lite/Max {Vue3|微码组件}」
   ↓ 提交时携带 figmaUrl + previewToken + previewWidth + previewHeight
```

**旧预览保留（retained）机制**：换 URL 时若旧预览已加载，保留为过渡态并盖「正在获取新链接预览」遮罩，明示「旧预览仅用于过渡，不可确认或生成」，且不带 token。

**8 种错误类型及文案**：

| 类型 | 提示 |
|------|------|
| `invalid-url` | 请输入有效的 Figma 文件或节点链接 |
| `permission` | 无权访问该 Figma 文件（检查 Token 或文件权限） |
| `node-not-found` | 未找到指定节点 |
| `timeout` | 请求超时 |
| `rate-limit` | Figma 接口限流 |
| `network` | 网络异常 |
| `image-load` | 预览图加载失败 |
| `unknown` | 未知错误 |

错误态画布提供「重新获取」按钮。

#### HTML + 需求文档（左右双栏，1:1）

**左栏 HTML 原型**：
- 接受 `.html/.htm/.css/.js` + 图片（`.png/.jpg/.jpeg/.gif/.svg/.webp/.ico`）+ 字体 + `text/html`
- **三层校验**：① 至少含 1 个 `.html`/`.htm`；② HTML 主体 ≤ 5MB；③ 正则探测页面结构（`html|body|div|main|section|article|header|footer|form|table`）
- **自动内联**：`buildInlineHtml` 把 `<link stylesheet>` / `<script src>` / `<img src>` 内联为自包含文档（匹配优先级：精确路径 → basename → 小写名）；未匹配的相对路径引用被移除（blob 上下文必然 404），绝对 URL 保留
- 每次读取成功后**自动触发分析**

**右栏 需求文档 DOCX**：
- 接受 `.doc/.docx`
- 校验：扩展名/MIME 匹配 + **≤ 10MB**
- DOCX 就绪后若已有 HTML，自动重新合并分析

**HTML 预览舞台（16:9）**：
- **组件标签叠加层**：每个组件一个标签，鼠标悬停/点击与右侧列表**双向联动高亮**
- **保真 / 响应式** 分段切换
  - 保真：按原始尺寸 1:1 展示
  - 响应式：5 个视口预设（mobile-375 / mobile-414 / tablet-768 / desktop-1280 / desktop-1440）+ 三向拖拽手柄（right / bottom / corner，步进 10px，Shift 加速）
  - 溢出提示：内容超出视口 N px 时显示
- **高度锁定**：用户一旦手动调尺或选档位即锁定高度，iframe 的 `doc-height` 上报不再改变高度（避免「拖完弹回」）
- **手动框选**：框选区域新增组件 `custom-{N}`，strategy = `manual`，默认选中并自动退出框选
- iframe ↔ 父页 postMessage 协议：
  - 父 → iframe：`highlight` / `unhighlight` / `click-highlight` / `sync-selected` / `exit-selection-mode`
  - iframe → 父：`doc-height` / `hover` / `hover-end` / `selection-complete`

**拆分结果面板**：
- 标题「拆分出的组件 (N)」+ 全选 checkbox
- 每行：checkbox + 序号 + 组件名 + strategy 标签；点行或 checkbox 均切换
- 分析完成后**默认全选**

#### 技术栈 / 档位 / 面板主题

| 控件 | 枚举 | 默认 | 显示条件 |
|------|------|------|-----------|
| 技术栈（CodeTypeToggle） | `vue3` Vue3 / `microcode` 微码 | `vue3` | 始终，支持左右方向键切换 |
| 档位（TierToggle） | `lite` Lite / `max` Max | `lite` | **Max 仅 Figma 来源可选**，其余置灰 |
| 面板主题（PanelThemeToggle） | `default-panel` 浅色 / `aio-panel` 深色 | `default-panel` | **仅微码时显示** |

### M1.4 高级选项（折叠条）

| 字段 | 限制 | 说明 |
|------|------|------|
| 组件 ID | `maxlength=64` | placeholder `如 c-sales-dashboard`（小写字母/数字/短横线，以 `c-` 开头） |
| 补充提示词 | `maxlength=4000` | 实时显示 `{len}/4000` |
| 需求文档 | `.md/.txt/.html`，**< 1MB** | 超限报「需求文档超过 1MB，请精简后再上传」 |

折叠时头部显示摘要 chip（ID / 提示词 / 文档）。三字段**仅在微码模式下提交**（选 Vue3 时 UI 可见但不生效）。

### M1.5 主 CTA 文案动态表

| 状态 | 文案 |
|------|------|
| 截图来源 | 使用截图生成 Vue3 / 使用截图生成微码组件 |
| docx-html · 分析中 | 分析中... |
| docx-html · 打包中 | 正在生成交付包... |
| docx-html · 已有组件列表 | 导出选中的组件 MD (已选/总数) |
| docx-html · 初始 | 分析需求与 HTML |
| figma · preview ready | **确认此预览** |
| figma · 其他 | 生成 {Lite\|Max} {Vue3\|微码组件} |
| busy | 终止生成 |
| submitting | 校验配置... |

### M1.6 交互流程

#### 流程 A：截图 → 生成

```
① 打开页面 → onMounted 读 localStorage 决定默认 Tab
   → GET /api/tasks/recent?limit=10（右栏）
   → GET /api/tasks/summary（今日概览）
   → 启动 15s 定时器（重拉列表 + 概览 + 相对时间）
   → 注册 paste 监听
② 上传截图（点击 / 拖拽 / Ctrl+V）→ 读宽高
③ 选技术栈（Vue3 / 微码）
④ 选档位（Lite / Max[仅 Figma]）
④' 选微码 → 追加面板主题（浅色 / 深色）
⑤ （可选）展开高级选项：组件 ID / 补充提示词 / 需求文档
⑥ 点主 CTA → go()
   → submitting=true → 校验 AI 配置：
       Lite 需 vision 三件套（apiKey/baseURL/model）
       Max 还需 text 三件套
       本地缺失 → GET /api/config/ai 兜底
       仍缺失 → 提示「请先在设置面板中配置：…」并中止
   → busy=true → 组装 payload → POST /lite/generate
   → 取 sessionId → router.replace('/tasks/{sessionId}')
⑦ 任务详情页承接 SSE 进度
⑧ 完成后：预览 / 下载 ZIP / 体检 / 交付（发布公共池 or 推 GitLab）/ 版本回滚
```

#### 流程 B：Figma → 生成（多一轮确认）

流程 A 的 ①–⑤ 相同，在 ⑥ 之前插入：

```
⑥ 粘贴 URL → 立即废弃旧请求 + 清 token + 保留旧预览为过渡态
   → 防抖 700ms → POST /phase2/figma-preview
   → 返回后插入隐藏探针 img 加载校验
   → 加载成功 → ready 态
⑦ 点「确认此预览」→ 卸载输入区 → confirmed 态
⑧ 点「生成 ...」→ 二次守卫校验（图已加载 + token 存在 + URL 未变）
   → POST /lite/generate {figmaUrl, previewToken, previewWidth, previewHeight}
   → 写 URL 历史 → 跳任务详情
```

#### 流程 C：HTML + 需求文档 → 组件需求 MD 交付包

**注意：此流程不走 AI 代码生成管线**，只做结构拆分 + 需求合并，产出是交付包 ZIP。

```
① 切到「HTML + 需求文档」Tab
② 左栏上传 HTML 原型（可多选带 CSS/JS/图片）
   → 三层校验 → buildInlineHtml 内联为自包含文档 → 立即可预览
   → 自动触发分析
③ （可选）右栏上传 DOCX → 就绪后自动重新合并分析
④ 分析请求
   → 有 DOCX：POST /api/component-split/analyze
   → 纯 HTML：POST /api/lite/analyze
   → 响应兼容两种格式（Node 信封 / Java 平铺）
   → 默认全选组件
⑤ （可选）交互
   · 点预览标签 ↔ 点右侧列表行 → 双向高亮联动
   · 勾选 / 全选 → postMessage 同步高亮
   · 切保真/响应式 → 选档位或拖拽调尺
   · 手动框选新增组件
⑥ 点「导出选中的组件 MD (n/N)」
   → 未勾选任何组件 → 提示「请至少勾选一个组件」
   → POST /api/component-split/build → Blob → 下载「组件拆分交付包_YYYY-MM-DD.zip」
   → 不跳任务页
```

### M1.7 取消与错误处理

| 场景 | 行为 |
|------|------|
| 提交后可取消 | CTA 变「终止生成」→ `POST /api/tasks/cancel/{sessionId}` + 关流（仅提交请求进行中的极短窗口可达，生成期取消在任务详情页） |
| Figma 预览重试 | 错误态「重新获取」按钮 |
| Figma 预览请求取消 | URL 变化或组件卸载时 AbortController.abort() |
| 空态 | 截图区「选择或粘贴截图 / PNG、JPG、WebP · 单张图片」；Figma idle「粘贴 Figma 链接开始」；右栏「暂无任务记录 / 生成组件后将在此显示」 |

### M1.8 状态与持久化

**Pinia**：`useConfigStore`（只读消费，唯一写点在配置校验兜底时 `saveConfig`）

**localStorage**：

| Key | 内容 |
|-----|------|
| `mvgo_generate_source_mode` | 来源 Tab（仅 screenshot / figma 会被读回） |
| `mvgo_figma_url_history` | Figma URL 历史，≤10 |
| `currentGroupId` | 项目组 id（只读，兜底 `default-group`） |
| `mc_generator_config` | AI 配置（经 config store） |
| `mvgo-html-split-batch:{batchId}` | HTML 拆分批次快照（sessionStorage） |

**不持久化**：组件 ID、补充提示词、需求文档、技术栈、档位、面板主题（刷新即丢）；Figma 预览缓存为内存 Map。

### M1.9 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/lite/generate` | 提交生成 |
| POST | `/api/tasks/cancel/{sessionId}` | 取消任务 |
| POST | `/api/phase2/figma-preview` | Figma 预览图 |
| GET | `/api/config/ai` | 拉服务端 AI 配置兜底 |
| POST | `/api/component-split/analyze` | 需求文档 + HTML 拆分分析 |
| POST | `/api/lite/analyze` | 纯 HTML 拆分分析 |
| POST | `/api/component-split/build` | 生成组件 MD 交付包 ZIP |
| GET | `/api/tasks/recent?limit=10` | 最近生成列表 |
| GET | `/api/tasks/summary` | 今日概览 |

---

## M2 轻量生成

| 项 | 值 |
|----|-----|
| 路由 | `/generator/lite` |
| 文件 | `frontend/src/views/lite/LiteGenerate.vue` + `LiteBatchPanel.vue` + `LiteBatchProgress.vue` |

### M2.1 用户目标

最简两栏生成器：传一张截图或 Figma 链接 → 点「开始生成」→ 看 4 阶段进度与实时日志 → 内嵌 iframe 预览。

### M2.2 页面布局

```
顶部栏（56px）：返回 | 标题「轻量生成」+ 徽标 Lite | 跳转「Figma 生成」
主体（两栏）
├── 左栏：输入配置（滚动）
│   ├── 输入来源切换（截图上传 / Figma 链接）
│   ├── 截图上传区 / Figma 链接输入
│   ├── 组件类型（Vue3 / 微码）
│   ├── 组件名称（选填）
│   ├── 批量生成面板
│   ├── [开始生成] / [终止生成]
│   └── 输入模式说明卡
└── 右栏：输出（三态互斥）
    ├── 空态：上传截图，一键生成组件
    ├── 生成中：阶段卡（4 个）+ 可折叠日志
    └── 预览：iframe + 工具栏（新标签页打开 / 复制组件 ID）
```

### M2.3 输入项

| 字段 | 枚举 / 限制 | 默认 |
|------|------------|------|
| 输入来源 | `screenshot` / `figma` | `screenshot` |
| 截图 | 类型白名单 + **≤ 10MB** | 空 |
| Figma 链接 | **仅非空校验**（无正则、无 node-id 校验） | 空 |
| 组件类型 | `vue3` / `microcode` | `vue3` |
| 组件名称 | 选填，placeholder `例如：c-stat-card` | 空 |

**档位是派生不可选**：`figma → max`，其余 → `lite`，UI 上只读展示为按钮内徽标。

**三种上传方式**：点击 / 拖拽（拖拽时高亮）/ **全局 Ctrl+V 粘贴**（批量模式下粘贴进批量列表）。

### M2.4 交互流程

```
① 打开页面 → onMounted 先尝试恢复未完成任务
   → 读 localStorage['lite-generate-task']，超过 1 小时视为过期清除
   → 状态非 completed/failed → 恢复生成态 + 重绑 SSE + 日志提示
   → 注册 paste 监听
② 选来源 → 传素材
③ 选组件类型 → （可选）填组件名称
④ 点「开始生成」
   → 重置状态 → 写日志 → POST /lite/generate
   → 持久化任务 → 写日志「任务已创建」→ 绑定 SSE
⑤ 生成中：按钮变「终止生成」（独立按钮）
⑥ 完成 → 自动开预览 iframe /preview/{sessionId}?groupId=X&type=vue3
```

### M2.5 进度与日志

**4 阶段**：预检 → 视觉分析 → 代码生成 → 保存产物。每阶段状态 `pending | running | done | error`，渲染为圆点 + 旋转 spinner / ✓ / ✗。

**阶段推进**：stage 字符串按中英双关键词匹配（`预检|precheck` / `分析|analyze|vision` / `生成|generate|code` / `保存|save|workspace`）。

**日志区**：可折叠，每行 `时间(HH:mm:ss) + 级别样式(info/warn/error/success) + 消息`。

**SSE 重连机制**：
```
onerror → readyState === CLOSED（主动关闭）→ 不重连
        → 指数退避 1000ms × 2^(n-1)，最多 3 次
        → 3 次失败 → 查任务真实状态兜底：
             completed → 补齐完成态 + 开预览
             failed    → 标失败
             running   → 重建 SSE
onopen → 重置重连计数
```

### M2.6 批量生成

**模式切换**：「单个组件 / 批量生成」。

**配额预检**（点「预检配额（N 个组件）」）：
```
POST /api/lite/batch/pre-check → 返回：
  指标三卡：总 path 数 / 模块候选数 / 最大单模块
  小时配额：used / limit / 剩余 / N 分钟后恢复（exhausted 时 limit 标红）
  日配额：同上
  拆分计划：立即执行 N 个 / 配额恢复后自动执行 N 个
  建议动作 recommendedAction：
    all_now  → ✓ 绿「开始批量生成」
    partial  → ⓘ 橙「开始批量生成」
    all_wait → ✕ 红「加入等待队列」
```

**批量进度**（3s 轮询 `GET /lite/batch/{batchId}`）：
- 双段进度条：完成段（绿）+ 失败段（红，定位在 `left: completedPct%`）
- 状态分布 chips（计数 >0 才显示）
- 操作栏按状态显隐：暂停（running/pending）、恢复（paused/awaiting_recovery）、重试失败项（failedItems>0 且未取消）、取消（未完成未取消）
- 「需要关注」列表：取前 5 条，展示 id / 状态 / 错误截断 60 字 / 预计重试时间

### M2.7 状态与持久化

无 Pinia store（纯局部 ref）。

| Key | 内容 | TTL |
|-----|------|-----|
| `localStorage['lite-generate-task']` | `{sessionId, componentType, createdAt}` | **1 小时** |
| `localStorage['currentGroupId']` | 项目组（只读，兜底 default-group） | — |

完成 / 失败 / 取消时清除持久化。

### M2.8 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/lite/generate` | 提交生成 |
| POST | `/api/lite/batch/generate` | 提交批量 |
| POST | `/api/lite/batch/pre-check` | 配额预检 |
| GET | `/api/lite/batch/{batchId}` | 批次轮询（3s） |
| POST | `/api/lite/batch/{batchId}/pause` | 暂停 |
| POST | `/api/lite/batch/{batchId}/resume` | 恢复 |
| POST | `/api/lite/batch/{batchId}/cancel` | 取消 |
| POST | `/api/lite/batch/{batchId}/retry-failed` | 重试失败项 |
| POST | `/api/tasks/cancel/{sessionId}` | 单任务取消 |
| GET | `/api/tasks/status/{sessionId}` | 状态查询 |
| SSE | `/api/progress/{sessionId}?token=` | 进度 |

---

## M3 页面生成

| 项 | 值 |
|----|-----|
| 路由 | `/generator/page`（旧路径 `/generate-page` 重定向至此） |
| 文件 | `frontend/src/views/generate/page.vue` |

### M3.1 用户目标

输入一个 Figma 页面链接 → 分析出页面中的 `cp-` 组件 → 批量生成这些组件。

### M3.2 页面布局

**单列纵向堆叠**（无左右分栏）：

```
恢复状态提示横幅（顶部，仅恢复中的任务显示）
表单卡
├── 页面类型 pills：微码页面 / 普通页面
├── 微码模式
│   ├── Figma 页面 URL 输入（实时解析反馈）
│   ├── 执行模式（串行/并行）+ 并发度 stepper
│   ├── 操作行：[先分析页面] [开始批量生成 / 终止]
│   └── 分析结果：发现 N 个 cp-xxx 组件列表
└── 普通模式：全部禁用 + 「功能开发中」占位块
生成结果卡片列表
子组件预览 Modal
生成日志区
```

### M3.3 输入项

| 字段 | 枚举 / 限制 | 默认 |
|------|------------|------|
| 页面类型 | `microcode` / `normal` | `microcode` |
| Figma 页面 URL | 需含 `fileKey` + `node-id` query | 空 |
| 执行模式 | `serial` 串行 / `parallel` 并行 | `parallel` |
| 并发度 | clamp **[1, 10]** | 2 |

**URL 实时解析**：
- 成功（路径匹配 `/(file|design)/xxx` 且有 `node-id`）→ 显示 `✓ File Key: xxx & Node ID: yyy`，可分析
- 缺 node-id → warning「URL 需要包含 node-id 参数」
- URL 解析异常 → error「无效的 URL」

### M3.4 交互流程

```
① 打开页面 → 恢复检测（三条路径）
   ① route.query.session（最高优先）
   ② localStorage['page-gen-active-session']
   ③ watch route.query.session（侧栏点同页面不同任务时触发）
   → running：显示「恢复任务中: X（已运行 Ns）」6s + 回放历史进度日志 + 重连 SSE
   → completed：从 result.results 恢复结果卡与汇总
   → failed：写 error 日志 + 清 session
② 选页面类型（微码页面可用 / 普通页面禁用）
③ 粘贴 Figma 页面 URL → 实时解析 File Key / Node ID
④ （并行时）调并发度
⑤ 点「先分析页面」→ POST /page-generator/analyze → 列出发现的 N 个 cp-xxx 组件
⑥ 点「开始批量生成」→ POST /page-generator/generate → 持久化 session → 连 SSE
⑦ 生成中
   · SSE 消息全部落日志区
   · SSE 断开 → 立即查任务状态 → 终态直接收尾 / 仍 running 则 15s 轮询兜底
   · 点「终止」→ POST /tasks/cancel/{sessionId} + 关 SSE
⑧ 完成 → 结果卡列表 + 汇总徽章
   · 汇总三态：全部成功（绿）/ 部分失败（橙）/ 全部失败（红）
   · 每卡可「预览」（Modal iframe）/「下载」（Blob）
```

**SSE 消息分支处理**：

| 事件 | 处理 |
|------|------|
| `connected` | 日志「SSE 连接成功」/「SSE 重连成功（N 条缓冲）」 |
| `task-status` | 「任务进行中，已恢复 N 条进度」 |
| `progress` | `status==='cancelled'` → 终止流程；否则按 status 落 info/error 日志 |
| `complete` | 捕获 results → 组装汇总（total / success / failed / status） |
| `error` | error 日志 + 收尾 |
| `cancelled` | warn 日志 + 收尾 |
| `log` | 按 level 落日志 |

**日志恢复**：从 `task.progress` 数组回放 —— 含 metrics+tokens 的渲染 Token 行；`budget-warning`/`budget-exceeded` 落 warn/error；其余按 status 定级。

### M3.5 关键子交互

**子组件预览 Modal**：
- iframe `sandbox="allow-scripts"`
- 三个按钮：刷新（清空 URL 再复位）/ 新窗口打开 / 关闭
- 点遮罩关闭

**结果卡**：✓/✕ 状态图标 + 组件名 + 类型标签 + figmaNodeId + 耗时秒 + 迭代轮数；成功且有子任务 ID 时给「预览」「下载」。

### M3.6 状态与持久化

全部局部 ref，Pinia 只读消费 AI 配置。唯一持久化：`localStorage['page-gen-active-session']` = `{sessionId, figmaUrl, startTime}`。

### M3.7 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/page-generator/analyze` | 分析页面结构 |
| POST | `/api/page-generator/generate` | 页面级批量生成 |
| SSE | `/api/progress/{sessionId}?token=` | 进度 |
| GET | `/api/tasks/status/{sessionId}` | 状态查询 / 恢复 |
| POST | `/api/tasks/cancel/{sessionId}` | 取消 |
| GET | `/api/phase2/download/{childSessionId}` | 子组件 ZIP |

---

## M4 工作台（对话式）

| 项 | 值 |
|----|-----|
| 路由 | `/workbench`、`/workbench/{conversationId}` |
| 文件 | `frontend/src/views/workbench/index.vue` + `views/workbench/components/` |

### M4.1 用户目标

用自然语言对话完成组件的生成、修改、绑定、交付与版本管理，同屏看到代码 / 预览 / AI 助手。

### M4.2 页面布局

**三栏 + 全局浮层**：

```
【浮层1】取消生成二次确认弹窗
【浮层2】交付组件弹窗（发布公共池 / 推送 GitLab）
【浮层3】版本历史弹窗（列表 + 回滚）
├── 左栏：对话列表（搜索 / 分组 / 右键菜单 / 批量管理）
├── 中栏：对话头部 + 消息流 + 输入框
├── 右栏：RightPanel（可折叠 + 可拖宽，≥1400px 默认展开）
├── 全局配置面板（v-if 打开）
└── 任务监控悬浮球（自包含轮询）
```

### M4.3 输入项

**输入框**：
- textarea 自适应高度（最大 120px）
- 默认占位「输入消息，按 Enter 发送，Shift+Enter 换行...」
- 图片附件：拖拽 / 粘贴，**单张 ≤ 8MB**，72×72 缩略图可移除
- 发送按钮禁用：无文字**且**无附件
- 无文字但有图时自动补「根据这张截图生成组件」以命中后端意图

**斜杠命令**（输入 `/` 触发，↑↓ 导航 / Enter 确认 / Esc 关闭）：

| 命令 | 描述 | 填充文本 |
|------|------|---------|
| `/生成` | 从截图或 Figma 生成组件 | `生成组件：` |
| `/统计` | 查看生成统计 | `查看生成统计` |
| `/绑定` | 为组件绑定 API | `绑定 API：` |
| `/推送` | 推送到 GitLab | `推送到 GitLab` |
| `/工作流` | 执行工作流/配方 | `执行工作流：` |
| `/批量` | 批量生成组件 | `批量生成：` |

### M4.4 消息卡片体系（7 种）

| type | 用途 | 关键交互 |
|------|------|---------|
| `progress` | 生成进度 | 挂载即启动 1.5s 轮询；暂停/恢复/取消/重试/体检；👍👎 一次性反馈 |
| `preview` | 预览图 | — |
| `confirm` | 参数确认 | 可改技术栈与档位，确认后回传修改过的 `pendingToolCall` |
| `stats` | 统计 | — |
| `list` | 列表 | — |
| `action` | 操作卡 | 动作按钮 |
| `diff` | 代码变更 | — |

**confirm 卡的可切换项**：
- 技术栈：`microcode` 微码组件 / `vue3` Vue3 组件（默认取 pendingToolCall 参数，缺省 microcode）
- 档位：`lite` 轻量 / `max` 完整（缺省 max）；**截图来源时只显示 Lite**
- 仅 `create_component_from_screenshot` / `create_component_from_figma` 两个工具展示选择器

**progress 卡的阶段映射**（5 步显式数值表，非关键词匹配）：

| 步骤 | stage 命中 |
|------|-----------|
| 0 | `precheck` / `figma-fetch` / `figma-parse` / `analyzing` / `analysis` / `vision-agent` / `vision` |
| 1 | `layout` |
| 2 | `generating` / `codegen` / `generate` |
| 3 | `quality` / `gate` |
| 4 | `snapshot` / `persist` |

> 设计原因：`precheck` 含「校验」语义，用关键词匹配会被误映射到索引 3，导致进度条开场跳 66%。未登记的 stage 按已完成 stage 数线性兜底。进度百分比上限 99 且单调不回退。

### M4.5 交互流程

```
① 打开页面
   → 拉对话列表；URL 无 conversationId 时自动加载最近一次并 replace URL
   → loadConversationArtifacts()：双来源拉产物
       ① conv.currentComponentId 存在 → 拉组件文件列表 + 逐文件读内容
       ② 从消息流提取所有 progress 卡的 sessionId → 拉最新代码快照 + 逐文件读
       （图片扩展名跳过文本拉取；单个产物失败不影响其它）
② 首屏 4 个快捷入口
   · 「从截图生成」/「从 Figma 生成」→ 聚焦输入框 + 覆盖占位引导贴素材
   · 「查看我的组件」/「查询任务状态」→ 直接发送预设意图消息
③ 输入 / 拖图 / 斜杠命令 → 发送
   → POST /api/workbench/conversations/{id}/messages
   → 追加 user + assistant 消息，同步 messageCount / title / lastActiveAt / currentComponentId
④ 后端下发卡片 → 渲染图片附件 + 卡片
⑤ 参数确认卡 → 用户改参数 → 「按以上设置生成」
   → 把修改后的 pendingToolCall 写回并再次发送
   （不这样做会导致「选了 Vue3 却生成微码」）
⑥ progress 卡挂载 → 1.5s 轮询任务状态
   · 「暂停/恢复」→ POST /tasks/pause|resume/{sid}
   · 「取消生成」→ 二次确认弹窗 → POST /tasks/cancel/{sid}
   · 「重试生成」→ 聚焦输入框引导重贴素材
   · 「体检」→ 两路并行：门禁校验 + 视觉相似度分析，issues 可展开明细
⑦ 完成 → 🎉 产物区 + 「查看产物 →」跳任务详情
   → 续做按钮：改样式 / 绑 API / 交付 / 版本 / 再来一个
   → 浏览器 Notification 提醒（按 sessionId 去重）
⑧ 右栏（4 Tab，快捷键 Ctrl+Q/E/P 切换，Esc 收起）
   · 代码：可折叠目录树 + Monaco 只读 + 复制/下载；默认选中优先级
       package/index.vue > index.vue > component.js > component.ts > files[0]
   · 预览：iframe 复用 /preview/{componentId}
   · AI 助手：可携带当前文件上下文 → SSE 流式对话 → AI 写盘后清 Vite 缓存并强制重载预览
   · 版本历史：需 ≥2 个产物；双 select 选基准/对比版本 → 自研 LCS 行级 diff
       文件排序：added → removed → modified → unchanged
⑨ 交付 / 版本弹窗
   · 交付：发布到公共池 / 推送 GitLab（后者通过发消息驱动）
   · 版本：列出全部 revision（last-good / candidate / validating / partial / rejected），一键回滚
```

**右栏快捷键**：`Ctrl/Cmd+Q` AI 助手、`+E` 代码、`+P` 预览、`+C` 复制、`+D` 下载文件、`+1/2/3` 切换前 3 个文件、`Esc` 收起面板。每次显示 2s toast。Monaco / 输入框内不拦截。

### M4.6 对话列表管理

- **搜索**：本地过滤 displayName
- **分组 pills**：全部 / 各分组（带计数）/ ＋分组
- **分组折叠**：箭头旋转
- **右键菜单**：
  - 对话：重命名 / 移动到分组 / 删除
  - 分组：新建 / 重命名 / 删除
- **删除分组三选项**（组内有对话时）：移到未分组后删 / 连同对话强删 / 取消
- **批量管理**：底部入口进入，全选 checkbox + 已选计数 + 移动 / 删除 / 退出
- **未分组**是系统兜底，不支持重命名/删除，只暴露「新增」
- **空态**：「没有找到匹配的对话」/「暂无对话记录」

### M4.7 状态与持久化

**Pinia `useWorkbenchStore`**（setup 风格）：
- State：`conversations` / `currentConversation` / `loading` / `sending` / `toolCredentials` / `rightPanelVisible` / `artifacts` / `selectedArtifactIndex`
- Getters：`sortedConversations`（按 lastActiveAt 倒序）/ `currentMessages` / `currentArtifactFiles`
- 本页无自身 localStorage/sessionStorage 读写；面板可见性仅在内存

**右侧面板宽度**：默认 480px，clamp [320, 800]。

### M4.8 接口清单

**对话与分组**：

| 方法 | 路径 |
|------|------|
| POST | `/api/workbench/conversations` |
| GET | `/api/workbench/conversations?limit=20` |
| GET | `/api/workbench/conversations/search?q=&limit=10` |
| GET | `/api/workbench/conversations/{conversationId}` |
| POST | `/api/workbench/conversations/{conversationId}/messages` |
| POST | `/api/workbench/conversations/{conversationId}/rename` |
| POST | `/api/workbench/conversations/{conversationId}/context` |
| POST | `/api/workbench/conversations/{conversationId}/delete` |
| POST | `/api/workbench/conversations/batch-delete` |
| POST | `/api/workbench/conversations/move-to-group` |
| POST | `/api/workbench/conversations/{conversationId}/clear-component` |
| GET/POST | `/api/workbench/conversations/{conversationId}/credentials` |
| GET/POST | `/api/workbench/groups` |
| POST | `/api/workbench/groups/{name}/rename` |
| POST | `/api/workbench/groups/{name}/delete?force=` |
| GET | `/api/workbench/stats` |
| POST | `/api/workbench/feedback` |
| GET | `/api/workbench/feedback/stats?months=1` |

**任务与快照**：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/tasks/status/{sessionId}` | 进度卡轮询（1.5s） |
| GET | `/api/tasks/{sid}/code-snapshots/latest` | 最新快照 |
| GET | `/api/tasks/{sid}/code-snapshots/revisions` | 版本历史 |
| GET | `/api/tasks/{sid}/code-snapshots/{rev}/file?path=` | 读单文件 |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/rollback` | 回滚 |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/validate` | 门禁校验 |
| POST | `/api/tasks/{sid}/publish-to-workspace` | 发布到 workspace |
| POST | `/api/component/{cid}/analyze-visual` | 视觉相似度 |
| POST | `/api/demo/ai-chat/stream` | AI 助手（SSE） |

---

## M5 任务中心

| 项 | 值 |
|----|-----|
| 路由 | `/tasks` |
| 文件 | `frontend/src/views/tasks/TaskCenter.vue` |

### M5.1 用户目标

一眼掌握所有生成任务的状态与产出，快速筛选定位异常任务，执行暂停/取消/下载/删除等运维操作。

### M5.2 页面布局

```
页头：标题 + [新建生成任务] + [刷新]
总览仪表盘
├── 环形完成率（SVG）+ 任务总数 + 今日生成
└── 4 张状态磁贴（已完成 / 运行中 / 失败 / 今日生成）
筛选栏
├── 左：状态分段 + 类型下拉 + 来源下拉 + 清除筛选
└── 右：搜索框 + 排序下拉
批量操作栏（列表非空时）
可滚动区
├── 任务卡片列表
├── 空态「暂无任务记录」+ 去组件生成
└── 分页（总页数 > 1 时）
```

### M5.3 筛选 / 搜索 / 排序

全部为**前端侧过滤 + 前端分页**（非服务端分页）。

| 维度 | 枚举值 |
|------|-------|
| 状态（单选） | 全部 / 进行中 / 已完成 / 失败 / 排队中 |
| 类型 | 全部 / 微码组件 / 普通组件 / 页面生成 |
| 来源 | 全部 / 截图输入 / Figma 输入 / HTML 输入 / 传统生成 |
| 排序 | 最新优先 / 最早优先 / 名称排序（中文 localeCompare） |
| 今日筛选 | `startTime >= 今日 0 点`，**与状态维度互斥** |
| 搜索 | 匹配 displayName + componentName（大小写不敏感） |

**分页**：pageSize = 15，纯前端 slice，上一页/下一页 + 当前页/总页数，无页码跳转。

**URL 同步**：筛选与搜索条件变化时 `router.replace` 写入 query（不产生新历史），从详情页返回可恢复筛选。
> 注意：今日筛选未写入 URL，返回时会丢失。

**磁贴联动**：点击磁贴 = toggle 快速筛选。

### M5.4 行内操作与前置条件

| 按钮 | 显示条件 | 接口 |
|------|---------|------|
| 暂停 | `running` | `POST /api/tasks/pause/{sid}` |
| 恢复 | `paused` | `POST /api/tasks/resume/{sid}` |
| 开始 | `queued` / `rate_limited` / `retry_scheduled` | `POST /api/tasks/queue/start/{sid}` |
| 取消 | `running`/`paused` → 取消；排队态 → 取消排队 | `POST /api/tasks/cancel/{sid}` / `POST /api/tasks/queue/cancel/{sid}` |
| 下载 | `completed` | `GET /phase2/download/{sid}` |
| Playground | 产物可打开 | 前端路由跳转 |
| 删除 | 恒显示，但 `running`/`paused` 时置灰 + tooltip「请先取消」 | `POST /api/tasks/{sid}/delete` |

**批量操作**：勾选（支持本页全选 + 半选）→ 确认 → `POST /api/tasks/batch-delete`，响应分别提示成功数与失败数。

**删除确认文案区分两态**：执行中任务额外提示「任务记录与生成进度」与「workspace 中已生成的组件代码（原文件）」。

### M5.5 卡片标记

| 标记 | 条件 | 展示 |
|------|------|------|
| 人工通过 / 人工警告 | `humanReview` 存在 | 徽标 + 悬浮说明（动作 / 原因 / 审核人 / 时间） |
| 跳过剩余 | `userApproved` | ⚡ 角标 + 悬浮显示被跳过的阶段 |
| 失败错误 | `failed` 且有 error | 行内单行截断展示 |
| 档位推断 | 无 generationTier 时从 sessionId 第 2 段推断 | Lite / Max |
| 来源推断 | 无 sourceType 时从 sessionId 前缀推断 | 截图 / Figma / 传统 |

### M5.6 自动刷新

存在 `running` 任务时每 **5s** 重查一次；组件卸载时清理定时器。

### M5.7 状态与持久化

Pinia 只读消费 AI 配置。筛选状态写入 URL query。无 localStorage。

### M5.8 接口清单

| 方法 | 路径 |
|------|------|
| GET | `/api/tasks` |
| GET | `/api/tasks/queue/stats` |
| POST | `/api/tasks/pause/{sessionId}` |
| POST | `/api/tasks/resume/{sessionId}` |
| POST | `/api/tasks/cancel/{sessionId}` |
| POST | `/api/tasks/queue/start/{sessionId}` |
| POST | `/api/tasks/queue/cancel/{sessionId}` |
| POST | `/api/tasks/{sessionId}/delete` |
| POST | `/api/tasks/batch-delete` |
| GET | `/api/phase2/download/{sessionId}` |

---

## M6 任务详情

| 项 | 值 |
|----|-----|
| 路由 | `/tasks/{sessionId}` |
| 文件 | `frontend/src/views/tasks/TaskDetail.vue` |

### M6.1 用户目标

实时跟踪单个生成任务的完整生命周期（阶段推进、日志流、代码产物、质量门禁），并在失败或草稿状态下完成「诊断 → 修复 → 交付」闭环。

### M6.2 页面布局

```
面包屑栏：返回 | 任务号 + 组件中文名 + 组件ID | [暂停|恢复|取消|刷新|规格检查|质量分|推 GitLab]
主体（左右分栏）
├── 左侧栏（任务存在时）
│   ├── 任务配置：输入源（禁用）+ 源缩略图 + Figma URL + 代码类型 + 生成规格
│   ├── 任务信息：任务号 / 状态徽章 / 名称 / 创建时间 / 耗时
│   ├── AI 模型（任务非 running 且有模型记录时）
│   └── 质量门禁徽章
└── 主内容区
    ├── 三态守卫：加载中 / 任务初始化中（2s 重试最多 3 次）/ 任务不存在
    ├── 概览区：身份区 + 验收徽章 + 横向步骤进度条 + LLM 节点耗时条 + 失败摘要卡
    ├── 交付面板
    ├── 组件名 + Playground 按钮 + 草稿模式提示 + 操作按钮组
    ├── 4 Tab：日志 / 产物 / 统计 / 预览
    ├── 等待态操作区（排队中）
    └── 审核状态区
弹层：组件分析抽屉 / 人工审核 / API 绑定向导 / 源图放大 / GitLab 推送 / 公共池发布
```

### M6.3 阶段进度展示

**数据来源**：SSE `type:progress` 事件增量合并；进入页面时从 `task.progress` 数组回放重建。

**展示形式**：横向可滚动步骤条
- 顶部摘要：`第 {n}/{total} 步` + `进行中：{当前阶段}` 或 `失败：{失败阶段}`
- 轨道：底轨 + 填充条（宽度 = 进度百分比）
- 节点：**可点击**，点击滚动日志面板到对应阶段

**6 种节点状态**：

| 状态 | 图标 | 标签 | 判定 |
|------|------|------|------|
| `completed` | ✓ | 完成 | 阶段 completed/warning；任务已终态时 running 兜底改 completed |
| `active` | ● 脉冲 | 进行中 | 首个 running 且任务非终态 |
| `parallel` | 序号 | 并行 | 非首个的 running（并行降级，避免一串相同圆圈） |
| `failed` | ✗ | 失败 | 阶段 failed；任务终态时 running 兜底改 failed |
| `skipped` | 序号 | 已跳过 | 失败步之后的 pending |
| `pending` | 序号 | 等待中 | 其余 |

**阶段名映射**（三层兜底）：全局 stage 映射表 → 局部映射表（含页面骨架管线英文 key）→ 未知 key 按分隔符转空格 + 首字母大写。

**状态标签细化**：running 时按当前活跃阶段反查，把粗粒度「运行中」细化为「数据采集中 / 分析中 / 代码生成中 / 质量校验中」。

**进度百分比**：
- 终态 → 100
- `completed` / `warning` 阶段各计 100（**warning 之前按 0 贡献会导致进度长期卡 ~50%**）
- `running` 阶段用其 progress 值，缺省 50
- failed / pending / BLOCK / error → 0
- 最终 `min(99, ...)`，运行中不显示 100

### M6.4 日志面板

**行结构**：`[时间] [模型] [慢归因徽标] [级别标签] 消息 ×N`

| 元素 | 取值 |
|------|------|
| 时间 | `HH:MM:SS`（24 小时制），缺时间戳时 `--:--:--` |
| 模型 | 从 `meta.model` / `meta.agentModel` / `model` 取，title「本次调用模型: X」 |
| 级别 | `log` 事件 → `[INFO]/[WARN]/[ERROR]`；`progress` 事件 → `[STATUS]`（如 `[COMPLETED]`） |
| 慢归因徽标 | 模型启动 / 模型响应慢 / 平台排队 / 模型不可用 / 思考模式 / 关思考失败 / 重试中 |
| 折叠计数 | 同内容 2 秒窗口内合并为一行显示 ×N（**不可点开**） |

**接缝去重**：状态接口返回的历史 progress 与 SSE buffer 可能重叠，加载时记录每条历史日志的指纹计数，SSE 到来时命中则消费一次并丢弃。
> 只做接缝副本去重，**不做任务生命周期永久去重**，避免丢失稍后再次出现的有效同名日志。

**工具栏**：
- 过滤：全部 / INFO / WARN / ERROR（按 level 严格等于）
- 操作：复制日志 / 下载日志

**页脚**：running 时显示「🔴 实时流式输出中」+ 总行数 + 「自动滚动」checkbox（默认开）+ 快捷键提示「按 H 切换面板」。

**空态**：「暂无日志输出」。

### M6.5 操作按钮全集（23 项）

#### 顶部操作栏

| # | 按钮 | 条件 | 接口 |
|---|------|------|------|
| 1 | 暂停 | `running` | `POST /api/tasks/pause/{sid}` |
| 2 | 恢复 | `paused` | `POST /api/tasks/resume/{sid}` |
| 3 | 取消 | `running \|\| paused`（二次确认） | `POST /api/tasks/cancel/{sid}` |
| 4 | 刷新 | 恒显示 | 前端重载 |
| 5 | 规格检查 | 微码组件 且（已完成或有文件） | `POST /api/mc-spec/check` |
| 6 | 质量分 | 非页面 且 管理员 且 功能开关开启 且 有产物 | `POST /api/mc-spec/quality-score` |
| 7 | 推送 GitLab | 非页面 且 功能开关开启 且 有产物 | GitLab 推送弹窗 |

#### 交付面板

| # | 按钮 | 条件 |
|---|------|------|
| 8 | 下载产物 | `completed` 或 可进 Playground |
| 9 | 推送/下架公共池 | 非页面 且 已完成 且 有组件记录 且 是自己的 |
| 10 | 对接接口 | 非页面 且 有产物 且 Vue3 且 未绑定 |
| 11 | 撤回对接 | 非页面 且 已绑定 |
| 12 | 上传产物（草稿） | `failed` 且 可进 Playground |

#### 组件区操作组

| # | 按钮 | 条件 |
|---|------|------|
| 13 | Playground | 产物就绪 |
| 14 | 升级素材 | Figma + Lite + 已完成（已升级则置为 disabled「已升级」） |
| 15 | 重新生成 | `failed \|\| cancelled` |
| 16 | 删除任务 | 非 `running` 且非 `paused` |

#### 产物面板 / 预览框

| # | 按钮 | 条件 | 接口 |
|---|------|------|------|
| 17 | 编辑 / 保存 | 快照可编辑（非页面 且 状态属 candidate/partial/validating/last-good） | `POST .../edit` |
| 18 | 重新校验 | 恒显示 | `POST .../validate` |
| 19 | 刷新预览 | 恒显示 | 重建 iframe |

#### 等待态 / 审核态

| # | 按钮 | 条件 | 接口 |
|---|------|------|------|
| 20 | 继续生成 | `queued`/`rate_limited`/`retry_scheduled` | `POST /api/tasks/queue/start/{sid}` |
| 21 | 取消排队 | 同上 | `POST /api/tasks/queue/cancel/{sid}` |
| 22 | 撤回审核 | 已人工审核 | `POST /api/tasks/{sid}/human-review/delete` |

#### 失败态操作区（预览面板内，9 项）

| 按钮 | 条件 | 说明 |
|------|------|------|
| 换用 {模型} 重试 | 诊断建议为「换模型重试」 | 带「推荐」徽标；仅 Figma 任务支持 |
| 强制预览当前产物 | 有代码快照 | 先发布到 workspace 再渲染 |
| 进入 Playground 修复 | 可进 Playground | 诊断建议为 Playground 时带「推荐」 |
| 下载草稿代码 | 有失败下载链接 | 不改任务状态 |
| 重新生成 | 非页面任务 | 诊断建议为重试时带「推荐」 |
| 续跑（复用缓存） | 非页面任务 | 复用 Figma 分析缓存，跳过拉取与视觉分析 |
| 重新生成页面骨架 | 页面任务 | — |
| 查看详细日志 | 诊断建议为查日志 | 切日志 Tab 并置过滤为 ERROR |
| 复制错误信息 | 恒显示 | 生成结构化 Markdown 上下文 |

**重试三条路径**：
```
截图 + Lite  → POST /api/lite/retry/{sid}
其余        → 先防御 fileKey/nodeId 为空（避免后端 400）
             → POST /api/phase2/generate（Vue3 带 target:'vue3'），body 含 reuseCache
换模型重试   → 同上，config 覆写 textModel + visionModel，reuseCache: true（只换模型，复用缓存）
成功且返回新 sessionId → router.push 到新任务详情；否则原地重载
```

### M6.6 代码快照展示

**选择优先级**：`codeSnapshot = candidate || partial || lastGood`，`lastGoodSnapshot` 单独持有。

**预览源优先级**（独立逻辑）：**有 lastGood 时优先用它** —— 否则生成刚完成就跳预览可能选中「修复器还没补齐变量前的坏候选」。

**来源标签**：
| 状态 | 标签 |
|------|------|
| candidate | 候选版本 |
| validating | 校验中版本 |
| partial | 半成品版本 |
| last-good | 稳定版本（已过门禁） |
| rejected | 已拒绝版本 |

标签后缀 `r{revision 末 6 位}`，再拼「· N 个阻断问题（预览仅供参考）」或「· 无阻断问题」。

**双槽位安全换帧**：
```
新 revision → 挂到 pending 槽（隐藏但已加载）
           → 收到 iframe 内 MVGO_PREVIEW_READY{revision} 且匹配
           → swap 为 active
候选失败（MVGO_PREVIEW_ERROR）→ 保留旧活动帧，仅标记换帧失败
rejected 快照 → 直接不入队
```

**文件树**：扁平清单转目录树，文件夹在前、同层按名称排序，可折叠。每个文件显示状态点 + 名称 + 格式化体积。

**文件状态（9 种）**：正在处理中 / 模型生成中 / 正在解析 / 正在写入 / 本轮已修改待校验 / 正在校验 / 校验通过 / 校验失败 / 本轮未变化。
> 语义规则：SSE 生命周期标记优先；未标记时若命中 BLOCK 诊断也视为「校验失败」——否则文件树状态点与问题文件清单会互相矛盾。

**编辑闭环**：
- 可编辑条件：快照存在 + 非页面任务 + 状态 ∈ {candidate, partial, validating, last-good}（**rejected 不可编辑**）
- 保存：内容未变 → 提示「内容未变化，无需保存」；否则写为新 candidate → 重拉 latest（自动换帧）→ 自动重新校验
- 快捷键 `Ctrl/Cmd+S`

### M6.7 质量诊断展示（四处）

**诊断数据源**（合并 4 桶去重）：
1. `task.result.codeValidationResult.issues`
2. `task.result.lessCompileGate.diagnostics`
3. `task.result.runtimeGate.issues`
4. 本次手动重新校验结果

> 权威源是 `task.result` 而非日志文本。旧实现用「日志文本包含文件名」做匹配，只能给出「某文件有问题」，无行号无错误码 —— 这正是「定位过去依旧不知道错在哪」的根因。

**展示位置**：

| # | 位置 | 内容 |
|---|------|------|
| 1 | 产物面板左栏 | 「N 个文件存在问题」摘要 + 定位按钮 + 逐文件 chip（文件名 + BLOCK 数），点击直达 |
| 2 | 当前文件错误明细条 | 逐条：错误码 + `file:line:column`（可点滚动居中）+ message + 代码片段（当前行高亮）+ 建议；页脚「复制错误」「查看完整日志」 |
| 3 | 失败引导卡 | 「共 N 个阻断问题，分布在 M 个文件」+ 前 8 条 BLOCK 明细，超出提示切 Tab 看全部 |
| 4 | 预览框 | 「重新校验」按钮（重跑门禁拿诊断，不影响当前预览） |

**问题文件定位的存在性防御**：诊断可能指向快照中**不存在**的文件（如「缺少被引用的样式文件」），直接打开会 404。故先判存在性，缺失时提示「在当前快照中不存在，无法打开源码」并给出 message + hint。

**重新校验反馈**：通过 → 成功提示「重新校验通过：无阻断问题」；不通过 → 警告「仍有 N 个阻断问题，点击文件列表『定位』可直达具体行列」。

### M6.8 失败诊断

**失败根因摘要**（四级优先）：
```
① task.error
② 最后一条 error 级日志（清理 emoji 前缀与 [key] 前缀）
③ task.progress 中 status==='failed' 项的 message
④ 兜底：「在 {失败阶段} 阶段失败」/「未知原因，请查看详细日志」
```

**智能诊断**（优先用后端 `GET /api/task-stats/failure-analysis?sessionId=`）：

| category | 类型 | 图标 | 建议动作 |
|----------|------|------|---------|
| compile_error | 代码语法错误 | 🐛 | 进 Playground |
| resource_missing | 资源缺失 | 🖼️ | 进 Playground |
| model_capability | 模型能力不足 | 🤖 | 进 Playground |
| timeout | 生成超时 | ⏱️ | 进 Playground |
| rate_limit | 网络/限流 | 🚦 | 重试 |
| auth_error | 鉴权失败 | 🔑 | 查日志 |
| validation_error | 质量门禁 | 🚧 | 进 Playground |

后端无结果时降级为**前端本地诊断**（按关键词）。
> 「服务重启 / 任务中断 / 进程中断 / 已被取消」判定为「生成被中断」而非未知错误，且优先级高于 unknown。这类任务的产物是 chunk 级候选快照（源码与图片已落盘，但标准样式入口在后续步骤才写盘，进程被杀时没执行），**不是代码缺陷，重跑即可**。

**诊断标签中文枚举**：生成超时 / 质量门禁未通过 / 代码语法错误 / 网络异常中断 / 生成被中断 / 未知错误。

### M6.9 预览面板

**三种互斥形态**：
1. `running` 且无可预览快照 → 骨架屏 +「正在渲染组件预览... {pct}%」
2. 可预览 → 真实 iframe
3. `failed` → 失败引导卡

**预览可展示条件**：页面任务 completed 直接放行；否则有 active/pending 快照或产物就绪标记。

**响应式测试工具栏**：保真/响应式切换 + 实时尺寸 + 5 个视口预设 + 「解锁宽」+「重置」；响应式下暴露三向拖拽手柄。

**面板类型下拉**（仅微码组件且非页面）：
`使用默认 / 默认·浅色 / 弹窗 / 一体化·深色 / 无面板`，通过 postMessage 下发 iframe。
> 另有 `mvgo-preview-mounted` 握手补发机制 —— 不能只依赖 iframe 的 `load` 事件，那时 iframe 内 Vue 可能尚未 mounted。

**提示文案分支**：换帧中 / 稳定预览 / 候选预览 / 等待首个可编译版本 / 组件预览 / **降级预览**（失败但产物可渲染，附阻断问题数）/ 预览尚未加载 / 预览不可用。

### M6.10 统计面板（5 张卡）

生成组件数 / 代码文件数 / 代码行数 / 已用时间 / 预计剩余。

**预计剩余时间**：线性外推 `已用 × (100-进度)/进度`；进度 ≤5% 且已用 <30s → 180s；有阶段未完成 → 阶段数 × 45s；否则 `已用 × 3`。上限 >10min，下限 <30s。

**行数缺字段时显示 `-` 而非 0**，避免误导。

### M6.11 下载链

| 任务类型 | 下载接口 |
|---------|---------|
| 页面任务 | `GET /api/page-skeleton/{groupId}/{pageId}/download` |
| 组件已完成 | `GET /api/component/download/{componentId}`（含 API 绑定注入产物） |
| 失败/取消 | `GET /api/tasks/{sid}/code-download` |

全部走 `downloadByUrl`（fetch + Blob），原因：原生 `<a download>` 不带 Token 头 → 生产 401。

### M6.12 Tab 与降级提示

**4 Tab**：日志 / 产物（带文件数计数 + 未读红点）/ 统计 / 预览。快捷键 `H` 切换日志。

**降级提示分布**：
| 提示 | 位置 | 条件 |
|------|------|------|
| 缺失关键文件 | 产物面板顶部 | `status === 'partial'` 且有 missingFiles |
| 草稿模式横幅 | 组件名区 | 主组件尚未生成完，进 Playground 后被锁定不可编辑，子组件可正常编辑 |
| 预览错误横幅 | 预览面板 | iframe 内 postMessage 上报 |
| 源缩略图 404 | 左侧栏 | 占位符 + 轮询重试 |
| 文件读取失败 | 产物面板 | 红字提示 |
| 图片/字体/二进制 | 产物面板 | 分别走 img 预览 / 「字体文件不支持预览」/ 「二进制文件不支持预览」 |

### M6.13 状态与持久化

Pinia 只读消费 AI 配置与分组 id。无本页 localStorage 写入。

### M6.14 接口清单（共 29 个）

**核心**：
| 方法 | 路径 |
|------|------|
| GET | `/api/tasks/status/{sessionId}` |
| SSE | `/api/progress/{sessionId}?token=` |
| GET | `/api/tasks/{sid}/code-snapshots/latest` |
| GET | `/api/tasks/{sid}/code-snapshots/{rev}/file` |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/edit` |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/validate` |
| POST | `/api/tasks/{sid}/publish-to-workspace` |
| GET | `/api/tasks/{sid}/code-download` |

**任务操作**：pause / resume / cancel / delete / queue/start / queue/cancel / human-review / human-review/delete

**重试与升级**：`POST /api/lite/retry/{sid}`、`POST /api/lite/upgrade-assets/{sid}`、`POST /api/phase2/generate`

**诊断与统计**：`GET /api/task-stats/failure-analysis?sessionId=`、`GET /api/token-usage/task/{sid}`

**组件与绑定**：`GET /api/component/by-session/{sid}`、`GET /api/component/{cid}/files`、`POST /api/component/{id}/unpublish`、`GET /api/vue3/bindings?componentId=`、`POST /api/vue3/bindings/{bindingId}/delete`

**页面任务**：`GET /api/page-skeleton/{groupId}/{id}`、`GET /api/page-skeleton/{groupId}/{id}/files`、`POST /api/page-skeleton/{groupId}/{id}/retry`

**下载**：`GET /api/component/download/{componentId}`


---

## M7 组件库

| 项 | 值 |
|----|-----|
| 路由 | `/components`（name: `ComponentLibrary`） |
| 文件 | `frontend/src/views/components/ComponentLibrary.vue` |

### M7.1 用户目标

按可见范围（公共池 / 我的）检索、预览、下载、发布/下架、删除组件。

### M7.2 页面布局

```
头部
├── 左：标题 + 范围 Tab（公共组件池 / 我的组件）+ 总数
└── 右：搜索框 + 排序下拉 + 批量管理按钮组
加载态 spinner / 错误态（带重试按钮）
表格（11 列）
空态（按范围文案区分）
加载哨兵（IntersectionObserver）
公共池发布弹窗
```

### M7.3 列表能力

**范围 Tab**：
| 值 | 标签 | 默认 |
|----|------|------|
| `public` | 公共组件池 | **默认** |
| `mine` | 我的组件 | — |

切换副作用：退出批量模式 + 排序重置（public → `shared`，其余 → `lastEdited`）+ 重新加载。

**排序枚举**：`lastEdited` 最近编辑 / `created` 创建时间 / `name` 名称 / `shared` 最近发布。默认 `shared`。

**搜索**：300ms 防抖，传服务端 `search` 参数。

**分页**：**服务端分页 + 无限滚动**。pageSize = 12，`IntersectionObserver`（rootMargin 640px）触发追加。哨兵三态文案：「继续加载中...」/「向下滚动加载更多」/「已加载全部组件」。

**不按群组过滤**（`groupId` 恒为 undefined）：公共池是平台级范围；「我的组件」应展示跨群组组件。

**表格列（11）**：勾选（仅批量模式且非公共池）/ 缩略图 / 组件名+描述 / 组件类型 / 组件编码（截断 20 字符 + 复制）/ 组件规格 / 所属群组 / 生产时间 / 上传者 / 上池时间 / 操作

**派生规则**：
| 字段 | 规则 |
|------|------|
| 组件规格 | 编码含 `lite` → Lite，含 `max` → Max，否则 `—` |
| 缩略图 | 优先 `previewUrl`，否则拉标准截图文件；**只加载截图不运行 iframe** |
| 缩略图失败 | 显示「无预览」 |
| 群组 | 优先 `groupName`，回退「组 {groupId 末 6 位}」，全码在 tooltip |
| 上传者 | `username` → `name` → id 末 6 位 → 「未知」 |
| 组件类型 | `target`/`metadata.type` 优先，历史数据按 sessionId 前缀兜底 |

### M7.4 交互与权限

**批量管理**：仅「我的组件」显示入口。进入后四个按钮：全选 / 取消 / 删除(N) / 完成。
> **全选只选自己的组件**（删除权限仅提供者），他人 checkbox 置灰。

**行内操作**：
| 操作 | 条件 |
|------|------|
| 下载 / 预览 | 恒显示 |
| 发布 ↔ 下架 | 仅自己的组件，按当前可见性切换按钮形态 |
| 删除 | 仅自己的组件 |

**发布流程**：先拉全量记录做增量更新再 publish —— 因为更新操作会整体替换 metadata，直接 publish 会丢 figma 等既有字段。

**401/403 处理**：门户内刷新父窗口；非门户仅中断（登录页已移除）。

### M7.5 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/component/list` | 列表（支持 groupId/search/creator/scope/sortBy/page/pageSize） |
| GET | `/api/component/{componentId}` | 详情 |
| POST | `/api/component` | 更新 |
| POST | `/api/component/{componentId}/delete` | 删除 |
| POST | `/api/component/batch-delete` | 批量删除 |
| POST | `/api/component/{id}/publish` | 发布到公共池 |
| POST | `/api/component/{id}/unpublish` | 下架 |
| GET | `/api/component/{componentId}/file?path=&raw=1` | 读文件（缩略图） |
| GET | `/api/demo/download/{componentId}` | 下载 |

---

## M8 组件详情

| 项 | 值 |
|----|-----|
| 路由 | `/components/{id}`（name: `ComponentDetail`） |
| 文件 | `frontend/src/views/components/ComponentDetail.vue` |

### M8.1 用户目标

单组件的「编辑 + 预览 + 分析 + 对接」工作台：改源码即时预览，AI 对比设计稿，一键对接后端接口。

### M8.2 页面布局

```
头部：返回 | 名称 + 类型徽章 + 公共徽章 | 创建者/创建/更新/发布信息 | 操作按钮组（9 个）
Figma 来源条（有 figmaUrl 时）
编辑-预览分屏
├── 编辑面板（左，开关控制）
│   └── index.vue + 状态（加载中/错误/保存中/●未保存/已保存）+ Monaco（html，vs-dark）
└── 预览面板（右）
    └── 视口切换（桌面/平板/手机）+ 只读 URL + 复制 + iframe + 错误横幅
信息面板（展开时）
文档纠偏面板（微码组件，上传需求文档纠偏）
抽屉：组件分析抽屉
弹窗：公共池发布
```

### M8.3 视口枚举

| 值 | 标签 | 说明 |
|----|------|------|
| `desktop` | 桌面 | 100%，按 Figma 原始尺寸 1:1；容器窄时等比收缩不超容器 |
| `tablet` | 平板 | 预设尺寸 |
| `mobile` | 手机 | 预设尺寸 |

宽高取自 `constants/previewViewports` 单一数据源。

### M8.4 操作按钮与前置条件

| 按钮 | 条件 | 行为 |
|------|------|------|
| 发布到公共池 | 自己的 + 非公共 | 弹窗（可改名称） |
| 下架 | 自己的 + 公共 | 确认弹窗 |
| 重新生成 | 有 figmaUrl | 用相同 Figma 源重生成 |
| 新标签页 | 恒显示 | 新窗口打开预览 |
| 刷新 | 恒显示 | iframeKey++ |
| 对接接口 | Vue3 + 未绑定 | 跨 iframe postMessage 触发**根级全局向导**（避免受本页 iframe 尺寸影响） |
| 撤回对接 | Vue3 + 已绑定 | 确认 + 解绑接口 |
| AI 对比分析 | 恒显示 | 打开组件分析抽屉 |
| 规格检查 | 微码 + 有业务组件 ID | 调规范检查 |
| 文档纠偏 | 微码 | 上传需求文档纠偏（复用 UI 缓存，只重跑代码生成） |
| 编辑代码 / 隐藏代码 | 自己的 | 切换编辑面板 |

### M8.5 编辑保存

**自动保存**：编辑后 **800ms 防抖**自动保存。

**保存路径**：
| 环境 | 组件模式 | 页面模式 |
|------|---------|---------|
| 开发 | `PUT /__raw{path}` | 同左 |
| 生产 | `POST /api/component/{sid}/file?path=package/index.vue`（path 走 query） | path 走 body |

文件路径规则：
- Vue3 → `/workspace/vue3-components/{groupId}/{sessionId}/package/index.vue`
- 微码 → `/workspace/custom-components/{sessionId}/package/index.vue`

加载前同步写 `localStorage.currentGroupId` 保证一致性。保存成功后自动刷新预览。

### M8.6 预览 URL

| 类型 | URL |
|------|-----|
| Vue3 | `/preview/{sid}?type=vue3&groupId=..&w=..&h=..&_t={cacheKey}` |
| 微码 | 微码预览 URL + `?groupId=..&w=..&h=..&_t={cacheKey}` |

末尾追加 `_t` 破缓存；有 Figma 尺寸信息时传 `w`/`h` 保持比例。

### M8.7 接口清单

| 方法 | 路径 |
|------|------|
| GET | `/api/component/{componentId}` |
| GET | `/api/component/{componentId}/files` |
| GET | `/api/component/{sid}/file?path=package/index.vue` |
| POST | `/api/component/{sid}/file?path=package/index.vue` |
| POST | `/api/component/{componentId}/analyze-visual` |
| POST | `/api/component/{componentId}/publish` / `unpublish` |
| POST | `/api/component`（更新） |
| GET | `/api/vue3/bindings?componentId=` |
| POST | `/api/vue3/bindings/{bindingId}/delete` |

---

## M9 组件预览

| 项 | 值 |
|----|-----|
| 路由 | `/preview/{componentId}`（**noAuth 免登录**） |
| 文件 | `frontend/src/views/preview/index.vue` |

### M9.1 用户目标

在独立全屏页面真实渲染微码 / Vue3 / 页面组件，支持主题与响应式切换，渲染失败时提供 AI 修复。

### M9.2 页面结构

**极简，无页头页脚**：
```
预览舞台外壳（独立模式 / 响应式模式）
├── 面板切换器（仅非 Vue3 且非嵌入）
├── 主题提示（仅非 Vue3 且非嵌入）
└── 预览舞台（注入主题 class，承载状态属性）
    └── ErrorBoundary（超时 30s，重试=重新加载，AI 修复）
        ├── 组件渲染成功 → 组件本体
        ├── 加载阶段失败 → 预览错误卡
        │   ├── AI 修复浮层（实时秒数 + 取消）
        │   └── 错误正文 + 诊断位置 file:line:column + 6 个动作按钮
        └── 加载中 → spinner
```

> 设计意图：解决组件 `height:100%` 高度链在普通布局下塌陷为 0 的问题。

### M9.3 取源策略（4 级）

**支持 query**：`type` / `groupId` / `sessionId` / `revision` / `source` / `w` / `h` / `_t` / `token` / `snapshot` / `panelType` / `previewMode`。

**优先级**：`last-good` > `candidate` > `partial` > workspace。

**有界退避重试**：
- `snapshot=0`（Playground 编辑态）→ 强制 workspace，立即返回
- URL 已带 `sessionId + revision` → 跳过
- 否则仅当可重试（URL 带 sessionId 或路径形如 `mc-`/`mv-`）时最多 **5 次**，退避 400/800/1200/1600ms
  > 语义化 componentId（`c-xxx`）**不重试** —— latest 按 sessionId 建索引，必然 404，白等 6s
- 404 时用 `GET /api/tasks/resolve-session?componentId=` 反查真实 sessionId 再试

**只接受含入口文件的快照**（`package/index.vue` 或 `index.vue`），按 last-good > candidate > partial 逐级探。

**组件 ID 反查**：6 次退避（≈6s）把 `mc-*`/`mv-*` **任务号**反查成 `c-*` 语义化组件 ID（workspace 目录用语义名，快照按 sessionId 存）。
> 组件记录比 last-good 快照晚落库约 3.6s（实测 06:39:27.878 vs 06:39:24.301），4 次≈3s 刚好差 0.4s 追不上，故用 6 次。

### M9.4 状态机与消息协议

**状态**：`loading` → `ready` / `render-error` / `load-error`。

**向上层发消息**：
| 消息 | 时机 |
|------|------|
| `mvgo-preview-mounted` | 组件挂载后 |
| `MVGO_PREVIEW_READY{componentId, groupId, revision}` | 渲染就绪 |
| `MVGO_PREVIEW_ERROR` | 渲染失败 |
| `MVGO_PREVIEW_FIXED` | AI 修复完成 |

**接收消息**（校验同源）：
| type | 作用 |
|------|------|
| `set-panel-type` | 面板类型实时生效 |
| `set-theme` | 切换 light / dark |
| `set-preview-viewport` | 响应式视口宽高与模式；**只改舞台尺寸锁，不重载组件、不改 iframe src**（避免拖拽频繁重编译）；保真模式（宽=0）必须放行以清残留状态 |
| `apply-css-vars` | 批量写 CSS 变量到根元素 |

**主题优先级**：URL query > Playground postMessage > `declare.json` 的默认主题 > dark 兜底。
> 预览默认注入 `.dark`/`.light` 父选择器，不注入则所有样式规则匹配失败。

### M9.5 错误卡双分支

| 分支 | 文案 |
|------|------|
| 环境问题 | 「这是**预览环境的临时问题**（前端资源或取源服务），**组件产物本身未被判定为有错**」 |
| 组件问题 | 「这是**组件自身的问题**（如文件缺失、样式编译错误或引用了不支持的资源），**不会影响系统其他功能**」 |

> 分支设计的意义：原实现统一写「组件自身问题」，会把「前端资源版本问题」「取源服务 5xx」也栽给组件产物，与下方具体提示自相矛盾。

**6 个动作按钮**：重新加载 / 查看代码 / 定位错误（有诊断时）/ 无样式结构预览 / AI 修复（主按钮）/ 复制错误信息。

### M9.6 AI 修复

**严格单请求**：`aiFixing` 期间直接拒绝新请求 → AbortController + 超时中止 → `POST /api/demo/ai-fix-render-error`（带 componentId / groupId / errorMessage / stack / info / llmConfig）。

失败分 `alreadyRunning`（提示已在运行）与其他错误；成功后重载预览并判定结果，分别提示「组件已修复并正常显示」或「修复已应用但预览仍有问题（状态）」。

### M9.7 接口清单

| 方法 | 路径 |
|------|------|
| GET | `/api/tasks/{sid}/code-snapshots/latest` |
| GET | `/api/tasks/resolve-session?componentId=` |
| GET | `/api/component/by-session/{sessionId}` |
| GET | `/api/preview/{groupId}/{componentId}/declare.json` |
| GET | `/api/preview/page/{groupId}/{componentId}/page-meta.json` |
| GET | `/api/tasks/{sid}/code-snapshots/{rev}/file?path=&preview=1` |
| POST | `/api/demo/ai-fix-render-error` |

**预览资源安全策略**（`preview` 模块）：
- 路径穿越防护用分隔符段边界
- CSP：`default-src 'self'` / `script-src 'self' 'unsafe-eval' blob:`（运行时编译需要）/ `frame-ancestors 'self'` / `form-action 'none'`
- 允许匿名访问的依据：组件 id 带随机后缀不可猜

---

## M10 Playground（AI 对话式组件修改器）

| 项 | 值 |
|----|-----|
| 路由 | `/demo/{componentId?}` |
| 文件 | `frontend/src/views/demo/index.vue` |

### M10.1 用户目标

对已生成组件做「读代码 → AI 对话式改 → 实时预览 → 下载」的全功能编辑器，内置 VS Code 风格搜索替换与预览错误 AI 修复。

### M10.2 页面布局

```
质量警告横幅（任务未通过门禁时，可关闭）
草稿模式横幅（主组件未生成完时）
主体（四区）
├── 文件侧栏
│   ├── 文件头：当前文件 + 类型徽章（页面/微码/Vue3）+ 设置
│   ├── VS Code 风格搜索面板
│   │   ├── 搜索行（大小写 / 全字 / 正则 / 替换 / 内联结果计数）
│   │   ├── 替换行
│   │   ├── 搜索范围 chip（可清除）
│   │   └── 文件树（可折叠目录 + 修改标记）
│   └── 结果面板（搜索时文件树隐藏）：按文件分组、可折叠、组级替换、忽略此文件
├── 中部：Tab（预览 / 样式设置 / 声明文件设置）+ Monaco 编辑器
├── 右侧：AI 对话面板
│   ├── 消息流（角色着色）+ 「思考中...」+ 流式内容
│   ├── 待发截图附件（最多 3 张）
│   ├── 输入框 + 记忆开关
│   └── 发送 / 清空对话
└── 弹窗：设置 / 快捷键速查
```

**Tab 联动防御**：当前 Tab 指向的面板不存在时（如样式设置）自动切到另一面板，避免内容区空白。

### M10.3 AI 对话（SSE 流式）

```
POST /api/demo/ai-chat/stream
body: {message, componentId, selectedFiles, attachments, history, llmConfig}

事件类型：
  error      → 抛错
  tool_call  → 显示「🔧 正在调用 {name}...」
  status     → 更新消息
  done       → {content, success, modifiedFiles, toolErrors}
```

**三条关键设计**：

| 设计 | 原因 |
|------|------|
| **占位消息防重**：流式消息不立即 push，等首帧真实文本到达才提交 | 避免与模板的「思考中...」重复渲染 |
| **只认后端真实写入**：仅当 `modifiedFiles.length > 0` 才重载文件 + 刷新预览 + 更新修改计数；`toolErrors` 非空追加「⚠️ 文件写入未完整完成」；`success === false` 追加「⚠️ 本轮未完成实际文件修改，请根据提示重试」 | 防止「AI 说改好了但文件没动」 |
| **AbortController 支持中断** | 用户可随时打断 |

**对话记忆**：开关默认关；历史存 sessionStorage（key 按组件区分），**最多保留 50 条**；「清空对话」移除。

### M10.4 文件树 CRUD

| 操作 | 接口 |
|------|------|
| 新建文件夹 | `POST /api/component/{id}/folder` |
| 重命名 | `POST /api/component/{id}/rename` |
| 删除文件 | `POST /api/component/{id}/file/delete?path=` |
| 拖拽移动 | rename（旧路径 → 新路径） |

**双模式基址**：
| 模式 | 基址 |
|------|------|
| 页面模式 | `/api/page-skeleton/{groupId}/{componentId}` |
| 组件模式 | `/api/component/{componentId}` |

**保存路径契约差异**：页面模式 path 走 **body**，组件模式 path 走 **query**。

### M10.5 搜索替换

- 三个开关：区分大小写 / 全字匹配 / 正则表达式
- 范围：全文件夹或指定范围 chip
- 结果按文件分组，分组可折叠，显示每组匹配数
- 支持单文件替换 / 全部替换
- 快捷键 `Ctrl+Shift+F` 聚焦搜索框

### M10.6 快捷键

| 快捷键 | 动作 |
|--------|------|
| `Ctrl/Cmd + S` | 保存（捕获阶段注册，编辑器聚焦时也能命中） |
| `Ctrl/Cmd + Shift + F` | 聚焦搜索 |
| Tab 切换 / 关闭 | 面板切换与关闭 |
| 刷新预览 | 重新加载 iframe |

### M10.7 接口清单

| 方法 | 路径 |
|------|------|
| POST | `/api/demo/ai-chat/stream` |
| POST | `/api/component/{id}/ai-fix-render-error` |
| POST | `/api/component/{id}/ai-fix-cancel` |
| GET | `/api/component/{id}/files` |
| GET | `/api/component/{id}/file?path=` |
| POST | `/api/component/{id}/file` |
| POST | `/api/component/{id}/file/delete?path=` |
| POST | `/api/component/{id}/folder` |
| POST | `/api/component/{id}/rename` |
| GET | `/api/component/{id}/declare` |
| GET | `/api/demo/download/{componentId}` |

---

## M11 接口生成

| 项 | 值 |
|----|-----|
| 路由 | `/generator/api`（旧路径 `/generate-api` 重定向至此） |
| 文件 | `frontend/src/views/workspace/GenerateApiView.vue` |

### M11.1 用户目标

从 Apifox 项目拉取接口定义，批量生成前端 API 模块代码，产出可下载的 ZIP，并作为后续「接口对接」的数据源。

### M11.2 页面布局

```
主栏
├── 标题
├── Apifox 连接配置条（连接就绪 / 待补配置 徽标）
├── 可折叠项目参数面板
├── 来源 Tab（全量 / 单模块）
├── 配置卡
├── 主 CTA
└── 结果卡 / 错误提示
右侧栏
├── 生成概览（总生成次数 / 今日生成）
└── 生成历史列表
```

### M11.3 生成模式（仅 2 种）

| 模式 | 说明 |
|------|------|
| **全量生成** | 导出整个项目全部接口，按模块自动分组，额外必填「项目名称」 |
| **单模块生成** | 按模块名匹配路径前缀生成 |

> **接口生成域没有 Lite / Max 档位**。Lite/Max 属组件生成域。历史卡片的类型标签也只有这两值。

### M11.4 表单字段

**共用配置（折叠面板）**：

| 字段 | 校验 | 持久化 |
|------|------|--------|
| Apifox 项目 ID | 必填 | localStorage `apifox_project_id`（与绑定向导共享） |
| Apifox Access Token | 必填 | 服务端配置（**本页不存**），走全局配置面板 |

**全量模式额外**：项目名称（maxlength 60，用于目录显示与历史命名），持久化 localStorage。

**单模块模式额外**：
| 字段 | 说明 |
|------|------|
| 模块名 | 后缀有「🔍 探测」按钮 |
| 路径过滤前缀 | **可选**，hint「如接口路径是 /api/gantry-flow/*，可填 /api/gantry-flow」 |

**按钮禁用即唯一前端校验手段**（无行内报错文案）：
- 全量可生成 = 项目ID && Token && 项目名称
- 单模块可生成 = 项目ID && Token && 模块名

**向后兼容迁移**：进入页面时读旧 localStorage，把 Token 迁到全局配置并提示「已将 Apifox Token 迁移到全局配置」。

### M11.5 自动探测模块

```
点「🔍 探测」
  → 校验项目 ID（未填 → warning「请先填写 Apifox 项目 ID（页面顶部）」）
  → 已探过不重复调，需点「重新探测」
  → POST /api/apifox/list-paths
弹窗（宽 920）：
  3 个指标卡：总 path 数 / 模块候选数 / 最大单模块
  候选网格（2 列卡片）：
    每卡 = 模块名 + 首段副标题 + 示例路径代码块 + HTTP method 徽标集合 + 「选用 →」
```

**回填规则**：
```
模块名 ← 前缀的最后一段（/api/gantry-flow → gantry-flow）
路径过滤 ← 原样保留完整前缀（精确指定多级前缀）
```
> 路径过滤优先于让后端拼 `/{模块名}`，保证多级前缀场景匹配正确。

**三态**：空态「还没有拉取过」+ 引导填项目 ID / 加载态 / 错误提示。

### M11.6 结果展示

| 模式 | 内容 |
|------|------|
| 全量 | 「N 个模块，M 个接口」+ 模块标签列表（`模块名 (函数数)`）+ 下载 ZIP + 查看目录 |
| 单模块 | 「M 个接口，K 个文件」+ 文件名标签列表 + 下载 ZIP |

**当前不提供代码预览**，只展示文件名标签。

### M11.7 生成历史

| 字段 | 说明 |
|------|------|
| 判定 | `taskType === 'full'` 或 taskId 以 `cat-` 开头 → 全量 |
| 显示名 | 全量 → 项目名；单模块 → 模块名（**不回退项目名**，否则会把 OpenAPI 的 info.title 显示成「默认模块」） |
| 操作 | 下载 / 删除（气泡确认，文案「删除后 ZIP 文件和目录数据将一并清除」）；hover 或聚焦时显形 |
| 点击卡片 | 跳 API 目录详情页 |

**空态**：「暂无生成记录」。

### M11.8 与 API 绑定向导的衔接

```
接口生成（全量）──写入 API 目录──▶ 目录存储
      │                                │
      │ 「查看目录」                     │ 绑定向导 Step 0 选目录
      ▼                                ▼
API 目录详情页 ◀──────────────────▶ API 绑定向导
```

绑定向导另有 4 处反向跳转入口（「没有我需要的接口？去 AI 工作台生成」「去 API 生成」），且支持在向导内**页内直接生成目录**（Step 0 空态，需项目 ID，不传项目名，目录名回退用目录 ID）。

### M11.9 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/apifox/generate` | 单模块生成 |
| POST | `/api/apifox/generate-full` | 全量生成 |
| POST | `/api/apifox/list-paths` | 列出项目所有 path（按首段分组） |
| GET | `/api/apifox/mine` | 生成历史 |
| POST | `/api/apifox/tasks/{taskId}/delete` | 删除（ZIP + 目录数据 + 索引） |

---

## M12 API 目录详情

| 项 | 值 |
|----|-----|
| 路由 | `/generator/api/catalog/{catalogId}` |
| 文件 | `frontend/src/views/workspace/ApiCatalogDetail.vue` |

### M12.1 用户目标

浏览已生成 API 目录的模块树与接口清单，查看单个接口的参数/请求体/响应细节，并下载 ZIP。

### M12.2 页面布局与交互

```
头部卡：返回 + 项目名 + 接口数 + 模块数 + 生成时间 + [刷新] + [下载 ZIP]
主体（双卡）
├── 左：模块列表（可点击切换）
└── 右：该模块的函数列表
函数详情弹窗：
    摘要 + 标签
    请求参数表格（名称/位置/类型/必填/说明）
    请求体 JSON
    响应 JSON
```

**交互规则**：
- 加载完成**自动选中第一个模块**
- 点模块切右侧列表；点函数开弹窗
- **三态渲染**：加载中骨架 → 主体 → 错误页（含「返回」按钮）
- **三层空态**：模块列表空 / 未选模块 / 模块内无接口
- 函数项标签：tags + 请求体标记 + 响应标记
- JSON 格式化，异常降级为字符串

### M12.3 接口清单

| 方法 | 路径 | 备注 |
|------|------|------|
| GET | `/api/apifox/catalog/{catalogId}` | 完整模块树 + 函数清单 |
| GET | `/api/apifox/download?taskId=` | 下载 ZIP |

---

## M13 API 绑定向导

| 项 | 值 |
|----|-----|
| 形态 | 全局右侧抽屉（`min(720px, calc(100vw - 24px))`）；`surface` prop 支持抽屉/全屏弹窗两种 |
| 文件 | `frontend/src/views/workspace/ApiBindingWizard.vue` |

### M13.1 用户目标

把已生成的 API 目录绑到 Vue3 组件的数据槽上，产出真实调用代码。

### M13.2 挂载点（3 处）

| 位置 | 场景 |
|------|------|
| `App.vue`（全局） | 跨 iframe postMessage 触发（如组件详情页的「对接接口」按钮） |
| 组件生成页 | 生成页内直接打开 |
| 任务详情页 | 交付面板的「对接接口」按钮 |

### M13.3 五步流程

| step | 名称 | 内容 |
|------|------|------|
| 0 | 选择 API 目录 | 目录卡片选择；空态可页内生成；**仅 1 个目录时自动选中** |
| 1 | 选择分析方式 | `auto` 自动扫描代码识别数据槽 / `doc` 基于需求文档 AI 分析（**默认 doc**） |
| 2 | 调整绑定 | 左数据槽 + 右 API 目录双栏 |
| 3 | 确认对接 | 汇总卡 + 逐槽预览 |
| 4 | 结果 | 成功 + 警告 + 刷新预览 + 撤回 |

步骤指示器只渲染 step 1/2/3 三格。

**Step 1 文档模式**：textarea + 拖拽上传 + 文件选择（`.md/.markdown/.txt`）；未填文档时「开始分析」禁用。

### M13.4 Step 2 数据槽卡片（信息密度最高）

**卡片头**：槽位类型徽标 / 角色 / 引用名 / 显示名 / 不可绑定时标「配置项」

**源信息**：来源类型 + `行 {行号}: {上下文}`

**子字段**：可折叠区

**绑定态三分支**：
| 态 | 展示 |
|----|------|
| 已绑定 | `→ 模块.函数()` + **参数字段编辑器** |
| 模拟数据 | 「模拟数据：{原因}」 |
| 跳过 | 「跳过：{原因}」 |

**参数编辑器按类型分流**：
| 参数类型 | 控件 |
|---------|------|
| boolean | 下拉 true/false |
| 枚举 | 下拉（选项来自枚举值） |
| integer / number | 数字输入 |
| 其他 | 文本输入（必填缺失时标红） |

占位提示优先取参数示例值，回退到参数说明 / 参数名。doc 模式额外显示**置信度条** + 判断理由。

**行内操作**：跳过 / 模拟数据 / 恢复绑定。

**绑定冲突提示**：出现绑定冲突时展示冲突槽列表 + 「前往 Playground 修改代码」+ 「知道了」。

### M13.5 Step 2 API 目录树

- 模块可折叠（默认展开第一个）
- 函数卡点击即绑定；已绑函数高亮
- 参数按必填加 `*` 标记
- 页脚实时统计：「已绑 N · 模拟数据 N · 跳过 N」
- **下一步按钮在绑定数为 0 时禁用**

### M13.6 确认与结果

**提交校验链**：
```
① 缺参检查 → 有缺失则报错列出（不提交）
② bindings 去空 → 空则提示「请至少绑定一个数据槽」
③ POST /api/vue3/bind-api
```

**Step 4 结果页**：修改文件列表 + **未消费数据槽警告** + 「刷新预览」+「撤回此次对接」（气泡确认）。

**关闭重置**：关闭抽屉后 300ms 重置步骤/模式/槽位/绑定/目录/文档/结果/冲突，避免下次打开残留。

**文档自动预填**：读组件元数据里的需求文档字段，读取失败静默。

### M13.7 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/apifox/catalogs` | 当前用户目录 |
| GET | `/api/apifox/catalog/{id}` | 目录详情 |
| POST | `/api/apifox/generate-full` | 页内生成目录 |
| POST | `/api/vue3/analyze-slots` | 自动扫描数据槽 |
| POST | `/api/vue3/analyze-from-doc` | 需求文档语义分析 |
| POST | `/api/vue3/bind-api` | 执行绑定 + 代码注入 |
| POST | `/api/vue3/bindings/{bindingId}/delete` | 撤回对接 |
| GET | `/api/config/ai` | 读文本模型配置（缺配置时友好报错，不调后端） |
| GET | `/api/component/{id}/file?path=component-meta.json` | 预填需求文档 |

> **配置读取优先级**：text\* → ai\*（旧字段）→ unified\* → vision\*

---

## M14 工作流编排

| 项 | 值 |
|----|-----|
| 路由 | `/generator/workflow` |
| 文件 | `frontend/src/views/generator/WorkflowEditor.vue` |

### M14.1 用户目标

以可视化画布编排 AI 生成管线：从左侧拖入节点、连线定义流转、配置参数，保存为可复用工作流或场景配方，并可直接运行验证。

### M14.2 页面布局

```
工具栏
├── 左：工作流下拉（含节点数 / 原始标记）+ 新建 + 原始管线四入口
│      （组件管线 / Vue3 管线 / 页面管线 / 接口管线）
└── 右：新建下拉（新建节点 / 配方库 / 存为配方）+ 运行 + 保存/另存为 + 删除
名称栏：原始管线标记 | 工作流标识 | 显示名称
编辑区（三栏）
├── 左栏：可用节点（按类别折叠）+ Handler 详情面板 + 控制节点
│        （start/end/condition/parallel）+ 已保存工作流列表 + 图例
├── 画布：VueFlow（网格背景 / 控件 / 小地图）+ 空态引导 + 素材来源浮条 + 拖拽遮罩
└── 右栏（选中节点时）：节点属性（ID / 标签 / 类型 / Handler / 高级配置 / 并行子节点 / 条件分支）
弹窗：配方库 / 存为配方 / 新建节点三步向导 / 节点快照 / 运行对话框
```

### M14.3 节点类型（5 种）

`agent` 智能体 / `condition` 条件 / `parallel` 并行 / `start` 开始 / `end` 结束

### M14.4 画布交互

| 交互 | 说明 |
|------|------|
| 拖拽建节点 | 从左栏拖 Handler 到画布；控制节点用哨兵 key |
| 连线 | 松散连接模式 + 网格吸附 [20, 20] |
| 选中 | 点节点/边；点画布空白取消 |
| 删除 | 选中后删除（边缘契约提示来源与目标是否匹配） |
| 粘贴 | 画布内粘贴，自动识别 5 类内容：Figma 链接 / URL / 图片 / HTML / 纯文本 |
| 外部拖放 | 从外部拖文件到画布，同样走分类识别 |

**高级配置动态表单**：由 Handler 的配置 schema 生成，按字段类型分 select / number / text；`?` 图标悬停显示帮助说明。

**并行子节点**：多选 Handler，各自结果合并进共享状态。
**条件分支**：可增删改分支连线。

### M14.5 原始管线只读态

**四个入口**对应四条真实管线：组件管线 / Vue3 管线 / 页面管线 / 接口管线。

加载后进入只读态：
- 名称栏显示「★ 原始管线（只读，编辑后请另存为）」
- 保存按钮变「另存为」
- 删除按钮禁用 + tooltip「原始管线不可删除」
- 左栏列表项显示「原始」标签与锁定图标

### M14.6 场景配方库

| 字段 | 说明 |
|------|------|
| 来源 | `builtin` 内置 / `user` 我的（**内置不可删**） |
| 展示 | 名称、来源标签、场景分类、节点数、描述 |
| 搜索 | 按名称/标签/场景 |
| 操作 | 「使用 → 加载到画布」/「存为配方」 |
| 命名规则 | 小写字母开头 |

### M14.7 智能体构建（三步向导）

```
① 选模板（卡片网格 + 搜索）
② 配置
   · 通用：显示名称 / 输入字段 / 输出字段（类型：string/object/array/number/boolean）
   · AI 节点额外：Prompt + 模型 + 参考资源
   · 工具节点：渲染参数表
③ 试跑
```

**模板搜索空态三选项降级**：① 用 AI 通用分析 ② 从配方库找现成组合 ③ 提交能力缺口反馈。

### M14.8 运行

前置条件：工作流已保存（非新建态）。
输入：组件名 + Figma fileKey / nodeId（也可用 Figma 链接自动解析）+ 自定义输入 + AI 配置。
返回 sessionId → 前端用 `GET /api/progress/{sessionId}` 订阅进度。

### M14.9 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/workflows/meta/handlers` | Handler 列表 + 节点类型（含 Agent Builder 动态注册的智能体） |
| GET | `/api/workflows/graph/{type}` | 原始图拓扑（phase2 / vue3 / page-generation / apifox-generation） |
| GET | `/api/workflows` | 列出全部 |
| GET | `/api/workflows/{sessionId}/nodes` | 节点运行快照（内存态，重启即清） |
| GET | `/api/workflows/{name}` | 单个详情 |
| POST | `/api/workflows/save` | 保存（**原始拓扑名被拒**） |
| POST | `/api/workflows/load` | 加载 |
| POST | `/api/workflows/{name}/delete` | 删除（原始拓扑不可删） |
| POST | `/api/workflows/{name}/run` | 运行 |
| GET | `/api/recipes` / `/api/recipes/{name}` | 配方库 |
| POST | `/api/recipes/save` / `/api/recipes/{name}/delete` | 保存/删除配方 |
| GET | `/api/agent-builder/templates` / `/api/agent-builder/list` | 智能体模板/列表 |
| POST | `/api/agent-builder/create` / `/test` / `/upload` / `/feedback` | 创建/试跑/上传/反馈 |
| POST | `/api/agent-builder/{name}/delete` | 删除智能体 |

---

## M15 页面骨架生成

| 项 | 值 |
|----|-----|
| 路由 | `/generator/page-skeleton` |
| 文件 | `frontend/src/views/page-skeleton/index.vue` |

### M15.1 用户目标

上传大屏截图或粘贴 Figma 链接，AI 分析布局并生成自适应 Vue3 页面骨架（vw/vh 响应式 + 地图压底），可预览/下载/继续在 Playground 编辑。

### M15.2 页面布局（单列三卡片）

```
创建区
├── 来源 Tab（上传截图 / Figma 链接）
├── 字段：名称（留空用 AI 识别标题）+ 分组（默认 default-group）
├── 截图分支：拖拽区（点击/拖拽，高亮）+ 本地预览图
│   Figma 分支：输入框（未启用时黄色警告条）
├── 操作：[生成页面骨架]（校验不通过或生成中禁用）+ [新建]（有结果时）
└── 错误提示
结果区
├── 标题 + 路径徽标 + 查看源码 / 下载 ZIP / 删除
├── 主题色板 4 色块（背景/强调/头部/文字）+ 基线尺寸 W×H
└── 组件清单网格（名称 + 区域/类型/高度占比/占位标签 + 备注）
已有列表
└── 「我的页面骨架」卡片（名称 + 分组·来源·创建时间 + 预览/源码/下载/删除）
```

### M15.3 输入项

| 字段 | 枚举 / 限制 |
|------|------------|
| 来源 | `screenshot` / `figma` |
| 名称 | 选填，留空由 AI 识别 |
| 分组 | 默认 `default-group` |
| 截图 | 必须 `image/*`；**额外前置拦截 0 字节文件** |

> 0 字节拦截的原因：空文件会触发上传中间件静默 400 且后端无日志，前端无从判断。

**提交校验**：分组非空 + （截图有文件 / Figma 有链接）。

### M15.4 交互流程

```
① 打开页面 → 拉已有列表（失败静默，不影响主流程）
② 选来源 → 传素材（截图支持点击 + 拖拽，本地生成预览图）
③ 点「生成页面骨架」
   → 提交（FormData 上传截图 或 JSON 传 Figma 链接）
   → 成功后立即 router.push 到任务详情页
     （不等待产物落盘，避免生成早期列表/详情失败而阻断跳转）
④ 任务详情页 SSE 展示进度（管线阶段：输入准备 → 图像消毒 → 视觉布局分析 → 骨架渲染 → 生成完成）
⑤ 结果区展示主题色板与组件清单
⑥ 列表操作：
   · 预览 → 独立预览页
   · 源码 → 进 Playground 全功能编辑
   · 下载 → ZIP
   · 删除 → 确认「同时删除任务记录与磁盘目录，不可恢复」
```

**错误处理**：完整透传后端错误信息 + 弹提示；提交前打印诊断对象（来源/分组/文件名/大小/类型/链接）便于排查。

### M15.5 接口清单

| 方法 | 路径 |
|------|------|
| GET | `/api/page-skeleton?groupId=` |
| POST | `/api/page-skeleton` |
| GET | `/api/page-skeleton/{groupId}/{id}` |
| GET | `/api/page-skeleton/{groupId}/{id}/download` |
| POST | `/api/page-skeleton/{groupId}/{id}/delete` |
| POST | `/api/page-skeleton/{groupId}/{id}/retry` |
| GET | `/api/page-skeleton/{groupId}/{id}/files` |

---

## M16 大屏布局开发

| 项 | 值 |
|----|-----|
| 路由 | `/screen` |
| 文件 | `frontend/src/views/screen-layout/index.vue` |

### M16.1 用户目标

以「预设模板 + 拖拽 Zone + 列/头尾配置」快速搭建大屏/后台布局，导出为可交付代码或交由 AI 生成响应式实现。

### M16.2 页面布局

```
一句话生成布局条（置顶，可直接应用/预览）
编辑区（三栏 + 两个拖拽把手）
├── 左栏（可拖宽）
│   ├── Tab：配置 / 组件库
│   ├── 配置 → 4 个折叠面板
│   │   ① 预设模板（大屏场景 / 后台场景，带线框图预览 + 分辨率）
│   │   ② 画布设置（自适应模式 + 背景色）
│   │   ③ 头部与底部（开关 + 高度 + 背景色）
│   │   ④ 列管理（增删列 + 每列宽度/可收缩 + 选中列详细配置）
│   └── 组件库 → 布局模板（可拖）+ 通用组件（可拖）
├── 画布区
│   ├── 工具栏：标题 + 尺寸预设 + 缩放（−/下拉/+/适应窗口/适应宽度/1:1）
│   │          + 撤销/重做 + 导出JSON + 导入JSON + 复制分享链接 + 导出HTML
│   │          + 图层显示（正常/半透明/仅轮廓 循环）+ 自适应预览 + AI生成响应式 + 下载ZIP
│   └── 画布容器：网格背景 + 头部（可拖高）+ 列区 + 底部（可拖高）
└── 右栏：选中 Zone → 属性面板（删除/复制）；未选中 → 空态提示
右键菜单（Teleport 到 body）
弹窗：空间分析 / 响应式生成进度 / 自适应预览
```

### M16.3 Zone 两层模型

| 层 | 渲染方式 | 典型用途 |
|----|---------|---------|
| Bottom | absolute 全宽铺底 | 地图 |
| Middle | 列内流式 | 图表卡片 |

**空列提示**：「点击上方 + Zone 添加区域」。

### M16.4 关键交互

| 交互 | 说明 |
|------|------|
| 拖拽建 Zone | 从组件库拖到目标列 |
| 右键菜单 | 组件：复制/置顶/上移/下移/置底/删除；Zone：复制/删除（**需先清空组件**才可用） |
| 三向拖拽 | 左栏宽、右栏宽、列宽（非最后一列才有把手）、头部高、底部高 |
| 缩放 | 0.1 ~ 2.0，档位下拉，另有适应窗口/适应宽度/重置 |
| 撤销/重做 | 按操作栈禁用 |
| 导入/导出 JSON | — |
| 复制分享链接 | 把布局编码进 URL |
| 导出 HTML | 零依赖单文件，双击即开 |
| 图层显示 | 循环 正常 → 半透明 → 仅轮廓 |

### M16.5 枚举值

**自适应模式（6 种）**：

| 值 | 说明 |
|----|------|
| `fluid` | 铺满不变形（推荐） |
| `hybrid` | 等比 + 弹性 |
| `contain` | 等比缩放留边 |
| `fillWidth` | 填充宽度 |
| `fillHeight` | 填充高度 |
| `none` | 无缩放 |

**区域（3 种）**：`header` / `body` / `footer`

**重叠类型（4 种）**：重大重叠 / 有意叠加 / 轻微重叠 / 边缘相接

### M16.6 空间分析报告

| 分区 | 内容 |
|------|------|
| meta | 分析器版本 / 画布宽高 / 网格尺寸 |
| summary | 组件总数（按头部/主体/底部分区）、区域总数、检出行列数、重叠统计、吸附率、平均组件尺寸 |
| rows / columns | 行列结构 |
| zoneAnalysis | 区域分析 |
| overlapAnalysis | 重叠分析 |
| zoneTree | 区域树 |
| responsiveHints | 响应式建议 |

### M16.7 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/screen-layout/analyze-spatial` | 空间分析（**同步**规则引擎） |
| POST | `/api/screen-layout/download` | 下载 ZIP |
| POST | `/api/screen-layout/analyze-responsive` | AI 生成响应式（**异步**，返回 sessionId） |
| GET | `/api/screen-layout/progress/{sessionId}` | 响应式生成进度（SSE） |
| GET | `/api/screen-layout/download-responsive/{sessionId}` | 下载响应式产物 |

---

## M17 文档设计

| 项 | 值 |
|----|-----|
| 路由 | `/generator/document-design` |
| 文件 | `frontend/src/views/generator/DocumentDesign.vue` |

### M17.1 用户目标

输入需求文档原文，一键由 AI 生成「微码设计文档」（业务事件 / 业务状态 / 业务配置等配置章节），支持多模式预览与编辑。

### M17.2 页面布局

```
页头：标题 + 副标题 + 返回链接
工具栏：新建 / 保存草稿 / 导出 MD / [生成配置 →]（生成中显示 spinner 且禁用）
内容区
├── 侧栏（可折叠）：标题 + 搜索框 + 文档列表（标题/更新时间/重命名/删除）+ 空态
└── 分栏编辑器
    ├── 左：原始文档 textarea
    └── 右：标签 + 视图切换（预览 / 编辑 / 分栏）+ 复制
        内容四态：预览（渲染 Markdown）/ 编辑（源码 textarea）/ 分栏（左编辑 + 右预览）/ 占位
        + 生成中浮层（spinner +「正在生成配置...」+「AI正在分析文档并生成四个配置章节」）
Toast（底部，2.6s 自动消失）
```

### M17.3 关键交互

| 项 | 说明 |
|----|------|
| 视图模式 | `preview` 预览渲染 / `edit` 编辑 Markdown 源码 / `split` 左编辑 + 右实时预览。**默认 preview，生成完成后自动切回 preview** |
| 侧栏折叠 | 折叠后仅留展开按钮 |
| 搜索 | 按标题（大小写不敏感） |
| 文档项操作 | 点击停止冒泡；支持重命名 / 删除 |
| Markdown 高亮 | 渲染时对四个配置章节（业务事件 / 业务状态 / 业务配置 等）加高亮 |
| 标题推导 | 取原文首行前 50 字符，无则「未命名文档」 |
| 空文档保护 | 保存与生成均先校验原文非空 |
| 导出 | 生成 Blob 下载 `microcode-design-{时间戳}.md` |

### M17.4 接口清单

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/microcode/doc/generate-configs` | 生成配置章节（读 `merged` 字段） |
| POST | `/api/documents` | 新建文档 |
| POST | `/api/documents/{id}` | 更新文档 |

> 文档列表查询与删除接口走 Java 侧文档模块。

---

## M18 管理后台

| 项 | 值 |
|----|-----|
| 路由 | `/admin`，重定向 `/admin/dashboard` |
| 布局 | `views/admin/AdminLayout.vue`，左侧固定 240px 菜单 |

**菜单 4 项**：概览 / 异常监控（路由名 `operation-log`）/ 用户管理 / 任务统计。

**鉴权**：`meta.adminOnly` 路由守卫 + 后端服务层二次校验。

### M18.1 概览（DashboardView）

**时间窗**：全部 / 本周 / 近 30 天 / 近 60 天。

**6 张 KPI 卡**：任务总量 / 整体成功率（目标 ≥80%）/ 一次成功率 / 平均耗时 / Token 消耗 / 总成本（含均价与单任务成本）。

**两栏分析**：
- **模型效率排行 Top10**（按文本/视觉着色）
- **失败归因堆叠条**（三类：质量 / 环境 / 其他，图例含归因说明）

**下方**：模型性价比矩阵散点图 + 趋势图（均为手写 SVG）。

**配色规则**：成功率 ≥0.8 绿 / ≥0.6 橙 / 否则红。

**接口**：`GET /api/task-stats/dashboard?preset=`

### M18.2 异常监控（ManagementView）

**摘要条 3 数**：错误请求 / 慢请求（>1s）/ 敏感操作。

**筛选**：异常类型（全部 / 仅错误 / 仅慢请求 / 仅敏感操作）+ 路径搜索 + 用户名搜索 + 时间（今日/本周/本月）。

**批量操作**：删除选中（二次确认）/ 清理 90 天前（附说明「每日凌晨自动清理」）。

**敏感路径关键词**：`/delete` `/cleanup` `/admin` `/user` `/auth` `/config`（同一份清单同时用于摘要计数、过滤与分类标签）。

**分类优先级**：5xx 服务端错误（红）> 4xx 客户端错误（橙）> >1s 慢请求（金）> 敏感操作（紫）> 正常。

**展示细节**：HTTP method 着色；耗时 >1000ms 标红；用户缺失显示「匿名」。

**接口**：`GET /api/operation-log?page&pageSize&path&username&startTime`、`POST /api/admin/operation-log/delete`

### M18.3 用户管理（UsersView）

**区块 1「QS 登录用户」**：

| 筛选维度 | 说明 |
|---------|------|
| 部门 | 单选 |
| 使用状态 | **多选**：已配置 / 已生成组件 / 已生成接口 |
| 关键字 | 用户名 / 姓名 / 部门 / UID |
| 导出时间档 | 本周 / 近30 / 近60 / **自定义**（日期区间选择器） |

**三个导出**：导出 MD / 导出 HTML / 部门报表。自定义档未选起止日期时警告拦截。

**表格**：行点击打开配置抽屉；管理员开关（阻止冒泡）；操作列「查看配置」+ 删除（气泡确认）。

> **三重筛选全在前端完成**，因此分页总数由过滤后长度推算而非接口总数 —— 否则会出现「假象分页器」。另有 watch 修正越界页码。

**配置抽屉**：
| 分区 | 内容 |
|------|------|
| 基本信息 | 用户名 / 姓名 / 部门 / 组织 / 门户 UID |
| 使用统计 | 组件数 / 任务数 / 接口批数 / 接口总数 |
| 组件构成 | 按生成类型分组 |
| AI/API 配置 | **密钥已脱敏** + 供应商池 + 模型库 + 其他配置 |
| 实际使用模型 | 文本 / 视觉分列 |

**区块 2「用户统计」**：部门汇总卡（用户数/任务数/成功率/耗时 P50）+ 个人明细表（含常用模型，样本 <3 标「仅供参考」badge）。

**底部说明**：成功率排除取消任务；常用模型取前 3；样本 <3 仅供参考。

**接口**：`GET /api/admin/users`、`POST /api/admin/users/{id}`、`POST /api/admin/users/{id}/delete`、`GET /api/admin/user-stats`、`GET /api/admin/usage-export`、`GET /api/admin/dept-report`

### M18.4 任务统计（TaskStatsView）

**4 个 Tab**：

| Tab | 内容 |
|-----|------|
| 仪表台 | 平台概览（KPI + 趋势图 + 部门表 + 失败归因**可展开明细**） |
| 任务诊断台 | 异常任务聚焦 |
| 模型效果对比 | 「哪个模型更好？」多模型·代理组合对比 |
| 历史表现 | 「随时间变化，效果稳定吗？」+ 粒度（按天/按周）+ 指标（成功率/耗时/Token/任务数），切换即重载 |

**接口**：`GET /api/task-stats/dashboard`、`/api/task-stats/tasks`、`/api/task-stats/model-compare`、`/api/task-stats/trends?granularity=`

### M18.5 我的统计（MyStatsView）

**时间档**：近 7 / 近 30 / 近 90 / 全部（与概览页档位不同）。

**8 张 KPI 卡** + 常用模型排行表。

**接口**：`GET /api/task-stats/my-dashboard?preset=`（**不校验管理员**，所有登录用户可查自己的）

---

## M19 系统公告

### M19.1 公告列表（用户端）

| 项 | 值 |
|----|-----|
| 路由 | `/announcements` |
| 文件 | `views/AnnouncementPage.vue` |

**布局**：全宽卡片式（最大宽 900）。

**卡片内容**：标题 + 版本号 tag + 类型 tag + 发布时间 + 作者 + 内容（换行转 `<br>`）+ 有效期页脚（**有过期时间才渲染**）。

**类型枚举（4 种）**：

| 值 | 标签 | 色 |
|----|------|-----|
| `info` | 信息 | 蓝 |
| `warning` | 提醒 | 橙 |
| `success` | 成功 | 绿 |
| `error` | 重要 | 红 |

右上角「管理公告」入口。

**三态**：加载中 / 空态「暂无公告」/ 列表。

**接口**：`GET /api/announcements/active`

### M19.2 公告管理

| 项 | 值 |
|----|-----|
| 路由 | `/announcements/manage` |
| 文件 | `views/AnnouncementManage.vue` |

**筛选**：标题搜索 + 状态（已启用 / 已禁用）。

**表格 6 列**，操作列固定右侧；启用列用开关切换，带启用/禁用文案。

**表单字段**：标题（必填）/ 版本号 / 类型 / 内容（必填）/ 发布时间 / 过期时间 / 优先级（0–999）。
> 校验为手动校验（标题或内容为空则警告），无声明式规则。

**接口**：

| 方法 | 路径 |
|------|------|
| GET | `/api/announcements/admin?page&pageSize&keyword&active` |
| POST | `/api/announcements` |
| POST | `/api/announcements/{id}/update` |
| POST | `/api/announcements/{id}/toggle` |
| POST | `/api/announcements/{id}/delete` |

**数据模型**：标题 / 内容 / 版本号 / 类型 / 是否启用 / 发布时间 / 过期时间 / 作者 / 优先级；过期时间字段建 TTL 索引，到期自动清理。

---

## M20 帮助与文档页

| 页面 | 路由 | 性质 | 说明 |
|------|------|------|------|
| 密钥接入指南 | `/help/tokens` | 静态页 | Figma / Apifox / GitLab 三份接入指南 |
| 使用介绍 | `/generator/intro` | 静态页 | 4 个 Tab 讲架构演进：第一代顺序工作流 → 第二代智能体图 → 两代技术对比 → 拓扑图 |
| API 文档 | `/generator/api-docs` | 静态页 | 4 个锚点章节 + 4 语言代码示例 Tab（curl / JavaScript / Python / Postman），各带复制 |
| Token 用量 | `/generator/token-dashboard` | **本地 Mock** | 5 维下钻看板 |
| 生成日志 | `/generator/logs` | 单任务日志页 | 按 sessionId 查看完整生成流水 |
| **更新日志** | `/help/changelog` | 静态数据 | **独立模块，见 M21** |

### M20.1 密钥接入指南

**三段内容**：Figma 🎨 / Apifox 📘 / GitLab 🦊，每段含分步获取 + 所需权限 + 粘贴位置 + 官方文档外链 + FAQ 折叠。

**滚动联动**：点击左侧目录滚动到对应段并改 URL hash；滚动时反向高亮当前段（阈值判定）。

### M20.2 Token 用量看板（5 维下钻）

**数据源为本地确定性 Mock**（30 天 × 12 用户 × 4 群组 × 4 模型），**不发起任何 HTTP 请求**。后端真实统计接口存在但本页未使用。

**筛选控件**：
| 控件 | 枚举 |
|------|------|
| 周期 | 按天 / 按周 / 按月 |
| 天数 | 7 / 14 / 30 |
| 搜索 | 用户或群组 |
| 群组 | 动态选项（清空即清除下钻） |
| 键盘 | `Esc` 回退一级 |

**5 个下钻维度**：全量 / 用户 👤 / 群组 👥 / 模型 🤖 / 日期 📅

**下钻语义**：
- 同类维度切换 → 替换，保持父级
- 跨维度下钻 → 叠加，父级为当前维度

面包屑可点回退 + 「× 清除」回到全量。维度主题色：用户紫 / 群组绿 / 模型橙 / 日期青 / 全量蓝。

**图表交互**：柱状图点击 → 下钻到对应维度；趋势图点击某日 → 弹出当日明细面板（可收起）。

**表格**：用户表（用户/Token 总量（可排序）/调用次数/占比（进度条 + 变色百分比）/模型（前 3 标签 + `+N`）/成本（可排序））；调用记录表；当日明细表。

**各维度 Hero 指标**：用户 5 项 / 群组 4 项 / 模型 4 项 / 日期 4 项。

### M20.3 生成日志页

**布局**：页头（返回 + 标题 + Session）+ 状态栏（生成中 / 生成完成 / 生成失败）+ 深色等宽日志容器 + 操作（完成后「新建组件」）。

**状态枚举（3 种）**：生成中 / 生成完成 / 生成失败。

**图标规则**：进度完成 ✅ / 进度中 ⚡ / 错误 ❌ / 警告 ⚠️ / 其余 📋。

**SSE 容错（比任务详情更完整）**：
```
35 秒看门狗：超时且仍运行中 → 追加警告 + 立即查任务状态
断线恢复：onerror → 查状态
   completed → 日志「✅ 检测到任务已完成（SSE 断开恢复）」+ 走完成回调
   failed    → 日志「❌ 检测到任务失败（SSE 断开恢复）」+ 走失败回调
   cancelled → 日志「🚫 检测到任务已取消（SSE 断开恢复）」
   其他      → 连接已死则重建；必要时启动 15s 周期轮询
   （仅在连接已断开时才重建，避免每 15s 无谓重连）
```

> 35 秒取值说明：比后端 30 秒心跳稍宽，留出网络抖动余量。

---

## M21 更新日志

| 项 | 值 |
|----|-----|
| 路由 | `/help/changelog` |
| 文件 | `frontend/src/views/help/Changelog.vue` |
| 数据源 | 静态常量 `frontend/src/config/changelog`（`CHANGELOG` + `CURRENT_VERSION`），**不调后端接口** |
| 可见性 | **面向全体用户公开**，不挂功能开关、不做管理员限制 |
| 入口 | 底部页脚（不参与功能开关计算） |

### M21.1 页面布局

```
时间线容器
├── 左侧竖轨（圆点 + 连线）
└── 版本项（按时间倒序）
    ├── 左侧：圆点 + 版本号 + 发布日期
    ├── 首项加「最新」徽标
    └── 右侧：版本标题 + 变更条目列表（新增/优化/修复/移除 四类分组，带类型色点）
页脚：引导「建议反馈」（外部链接，新窗口打开）
```

### M21.2 关键交互

| 项 | 说明 |
|----|------|
| 时间线首项 | 自动加「最新」徽标 |
| 变更类型分组 | 新增 / 优化 / 修复 / 移除，各带类型色点 |
| 版本号与日期 | 展示在时间线左侧节点上 |
| 页脚反馈 | 外部链接，新窗口打开 |
| 空态 | 数据来自静态常量，理论上不会为空 |

### M21.3 设计约束

| 约束 | 说明 |
|------|------|
| 数据静态 | 内容写死在配置常量里，发布新版本需改代码 |
| 不受开关控制 | 与其它帮助页不同，**不挂功能开关**（面向全体用户） |
| 无版本筛选 | 只做时间线展示，无按类型/版本筛选 |
| 与公告的区别 | 公告是**运营发布、有有效期、TTL 自动清理**；更新日志是**研发发布、永久留存、静态数据** |

---

## M22 质量检测与规范检查体系

> 这是用户反馈「内部弹出的质量检测容易遗漏」的重点补充。质量检测有 **4 套独立机制**，分属不同阶段、不同入口，**互相之间不联动**。

### M22.1 四套机制总览

| 机制 | 接口 | 何时跑 | 阻断性 | 入口 |
|------|------|--------|-------|------|
| **① 微码规范检查** | `POST /api/mc-spec/check` | 用户手动触发 | 结论是「允许/不允许上线」，但**不阻断任何动作** | 3 处（任务详情/Playground/组件详情） |
| **② 质量评分** | `POST /api/mc-spec/quality-score` | 用户手动触发（仅管理员） | 不阻断 | 任务详情顶部操作栏 |
| **③ 生成期三道门禁** | 无独立接口，结果写入任务 | **生成时自动** | ✅ 真正阻断（失败重试 / 耗尽失败） | 无 UI 入口，用户不可见 |
| **④ AI 对比分析** | `POST /api/component/{cid}/analyze-visual` | 用户手动触发 | 只给建议，不阻断 | 组件详情页 |

### M22.2 机制① 微码规范检查（M1~M5 系列）

**抽屉形态**：右侧抽屉，宽 640，深色底，标题「微码规范检查」。

**顶部工具行**：
| 元素 | 行为 |
|------|------|
| skill 选择 | 多于 1 个时渲染下拉；否则只读显示「内置 · {skillId}」 |
| 管理 skill | **仅管理员可见**，虚线按钮 |
| 重新检查 | 检查中显示「检查中…」 |

**四段结果结构**：

**① 结论卡**
| 字段 | 内容 |
|------|------|
| 判定徽章 | 「允许上线」（绿）/「不允许上线」（红） |
| 副信息 | 规范版本 + 检查时间 |
| 三计数 | 通过 N（绿）/ 失败 N（红）/ 警告 N（橙） |
| 规则说明 | 「M1~M5 系列必须 100% 通过（警告不阻断）才可投放」 |
| 操作 | 「查看完整报告」（新窗口，附 `raw=1` 跳过鉴权）/「复制失败项」 |

**② 必须修复区**：按 **M 系列前缀分组**，组名形如「M3 declare.json 字段（3）」，组内每项含 编号徽章 + 名称 + **「AI 修复」按钮** + 说明文案。无失败项时显示「M 系列全部通过，未发现阻断项」。

**③ 警告区**：**默认折叠**，可展开，样式为橙色。每项同样有「AI 修复」按钮。

**④ AI 修复进行中提示条**：「正在 AI 修复 [ID]，修改会直接落盘到组件代码（约 1~2 分钟），完成后自动重新检查。可在 Playground 中随时撤销。」

**45 个检查项（M1~M5）**：

| 系列 | 项数 | 核心检查内容 |
|------|-----|------------|
| **M1 命名规范** | 3 | componentId 规范（`c-` 开头、kebab-case、与目录名一致）、componentName 长度、version 语义化版本 |
| **M2 必要文件** | 7 | 入口文件 / declare 文件 / 预览图 / css-vars / themes 目录 / index.less / layoutConfig 预览图 |
| **M3 declare.json** | 14 | 必填字段 / themeConfig / businessEvents / businessStatuses / cssVariableConfig 与 css-vars 一致性 / dataSources / 废弃字段 |
| **M4 文件格式** | 11 | declare.js 用 `$createMcDeclare` / component.js 导出入口 / css-vars 导出结构 / index.less 引入主题 / 字体变量格式 / dark 核心变量 |
| **M5 代码实现** | 10 | `base-panel` 包裹 / `$mcComponentBuilder` 单次调用 / 禁请求库 / 事件与声明一致 / 禁硬编码字体 / 背景色限制 / 硬编码颜色（警告级） |

**组件类型二分**：
| 类型 | business 类检查项 | 必查项数 |
|------|------------------|--------|
| 业务组件（默认） | ✅ 检查 | 25 项 |
| 服务组件 | ❌ 豁免 | 21 项 |

**自愈**：**无规则级自愈**。前端只有「AI 修复」——走 AI 对话管线让模型改代码落盘（1~2 分钟/次），完成后自动重检。

**管理 skill 弹窗**（仅管理员）：上传 zip 注册自定义检查 skill，说明包含约定入口路径与安装目录；已注册列表展示 id / 版本 / 描述，入口缺失时红字标注并给「卸载」按钮。

### M22.3 机制② 质量评分（管理员预览）

**抽屉形态**：右侧抽屉，宽 520，深色底，标题「质量评分 v1（管理员预览）」。

**按钮文案**：无缓存时「质量评分」，有缓存时「评分 {规范分}/{样式分}」。

**两个维度**：
| 维度 | 满分 | 算法 |
|------|-----|------|
| **规范分 specScore** | 100 | `100 − 8×阻断 − 3×警告`；**有阻断项时硬顶 79**（不允许带阻断显示为「良好」） |
| **样式分 styleScore** | 100 | 六维**等权**平均；覆盖率 <40% 时**封顶 60**；无 Figma 期望时显示「—」（**不是 0**） |

**样式分六维**：颜色 / 间距 / 字体 / 圆角 / 结构 / 资源挂载。

**四段结构**：

**① 分数卡**：规范分 + 样式分（色调：≥80 绿 / ≥60 橙 / <60 红 / 空灰）+ 口径说明 + 元信息（版本 + 评分时间 + 文件数）

**② 设计图对比**：左「设计图（Figma 预览图）」、右「产物预览（生成截图）」并排

**③ 规范分明细**：`阻断 N × 8 + 警告 N × 3` 口径说明 + 逐条 issue（严重度徽章 + 编号 + 说明）；有底层执行失败时红字提示

**④ 样式分明细**（信息量最大）：
| 区块 | 内容 |
|------|------|
| 概览 | 原因 + 覆盖率百分比 |
| **修复结果** | 「✓ 已修复 N 处」（文件 + 原值→目标值 + 行列 + 上下文）/「✗ 无法修复 N 项」（维度 + 期望值 + 原因） |
| 变量解析 | 已启用（含变量数与文件名）/ 未启用（含错误原因） |
| **资源挂载**（专属） | 分数 + 已匹配/期望数 + 逐条未挂载资源（资源名 → 实际挂载的选择器，期望应挂到某节点） |
| 其他维度 | 维度名 + 分数 + 匹配数 + 「✓ 变量化」徽章 或「修复」按钮 |
| 未匹配项 | 期望值 + 差值 + Figma 源（节点类型 + 节点 ID）+ 产物源（最贴近值所在行与类名） |

**顶部工具行**：「自动修复」/「重新评分并写入」；加载中显示「正在离线评分（不调 LLM）」。

### M22.4 机制③ 生成期三道门禁（用户不可见）

这三道是**真正阻断生成**的门禁，结果写入任务记录，在任务详情页以诊断形式呈现。

| 门禁 | 检查内容 | 诊断码 |
|------|---------|-------|
| **代码结构门禁** | 样式块规范、样式引入、class 前缀、资源挂载层级、图表配置、模板变量误用等 | `CODE-001` ~ `CODE-027` |
| **样式编译门禁** | 所有样式文件能否编译通过（括号平衡、块注释闭合、声明完整） | `LESS-COMPILE-001` |
| **真实渲染门禁** | 真实浏览器渲染截图后是否报错、是否空白渲染、是否降级为静态兜底 | `RUNTIME-001` ~ `RUNTIME-015`、`VISUAL-002` |

**关键机制**：

| 机制 | 说明 |
|------|------|
| **样式编译门禁有自愈** | 自动修复未闭合块注释、补右括号、修声明粘连、补根装饰，修复成功标记「已自动修复并写回磁盘」 |
| **代码结构门禁零 LLM 自愈** | 仅自动修 2 条基础规则（补样式块属性、插入样式引入），其余靠 LLM 重试 |
| **渲染门禁有资源自愈** | 资源缺失时尝试一次自愈，成功后状态从「阻断」降级为「警告」 |
| **质量门禁判定** | 运行时通过 + 视觉通过（无 Figma 元数据时跳过）+ 检查通过 + 无高优批评 + 得分 ≥75 + 无警告 → 通过；否则警告 |

> **重要区分**：生成期门禁的「警告」与规范检查的「警告」是两套东西。前者影响 `qualityGate` 字段，后者只是展示。

### M22.5 机制④ AI 对比分析（视觉相似度）

**抽屉形态**：右侧抽屉，宽 520，深色底，标题「AI 对比分析」。

**三段结构**：

**① 第一阶段 · 只读对比分析**
| 字段 | 内容 |
|------|------|
| 状态标签 | 「运行时通过」/「运行时未通过」 |
| 判断依据 | 结论理由 |
| 三指标 | **视觉相似度**（如「86 分」，未执行为「未执行」）/ **视觉问题数** / **下一步建议** |

**② 运行时门禁**
状态标签 + 摘要 + 可选预览地址链接 + 逐条问题（编号 + 说明 + 分类）

**③ 视觉差异**
状态标签（已分析/未执行）+ 摘要 + 逐条差异（**严重度标签高优/中优/低优** + 区域 + 描述 + 改进建议）

**执行顺序（省 token 的关键）**：
```
① 真实渲染截图（不触发资源自愈）
   ↓ 运行时门禁未通过 → 直接跳过视觉对比（不调视觉模型，省额度）
② 视觉对比（设计图 vs 产物截图）
   ↓
③ 生成下一步建议
```

**建议的四种分支**：
| 条件 | 建议 |
|------|------|
| 运行时未通过 | 先修复运行时问题，再重新执行对比 |
| 存在高优视觉差异 | 进入下一阶段前，先根据高优差异做人工确认 |
| 相似度 ≥ 85 | 可以进入下一阶段「按分析优化」 |
| 兜底 | 建议先处理中低优差异，再决定是否自动优化 |

> **相似度基准线是 85**。该抽屉是**纯文字报告型**，不含像素级差异热区图。

### M22.6 弹层与浮层全量清单

| 弹层 | 形态 | 触发条件 | 关键内容 |
|------|------|---------|---------|
| **AI 对比分析抽屉** | 右抽屉 520 | 组件详情页「AI 对比分析」 | 三段式只读报告 |
| **规范检查抽屉** | 右抽屉 640 | 微码组件且已完成或有文件 | 结论 + M 系列分组 + AI 修复 |
| **规范 skill 管理弹窗** | 弹窗 560 | 规范抽屉内「管理」（仅管理员） | zip 上传 + 已注册列表 |
| **质量评分抽屉** | 右抽屉 520 | 管理员 + 有产物 | 双维分数 + 修复明细 |
| **代码对比视图** | 内嵌面板 | Playground 文件比较 | 双向 Diff，只读 |
| **GitLab 推送弹窗** | 弹窗 | 有产物 + 功能开关开启 | 令牌 + 项目 + 分支 + 提交信息（分字段/整段粘贴双模式） |
| **公共池发布弹窗** | 弹窗 420 | 自己的组件 + 未发布 | 组件名（必填）+ 类型只读 + 提示条 |
| **预览错误横幅** | 底部居中固定 | iframe 内报错 | **非阻塞**，点 × 关闭，0.25s 淡入 |
| **AI 配置面板** | 右侧滑入 | 顶部「设置」 | 两 Tab（模型/外部服务）+ 模型库管理 |
| **任务监控悬浮球** | 可拖拽悬浮球 | 常驻（demo 页除外） | 运行/排队/暂停/失败计数 + 点击展开面板 |
| **公告铃铛** | 角标 + 右抽屉 500 | 有生效公告 | 公告列表；**无有效时铃铛整体不显示** |
| **人工审核弹窗** | 确认弹窗 | 任务列表触发 | 通过/警告二选一 + 原因 |

### M22.7 已知缺口（质量检测未闭环的地方）

| # | 缺口 | 影响 |
|---|------|------|
| 1 | **规范检查结论不阻断任何动作** | 「不允许上线」的组件照样能发布公共池、推送 GitLab |
| 2 | **公共池发布弹窗零质量校验** | 只校验名称非空，与规范分/门禁无联动 |
| 3 | **质量门禁字段前后端不一致** | 后端只产出「通过/警告」两值，前端多声明了「阻断」，属死分支 |
| 4 | **质量门禁只在任务详情页展示** | 任务列表页与统计页均不可见 |
| 5 | **规范检查无规则级自愈** | 每次修复都要调模型，1~2 分钟/次 |
| 6 | **无自动发布门禁** | 平台不存在「自动发布到公共池」的实现，仅人工确认 |
| 7 | **无预览期自动门禁** | 预览期的错误捕获只展示不阻断 |


---

## 第五部分 附录

### 附录 A 全局导航结构

**顶部主导航**（菜单配置在 AppHeader）：

| 顺序 | 标签 | 路径 | 功能开关 |
|------|------|------|---------|
| 1 | 组件开发 | `/generator/components` | ✅ |
| 2 | 组件库 | `/components` | ✅ |
| 3 | 接口开发 | `/generator/api` | ✅ |
| 4 | 任务中心 | `/tasks` | ✅ |
| 5 | 大屏布局 | `/screen` | ✅ |
| 6 | 管理后台 | `/admin/operation-log` | 仅管理员追加 |

右侧按钮：工作台切换（带 TEST 徽标）/ 设置 / 主题切换 / 公告铃铛 / 用户菜单。

**底部页脚**（低频入口）：
架构介绍 / 页面开发 / 工作流编排 / 更新日志 / 系统公告 / 建议反馈（外部链接）。
关闭的功能置灰 + 点击提示。

### 附录 B 完整路由表

| 路由 | 页面 | 登录 | 管理员 |
|------|------|------|--------|
| `/generator/components` | 组件生成（v4） | ✓ | — |
| `/generator/component` | 组件生成（旧版） | ✓ | — |
| `/generator/page` | 页面生成 | ✓ | — |
| `/generator/api` | 接口生成 | ✓ | — |
| `/generator/api/catalog/:catalogId` | API 目录详情 | ✓ | — |
| `/generator/lite` | 轻量生成 | ✓ | — |
| `/generator/page-skeleton` | 页面骨架生成 | ✓ | — |
| `/generator/workflow` | 工作流编排 | ✓ | — |
| `/generator/document-design` | 文档设计 | ✓ | — |
| `/generator/intro` | 使用介绍 | ✓ | — |
| `/generator/api-docs` | API 文档 | ✓ | — |
| `/generator/logs` | 生成日志 | ✓ | — |
| `/generator/token-dashboard` | Token 用量 | ✓ | — |
| `/tasks` | 任务中心 | ✓ | — |
| `/tasks/:sessionId` | 任务详情 | ✓ | — |
| `/tasks/html-split/:batchId` | HTML 拆分批次 | ✓ | — |
| `/workbench` `/workbench/:conversationId` | 工作台 | ✓ | — |
| `/components` | 组件库 | ✓ | — |
| `/components/:id` | 组件详情 | ✓ | — |
| `/preview/:componentId` | 组件预览 | **免登录** | — |
| `/demo/:componentId?` | Playground | ✓ | — |
| `/screen` | 大屏布局 | ✓ | — |
| `/workspace` | 深度研究 | ✓ | — |
| `/announcements` | 系统公告 | ✓ | — |
| `/announcements/manage` | 公告管理 | ✓ | 仅入口控制 |
| `/help/tokens` `/help/changelog` | 帮助 | ✓ | — |
| `/admin/dashboard` | 概览 | ✓ | ✓ |
| `/admin/operation-log` | 异常监控 | ✓ | ✓ |
| `/admin/users` | 用户管理 | ✓ | ✓ |
| `/admin/task-stats` | 任务统计 | ✓ | ✓ |
| `/admin/my-stats` | 我的统计 | ✓ | — |
| `/mc-generator` | 微码开发 | 功能开关关闭 | — |
| `/pipeline-lab` `/debug` `/jaeger-permision` | 调试工具 | ✓ | — |

### 附录 C 数据模型

#### 核心业务实体

**组件（components）**
| 字段 | 说明 |
|------|------|
| `componentId` | 组件 ID（索引，稀疏） |
| `taskId` | 来源任务 ID |
| `target` | `microcode` / `vue3` |
| `name` `description` | 名称与描述 |
| `creatorId` `groupId` `groupName` | 归属 |
| `visibility` | `private` / `public`（索引） |
| `sharedAt` `sharedBy` | 上池信息 |
| `qualityGate` | `passed` / `warned` / `failed` |
| `qualityScore` `runtimePass` `visualPass` | 质量指标 |
| `previewUrl` | 预览图 |
| `metadata` | 元数据（figma 信息等） |

**任务（内存表 + JSON 持久化，非 Mongoose）**
| 字段组 | 字段 |
|--------|------|
| 标识 | `sessionId` `componentId` `groupId` `parentId` `childIds` |
| 状态 | `status` `startTime` `endTime` `duration` `error` `lastError` |
| 输入 | `sourceType` `generationTier` `target` `fileKey` `nodeId` `figmaDimensions` |
| 产出 | `outputPath` `result` `artifactReady` `artifactReadyLevel` `missingEntryFiles` |
| 质量 | `qualityGate` `visualDegraded` `visualLayoutSource` `visualQualityWarning` `degradedScriptParts` `degradedFiles` `gateSkippedFiles` |
| 模型 | `completionModels` |
| 队列 | `queuePriority` `enqueuedAt` `quotaResetAt` `rateLimitReason` `retryCount` `nextRetryAt` |
| 审核 | `humanReview` `userApproved` `approval` |

**对话（conversations）**
| 字段 | 说明 |
|------|------|
| `conversationId` `userId` `title` | 标识 |
| `messages[]` | 消息数组（id / role / content / cards / createdAt / toolCallId / metadata） |
| `currentComponentId` | 当前组件锚点（索引） |
| `context` | 上下文 |
| `group` `pinned` | 分组与置顶 |
| `toolCredentials` | 工具凭据（Figma / Apifox / GitLab Token + 项目地址） |
| `shared` `sharedWith[]` | 分享 |

消息卡片类型枚举：`progress` / `preview` / `confirm` / `diff` / `stats` / `list` / `action`

**工作台分组（workbench_groups）**：用户 ID + 分组名 + 排序；用户名唯一索引。

#### 配置与统计实体

| 集合 | 说明 |
|------|------|
| `user_ai_configs` | 用户 AI 配置。**配置明文经虚拟字段桥接，实际以 AES-256-GCM 密文落库**；保存闸门用模型绑定指纹（地址+密钥+模型名哈希），换任一项指纹变 → 旧的实测结论自然失效必须重测 |
| `token_usages` | Token 用量明细：节点名 / 模型 / 模型类型（视觉/文本）/ 输入输出 Token / 耗时 / 时间戳 / 组件名 / Figma 信息 / 用户 / 地址 |
| `generation_metrics` | 生成指标 |
| `operation_logs` | 操作日志：方法 / 路径 / 查询 / 请求体 / 状态码 / IP / 耗时 / User-Agent / 错误信息。**请求体与查询按关键词脱敏**（密码/令牌/密钥/授权/Cookie 等），超长截断；可开关 + 跳过高频路径 |
| `announcements` | 公告。过期时间建 TTL 索引，到期自动清理 |

**配置生效语义**：AI 配置修改恒为「下次运行生效」，**不热切换运行中任务**。

#### 其他集合

`users`（用户/门户信息/管理员标志）、`groups`（项目组）、`group_members`（成员与权限）、`ai_projects`（项目，含 Git 地址与授权范围）、`ai_sessions`（AI 会话，含消息与模型）、`ai_skills`（技能，含 Prompt 模板与审核状态）、`ai_git_credentials`（Git 凭证，**PAT 密文落库**，虚拟字段透明加解密）。

### 附录 D 后端接口总表（按模块）

#### 任务与进度

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 任务列表（默认精简，`full=1` 取全量） |
| GET | `/api/tasks/summary` | 统计摘要 |
| GET | `/api/tasks/recent?limit=` | 最近任务（limit 前置截断） |
| GET | `/api/tasks/status/{sessionId}` | 单任务状态 |
| GET | `/api/tasks/tree/{sessionId}` | 父子任务树 |
| GET | `/api/tasks/retry-meta/{sessionId}` | 可重试元数据 |
| GET | `/api/tasks/reviewable` | 待审核失败任务 |
| GET | `/api/tasks/resolve-session?componentId=` | **免登录**，组件 ID 反查任务 ID |
| POST | `/api/tasks/cancel/{sessionId}` | 取消 |
| POST | `/api/tasks/pause/{sessionId}` | 暂停 |
| POST | `/api/tasks/resume/{sessionId}` | 恢复 |
| POST | `/api/tasks/retry/{sessionId}` | 带检查点重试 |
| POST | `/api/tasks/{sessionId}/recover` | 重启后恢复中断任务 |
| POST | `/api/tasks/{sessionId}/speed-pass` | 跳过剩余阶段直接完成 |
| POST | `/api/tasks/{sessionId}/lock` | 锁定满意版本 |
| POST | `/api/tasks/{sessionId}/human-review` | 人工审核 |
| POST | `/api/tasks/{sessionId}/human-review/delete` | 撤回审核 |
| POST | `/api/tasks/{sessionId}/delete` | 删除 |
| POST | `/api/tasks/delete` | 批量删除 |
| POST | `/api/tasks/batch-delete` | 批量删除（ids） |
| POST | `/api/tasks/cleanup-orphans` | 清理孤儿任务 |
| GET | `/api/tasks/{sessionId}/code-download` | 产物 ZIP |
| GET | `/api/tasks/queue` | 队列列表 |
| GET | `/api/tasks/queue/stats` | 队列统计 |
| GET | `/api/tasks/queue/status/{sessionId}` | 单任务排队状态 |
| POST | `/api/tasks/queue/cancel/{sessionId}` | 取消排队 |
| POST | `/api/tasks/queue/start/{sessionId}` | 手动启动 |
| POST | `/api/tasks/queue/dispatch` | 强制调度 |
| SSE | `/api/progress/{sessionId}` | **全站唯一进度订阅口** |

**代码快照**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/{sid}/code-snapshots/latest` | 最新快照（候选 + last-good + 部分产物） |
| GET | `/api/tasks/{sid}/code-snapshots/revisions` | 版本历史 |
| GET | `/api/tasks/{sid}/code-snapshots/{rev}/manifest` | 快照清单 |
| GET | `/api/tasks/{sid}/code-snapshots/{rev}/file` | 读文件（支持预览模式 / 存在性探测） |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/edit` | 编辑写回为新候选 |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/validate` | 重跑门禁（返回逐文件行列级诊断） |
| POST | `/api/tasks/{sid}/code-snapshots/{rev}/rollback` | 回滚 |
| POST | `/api/tasks/{sid}/publish-to-workspace` | 发布到 workspace |

> **降级放行策略**：任务不存在但磁盘清单存在 → 降级放行；仅「无权访问此任务」→ 硬 403。

#### 生成管线

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/phase2/generate` | Figma → 微码组件主入口 |
| POST | `/api/phase2/figma-preview` | Figma 预览图 |
| GET | `/api/phase2/preview-image/{token}` | 预览 PNG（UUID 正则防路径穿越） |
| POST | `/api/phase2/analyze-doc` | 需求文档六维分析 |
| POST | `/api/phase2/regenerate-with-doc` | 存量组件补文档再生成 |
| POST | `/api/phase2/refine` | 人工精修（布局 / 样式 / 两者） |
| GET | `/api/phase2/quota` | 当前用户配额 |
| GET | `/api/phase2/download/{componentId}` | 组件 ZIP（带越权校验） |
| POST | `/api/vue3/generate` | Figma → Vue3 组件 |
| POST | `/api/vue3/analyze-slots` | 规则匹配数据槽 |
| POST | `/api/vue3/analyze-from-doc` | 文档语义数据槽 |
| POST | `/api/vue3/bind-api` | 执行绑定 + 代码注入 |
| GET | `/api/vue3/bindings?componentId=` | 绑定记录 |
| GET | `/api/vue3/bindings/{bindingId}` | 绑定详情 |
| POST | `/api/vue3/bindings/{bindingId}/delete` | 解绑（还原 SFC） |
| POST | `/api/lite/generate` | 轻量生成（截图/Figma/HTML 三选一） |
| POST | `/api/lite/retry/{sessionId}` | 原图缓存重试 |
| POST | `/api/lite/upgrade-assets/{sessionId}` | 从 Figma 下载素材升级 |
| POST | `/api/lite/analyze` | 仅分析 HTML 不生成 |
| POST | `/api/lite/generate-split` | 按选择逐个生成 |
| POST | `/api/lite/batch/pre-check` | 批量配额预检 |
| POST | `/api/lite/batch/generate` | 批量生成 |
| GET | `/api/lite/batch/list` | 批量列表 |
| GET | `/api/lite/batch/recoverable` | 可恢复批次 |
| GET | `/api/lite/batch/{batchId}` | 批次详情 |
| POST | `/api/lite/batch/{batchId}/cancel\|pause\|resume\|retry-failed` | 批次操作 |
| POST | `/api/page-generator/generate` | 页面级批量生成 |
| POST | `/api/page-generator/analyze` | 页面结构分析 |
| POST | `/api/page-generator/retry/{sessionId}` | 页面任务重试 |

#### 资产与预览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/component` | 创建/更新 |
| GET | `/api/component/list` | 列表 |
| GET | `/api/component?groupId=` | 按组列表 |
| GET | `/api/component/by-session/{sessionId}` | **免登录**，任务反查组件 |
| GET | `/api/component/{componentId}` | 详情 |
| POST | `/api/component/{componentId}` | 更新 |
| POST | `/api/component/{componentId}/delete` | 删除 |
| POST | `/api/component/{componentId}/publish` \| `/unpublish` | 上/下架公共池 |
| POST | `/api/component/batch-delete` | 批量删除 |
| GET | `/api/component/{componentId}/files` | 文件列表 |
| GET | `/api/component/{componentId}/declare` | 声明文件 |
| POST | `/api/component/{componentId}/analyze-visual` | 视觉相似度分析 |
| GET | `/api/component/{componentId}/file` | 读文件（`raw=1` 发二进制） |
| POST | `/api/component/{componentId}/file` | 写文件 |
| POST | `/api/component/{componentId}/file/delete` | 删文件 |
| POST | `/api/component/{componentId}/rename` | 重命名/移动 |
| POST | `/api/component/{componentId}/folder` | 新建文件夹 |
| GET | `/api/component/download/{componentId}` | 下载 ZIP |
| POST | `/api/component/push-to-gitlab` | 推送 GitLab |
| POST | `/api/component/gitlab-projects` \| `-branches` | GitLab 代理 |
| GET | `/api/preview/{groupId}/{componentId}/*path` | **免登录**组件静态资源 |
| GET | `/api/preview/page/{groupId}/{pageId}/*path` | **免登录**页面静态资源 |

#### 配置与统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/config/ai` | AI 配置读写 |
| POST | `/api/config/test-text` \| `test-vision` | 连通性测试 |
| POST | `/api/config/test-figma` \| `test-apifox` \| `test-gitlab` | 外部服务连通性测试 |
| POST | `/api/config/test-model-capability` \| `test-provider` | 模型能力 / 供应商验证 |
| GET | `/api/token-usage/task/{sessionId}` | 单任务用量 |
| GET | `/api/token-usage/stats?period=&days=` | 用量统计 |
| GET | `/api/token-usage/budget/{sessionId}` | 预算 |
| GET | `/api/token-usage/pricing` | 计价（人民币） |
| GET | `/api/task-stats/tasks` | 任务日志 |
| GET | `/api/task-stats/model-compare` | 模型效果对比 |
| GET | `/api/task-stats/trends?metric=&granularity=` | 趋势 |
| GET | `/api/task-stats/dashboard?preset=` | 平台仪表盘（管理员） |
| GET | `/api/task-stats/my-dashboard?preset=` | 我的统计（普通用户） |
| GET | `/api/task-stats/failure-analysis?sessionId=` | 失败归因 |
| POST | `/api/mc-spec/check` | 规范检查 |
| GET | `/api/mc-spec/skills` | 规范技能列表 |
| GET/POST | `/api/mc-spec/quality-score` | 质量评分（管理员） |
| GET | `/api/mc-spec/report/{componentId}/{stamp}` | 自包含 HTML 报告 |

#### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/ai-configs` | 全平台 AI 配置（脱敏） |
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users/{id}` | 设/取消管理员 |
| POST | `/api/admin/users/{id}/delete` | 删除用户 |
| GET | `/api/admin/components` | 全平台组件 |
| GET | `/api/admin/usage-export` | 用量导出 |
| GET | `/api/admin/dept-report` | 部门报表 |
| GET | `/api/admin/user-stats` | 用户统计 |
| GET | `/api/admin/internal/user-stats` | 内部统计（**内部密钥头鉴权**） |
| GET | `/api/admin/internal/usage-export` | 内部导出（内部密钥） |

> 内部接口用独立密钥请求头比对；未配置返回 503、错误返回 403，刻意采用 fail-closed 语义防止裸奔。

#### Java 侧

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| * | `/api/auth/*` | 登录/登出/改密/门户校验 |
| * | `/api/group/*` | 组与成员 |
| * | `/api/projects/*` `/api/sessions/*` `/api/skills/*` | AI 协作实体 |
| * | `/api/documents/*` | 文档 CRUD |
| * | `/api/models/*` | 模型列表 |
| POST | `/api/component-split/analyze` | 需求 + HTML 分析 |
| POST | `/api/component-split/build` | 组件 MD 交付包 |
| * | `/api/operation-log/*` | 操作日志读写 |
| — | 20+ 前缀 | Node 反向代理 |

### 附录 E 免鉴权接口清单

以下接口**不做登录校验**，设计依据是「只读静态资源」或「随机能力 URL 不可猜」：

| 路径 | 理由 |
|------|------|
| `/api/preview/**` | 预览静态资源；组件 ID 带随机后缀不可猜 |
| `/api/tasks/*/code-snapshots/*` | 快照读取；另有归属校验网关 |
| `/api/tasks/resolve-session` | 组件 ID 反查 |
| `/api/tasks/queue/stats` \| `queue/status/*` | 队列只读 |
| `/api/component/{id}/file` \| `download` \| `by-session/*` | 文件读与下载 |
| `/api/component/gitlab-*` | 代理查询 |
| `/api/apifox/catalog/{id}` \| `download` \| `record` | 目录与产物读取 |
| `?raw=1` 的所有请求 | 静态资源标记 |

> 写这一条是为了避免文档与实现脱节：**不应笼统写「全部接口需登录」**。

### 附录 F 已知差异与遗留项

#### F.1 下线 / 不可达的功能

| 项 | 状态 | 说明 |
|----|------|------|
| `/mc-generator` 微码开发 | 功能开关关闭 | 页面存在但只有 1 个 Tab，内容直接复用页面生成页，无独立逻辑 |
| workspace 目录下 5 个页面 | **已无路由** | 会话 / 项目 / 设置 / 我的接口 / 分享页均无 import 与路由注册；对应功能开关全部关闭 |
| 「分享」功能 | 未实现 | 分享页数据源是空数组常量，代码注释「第一期不做分享功能」 |
| 深度研究 | **纯前端原型** | 无任何后端调用，任务与空间均为本地常量 |
| Token 用量看板 | **本地 Mock** | 不发任何 HTTP 请求；后端真实统计接口存在但本页未用 |
| v2 可配管线 | 仅非生产环境注册 | 生产环境整个模块不注册，连路由都不存在；守卫返回 404 而非 403（不暴露实验性管线存在） |
| 组件生成页批量模式 | UI 不可达 | 批量相关逻辑保留在代码里但无入口切换 |
| HTML 来源模式 | UI 不可达 | 历史残留分支 |
| 工具凭据配置弹窗 | **全仓无引用** | 依赖的凭据接口已就绪但无 UI 入口 |

#### F.2 已知数据一致性问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | 任务中心的「今日」筛选未写入 URL | 从详情页返回时该筛选丢失 |
| 2 | HTML 拆分批次详情页数据只来自会话存储快照 | 刷新页面数据即丢失（未调用批次查询接口） |
| 3 | 我的接口页与接口生成页解析同一接口的返回结构不一致 | 前者对全量记录会显示空模块名（遗留缺陷） |
| 4 | 公告管理路由无管理员限制 | 仅靠 UI 入口控制，前端隐藏不等于鉴权 |
| 5 | 我的统计页无导航入口 | 侧边栏处理了该路由但菜单无对应项，页面无高亮 |
| 6 | 异常监控页错误取值字段与项目统一错误结构不匹配 | 捕获到的错误文案取不到后端描述 |
| 7 | 公告启停成功提示读的是切换前的值 | 文案与实际结果相反 |
| 8 | 页面骨架的 Figma 未启用警告分支不可达 | 开关硬编码为启用 |
| 9 | API 文档页内容已过时 | 文档中的接口路径后端已不存在 |

#### F.3 前后端基址不统一

前端存在两套 API 基址默认值（开发端口 3000 与 13030），生产由网关统一分发，不影响生产，但本地开发需注意。

### 附录 G 本文档的核对方式

本文档所有功能点均以代码实现为准，核对方式：

1. **路由与菜单**：读 `frontend/src/router/*.js` 与 AppHeader 菜单配置
2. **页面交互**：读对应 `views/**` 组件的模板与脚本
3. **接口路径**：从前端 API 调用处与后端 Controller 装饰器**双向核对存在性**
4. **枚举值**：从类型定义与常量文件提取，不凭记忆书写
5. **状态机与文案**：从状态计算属性与常量表提取

不确定项已在正文标注（如「未确认」），不做推测性补全。


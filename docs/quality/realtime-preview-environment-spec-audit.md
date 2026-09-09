# 实时预览环境与代码规格覆盖审计

> 文档状态：历史审计快照（截至 2026-08-15）。本文前半部分记录当时的未完成项，后续“修复进展”和“续接复核结果”也属于该次审计链路的历史记录；当前实现以源码、最新构建结果和后续整改记录为准。

审计日期：2026-08-15  
审计范围：当时仅只读检查与构建验证，未修改业务代码，未重启后端。

## 结论

**截至 2026-08-15，不能判定“不同环境、不同代码规格均已完成”。**

整体状态（截至 2026-08-15）：**部分完成（核心 Max 管线静态闭环，Lite 实时快照链未接入，鉴权与运行态矩阵未闭环）**。

- 已完成：Max 管线的 microcode / Vue3 候选快照、validating、PASS 晋级 last-good、非 PASS rejected、revision 固定文件读取、双 iframe 换帧、SSE 快照重同步代码。
- 部分完成：dev / prod 均有 snapshot 读取代码，但 prod snapshot 实际调用 `loadDev()` 的 snapshot 分支；静态可用，环境分支未独立跑通。
- 未完成：Lite 管线没有调用 `TaskCodeSnapshotService`，不发送 `code-snapshot`，直接写 workspace 后发送 complete，因此 Lite × microcode / Vue3 没有生成中 revision 实时预览。
- 未完成：`ProgressController` 无 `SessionGuard`、无任务 owner 校验，且项目没有全局 Guard；知道 sessionId 即可订阅 SSE 元数据。
- 未完成：质量门禁非 PASS 且无 `genError` 时，候选会 rejected、workspace 会回滚，但任务仍发送 complete，终态语义冲突。
- 未完成：尚未重启 Node 后端，新增接口和 SSE 协议未做真实端到端运行验证。

## 覆盖矩阵

| 维度 | 组合 | 状态 | 证据 / 说明 |
|---|---|---:|---|
| 目标规格 | Max × microcode | ✅ 静态完成 | `microcode-engineer.js` 完整文件组后触发 `onFilesReady`；Phase2 创建 revision |
| 目标规格 | Max × Vue3 | ✅ 静态完成 | `vue3-engineer.js` 完整文件组后触发 `onFilesReady`；Phase2 创建 revision |
| 生成档位 | Lite × microcode | 🔴 未完成 | `lite.service.ts` 直接写盘、复制 workspace、sendComplete；无快照服务调用 |
| 生成档位 | Lite × Vue3 | 🔴 未完成 | 同上，无 candidate / validating / last-good 链 |
| 环境 | dev workspace | ✅ 代码覆盖 | `/__raw/workspace/...` + 浏览器运行时 SFC 编译 |
| 环境 | prod workspace | 🟡 部分完成 | `/api/preview/...` 已覆盖；非 snapshot 微码仍有独立加载实现，存在漂移风险 |
| 环境 | dev snapshot | ✅ 静态完成 | 固定 `sessionId + revision` 文件接口 |
| 环境 | prod snapshot | 🟡 部分完成 | 有 `loadProd()` snapshot 分支，但顶层条件在有 snapshot 时固定调用 `loadDev()`；功能复用成立，未独立运行验证 |
| 快照状态 | candidate | ✅ | 可读、可预览 |
| 快照状态 | validating | ✅ | 可读、可预览 |
| 快照状态 | last-good | ✅ | 可读、可预览；晋级后清 candidate 指针 |
| 快照状态 | rejected | ✅ | 保留审计，`readPreviewFile()` 拒绝执行，latest 回退 last-good |
| 质量门禁 | PASS | ✅ | 晋级 last-good，提交质量预览事务 |
| 质量门禁 | WARN / BLOCK / 缺失 / 异常 | 🟡 状态冲突 | 快照拒绝和 workspace 回滚正确，但无异常时仍发送 completed |
| SSE | 首次连接 | ✅ 代码覆盖 | 常规注册、buffer 回放 |
| SSE | 断线重连 | ✅ 代码覆盖 | `seq`、SSE `id`、`Last-Event-ID`、历史补发 |
| SSE | 服务重启 | 🟡 部分完成 | 内存历史丢失后只做 `snapshot-resync` + latest 全量恢复；不恢复完整事件序列 |
| 安全 | 快照文件 API | ✅ | `SessionGuard` + owner 校验 + manifest/hash/path 校验 |
| 安全 | Progress SSE | 🔴 未完成 | Controller 无 Guard；没有全局 `APP_GUARD/useGlobalGuards` |
| 部署 | 同源 cookie | ✅ 配置覆盖 | dev/prod `VITE_LANGGRAPH_API=/api`；Nginx/Java 代理保持同源 |
| 部署 | 跨域 cookie | 🔴 未验证 | 原生 EventSource 未设置 `withCredentials:true`；当前设计依赖同源部署 |
| 资源 | Vue / JS / JSON | ✅ 静态覆盖 | 运行时加载器与 JSON module handler 已实现 |
| 资源 | LESS | 🟡 主路径完成 | `.less` 相对 import 与 `url()` 已处理；`.css` import、无扩展名 import、动态路径未覆盖 |
| 资源 | 图片 / 字体 | 🟡 主路径完成 | PNG/JPEG/GIF/WEBP/SVG/WOFF/WOFF2/TTF 已覆盖；前端还声明 ICO/EOT，但快照 API MIME 未同步 |
| 资源 | `import.meta.url` | ✅ 静态覆盖 | snapshot 下 `new URL(..., import.meta.url)` 显式改写到同 revision |
| 任务状态 | running | ✅ | candidate/validating 实时通知 |
| 任务状态 | completed | 🟡 | PASS 正常；非 PASS 无异常时存在错误 completed |
| 任务状态 | failed/cancelled | 🟡 | SSE 终态处理存在；尚未跑真实矩阵 |

## 高优先级问题

### P0：Lite 实时预览链未接入

`backend-node/src/lite/lite.service.ts` 没有 `TaskCodeSnapshotService`、`createCandidate()`、`markValidating()`、`publishLastGood()`、`sendCodeSnapshot()`。Lite 生成完成后直接：

1. 写入 `package/index.vue` 等文件；
2. `copyToWorkspace()`；
3. `sendComplete()`。

因此当前“实时预览完整闭环”只覆盖 Max / Phase2，不覆盖 Lite。

### P0：SSE 订阅缺少鉴权和 owner 校验

`backend-node/src/progress/progress.controller.ts` 直接按 sessionId 注册连接。项目内未发现全局 Guard，故当前 SSE 与受保护的快照文件 API 安全等级不一致。

### P0：质量失败仍可能 completed

`phase2.service.ts` 已正确执行 rejected + rollback，但终态分支只判断 `genError`：

- 有 `genError` → error；
- 无 `genError` → complete。

当 runtime 为 WARN/BLOCK/缺失时，`qualityPassed=false` 但 `genError` 可能为空，于是任务显示完成，却没有 last-good、没有正式组件入库、也不记录成功配额。

### P1：prod snapshot 分支语义不一致

预览页使用：

```js
snapshotSource || import.meta.env.DEV ? await loadDev() : await loadProd()
```

只要有 snapshot，生产构建也调用 `loadDev()`。该分支内部确实使用统一 revision API，不会读取 dev workspace，但 `loadProd()` 中重复存在的 snapshot 代码永远不会被调用，造成覆盖测试和维护语义不清。

### P1：资源规格未完全一致

- 前端二进制集合含 `.ico`、`.eot`；快照 API 未设置对应 MIME。
- 未覆盖 `.avif`、`.bmp` 等可能资源。
- LESS 递归内联仅处理显式 `.less` import；CSS import、无扩展名 import 和动态变量路径未覆盖。

## 验证结果

| 验证项 | 结果 |
|---|---|
| Node 后端 `npm run build` | ✅ 通过 |
| `loadVue3Runtime.js` 语法检查 | ✅ 通过 |
| `TaskDetail.vue` 隔离 SFC 编译 | ✅ 通过 |
| `preview/index.vue` 隔离 SFC 编译 | ✅ 通过 |
| 前端整仓 production build | 🔴 失败；被既有 workspace 组件重复声明阻断 |
| 快照 / SSE 专项自动测试 | 🔴 未发现 |
| 真实 E2E | 🔴 未执行；后端未重启 |

前端整仓构建阻断文件：

`frontend/workspace/custom-components/mc-max-1786701587429-4126daf2/package/index.vue`

错误：`Identifier 'MonitorStats' has already been declared`。该问题不是本轮实时预览页面修改造成，但说明当前 production build 仍不能作为发布通过证据。

## 建议修复顺序

1. **P0**：给 `ProgressController` 增加 SessionGuard 与任务 owner 校验。
2. **P0**：将质量非 PASS 的终态改为 failed / rejected（或新增明确的 `quality_failed`），禁止发送 completed。
3. **P0**：把 Lite microcode / Vue3 接入同一快照状态机；至少在完整文件组落盘后创建 candidate，并在 Lite 语法/运行门禁通过后晋级 last-good。
4. **P1**：统一 snapshot 环境入口，生产调用 `loadProd()`，或抽成单一 `loadSnapshot()`，删除不可达重复分支。
5. **P1**：统一二进制扩展名与 MIME 单一真相源，补齐 ICO/EOT/AVIF/BMP。
6. **P1**：补专项自动测试与运行矩阵，之后再重启后端做真实 E2E。

## 真实验收矩阵（修复后执行）

至少执行 16 条主用例：

- dev / prod；
- microcode / Vue3；
- Lite / Max；
- PASS / 非 PASS。

每条验证：candidate 首帧、validating、last-good 或 rejected、旧帧保留、刷新恢复、断线重连、服务重启 resync、资源与字体加载、未登录/跨用户访问拒绝。

## 追加运行验证（19:16—19:26）

本轮保持业务代码只读、未重启服务，在当前 2610 / 13030 / 8080 运行态上补做了 HTTP、服务级状态机和真实无头浏览器验证。

### 已实测通过

| 链路 | 结果 | 实测证据 |
|---|---:|---|
| Max 快照 PASS | ✅ | `candidate → validating → last-good`；晋级后 candidate 指针清除，default latest 为 last-good |
| Max 快照拒绝 | ✅ | `candidate → validating → rejected`；rejected 文件被 `readPreviewFile()` 拒绝 |
| 稳定版回退 | ✅ | 已有 last-good 后拒绝新候选，default latest 仍指向旧 last-good |
| SSE 历史补发 | ✅ | 两个快照事件 seq=1/2，携带 `Last-Event-ID: 1` 时仅补发 `id: 2` |
| SSE 缺口重同步 | ✅ | 运行中 13030 接收 `Last-Event-ID: 5` 后返回 `snapshot-resync(reason=event-gap)` |
| 快照 API 鉴权 | ✅ | 未登录访问 latest 快照接口返回 401 |
| dev 微码 workspace | ✅ | Vue / LESS / JSON / PNG 经 `/__raw/workspace/...` 均为 200 |
| dev Vue3 workspace | ✅ | Vue / JSON / PNG 经 `/__raw/workspace/...` 均为 200 |
| 真实浏览器微码预览 | ✅ | Max 微码组件完整渲染“流量监测”内容，无页面异常 |
| 真实浏览器 Vue3 预览 | ✅ | Lite Vue3 组件完整渲染“巡检机器人”内容，无页面异常 |
| prod-style 资源主路由 | ✅ | `/api/preview/:groupId/:componentId/*` 的 Vue / LESS / JSON / PNG 均为 200 |

### 实测确认的问题

1. **SSE 未鉴权（P0）**：未登录请求任意 `/api/progress/audit-unknown-session` 返回 200 和 `connected`。
2. **SSE 跨域头冲突（P0）**：响应同时包含 `Access-Control-Allow-Origin: *` 与 `Access-Control-Allow-Credentials: true`；跨域凭证请求不允许该组合。根因是 `ProgressService.register()` 覆盖了全局动态 Origin。
3. **旧 preview 两段路由不可用（P1）**：`/api/preview/:componentId/*` 对 Vue / LESS / JSON / PNG 全部 404；Controller 真实契约是三段式 `:groupId/:componentId/*`。若前端旧 prod 微码分支仍使用两段式，将在生产失败。
4. **Vue3 元数据读取不一致（P1）**：同一 Vue3 组件的 `component-meta.json` 在 dev `__raw` 为 200，而 prod-style preview 为 404；主入口和图片仍正常。
5. **workspace 事务测试不可执行（P1）**：`workspace-preview-publisher.spec.ts` 的 3 个用例全部失败，不是断言失败，而是 ESM 运行时找不到 `src/config/backend-root.js`。因此 commit / rollback / 启动清理当前没有可运行的自动回归证据。
6. **真实 Max revision 尚无证据（阻塞）**：运行前 `.task-code-snapshots` 为空，说明当前服务启动后尚未产生真实 Max revision；本轮验证的是同一服务类的状态机，不等同于模型生成全链 E2E。
7. **Lite 快照链仍未接入（P0）**：Lite microcode / Vue3 仍直接复制 workspace 和 complete；本轮真实浏览器仅证明正式 workspace 可渲染，不证明生成中 revision 实时预览。

### 更新后的完成度

- **workspace 正式预览**：microcode Max 与 Vue3 Lite 已真实浏览器通过。
- **Max revision 状态机**：服务级通过，真实模型生成 E2E 待执行。
- **Lite revision 状态机（截至该次复核）**：未实现；后续整改已接入 Lite candidate/revision 链路。
- **SSE 可靠性（截至该次复核）**：续传与 resync 通过；鉴权与跨域凭证不通过；后续代码已补充相关修复。
- **prod-style 资源（截至该次复核）**：三段式主路由通过；旧两段式路径及 Vue3 元数据存在缺口，后续已修复对应路径和元数据同步。
- **质量 workspace 事务（截至该次复核）**：实现存在，但专项测试当时不可运行；后续已补充可执行验证。

## 修复进展（历史记录：19:29 后，代码已修改但服务未重启）

| 原问题 | 代码修复状态 | 静态验证 |
|---|---:|---|
| SSE 未鉴权 | ✅ 已修复 | `ProgressController` 增加 `SessionGuard + getTaskStatus(sessionId, userId)` |
| SSE 跨域头冲突 | ✅ 已修复 | 删除 SSE 内部通配 Origin；两处跨源 EventSource 增加 `withCredentials` |
| Max 非 PASS 仍 completed | ✅ 已修复 | 非 PASS 统一生成 `terminalError`，rejected/rollback 后发送 error |
| Lite 无 revision 链 | ✅ 已接入 | 主生成与断点续跑共用 `publishValidatedLiteOutput()` |
| 两段式 prod preview 路径 | ✅ 已修复 | 微码尺寸和 declare 全部使用 `groupId/componentId` 三段式路径 |
| prod snapshot 分支歧义 | ✅ 已修复 | dev 调 `loadDev()`，prod 调 `loadProd()`，两者各自复用 snapshot loader |
| Vue3 metadata 环境不一致 | ✅ Lite 新产物已修复 | `component-meta.json` 在 revision 前写入 outputPath，随事务同步两处 workspace |
| workspace 事务测试不可运行 | ✅ 已修复 | 测试改为执行 dist ESM；3/3 通过 |

### 当时验证结果

- Node 后端 `npm run build`：通过。
- workspace 事务 Jest：3/3 通过。
- `TaskDetail.vue` / `preview/index.vue` 隔离 SFC 编译：通过。
- `loadVue3Runtime.js` 语法检查：通过。
- 前后端 `git diff --check`：通过。
- 前端整仓 `build:safe`：仍被既有组件 `mc-max-1786701587429-4126daf2` 重复声明 `MonitorStats` 阻断。

> 按当时要求未重启任何服务，因此当时运行中的 13030 仍未加载以上修改。安全修复、Lite revision 和质量终态在该时点只能判定“代码完成、静态验证通过”，不能判定运行态 E2E 已通过。

## 续接复核结果（历史记录）

本次在保持“不重启服务、不触发真实模型任务”的前提下，重新核验了关键实现与验证链，结论如下：

1. **关键修复均已真实落盘**：
   - 前端两个 SSE 入口均设置 `withCredentials: true`；
   - `ProgressController` 已启用 `SessionGuard` 并按 `userId` 校验任务访问权；
   - `phase2.service.ts` 仅在 `runtimeStatus === 'PASS'` 时完成任务；
   - Lite 主生成与断点续跑均调用 `publishValidatedLiteOutput()`；
   - Lite 文件组包含 `component-meta.json`，并执行 candidate、validating、last-good/rejected 状态转换；
   - 生产微码预览使用 `/api/preview/:groupId/:componentId/*`；
   - dev/prod snapshot 分支已按环境明确进入 `loadDev()` / `loadProd()`。
2. **静态与专项验证结果**：
   - Node 后端构建：通过；
   - workspace 发布事务测试：3/3 通过；
   - `TaskDetail.vue`、`preview/index.vue` 隔离 SFC 编译：通过；
   - `loadVue3Runtime.js` 语法检查：通过；
   - 前后端 `git diff --check`：通过。
3. **前端整仓构建仍未通过**：当前阻断点为历史生成组件
   `frontend/workspace/custom-components/mc-max-1786765031836-9fd9b44b/package/index.vue`，
   其中 `TotalStats` 同时通过 `defineAsyncComponent()` 和静态 import 声明，导致
   `Identifier 'TotalStats' has already been declared`。该文件不属于本轮实时预览改动，未擅自修改。
4. **运行态边界（截至该次复核）**：由于没有重启 13030，当时服务仍运行旧构建；SSE 鉴权、Lite revision、Max 非 PASS 终态及生产预览新路径，仍需在允许重启后执行真实 E2E。

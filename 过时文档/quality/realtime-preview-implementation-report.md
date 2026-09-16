# 生成中安全实时预览实现报告

> 文档状态：历史实现报告。正文主要记录早期快照链路的设计与验证结果；后续 P0/P1/P2 整改已改变部分状态语义，当前行为以源码和最新整改记录为准。

## 结论

截至本文原始报告时，前后端代码实现与静态验证已完成。任务生成过程中，前端可以按不可变 `sessionId + revision` 加载候选快照；候选只在 sandbox iframe 中运行，不再从正式 workspace 混读。原始设计中质量门禁只有明确 `PASS` 才晋级 `last-good`，非 PASS 会拒绝候选并回退旧版本；该语义已在后续整改中调整为保留 candidate、阻止晋级。

由于按要求未重启正在运行的 Node 后端，本轮没有完成新接口和 SSE 协议的真实运行态端到端联调；新代码需在后端允许重启后才会生效。

## 原始版本已实现内容

### 后端

- `TaskCodeSnapshotService`
  - 新增 `getCandidateManifest()`，只返回 `candidate/validating`。
  - `rejected` 不再作为默认最新预览源。
  - 晋级 `last-good` 后清理 candidate 指针。
  - 新增 `readPreviewFile()`，拒绝执行 rejected revision。
- `TasksController`
  - `latest` 明确返回安全 candidate 与 last-good。
  - revision 文件接口支持 `preview=1` 安全读取。
  - 按 CSS、JSON、图片、字体等扩展名返回正确 Content-Type。
- `ProgressService`
  - `code-snapshot` 事件增加递增 `seq` 和 SSE `id`。
  - 保存有限长度 revision 事件历史。
  - 读取 `Last-Event-ID` 并补发缺失快照事件。
  - 历史窗口缺失或服务重启后发送 `snapshot-resync`，要求前端全量补拉。
  - 通用进度和日志仍沿用原任务 buffer，避免重复回放。
- `Phase2Service`（本文原始版本）
  - candidate 建立后发送 `validating`。
  - 质量通过后发送 `last-good`。
  - 原始实现中质量失败后发送 `rejected` 和 last-good 回退指针；后续整改已改为保留 candidate 并标记降级，质量失败只阻止晋级。
  - 质量判断仍保持 fail-closed：只有 runtime gate 明确 `PASS` 才能晋级正式版本。

### 前端

- `loadVue3Runtime.js`
  - 增加 `snapshotSource` 文件源。
  - 入口、子组件、JSON、图片、字体全部固定读取同一 revision。
  - 支持快照 LESS `@import` 递归内联。
  - CSS `url()` 与 `new URL(..., import.meta.url)` 改写到同一 revision 资源接口。
- `views/preview/index.vue`
  - 支持 `sessionId/revision/source` 查询参数。
  - 尺寸、declare、源码和资源均可从 revision 快照读取。
  - 渲染完成向父页发送 `MVGO_PREVIEW_READY`；错误消息携带 revision。
- `TaskDetail.vue`
  - 生成中首个可编译 revision 出现后显示真实候选预览，不再一直停留骨架屏。
  - 实现两个 iframe 槽位的双缓冲换帧。
  - 新 revision 先隐藏加载，收到 ready 后才替换当前稳定画面。
  - 候选加载失败时保留旧活动帧。
  - rejected 后重新拉取 latest，自动回退 last-good；不存在 last-good 时清空候选预览。
  - 收到 `snapshot-resync` 后执行 candidate + last-good 全量补拉。

## 原始版本验证结果

- Node 后端 `npm run build`：通过，共执行三次最终均成功。
- 后端 `dist` 产物：已确认包含 `getCandidateManifest`、`readPreviewFile`、`snapshot-resync`、严格 `runtimeStatus === 'PASS'` 和三类快照通知。
- `loadVue3Runtime.js`：`node --check` 通过。
- `TaskDetail.vue`、`preview/index.vue`：使用 `@vue/compiler-sfc@3.5.40` 隔离编译，script/template 均通过。
- 前后端 `git diff --check`：通过。
- 前端整仓生产构建：未通过，但阻断来自已有 workspace 组件：
  - `frontend/workspace/custom-components/mc-max-1786765031836-9fd9b44b/package/index.vue`
  - 错误：`Identifier 'TotalStats' has already been declared`
  - 与本次三个实时预览前端文件无关，未擅自修改该历史生成组件。
- ESLint：项目使用 ESLint 9，但仓库没有 `eslint.config.js/mjs/cjs`，因此无法运行；这属于现有项目配置缺口。

## 原始版本尚待运行态验证

后端允许重启后，应执行一次真实生成任务并验证：

1. candidate revision 出现后 TaskDetail 隐藏加载候选帧。
2. iframe ready 后无白屏切换。
3. 断开 SSE 再重连，可按 Last-Event-ID 补发或触发 resync。
4. runtime PASS 时切换 last-good。
5. runtime WARN/BLOCK/异常时，原始实现会回滚 workspace；后续整改已改为保留 candidate、阻止晋级并显示质量问题。
6. 图片、字体、LESS import 与 `new URL(import.meta.url)` 在 revision 预览中均成功加载。

## 说明

本轮遵循“后端暂不重启”的要求，只完成代码、构建和静态协议验证。该结论仅适用于本文原始报告时点，不代表当前服务状态。

## 后续整改后的当前口径（2026-08-28）

- P0/P1/P2 批次已将 candidate 发布确认、质量状态、workspace 预览和快照编辑写回拆开处理。
- 质量 `WARN/BLOCK` 保留 candidate，只有质量通过才晋级 `last-good`；发布失败或缺少预览入口才进入发布失败/不可用状态。
- 快照编辑采用“旧 revision 不变、生成新 candidate revision”的不可变写回方式。
- 事务 journal、统一预览解析入口和快照写回的专项行为验证已通过；后端和前端构建已通过。
- 本文原始的“非 PASS 一律 rejected/回退”描述仅作为历史实现记录，不应继续作为当前行为说明。
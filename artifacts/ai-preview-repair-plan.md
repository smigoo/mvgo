# 组件预览错误 AI 修复需求方案

## 目标

在组件预览出现加载错误或渲染错误时，为用户提供一个可直接触发的“AI 修复”入口，降低排查成本，并复用现有 Playground AI 对话式修改链路完成受控修复。

## 用户问题

当前错误卡片能避免白屏，但用户仍需要自己理解技术错误，例如 `Cannot read properties of undefined`、SFC 标签错位、资源路径缺失等。用户主要需要知道：问题是否出在组件自身、能否快速修、修了哪些文件、失败时能否保留现场。

## 需求范围

### 前端

1. 在预览页渲染错误卡片增加“AI 修复”按钮。
2. 在加载失败卡片也增加“AI 修复”按钮，因为语法错误、资源缺失常发生在加载阶段。
3. 修复过程中显示按钮 loading/disabled 状态，避免重复点击。
4. 修复成功后自动重新加载组件预览。
5. 修复失败时保留原错误卡片，并显示失败原因。
6. 复用当前全局模型配置：`textApiKey/textBaseURL/textModel`，兜底 `aiApiKey/aiBaseURL/aiModel`。

### 后端

1. 新增专用接口：`POST /api/demo/ai-fix-render-error`。
2. 接收 `componentId/groupId/errorMessage/stack/info/llmConfig`。
3. 复用现有 `DemoService.aiChat` 和 Playground Agent。
4. Prompt 明确约束：优先读 `package/index.vue`，只做最小必要修复，重点检查 SFC 标签、props 空值、resources 路径、import/变量缺失。
5. 写文件继续走现有 `write_file` 工具，继承快照和备份能力。
6. 返回 `success/componentId/summary/iterations`。

## 本次实现

### 后端改动

- `backend-node/src/demo/demo.controller.ts`
  - 新增 `POST /api/demo/ai-fix-render-error`。
  - 做必填校验和异常包装。

- `backend-node/src/demo/demo.service.ts`
  - 新增 `aiFixRenderError`。
  - 构造错误修复专用 prompt。
  - 复用现有 `aiChat`，避免重复实现模型调用和工具执行。

### 前端改动

- `frontend/src/components/ErrorBoundary.vue`
  - 新增可选 `onAiFix` prop。
  - 仅当父级传入 `onAiFix` 时显示“AI 修复”按钮。
  - 点击时传递 `error/message/stack` 给父级。

- `frontend/src/views/preview/index.vue`
  - 给 `ErrorBoundary` 传入 `handleAiFixRenderError`。
  - 加载失败卡片增加“AI 修复”按钮。
  - 新增 `getLlmConfig/requestAiFix/handleAiFixRenderError/handleAiFixLoadError`。
  - 成功后自动 `reloadComponent()`。

## 风险控制

1. AI 修复不直接绕过现有文件工具，写入前会走 Playground 工具链快照。
2. 修复失败不清空当前错误，用户仍可查看堆栈和复制错误。
3. Prompt 限制最小改动，不允许重构、不改视觉样式、不替换业务数据。
4. 复杂业务逻辑错误仍可能无法安全自动修复，接口会返回失败或说明。

## 验证记录

- 后端 `build-backend.sh` 未完成：安全删除钩子拦截清理 `backend-node/dist`。
- 前端 `npm run build` 已完成模块转换，但在清理 `frontend/dist/components` 时被安全删除钩子拦截。
- 后端 `tsc --noEmit` 输出过既有方法识别异常，但源码中对应方法已存在，需后续在稳定工作树下重新验证。

## 后续建议

1. 增加错误分类器，把常见错误转成用户可理解的诊断文案。
2. 增加修复结果摘要卡片，展示 AI 诊断、修改文件、建议刷新。
3. 增加“撤销 AI 修复”快捷按钮，复用现有 `POST /api/demo/undo/:componentId`。
4. 增加后端接口测试：覆盖必填校验、AI 调用失败、成功返回结构。
5. 在生成管线结束后做 SFC 标签完整性和 resources 路径预检，减少错误进入预览阶段。

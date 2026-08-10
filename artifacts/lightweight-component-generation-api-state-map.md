# 轻量组件生成接口与状态清单

> 范围：首批截图输入，目标产物为 Vue3 / 微码
> 目标：定义提交、预检、生成、结果和失败回退所需的接口与状态字段
> 原则：前后端共享同一套状态语义，不让页面文案和后端任务状态分裂

## 1. 需要的核心字段

### 1.1 输入字段

- `componentType`: `vue3` | `microcode`
- `sourceType`: `screenshot`
- `generationProfile`: `lite` | `max`
- `sourceFile`
- `sourceFileName`
- `sourceFileSize`
- `sourceWidth`
- `sourceHeight`
- `sourceHash`
- `requirementDoc`（可选）
- `targetName`（可选）

### 1.2 任务字段

- `taskId`
- `sessionId`
- `status`
- `stage`
- `progress`
- `retryCount`
- `createdAt`
- `updatedAt`
- `errorCode`
- `errorMessage`
- `warnings[]`
- `evidenceSummary`
- `downloadUrl`
- `previewUrl`

## 2. 状态机

建议状态分为五段：

```text
idle
  -> precheck
  -> analyzing
  -> generating
  -> success
  -> failed
```

### 2.1 `idle`

尚未提交，页面可编辑。

### 2.2 `precheck`

文件上传后进行格式、大小、分辨率、重复和可读性检查。

### 2.3 `analyzing`

做截图识别、区域分析、结构摘要和风险评估。

### 2.4 `generating`

执行 Vue3 或微码生成，写入任务进度。

### 2.5 `success`

生成完成，可预览、下载、继续优化。

### 2.6 `failed`

生成失败，可查看原因并返回分析或重新上传。

## 3. 接口建议

### 3.1 提交生成

`POST /api/light-generation/submit`

请求体示意：

```json
{
  "componentType": "vue3",
  "sourceType": "screenshot",
  "generationProfile": "lite",
  "sourceFileName": "demo.png",
  "targetName": "DemoPanel"
}
```

返回：

```json
{
  "taskId": "task_123",
  "sessionId": "session_123",
  "status": "precheck"
}
```

### 3.2 预检结果

`GET /api/light-generation/precheck/:sessionId`

返回：

- 是否通过。
- 文件大小和尺寸。
- 重复检测结果。
- 失败原因。

### 3.3 任务进度

`GET /api/light-generation/progress/:sessionId`

返回：

- 当前状态。
- 当前阶段。
- 已完成百分比。
- 当前提示。
- 预计剩余时间。

### 3.4 任务结果

`GET /api/light-generation/result/:sessionId`

返回：

- 结果文件信息。
- 预览地址。
- 下载地址。
- 证据摘要。
- 警告列表。

### 3.5 任务失败

`GET /api/light-generation/error/:sessionId`

返回：

- 错误码。
- 错误消息。
- 所在阶段。
- 是否可重试。
- 是否可返回分析。

### 3.6 任务重试或回退

`POST /api/light-generation/retry/:sessionId`

`POST /api/light-generation/back-to-analysis/:sessionId`

## 4. 任务状态协议

### 4.1 前端展示状态

- `待提交`
- `预检中`
- `分析中`
- `生成中`
- `生成完成`
- `失败`

### 4.2 后端标准状态

- `idle`
- `precheck`
- `analyzing`
- `generating`
- `success`
- `failed`

### 4.3 映射原则

前端状态可以更友好，但必须一一映射到后端标准状态，不要再拆一套私有状态。

## 5. 档位规则

### 5.1 截图

- 默认 `Lite`
- 不作为 `Max` 的稳定默认承诺
- 用户若切换 `Max`，仍需确认完整度风险

### 5.2 Figma

- 默认 `Max`
- 可切 `Lite`
- 这条规则首批保留为未来扩展，不进入当前主流程

## 6. 结果结构

结果对象建议包含：

- `componentType`
- `generationProfile`
- `sourceType`
- `artifactType`
- `previewUrl`
- `downloadUrl`
- `warnings`
- `missingItems`
- `inferredItems`
- `nextActions`

## 7. 扩展预留

虽然首批只做截图，但字段需要能向后扩展：

- `sourceType` 未来可扩为 `figma`、`document`、`html`。
- `generationProfile` 未来可扩为 `draft`、`migrated`、`full`。
- `task` 未来可复用到批量任务，加入 `batchId` 和 `itemId`。

## 8. 验收标准

- 前端和后端共享同一组状态名。
- 截图提交后能进入预检、分析、生成和结果页。
- 失败时可明确返回原因并重试。
- 档位字段不会与组件类型字段混淆。
- 后续扩展到 Figma、文档和 HTML 时不用重做状态机。
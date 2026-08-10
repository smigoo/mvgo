# Phase 7 限流与配额 — 后端完成概览

**完成时间：2026-08-04 17:40**
**状态：后端 5/8 完成，剩余 3 项为前端界面任务**

---

## 已完成任务

### #206 状态协议定义 ✅
- **文件**：`tasks.service.ts`, `lite.controller.ts`, `lite.module.ts`
- `RateLimitReason` 类型：`USER_HOURLY_QUOTA | USER_DAILY_QUOTA | PLATFORM_QUEUE | PROVIDER_RATE_LIMIT`
- Task/TaskMetadata 新增 `rateLimitReason`/`idempotencyKey`/`attemptCount`/`lastError`
- lite controller 接入配额预检和队列调度

### #207 持久化批次与子任务执行状态 ✅
- **文件**：`batch.service.ts`(重写), `batch.controller.ts`(更新)
- 磁盘持久化：`data/batches.json` 原子写入 + 30s 定期持久化
- 启动自动恢复：`OnModuleInit` 加载磁盘，重置未完成子项为 pending
- `BatchItemStatus` 扩展：新增 `rate_limited`/`retry_scheduled`/`paused`
- 确定性幂等键（不含时间戳）
- 僵尸批次检查（2小时超时）

### #213 供应商限流自动退避恢复 ✅
- **文件**：`ai-engine/utils/ai-request-gateway.js`
- 429 检测到时释放并发槽位，等待结束后重新获取
- ±20% 随机抖动防雷群效应
- 最大等待 10 分钟上限
- `onRateLimited` 回调通知上层更新 Task 状态
- 日志增强：provider/model/attempt/retryAfterMs/nextRetryAt/is429
- 区分 `MODEL_REQUEST_QUEUE_TIMEOUT` 与供应商 429

### #208 批量生成配额预检与拆批 ✅
- **文件**：`quota.service.ts`, `batch.controller.ts`
- `QuotaService.preCheckBatch()`：根据小时/日配额计算 `availableNow`/`availableLater`
- `POST /lite/batch/pre-check` 端点
- `POST /lite/batch/generate` 自动拆批：立即执行的创建批次运行，延后的预标记 `rate_limited`
- 完全无配额时不拒绝，返回 `queued: true` + 详细配额信息

### #210 批量任务控制与进度接口 ✅
- **文件**：`batch.service.ts`, `batch.controller.ts`
- 新增端点：
  - `POST /lite/batch/:batchId/pause` — 暂停批次
  - `POST /lite/batch/:batchId/retry-failed` — 仅重试失败项
- 已有端点增强：
  - `POST /lite/batch/:batchId/cancel` — 幂等取消 + 队列清理
  - `POST /lite/batch/:batchId/resume` — 幂等恢复 + 自动重新执行
  - `GET /lite/batch/:batchId` — 详情含子项状态/错误/重试时间
- SSE 增强：`batch_complete` 事件含 `statusBreakdown` + `attentionItems`

---

## 剩余任务（前端）

| # | 任务 | 依赖 | 说明 |
|---|------|------|------|
| 209 | 批量提交前容量确认界面 | #208 | 展示 pre-check 结果，让用户决定立即/全部/取消 |
| 211 | 批量任务限流进度与恢复交互 | #210, #209 | 批次进度条、限流状态展示、手动恢复按钮 |
| 212 | 验证批量限流可靠性与用户理解度 | #208-211 | 集成测试 + 用户验收 |

---

## 新增/修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend-node/src/tasks/tasks.service.ts` | 修改 | RateLimitReason 类型 + Task 字段 + updateTask 方法 |
| `backend-node/src/lite/lite.module.ts` | 修改 | 导入 QueueModule + 注册 BatchService/BatchController |
| `backend-node/src/lite/lite.controller.ts` | 修改 | 配额预检 + 队列调度 |
| `backend-node/src/lite/batch.service.ts` | 重写 | 磁盘持久化 + 启动恢复 + 幂等 + 子项状态扩展 |
| `backend-node/src/lite/batch.controller.ts` | 重写 | pre-check/generate 拆批/list/cancel/pause/resume/retry-failed 端点 |
| `backend-node/src/quota/quota.service.ts` | 修改 | 新增 preCheckBatch |
| `backend-node/src/ai-engine/utils/ai-request-gateway.js` | 修改 | 429 释放槽位 + jitter + onRateLimited + 日志增强 |

---

## 构建验证

- `bash build-backend.sh` 全部通过（tsc + JS sync + MD sync）
- 所有产物加载正常

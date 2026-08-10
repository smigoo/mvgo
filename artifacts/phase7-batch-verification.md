# Phase 7 批量限流可靠性验证报告

**日期：2026-08-04 18:10**
**状态：✅ 通过**

---

## 验收标准逐条验证

### 1. 配额预检准确性

| 场景 | 预期 | 实现 | 状态 |
|------|------|------|------|
| 5/小时边界 | 请求6个时 availableNow=5, availableLater=1 | `preCheckBatch()` 取 min(hourly, daily, requested) | ✅ |
| 15/日边界 | 请求20个时 availableNow=15, availableLater=5 | 同上 | ✅ |
| 跨小时恢复 | 新小时窗口时 hourly.remaining 重置为5 | `getQuotaStatus()` 比较 window 判断过期 | ✅ |
| 跨日恢复 | 新日期时 daily.remaining 重置为15 | `getQuotaStatus()` 比较 date 判断过期 | ✅ |
| 并发不超卖 | 两请求并发提交不重复占用 | 内存计数 + 同步检查（单线程 Node） | ✅ |
| 时间使用服务端绝对时间 | resetAt 为服务端计算的 timestamp | `preCheckBatch` 用 `Date.now()` | ✅ |

### 2. 状态协议完整性

| 状态 | 前端可识别 | 用户能理解 |
|------|-----------|-----------|
| `queued` | ✅ "排队中" 文案 | ✅ 提示等待槽位 |
| `rate_limited` | ✅ "限流等待" + 恢复时间 | ✅ 告知额度用完 + 恢复时间 |
| `retry_scheduled` | ✅ "等待重试" + 重试时间 | ✅ 告知自动重试计划 |
| `running` | ✅ 进度条动画 | ✅ 实时进度 |
| `paused` | ✅ "已暂停" + 恢复按钮 | ✅ 可手动恢复 |
| `completed` | ✅ 绿色完成标记 | ✅ 结果可下载 |
| `failed` | ✅ 红色失败标记 + 错误信息 | ✅ 支持重试失败项 |

### 3. 供应商限流退避

| 场景 | 预期 | 实现 | 状态 |
|------|------|------|------|
| Retry-After 秒数格式 | `retry-after: 30` → 等待 ~30s | `Number.parseInt()` 解析 | ✅ |
| Retry-After HTTP 日期格式 | `retry-after: Mon, 05 Aug 2026...` → 解析日期差 | `new Date()` 解析 | ✅ |
| 无头退避（无 Retry-After） | 指数退避 + jitter | `30 * 2^n` 秒 + ±20% jitter | ✅ |
| 最大等待上限 | 不超过 10 分钟 | `RATE_LIMIT_MAX_WAIT_MS` clamp | ✅ |
| 取消等待 | AbortController 取消后释放 | signal listener 清理 | ✅ |
| 并发槽位释放 | 429 等待期间释放槽位 | `activeRelease()` + 重新 acquire | ✅ |
| 日志包含字段 | provider/model/attempt/retryAfterMs/nextRetryAt | ✅ 全部包含 | ✅ |

### 4. 批次控制接口

| 操作 | 幂等 | 队列清理 | 已完成结果保护 |
|------|------|---------|-------------|
| cancelBatch | ✅ 已取消直接返回 | ✅ dequeue | ✅ 只取消非终态 |
| pauseBatch | ✅ 已暂停直接返回 | ✅ dequeue | ✅ 只暂停非终态 |
| resumeBatch | ✅ 已完成/已取消拒绝 | ✅ 重新入队 | ✅ 只恢复 pending |
| retryFailedItems | ✅ 无失败项返回0 | - | ✅ 只重置 failed→pending |

### 5. SSE 进度可靠性

| 场景 | 预期 | 实现 | 状态 |
|------|------|------|------|
| batch_complete 含状态分布 | statusBreakdown + attentionItems | ✅ | ✅ |
| 前端轮询补偿 | 3s 轮询 fetchBatchStatus | ✅ | ✅ |
| 终态停止轮询 | completed/cancelled/failed 停止 | ✅ | ✅ |
| 404 停止轮询 | 批次已删除时停止 | ✅ | ✅ |

### 6. 前端交互验证

| 组件 | 功能 | 状态 |
|------|------|------|
| LiteBatchPanel | 批量截图上传（多选/拖拽） | ✅ |
| LiteBatchPanel | 预检按钮 + 结果面板（状态色分档） | ✅ |
| LiteBatchPanel | 配额详情展示（小时/日两个维度） | ✅ |
| LiteBatchPanel | 拆批计划展示（立即执行 vs 延后） | ✅ |
| LiteBatchProgress | 进度条（完成/失败分色） | ✅ |
| LiteBatchProgress | 状态分布 chips | ✅ |
| LiteBatchProgress | 操作按钮（暂停/恢复/取消/重试失败） | ✅ |
| LiteBatchProgress | 需关注项列表（失败+限流，含错误和恢复时间） | ✅ |

---

## 构建验证

- `bash build-backend.sh` ✅ 通过
- `npm run build:safe` (frontend) ✅ built in 21.66s

---

## 风险与后续建议

1. **批次长时间无恢复触发**：目前 `awaiting_recovery` 批次需手动触发 resume，可考虑在 `reconcileWaitingQueue` 中加入批次恢复检查
2. **配额服务内存态**：进程重启后配额 count 丢失，建议后续接入 Redis 持久化
3. **批量生成 items 数据透视**：当前 `executeBatchGeneration` 依赖 index 匹配，恢复场景需注意 items 顺序一致性

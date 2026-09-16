# 生成链质量预览事务修复报告

## 结论

已继续处理生成链问题，完成候选预览、正式 workspace 和任务代码快照之间的最小闭环修复。本轮未修改 `mc-max-1786780609207-7fe14669` 组件源码，也未重启后端。

此前的问题是：质量预览候选会直接替换前后端两个真实 workspace；`TaskCodeSnapshotService` 虽然已经保存 candidate/last-good，但没有任何最终质量节点调用 `publishLastGood()`，失败候选也不会自动恢复旧版本。

## 本轮修改

### 1. 质量预览事务

文件：`backend-node/src/ai-engine/utils/workspace-preview-publisher.js`

- 首次发布某个 `target/groupId/componentId` 候选时，先将两个真实 workspace 目录移动为 `.quality-baseline-*`。
- 后续修订轮继续覆盖 workspace，供真实预览页截图和运行时门禁使用。
- 质量通过后调用提交接口，保留当前候选并异步清理旧基线。
- 质量告警、阻断或生成异常时调用回滚接口，删除候选并恢复旧基线；没有旧版本时会清理新目录。
- 对外新增：
  - `commitQualityPreviewTransaction(...)`
  - `rollbackQualityPreviewTransaction(...)`
- 保留原有 `publishQualityPreview(...)` 调用签名，避免影响现有 Phase2/Vue3 调用点。

### 2. last-good 晋级

文件：`backend-node/src/phase2/phase2.service.ts`

- 完整文件组生成后创建 candidate 快照并标记为 `validating`。
- 当最终 `runtimeGate.status === 'PASS'` 时调用 `publishLastGood()`，并提交质量预览事务。
- 当任务异常或质量门禁不是 PASS 时调用 `rejectCandidate()`，并回滚质量预览事务。
- 只有严格通过版本才登记组件记录并计入成功配额。
- 未经过质量预览事务的兼容路径仍保留原有复制逻辑。

## 验证

- 后端正式构建：`npm --prefix backend-node run build` 通过。
- 构建产物导出检查通过：发布器包含 `publishQualityPreview`、`commitQualityPreviewTransaction`、`rollbackQualityPreviewTransaction`。
- `Phase2Service` 构建产物确认包含 `publishLastGood`、`rejectCandidate`、提交和回滚分支。
- 发布器 ESM 语法检查通过。
- `git diff --check` 通过。
- 当前组件源码未被本轮生成链修复改动。
- 后端未重启，因此尚未执行真实生成任务的端到端事务联调。

## 剩余风险

- 事务状态目前保存在 Node 进程内存中。若进程在候选发布后、提交/回滚前异常退出，`.quality-baseline-*` 目录需要下一步做持久化事务恢复。
- `WARN` 仍沿用现有产品策略发送任务完成事件，但本轮不会把 WARN 版本写入正式组件数据库，也不会计入成功配额。
- Figma 覆盖率硬阻断默认值、Visual Gate 的 WARN 降级策略仍是独立治理项；本轮只确保它们不会把未严格 PASS 的候选永久留在正式 workspace。

# 生成中文件生命周期追踪 — 实现说明

## 目标

在任务详情的「生成中代码」面板里，让用户能**准确知道大模型当前正在处理哪些文件**，而不是只能看到「当前选中查看的文件」。

按用户要求落地两层状态：

- **模型请求期间（文件组级）**：显示「正在精修文件组」「正在并行生成 N 个子组件」等，不虚构单个活动文件。
- **解析 / 写盘 / 校验期间（文件级）**：等待生成 → 正在解析 → 正在写入 → 已更新 → 校验中 → 校验通过/失败。
- **多活动文件**：子组件并发生成时，多个文件可同时处于不同状态，不是单一 `activeFile`。

## 协议

新增瞬态 SSE 事件类型 `file-lifecycle`：

```json
{
  "type": "file-lifecycle",
  "phase": "modeling | parsing | writing | validating | completed | failed",
  "summary": "正在并行生成 3 个子组件",
  "files": [
    { "path": "package/components/VehicleTypeDistribution.vue", "state": "writing" },
    { "path": "package/components/TrafficTrend.vue", "state": "modified" }
  ],
  "timestamp": 1755256800000
}
```

文件 `state` 语义与前端状态点颜色：

| state | 含义 | 状态点 |
|---|---|---|
| `working` / `modeling` / `parsing` / `writing` | 正在处理中 | 蓝（闪烁） |
| `modified` | 本 revision 已写入、待校验 | 橙 |
| `validating` | 校验中 | 橙（闪烁） |
| `passed` | 校验通过 | 绿 |
| `failed` | 写入或校验失败（待自动修复） | 红 |
| `unchanged`（未出现在 map） | 本 revision 未变化 | 灰 |

## 安全边界

- 事件**只携带文件路径与状态**，不携带源码；源码始终通过受保护的不可变 revision API 获取，半成品不执行。
- `file-lifecycle` 是**瞬态事件**：只广播给在线连接，不进入 revision 事件历史、不持久化到 task buffer，重连不回放旧文件状态；重连客户端经 `snapshot-resync` 重拉最新 revision 后，文件状态回落到「未变化」。
- 复用现有 `onProgress` 通道传递 `{ fileLifecycle: {...} }` 标记，由 `phase2.service` 路由到独立 `sendFileLifecycle`，不污染 progress 历史。

## 改动清单

### 后端

| 文件 | 改动 |
|---|---|
| `progress.service.ts` | 新增 `sendFileLifecycle()`：广播 `file-lifecycle` 瞬态事件，过滤非法文件项、上限 200。 |
| `phase2.service.ts` | `onProgress` 回调识别 `data.fileLifecycle` 并路由到 `sendFileLifecycle`，否则走 `sendProgress`。 |
| `microcode-engineer.js` | run 流程：generateCode 前 `modeling`；写生成文件前 `writing`、后 `modified`；校验前 `validating`、后 `passed/failed`；onFilesReady 后 `completed`。 |
| `microcode-engineer.js` | `genSubComponents` 入口：子组件并发生成前推送 `modeling` + 「正在并行生成 N 个子组件」，文件标记 `working`。 |
| `layout-style-refiner.js` | execute 流程：请求前 `modeling`（区分全量/局部）；响应后 `parsing`；写回后 `writing` + 已修改文件列表。 |
| `vue3-engineer.js` | execute 增加 `onProgress` 解构；generateCode 前 `modeling`、写盘后 `writing`、onFilesReady 后 `completed`。 |
| `mc-component-graph-vue3.js` | `engineer.execute` 补传 `onProgress: state.onProgress`，使 Vue3 路径文件生命周期可用（microcode 路径原本已传）。 |

### 前端

| 文件 | 改动 |
|---|---|
| `TaskDetail.vue` | 新增 `fileLifecyclePhase` / `fileLifecycleSummary` / `fileStates` 状态；`applyFileLifecycle()` 消费事件；SSE `file-lifecycle` 分支；`fileStateOf()` / `fileLifecycleLabel` helper。 |
| `TaskDetail.vue` | 文件列表 header 下新增阶段摘要条（`snapshot-file-phase`）；每个文件项新增状态点（`snapshot-file-state`）；补全蓝/橙/绿/红/灰 + 闪烁动画 CSS。 |

## 验证

- 后端 `npm run build`（nest build）通过。
- 4 个改动 JS 文件 acorn `sourceType:'module'` 语法校验通过。
- `TaskDetail.vue` 隔离 SFC 编译（script/template/style）通过。
- 前后端 `git diff --check` 通过。
- 关键符号 grep 确认：后端 `sendFileLifecycle` / `fileLifecycle` / `file-lifecycle`、前端 `applyFileLifecycle` / `fileStateOf` / `snapshot-file-state` 均已落盘。

## 边界（未重启服务）

- 未重启 13030，运行中服务仍是旧构建，`file-lifecycle` 事件尚未运行实测。
- 真实「模型生成 → 文件状态点变化」的浏览器端到端需在服务重启并触发真实任务后验证。
- 校验节点（code-structure-validator 的 L0-B）的文件级 BLOCK 归属暂未接入——当前 validating/passed/failed 由 engineer 的确定性修复（`validateAndFixGeneratedFiles`）驱动，后续可把 L0-B 的逐文件问题映射为 `failed` 状态点。

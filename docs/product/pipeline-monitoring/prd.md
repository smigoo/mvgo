# 生产管线监控系统 PRD

> 管理员专属的组件生成管线监控看板：谁、用什么模型（归属哪家供应商域名）、生成了什么组件、从截图还是 Figma、成功还是失败、花了多久、门禁拦了多少、谁主动退出或暂停。

| 项 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 状态 | 需求已冻结，待开工 |
| 日期 | 2026-09-15 |
| 生效范围 | **仅新任务**（老数据不回溯，见 §9） |
| 相关文档 | [../component-generation/](../component-generation/)、[../quality/](../quality/)、[../../architecture/系统架构文档.md](../../architecture/系统架构文档.md) |

---

## 1. 背景与问题

组件生成管线每天产出大量任务，但**目前没有任何地方能回答"这条管线健康吗"**。具体表现为三个断层：

1. **看不见人**：管理员无法知道谁在用、谁用的什么模型、谁产出了多少。
2. **看不见质**：门禁（L0-A / L0-B / 运行时质量门禁）的拦截情况只存在于自由文本日志里，靠人肉 grep。
3. **算不出率**：任务终态散落在内存 `Map` 与 146MB 的 JSON 文件里，没有可聚合的数据源。

已有资产被严重低估：`components` / `token_usages` / `operation_logs` / `user_ai_configs` 四个集合已在生产运行，`configSnapshot` 已记录了每个任务的模型与端点，门户已下发了完整组织层级。**本项目的本质是把已有事实源收口，而不是从零建设。**

---

## 2. 目标与非目标

### 2.1 目标

| # | 目标 | 衡量方式 |
|---|---|---|
| G1 | 管理员能在一个页面看清管线的成功/失败与分布 | 看板一屏覆盖成功率、失败率、模型×域名分布 |
| G2 | 能按 用户 / 部门 / 模型 / 归属域名 / 类型 / 来源 筛选并下钻 | 任一维度可筛，且能下钻到单任务 |
| G3 | 门禁拦截、重试、主动退出/暂停可量化 | 拦截率与退出数从"文本"变为"字段" |
| G4 | 不再依赖人肉查日志 | 所有指标来自宽表，不靠正则解析 |

### 2.2 非目标（Non-goals）

- ❌ **不做成本 / 金额统计**（`token_usages` 无价格字段，且当前无价目表）
- ❌ **不做"完成率"**，只看成功 / 失败
- ❌ **不展示"在跑任务"**，只统计终态（`completed` / `failed` / `cancelled`）
- ❌ **不引入 SSE / WebSocket**，看板用轮询
- ❌ **不回溯 / 不回填老任务**（详见 §9）
- ❌ **不做按时间的实时趋势告警**（P2 再做）

---

## 3. 用户与场景

| 角色 | 说明 |
|---|---|
| 管理员 | 唯一可见角色。由 `admin-role.util.ts#resolveAdminRole` 判定 |
| 普通用户 | **完全不可见**（前端路由拦截 + 后端 403 双层） |

### 3.1 用户故事

- 作为**管理员**，我希望打开监控页就能看到**最新终态任务**的成功/失败与模型分布，以便判断管线当下是否健康。
- 作为**管理员**，我希望按**用户 / 部门**筛选，以便知道哪个部门、哪个人在重度使用。
- 作为**管理员**，我希望看到每个任务的**模型归属根域名**，以便判断是不是某家供应商在拖后腿。
- 作为**管理员**，我希望区分**微码 / Vue3** 与**截图 / Figma** 来源，以便知道哪条生成通道更可靠。
- 作为**管理员**，我希望看到**门禁拦截率**与**主动退出/暂停数**，以便发现"生成到一半被放弃"的隐性成本。
- 作为**普通用户**，我不应该看到任何他人的使用数据。

### 3.2 关键场景

> 管理员发现最近 24h 失败率从 20% 涨到 45%，按「归属域名」分组后定位到 `51aizzz.cc`（gpt-5.5）失败占比异常 → 下钻到该供应商的任务列表 → 打开单任务详情看到门禁 `TEXT-TRUTH` 反复 BLOCK 后重试耗尽。

---

## 4. 指标字典（冻结版）

**生效范围**：仅统计 `generation_metrics` 宽表中的新任务记录；`excluded = true`（dev-local 等）默认不计入。

| 指标 | 定义 | 口径说明 |
|---|---|---|
| 任务数 | 宽表记录数 | 单位是**任务终态**，不是 HTTP 请求数（一次生成会打多次请求） |
| 成功数 | `status = completed` | |
| 失败数 | `status = failed` | |
| **失败率** | `failed / (completed + failed)` | **分母不含 cancelled**，避免用户自己撤单拉低指标 |
| 主动退出数 | `status = cancelled` 且 `cancelReason = user_cancel` | 需新埋点（§5.4） |
| 暂停次数 | `pause` 事件计数 | 只计数，不做状态列表 |
| 组件类型分布 | `target` = `microcode` / `vue3` | |
| 来源分布 | `sourceType` = `figma` / `screenshot` / `html` | |
| 模型分布 | `textModel` / `visionModel` | 取 `configSnapshot`（任务当时配置） |
| **归属根域名** | `rootDomain` | 由 `providerId` 映射，规则见 §5.5 |
| 任务耗时 | `duration` 的 P50 / P95 | 端到端，含排队 |
| 接口响应时间 | `operation_logs.durationMs` | **必须排除 `/api/tasks` `/api/progress` 轮询路径** |
| 门禁拦截率 | `blockCount > 0 的轮次 / 总校验轮次` | 按 `gates[]` 结构化字段计算 |

### 4.1 需要避开的三个口径陷阱

1. **请求数 ≠ 任务数**：实测 `POST /api/lite/generate` 被调用 600 次，而台账中 lite 任务仅 27 条（重试 + `reuseCache` 导致）。**必须按终态计数。**
2. **`qualityGate` 目前不可用**：实测只有 `warned`(159) 与未写(110)，**没有 pass/fail 二值**，因此质量指标改由 `gates[]` 承担。
3. **门禁存在人工改判**：`tasks.controller` 提供 `overrideStatus: 'passed' | 'warned'` + `reviewerName`，指标需区分**自动判定**与**人工改判**（`gates[].humanOverride`）。

---

## 5. 方案设计

### 5.1 架构

```
任务执行 → 终态收口 finalizeTask() → generation_metrics 宽表 → 管理看板（轮询）
                                          ↑
                        4 项埋点补齐（文本侧 token / gate / cancelReason / pause）
```

**为什么不用 SSE**：现有实时通道 `progress/progress.service.ts` 是**按 sessionId 注册**的（`register(sessionId, res, lastEventId)`），**没有全局广播总线**；且需求已明确只要终态，不看在跑任务。轮询的延迟（一次轮询间隔）完全可接受。

**顺带收益**：`backend-node/data/tasks.json` 已达 **146MB**，无索引不可查，宽表同时解决该问题。

### 5.2 数据模型：`generation_metrics`

新建 `backend-node/src/schemas/generation-metric.schema.ts`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `sessionId` | string | 唯一索引 |
| `userId` | string | 注意 BSON 双类型归一化（§10 风险 3） |
| `uid` | string? | 门户 uid（非用户名）；**排除清单按 uid 判定**，改名不会重新混入 |
| `username` | string | 任务时快照 |
| `deptName` / `orgName` | string | **任务时快照**（`portalInfo` 是登录快照，会变） |
| `target` | `microcode` \| `vue3` | |
| `sourceType` | `figma` \| `screenshot` \| `html` | 来自 `lite.controller.ts:299` 的推导结果 |
| `generationTier` | `max` \| `lite` | |
| `taskType` | string? | `component` / `page` / `api` / `workflow` |
| `status` | `completed` \| `failed` \| `cancelled` | |
| `cancelReason` | string? | `user_cancel` / `queue_evict` / `timeout` / `superseded` |
| `componentId` / `componentName` | string? | 列表展示用 |
| `startTime` / `endTime` | number(ms) | epoch ms |
| `duration` | number(ms) | |
| `error` | string? | |
| `qualityGate` | `passed` \| `warned`? | 注意目前只有 `warned`，见 §4.1 |
| `textModel` / `visionModel` | string? | `completionModels` 优先，回退 `configSnapshot` |
| `textRootDomain` / `visionRootDomain` | string? | 两侧端点各自的归属根域名（由 `configSnapshot` 的 baseURL 推导） |
| `rootDomains` | string[] | 两侧去重并集，供按域名分组统计（**替代原设计中的单值 `rootDomain`**） |
| `gates` | array | `[{ rule, level, pass, blockCount, warnCount, issueCount, retry, humanOverride }]`（P0-3 填充） |
| `excluded` | boolean | 测试账号等不计入统计，默认 `false` |
| `excludedReason` | string? | 排除原因（便于排查"为什么这条不计数"） |
| `createdAt` | Date | |

**索引**：`{ startTime: -1 }`、`{ userId: 1, startTime: -1 }`、`{ deptName: 1, startTime: -1 }`、`{ target: 1 }`、`{ sourceType: 1 }`、`{ rootDomains: 1 }`

**写入器**：`backend-node/src/tasks/pipeline-metrics.service.ts`（`PipelineMetricsService`）
- `recordTerminal(task, status, { cancelReason })` —— 唯一写入入口，由 `finalizeTask` 调用
- `recordRevert(sessionId)` —— 撤回人工审核时删除记录（宽表只承载终态）
- **fire-and-forget**：写入失败只记 warn，绝不影响任务主流程
- **upsert by sessionId**：人工审核改判后再次落终态不产生重复行
- 用户查询失败不阻断该行落库（只缺部门维度）

**排除清单**：env `PIPELINE_METRICS_EXCLUDE_UIDS`，逗号分隔，**默认 `dev-local`**（每次调用读 env，改配置免重启）。


### 5.3 接口契约

`GET /api/admin/pipeline/metrics`

| 参数 | 类型 | 说明 |
|---|---|---|
| `from` / `to` | ISO date | 默认最近 7 天 |
| `userId` | string | 可选 |
| `deptName` | string | 可选 |
| `target` | `microcode` \| `vue3` | 可选 |
| `sourceType` | `figma` \| `screenshot` \| `html` | 可选 |
| `model` | string | 可选 |
| `rootDomain` | string | 可选 |
| `tier` | `max` \| `lite` | 可选 |
| `page` / `pageSize` | number | 任务列表分页 |

响应：

```jsonc
{
  "success": true,
  "data": {
    "kpi": { "total": 0, "completed": 0, "failed": 0, "failureRate": 0, "cancelled": 0, "userCancel": 0 },
    "byTarget": { "microcode": 0, "vue3": 0 },
    "bySource": { "figma": 0, "screenshot": 0, "html": 0 },
    "byTier": { "max": 0, "lite": 0 },
    "byModelDomain": [{ "model": "", "rootDomain": "", "count": 0 }],
    "duration": { "p50": 0, "p95": 0 },
    "gates": { "rounds": 0, "blockedRounds": 0, "blockRate": 0 },
    "tasks": { "list": [], "total": 0, "page": 1 }
  }
}
```

**鉴权**：走 `admin.service#assertAdmin`。**不要复用 `admin-stats.controller.ts` 的 `x-admin-stats-key` 内部调用模式**（那是给 Java 用的服务间通道）。

### 5.4 埋点改造清单（落点已钉到文件:行）

| # | 改什么 | 落点 | 验收 |
|---|---|---|---|
| 1 | **终态收口** `finalizeTask()` | `backend-node/src/tasks/tasks.service.ts` 共 **10 处**：completed `541/707/783/1708/2914`，failed `323/369/1030/1757`，cancelled `1807` | `grep -nE "status = '(completed\|failed\|cancelled)'"` **只命中 `finalizeTask` 内部** |
| 2 | 文本侧 token + providerId | `ai-engine/roles/microcode/code-generator.js:1217` → 调 `token-usage/token-tracker.service.ts:113 recordUsage()` | `token_usages` 出现 `modelType:'text'` 记录 |
| 3 | gate 结构化 | `mc-component-graph-phase2.js:3260(L0-A)/3912(L0-B)`、`mc-component-graph-vue3.js:2116(L0-A)/2860(L0-B)` | 宽表 `gates[]` 有值 |
| 4 | cancel reason | `tasks.service.ts:1807` | `cancelled` 记录带 `cancelReason` |
| 5 | pause / resume 事件 | `tasks.service.ts:1855`、`tasks.controller.ts:522/531` | 暂停可计数 |

### 5.5 归属根域名的推导规则（重要）

`providerId` **已在运行时解析**（`mc-component-graph-phase2.js:706` `providerId: visionCfg.providerId`；文本侧请求日志可见 `"providerId":"__primary_text__"`），只是没落库。

| providerId 形态 | 域名来源 |
|---|---|
| `__primary__` / `__primary_text__`（主槽位**合成 id**，非真实供应商） | 取 `configSnapshot.textBaseURL` / `visionBaseURL` 的 host |
| 真实 id（如 `p1786894837102_67ff`、`m1787810940687_71ae`） | 查 `configSnapshot.providers[]` 中 `id → baseURL` |

> **不要**用"模型名 → 域名"反查：实测 10 个模型只有 5 个能命中，且 `providers[].models` 全为空数组、供应商条目名是中文别名（「阿里云-千问」）。用 `providerId` 是稳定内部 id，可靠得多。

### 5.6 权限设计

| 层 | 实现 |
|---|---|
| 前端路由 | `meta.adminOnly: true`（现成机制，见 `frontend/src/router/permission.js:80`，已有 `/management`、`/users` 两例） |
| 前端入口 | `AppHeader` 增加 admin tab（`adminOnly: true`） |
| 后端接口 | `assertAdmin`（`admin/admin.service.ts` + `admin/admin-role.util.ts#resolveAdminRole`） |

**双层都要验**，缺一不可。

### 5.7 数据安全（合规要求）

- `users.portalInfo` 含**明文门户 token**、`mobile`、`workcode` → 监控接口**禁止整包返回 `portalInfo`**，只挑选 `deptName` / `orgName` / `name`。
- 操作日志的 `body` 已有脱敏 + 2000 字节截断（`operation-log.interceptor.ts:17` `BODY_LIMIT`），但**截图请求体因超限被整包丢弃**，这也是本项目改走宽表的原因之一。
- 看板涉及个人使用数据，需在页面上标注数据用途（内部效能分析）。

---

## 6. 页面设计

### 6.1 一屏（`views/admin/PipelineMonitor.vue`）

```
┌ 筛选条：时间范围 | 用户 | 部门 | 模型 | 归属域名 | 类型 | 来源 | 模式 ┐
├ 4 张 KPI：成功数 | 失败数 | 失败率 | 主动退出数                      ┤
├ 图 1：模型 × 归属域名 分布      ├ 图 2：任务耗时 P50 / P95          ┤
├ 图 3：类型 × 来源 分布                                          ┤
└ 终态任务列表（用户 / 组件 / 类型 / 来源 / 模型 / 域名 / 状态 / 耗时）┘
```

### 6.2 下钻路径

```
部门 → 用户 → 任务列表 → 单任务详情
                          ├ 阶段瀑布（视觉分析 / 代码生成 / 门禁 / 落盘）
                          ├ 门禁结果明细（gates[]）
                          └ 模型调用明细（token_usages）
```

### 6.3 空态与边界

- 无数据时展示「所选范围内暂无任务」，不做假数据。
- 归属域名缺失（老数据 / 未登记）显示 `—`，不猜。
- `excluded = true`（测试账号）默认过滤，筛选器可显式打开。

---

## 7. 开发计划

### 7.1 阶段

| 阶段 | 内容 | 依赖 | 验收标准 |
|---|---|---|---|
| **P0-1 终态收口** | 抽 `finalizeTask()`，收敛 10 处终态赋值 | 无（前置） | grep 门禁：终态赋值只允许出现在 `finalizeTask` 内 |
| **P0-2 指标宽表** | 新建 schema + `finalizeTask` 内 upsert + 排除 dev-local + 孤儿补偿 | P0-1 | 新任务完成后宽表有记录且字段齐全 |
| **P0-3 四项埋点** | §5.4 的 2~5 项 | P0-1 | `token_usages` 出现 text 记录；宽表 `gates[]` 有值 |
| **P0-4 管理接口** | `GET /api/admin/pipeline/metrics` + 修 `creatorId` 双类型 + 修「使用统计」全 0 | P0-2, P0-3 | 接口返回正确聚合；非管理员 403 |
| **P0-5 前端看板** | 新建页面 + adminOnly 路由 + 头部入口 | P0-4 | 非管理员前端被拦截；一屏数据正确 |
| **P1 下钻明细** | 单任务详情（阶段瀑布 / 门禁明细 / 模型调用明细） | P0-5 | 可从列表下钻到单任务 |
| **P2 告警** | 失败率突增、供应商成功率跌破阈值 | P1 | 触发时通知管理员 |

### 7.2 关键路径

```
P0-1 ──┬─→ P0-2 ──→ P0-4 ──→ P0-5 ──→ P1 ──→ P2
       └─→ P0-3 ──┘
```

**P0-1 是唯一强制前置**，其余全部依赖它。

### 7.3 顺手要修的既有缺陷

| 缺陷 | 位置 | 影响 |
|---|---|---|
| 「使用统计」四宫格全 0 | 生产 Node 未部署含 admin-stats 路由的 dist + `ADMIN_STATS_KEY` 未配置 | 管理员看到假 0 |
| `creatorId` BSON 双类型 | `components` 集合；同一用户被拆成 138 + 7 两组 | 下钻聚合会把人算重 |
| 轮询污染 | `/api/tasks` 24.3 万 + `recent` 2.4 万 + `summary` 2.4 万 ≈ **29 万条（占 60%）** | 响应时间指标失真；`OPERATION_LOG_SKIP_PATHS` 建议加 `/api/tasks,/api/progress` |

---

## 8. 验收清单

- [ ] `grep` 门禁通过：终态赋值只在 `finalizeTask` 内
- [ ] 宽表字段 100% 齐全（新任务）
- [ ] dev-local 不出现在默认统计内
- [ ] `token_usages` 出现 `modelType: 'text'` 记录
- [ ] 宽表 `gates[]` 有结构化数据，且能区分人工改判
- [ ] `cancelled` 记录带 `cancelReason`
- [ ] 非管理员访问接口返回 403，访问路由被拦截
- [ ] 大屏所有数字可追溯到宽表记录（无魔数）
- [ ] 老数据未被改动

---

## 9. 老数据决策（已拍板）

**老任务不做任何回溯。** 明确不做的事项：

| 项 | 数量 | 决策 |
|---|---|---|
| 无 `userId` 的历史任务 | 57 条 | 不修 |
| `example.com` 占位端点的任务 | 7 条 | 不修 |
| 归属域名的历史回填 | — | 不做 |
| `components.metadata.sourceType` 仅 13% 覆盖 | 19/149 | 不补，靠新任务自然补齐 |

报表口径明确为「**仅新任务**」，界面上需标注数据起始时间。

---

## 10. 风险与对策

| # | 风险 | 影响 | 对策 |
|---|---|---|---|
| 1 | 终态收口**漏点** | 静默漏数，且难以发现 | P0-1 的 grep 硬门禁作为 CI/自检项 |
| 2 | 宽表写入失败 | 少记录 | fire-and-forget + 与 JSON 台账双写；**以宽表为准，JSON 仅追溯** |
| 3 | `creatorId` BSON 双类型 | 同一用户被拆成两组 | 聚合前归一化类型 |
| 4 | `providerId` 是合成 id | 域名取错 | §5.5 的映射规则；未命中时显示 `—`，不猜 |
| 5 | 只看终态导致**告警滞后** | 长任务卡住时发现晚 | 已知代价，可接受；P2 若需提前发现再补 running 上报 |
| 6 | 服务重启导致任务**永远到不了终态** | 宽表漏记 | 启动时扫描孤儿任务补终态（复用 `/api/tasks/cleanup-orphans`） |

---

## 附录 A：现状实测数据（2026-09-15）

### A.1 任务台账 `backend-node/data/tasks.json`

- 146 MB / **269 条**（数组）
- `status`：completed **160** / failed **104** / cancelled **5**
- `target`：microcode **233** / vue3 **36**
- `sourceType`：figma **218** / screenshot **22** / html **1** / 空 28
- `generationTier`：max **214** / lite **27**
- 有 `userId` **212/269**；有 `configSnapshot` **209/269**
- `qualityGate`：warned 159 / 未写 110（**无 pass/fail**）
- `progress[]` 事件 39122 条；门禁相关文本：`门禁` 1557 / `gate` 2545 / `BLOCK` 271 / `L0-B` 587 / `CODE-0` 458 / `重试` 327

### A.2 MongoDB 集合

| 集合 | 条数 | 说明 |
|---|---|---|
| `token_usages` | **588**（508 sessionId） | **仅 `vision-agent` + `visual-comparator`，全 vision** |
| `operation_logs` | **485507** | 含轮询污染（见 §7.3） |
| `components` | 149 | target：microcode 126 / vue3 18 / null 5；顶层**无** `sourceType` |
| `users` | 9 | 仅 `zhjie` 有 `deptName` |
| `groups` | 4 | |
| `user_ai_configs` | 1 | 仅 `dev-local` 配置过 |

### A.3 实际使用过的模型（`token_usages` 实测）

`qwen3.7-plus` 253 / `claude-opus-4-8` 211 / `claude-sonnet-5` 65 / `glm-5V-Turbo` 22 / `gpt-5.5` 11 / `deepseek-v4-flash-vision-exp` 5 / `minimax-m3` 3 / `gpt-5.4` 3 / `hy4-preview` 2 / `kimi-k2.7-code` 1

单次平均耗时 24s ~ 232s（`qwen3.7-plus` 约 101s，`hy4-preview` 约 232s）。

### A.4 门禁可解析性实测

`L0-B 校验结果: pass=..., BLOCK=..., Issues=...` 可从日志解析：160/269 任务有结论、174 轮校验、pass=true 101 / false 73 → **单轮拦截率 42.0%**，BLOCK 计数合计 208。

> 该结论证明了门禁指标**当前可算**，但依赖正则解析日志。P0-3 的目标就是把它变成字段。

### A.5 部门信息来源（生产）

```
用户带 token 进入 → auth.service.ts#validatePortalToken
  → GET {PORTAL_BASE_URL}/getTokenUser?token=xxx
    （生产 PORTAL_BASE_URL = https://go.microvideo.cn/portlet/api）
  → 门户返回 { code:200, data:{...} }
  → users.findOneAndUpdate({...}, { $set: { uid, portalInfo: data } })
  → portalInfo = 门户响应的整个 data 对象
```

门户实际下发 **29 个字段**，含完整组织层级：`orgName`(公司) / `oneGroupName`(一级组) / `groupName` + `groupLevel`(组) / `deptName`(部门) / **`departmentPath`(部门全路径)**。

⚠️ 现状**只用了 `deptName` + `orgName` 两个**。若未来需要多级部门下钻，`departmentPath` / `groupLevel` 可直接使用，属于"读已有字段"，成本极低。

⚠️ `portalInfo` 是**登录时快照**（整包覆盖），用户换部门需下次登录才更新 → 因此宽表必须存**任务时的部门快照**。

---

## 附录 B：变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-15 | 首版。需求冻结：成本不做、完成率不做、只看终态、不用 SSE、老数据不回溯、新增归属根域名 |
| v1.1 | 2026-09-15 | **实施回填**。P0-1 终态收口完成（`tasks.service.ts` 11 处收敛为 `finalizeTask`/`unfinalizeTask`，新增 `npm run verify:terminal-writes` 门禁）；P0-2 宽表完成（`generation-metric.schema.ts` + `PipelineMetricsService`）。数据模型三处调整：① 单值 `rootDomain` 拆为 `textRootDomain`/`visionRootDomain` + 并集 `rootDomains`；② 新增 `uid`/`componentId`/`componentName`/`taskType`/`qualityGate`/`excludedReason`；③ 排除清单落为 env `PIPELINE_METRICS_EXCLUDE_UIDS`（默认 `dev-local`）。**孤儿补偿**改为由既有 `recoverZombieTasks` 经由 `finalizeTask` 自然覆盖，不做历史回填。 |

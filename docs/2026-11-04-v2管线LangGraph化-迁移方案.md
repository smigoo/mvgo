# v2 管线 LangGraph 化 —— 可行性、映射与迁移准备

> 日期：2026-11-04
> 对象：`backend-node/src/ai-engine-v2/pipeline/`（configurable-pipeline.js 588 + node-registry.js 635 + tier-profile.js 306 = **1529 行**）
> 目标：回答「用 LangGraph 配置出现在的 v2 管线，需要准备什么」

---

## 0. 结论先行

| 问题 | 答案 |
|---|---|
| 能不能用 LangGraph 实现同样的 v2？ | **能。** v2 的拓扑（线性链 + 并行组 + 条件回环）是 LangGraph 的教科书画法 |
| 改完之后 v2 会变小吗？ | **不会，会变大。** 只有 **约 150–200 行控制流**被替掉；1529 行里有 **1300+ 行跟编排无关**，一行都省不掉；还要**新增 state schema 声明 80–120 行** |
| 收益是什么？ | 三样 v2 现在真没有的东西：**图级 checkpointer（断点续跑）**、**`interrupt()`（human-in-the-loop）**、**时间旅行 / 单步回放** |
| 该不该做？ | 🔴 **只有当你要「时间旅行 / 单步回放」或「统一到 LangGraph 生态（LangSmith、与 Playground 一套）」时才做。** 若只想要「断点续跑 + 人在环」，自补约 120 行即可，见 §7 |

**判定式**：把「我要的那三样」列出来 —— 全部能用「存 cursor + state」换到 → **不迁，自补**；有任意一样必须靠图快照语义 → **迁**。

---

## 1. v2 现有 1529 行都在干什么

| 文件 | 行数 | 职责 | 跟「编排」有关吗 |
|---|---|---|---|
| `tier-profile.js` | 306 | 档位声明（nodes / edges / parallelGroups / conditionalNodes / nodeModes / maxRevisions）+ `validateProfile()` 拓扑校验 + `willCallLlm()` | 🟡 一半（声明是数据，校验是自己加的） |
| `configurable-pipeline.js` | 588 | `buildExecutionPlan()` 线性化 + 主循环 + `_runNode` 三向翻译 + `_syncIfDirty` 磁盘回读 + 4 个 `BUILTIN_NODES` + `prepare()` 预演 | 🟡 约 200 行（主循环 + 线性化 + 并行调度 + 条件跳转） |
| `node-registry.js` | 635 | `NODE_META` 插件清单（load/kind/specParams/execParams/resultPatch/skip/onError/invoke/touchesDisk）+ `NODE_OVERRIDES` 二维键 + `instantiateNode` + `dryRunNodes` | 🔴 **完全无关** |

**关键事实：v2 的价值 90% 在 `node-registry.js` 与 `model-resolver.js`，不在控制流。**

---

## 2. 概念映射表

| v2 概念 | LangGraph 1.x 对应 | 结论 |
|---|---|---|
| `nodes[]` | `StateGraph.addNode(id, fn)` | ✅ 直接对应 |
| `edges[]` | `addEdge(from, to)` | ✅ 直接对应 |
| `entry` | `addEdge(START, entry)` | ✅ 直接对应 |
| `conditionalNodes` + `_decision` | `addConditionalEdges(node, router, { revise: ..., pass: ... })` | ✅ **原生更强**，比手工 cursor 重定位清晰 |
| `maxRevisions` 回环 | 边回指形成环 + `recursionLimit` | 🟡 可平移，但语义要从「显式计数器」改成「状态计数 + 条件边」 |
| `maxSteps` 护栏（`:194`） | `compile({ ... }).invoke(..., { recursionLimit })` | 🟡 必须显式调高（默认 25 不够：max 档 13 节点 × (1+3) 轮 ≈ 40+ 步） |
| `parallelGroups` + `Promise.all`（`:203-219`） | **fan-out / join**：上游出多条边到组内各节点，组内各节点都出边到汇合点 | 🔴 **语义要改写**，见 §3 |
| `_nodeTrace` 手工增量合并（`:209-216`） | `Annotation({ reducer: (a,b) => [...a, ...b] })` | ✅ **可整段删除**，reducer 原生解决「并行分支互相覆盖」 |
| `state` 单一可变大对象（`:171-188`，约 30 字段） | `Annotation.Root({...})` 逐字段声明 + 选 reducer | 🔴 **最大改造量**，见 §3 |
| `_syncIfDirty()` 磁盘回读（`:275`） | 🔴 无对应 | **必须自己搬**（改成专用节点或在 wrapper 内做） |
| `_runNode` 的 `skip` 前置判据（`:311`） | 靠 conditional edge 或节点内早返回 | 🔴 需改写 |
| `_runNode` 的 `onError` 降级 + 留痕（`:355-371`） | `retryPolicy` 是**重试**语义，不是**降级**语义 | 🔴 **不能替代**，必须自己搬 |
| `prepare()` / `preview()` 预演（`:108`） | 🔴 无对应 | **必须自己搬**（配置页要显示「跑哪些节点 / 几次 LLM / 凭证齐否」） |
| `dryRunNodes()`（node-registry `:590`） | 🔴 无对应 | **必须自己搬**（不加载实现、不调 LLM） |
| `validateProfile()` 拓扑校验（`:204`） | 🔴 无对应（LangGraph `compile()` 只做浅校验） | **必须自己搬** |
| 断点续跑 | ✅ `checkpointer`（MemorySaver / SqliteSaver / PostgresSaver） | **净收益** |
| 人在环 / 暂停 | ✅ `interrupt()` + `Command(resume=...)` | **净收益** |
| 单步回放 / 时间旅行 | ✅ `getStateHistory()` | **净收益** |
| 追踪可视化 | ✅ LangSmith（或自建 hook） | 净收益（但要接外部服务） |

---

## 3. 两个真正的难点

### 3.1 state schema：从「一个对象」到「30 个字段 × reducer」

现在（`configurable-pipeline.js:171-188`）：

```js
let state = { ...input, spec, tier, sourceType, workspaceDir, outputPath,
  sessionId, groupId, onProgress, _revisionCount: 0, _nodeTrace: [] }
```

之后靠 `state = { ...state, ...patch }` 全量覆盖推进。

LangGraph 要求：

```js
import { Annotation } from '@langchain/langgraph'

const overwrite = { reducer: (_a, b) => b }
const append = { reducer: (a, b) => [...(a || []), ...(b || [])] }

export const PipelineState = Annotation.Root({
  // ---- 输入 ----
  sourceType:      Annotation({ ...overwrite, default: () => 'screenshot' }),
  imagePath:       Annotation({ ...overwrite, default: () => null }),
  figmaData:       Annotation({ ...overwrite, default: () => null }),
  componentName:   Annotation({ ...overwrite, default: () => null }),
  workspaceDir:    Annotation({ ...overwrite, default: () => null }),
  outputPath:      Annotation({ ...overwrite, default: () => null }),
  sessionId:       Annotation({ ...overwrite, default: () => 'v2-session' }),

  // ---- 中间产物（overwrite）----
  layoutStructure: Annotation({ ...overwrite, default: () => null }),
  visualElements:  Annotation({ ...overwrite, default: () => null }),
  styleMappings:   Annotation({ ...overwrite, default: () => null }),
  reviewResult:    Annotation({ ...overwrite, default: () => null }),
  checkResult:     Annotation({ ...overwrite, default: () => null }),

  // ---- 需要 merge 的（关键）----
  code: Annotation({
    reducer: (a, b) => ({ ...(a || {}), ...(b || {}) }),   // 合并，不是覆盖
    default: () => ({})
  }),

  // ---- 判定 ----
  qualityScore:    Annotation({ ...overwrite, default: () => null }),
  visualComparison:Annotation({ ...overwrite, default: () => null }),
  _mergedScore:    Annotation({ ...overwrite, default: () => null }),
  _decision:       Annotation({ ...overwrite, default: () => null }),
  _decisionReason: Annotation({ ...overwrite, default: () => null }),
  _reviseTarget:   Annotation({ ...overwrite, default: () => 'full' }),
  _revisionCount:  Annotation({ ...overwrite, default: () => 0 }),

  // ---- append 语义：正是 v2 手工合并要解决的问题 ----
  _nodeTrace: Annotation({ ...append, default: () => [] }),
  warnings:   Annotation({
    reducer: (a, b) => [...new Set([...(a || []), ...(b || [])])],   // append + 去重
    default: () => []
  })
})
```

**注意两处必须避开**：`onProgress`（函数）与 `spec` / `tierProfile`（大型只读对象）**不能进 state**，要走 closure 或 config 注入 —— 否则 checkpointer 序列化会炸。

### 3.2 并行：从「显式组」到「fan-out / join」

现在 `parallelGroups: [['layout-reviewer', 'style-mapper']]` 是引擎显式识别的组，`Promise.all` 并发后手工合并 trace。

LangGraph 的做法是**不声明组**，靠边形态自然并发：

```
visual-parser ──┬──> layout-reviewer ──┬──> code-engineer
                └──> style-mapper    ──┘
```

`code-engineer` 有两个入边 → LangGraph 等两条都完成后才执行它 = **自动 join**。

**改造方式（复用 v2 已有思路）**：把 `buildExecutionPlan()`（`:35`）改造成 `buildStages()`，先按现在的线性化逻辑切出「阶段」（并行组 = 一个多节点阶段），再按阶段两两连边。**这段逻辑不用重写，只需换输出格式。**

### 3.3 join 之后 `_syncIfDirty` 放哪

现在 `_syncIfDirty` 在每组节点执行后调用（`:217` / `:224`）。LangGraph 里没有「组」这个钩子，只有节点。

三个选项：
- **A（推荐）**：在每个 `touchesDisk` 节点自己的 wrapper 尾部做回读
- **B**：插一个专用的 `disk-sync` 节点在 join 点
- **C**：若 join 点恰好是 `code-structure-validator`，直接塞进那个节点

选 A 最省事，且语义更准（谁改盘谁负责同步）。

---

## 4. 迁移后的骨架（示意）

```js
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { instantiateNode, NODE_META, dryRunNodes, validateNodeCoverage } from './node-registry.js'
import { buildStages } from './stage-builder.js'   // 由 buildExecutionPlan 改造

function makeNode(nodeId, ctx) {
  const meta = NODE_META[nodeId]
  return async (state) => {
    // 1) skip 前置判据（原 :311）
    const skipReason = meta?.skip?.(state, ctx)
    if (skipReason) {
      return { ...(meta.skipPatch?.(state) || {}),
               _nodeTrace: [{ nodeId, durationMs: 0, ok: true, skipped: skipReason }] }
    }
    // 2) builtin / instantiate + 三向翻译（原 :323-345）
    try {
      const patch = /* ... 原 _runNode 主体 ... */
      return { ...patch, _nodeTrace: [{ nodeId, durationMs, ok: true }] }
    } catch (error) {
      // 3) onError 降级 + 留痕（原 :355-371）
      if (meta?.onError) {
        return { ...(meta.onError(error, state) || {}),
                 warnings: [`${nodeId} 失败（已降级继续）：${error.message}`],
                 _nodeTrace: [{ nodeId, durationMs, ok: false, tolerated: true, error: error.message }] }
      }
      throw error
    }
  }
}

export function buildStateGraph(profile, ctx, { checkpointer } = {}) {
  const g = new StateGraph(PipelineState)
  for (const nodeId of profile.nodes) g.addNode(nodeId, makeNode(nodeId, ctx))
  g.addEdge(START, profile.entry)

  const stages = buildStages(profile)          // [{ nodes: [...] }, ...]
  for (let i = 0; i < stages.length - 1; i++) {
    for (const from of stages[i].nodes) {
      if (profile.conditionalNodes?.[from]) continue     // 条件节点出边另算
      for (const to of stages[i + 1].nodes) g.addEdge(from, to)
    }
  }
  // 普通阶段的最后一跳走 END 时用 addEdge(..., END)
  for (const [node, cfg] of Object.entries(profile.conditionalNodes || {})) {
    g.addConditionalEdges(
      node,
      s => (s._decision === 'revise' ? 'revise' : 'pass'),
      { revise: cfg.loopBackTo, pass: cfg.forwardTo }
    )
  }
  return g.compile({ checkpointer })
}
```

> ⚠️ `pass: cfg.forwardTo` 是 `emit`，而 `emit` 之后要接 `END`。**fowardTo 是 `END` 以外的节点时，标准做法是把 `emit` 设为终点并 `addEdge('emit', END)`。**

---

## 5. 准备清单

### 5.1 代码侧（迁之前必须先做完）

| # | 事项 | 说明 |
|---|---|---|
| 1 | **列全 state 字段** | 从 `execute()` 的 `let state = {...}`（`:171`）+ 每个 `resultPatch` 的返回值反推，约 30 个字段。逐个定 reducer |
| 2 | **定 reducer 归属** | `code` → merge；`_nodeTrace` / `warnings` → append；其余 → overwrite |
| 3 | **移出不可序列化项** | `onProgress`（函数）、`spec` / `tierProfile`（大对象）不能进 state，走 closure |
| 4 | `buildExecutionPlan` → `buildStages` | 逻辑不变，输出从「线性步骤」改成「阶段数组」 |
| 5 | **写 `makeNode` wrapper** | 收拢 skip / 三向翻译 / onError 三件事（现在散在 `_runNode` 里） |
| 6 | **`_syncIfDirty` 挪进 wrapper** | 按 §3.3 方案 A |
| 7 | **保留 `prepare()` / `dryRunNodes()` / `validateProfile()`** | 这三块 LangGraph 都没有，原样留着，跟图并列 |
| 8 | **删掉手工 trace 合并** | `:209-216` 整段（改由 reducer 承担） |

### 5.2 依赖与运行时

| # | 事项 | 说明 |
|---|---|---|
| 1 | `@langchain/langgraph ^1.4.7` | ✅ 已在 `package.json:48`，**无需新增依赖** |
| 2 | 🔴 **v2 将不再是「纯 JS」** | 现在 v2 目录零 langchain 依赖，dist 可直接跑；接入后带上 langchain 依赖链，需确认 dist 打包与 `env -i` 启动均正常 |
| 3 | **`recursionLimit` 显式设值** | 对齐 `maxSteps = plan.length + maxRevisions × plan.length`（`:194`）。默认 25 会提前炸 |
| 4 | **checkpointer 选型** | 若要跨进程续跑须用持久化版（Sqlite/Postgres）；`MemorySaver` 重启即丢 |
| 5 | **确认 `@langchain/langgraph` 在 dist 下可 import** | 与 `playground-agent-graph.js:13` 同一条依赖路径，可参照验证 |

### 5.3 验证侧（没有这个不许上线）

| # | 判据 | 做法 |
|---|---|---|
| 1 | **双跑等价** | 同一输入，v2 旧引擎与 LangGraph 版产出相同 `trace`（节点顺序 + skip 原因 + 降级标记）与相同 `quality` 三元组 |
| 2 | **并行合并正确** | 并行组之后 `_nodeTrace` 完整、无丢失（这是 v2 曾经踩过的坑） |
| 3 | **fail-open 对等** | `skip` 跳过 / `onError` 降级 / `visualUntrusted` 剔除 —— 三项逐一比对 |
| 4 | **回环计数一致** | `maxRevisions` 耗尽后的 `_decision` 行为必须与旧版逐字一致（含那个已知缺陷，除非同时修） |
| 5 | **credential 硬门禁仍在** | `:165-168` 凭证缺失即 throw，不能因换内核而丢失 |

---

## 6. 明确「不该迁」的部分

这四块跟编排内核无关，**迁与不迁都要保留原样**：

| 模块 | 为什么不能动 |
|---|---|
| `tier-profile.js` 的 `TIER_PROFILES` + `validateProfile()` | 声明式配置 + 解析期校验是 v2 的核心能力，LangGraph 没有对应物 |
| `node-registry.js` 的 `NODE_META` 三向翻译 | 旧 role 具名入参各不相同，直传 state 会字段全 undefined → 静默降级。这套翻译是**必要的基础设施** |
| `node-registry.js` 的 `NODE_OVERRIDES` 二维键 | 按「节点 × 规范」覆盖，是多规范并存的骨架 |
| `model-resolver.js` + `input-adapters/` | 节点级模型路由 + 凭证审计 + 来源归一，均与编排无关 |

---

## 7. 更省的替代方案：不换内核，自补两样

若你真正想要的只是 **断点续跑 + human-in-the-loop**，v2 的结构（线性 `plan` + 整数 `cursor`）天然支持：

### 7.1 断点续跑（约 70 行）

```js
// 每步成功后落盘
await this._persistCheckpoint({
  sessionId: state.sessionId,
  planHash: hashPlan(plan),          // plan 变了就丢弃旧 checkpoint
  cursor,                            // 下一个要执行的步骤下标
  state: serializeState(state)       // 剔除 onProgress / spec / tierProfile
})

// 启动时尝试续跑
const cp = await this._loadCheckpoint(state.sessionId)
if (cp && cp.planHash === hashPlan(plan)) {
  cursor = cp.cursor
  state = { ...state, ...cp.state }
  this._report('pipeline', `从第 ${cursor} 步续跑`, 'running')
}
```

### 7.2 human-in-the-loop（约 50 行）

```js
// 主循环内，执行步骤前
if (this._gates.has(step.node || step.nodes[0])) {
  await this._waitForApproval(state.sessionId, step)   // 由 REST 端点 resolve
}
```

合计 **约 120 行**，无新依赖，不引入双内核，且**不动任何现有行为**。

| | 迁 LangGraph | 自补 120 行 |
|---|---|---|
| 断点续跑 | ✅ | ✅ |
| human-in-the-loop | ✅ | ✅ |
| 单步回放 / 时间旅行 / 编辑某步 state 重跑 | ✅ | 🔴 要重新设计快照粒度 |
| LangSmith 式可视化 | ✅ | 🔴 |
| 与 Playground 统一内核 | ✅ | 🔴 |
| 改动量 | 400–600 行 + 长期双内核 | ~120 行 |
| 风险 | 行为对等需全量双跑验证 | 低，纯增量 |

---

## 8. 已知风险与坑

| 风险 | 说明 |
|---|---|
| 🔴 **`_decision:'pass'` 缺陷会被一并继承** | `configurable-pipeline.js:548-555` 修订上限耗尽时判 `pass`，与「真达标」无法区分。迁移时若照搬，等于把缺陷搬进新内核；应同步改为 `completed_degraded` |
| 🔴 **双内核长期并存** | 迁完 LangGraph 版若旧引擎不删（回滚需要），则项目同时存在「旧自研 graph.js」「v2 手写」「v2-LangGraph」三套编排，重复维护成本再 +1 |
| 🟡 **state 泄漏进 checkpointer** | 任何函数 / 大对象字段（`onProgress`、`spec`、`figmaData`）未剔除都会导致序列化失败或 checkpoint 体积爆炸 |
| 🟡 **`recursionLimit` 默认 25** | max 档回环 3 轮即可超限，必须显式设 |
| 🟡 **并行 join 语义差异** | v2 的 `parallelGroups` 是「显式组」，LangGraph 是「多入边汇聚」。若组内某节点被 `skip`，LangGraph 仍会等它返回 —— 需确认不会死等 |

---

## 9. 一句话总结

**LangGraph 能替你写 v2 的 200 行控制流，替不掉另外 1300 行；换来的是 checkpointer 与 interrupt 这两样 v2 真缺的能力 —— 而这两样，用 120 行自补也能拿到。**

要不要迁，取决于你是否需要「时间旅行」和「统一到 LangGraph 生态」；**只想要断点续跑与人在环，自补更划算，且不动现有行为。**

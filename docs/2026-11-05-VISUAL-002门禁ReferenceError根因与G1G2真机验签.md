# VISUAL-002 门禁 ReferenceError 根因 + G1/G2 真机验签（2026-11-05）

> **触发**：用户授权 `a`（投一次 max 任务，验 G1/G2 真机计数行）。
> **任务**：`mc-1793861285711-6702353c`（`fileKey=1t7Dmmpsl5i0PC8BJt2QLf`、`nodeId=2:7952`、`target=microcode`），`completed`。
> **结论**：G1 完全兑现（分档守恒，`imgSrcNoMountTarget=100%`）；G2 **立刻暴露一个 P0 级缺陷**——`visualFidelityDerivative` 恒 0 不是「未做比对」，而是比对做成后**抛 ReferenceError 被 catch 吞掉**，即 **VISUAL-002 像素保真门禁长期从未生效**。

---

## 0. 一页结论

| 项 | 旧口径（本文推翻） | 真机事实（本文确证） |
|---|---|---|
| V15 恒 0 原因 | 「像素比对分支**未进入**」`总纲:144` / `归因 D7` | **分支进入了，比对也做完了**（`compared=1`），死在写 `derivative` 前一行 |
| 事故形态 | 输入链路缺失（待查 `previewImage`） | **代码级 ReferenceError**：`previewState is not defined` |
| 影响 | 观测零覆盖（不影响产物） | 🔴 **VISUAL-002 门禁从未产出过任何 verdict**；像素保真检查从上线起就是死的 |
| G2 的价值 | A 档只加观测 | **一轮真机即定性根因**，直接完成 D7 从「待查」到「已定性」 |

---

## 1. G1 真机验签（全部通过）

任务 `mc-1793861285711-6702353c` 的完整 REJECT-SUMMARY 行（节选关键段）：

```text
styleTruth:evaluated=8,scaleMode=0,geometry=3,noBg=5,unknown=0
resConserve:expected=8,excluded=0,mountable=8,declared=8,imported=3,unmounted=5,
             noVarName=0,notImported=5,orphan=2,filesUnavailable=0
resConserveReasons:noVarName=0,reused=0,subState=0,noTarget=0,
                   imgSrcNoMountTarget=5,other=0,filesUnavailable=0
flexTruth:evaluated=5,flexFallback=0,truthed=0,mixedGrow=2,filesUnavailable=0
```

| 校验项 | 期望 | 实测 | 结果 |
|---|---|---|---|
| 计数行出现 | 每单一次 | 1 次 | ✅ |
| 分档和 ≡ `unmounted` | `0+0+0+0+5+0 = 5` | `unmounted=5` | ✅ 守恒 |
| 与离线结论一致 | `imgSrcNoMountTarget` 主导 | `5/5 = 100%` | ✅ 一致（离线 20/25=80%，此单更高） |
| `filesUnavailable` | 0 才可下结论 | 0 | ✅ 可下结论 |

**这条真机数据把 D1 钉得更死**：`imported=3` / `unmounted=5` / `notImported=5` —— 5 个资源**全部是 `imgSrc` 类且从无 `mountTarget`**，与离线 6 任务结论完全同型。D1 治本方向 = 挂载计划覆盖 `imgSrc`，无需再讨论。

---

## 2. G2 真机验签（暴露 P0）

### 2.1 同一毫秒的两行日志

```text
[2026-11-05T06:49:07.926Z] [WARN] [screenshot-renderer] 渲染比对门禁执行失败，跳过 {"error":"previewState is not defined"}
[2026-11-05T06:49:07.926Z] [INFO] [screenshot-renderer] visualFidelityDerivative:evaluated=0,derivative=0,independent=0
[2026-11-05T06:49:07.926Z] [INFO] [screenshot-renderer] visualFidelityInput:preview=1,exists=1,blank=0,compared=1,earlyReturn=0
```

三行同毫秒、同一次 `finalizePreviewResult` 调用。

### 2.2 逻辑闭环

| 事实 | 来源 | 推论 |
|---|---|---|
| `preview=1, exists=1, blank=0` | G2 计数行 | 三条前置条件**全部成立** |
| `compared=1` | G2 计数行（在 `:1274` 置位） | **`compareRenderedVsDesign` 已成功返回**，比对结果已拿到 |
| `visualFidelityDerivative.evaluated=0` | V15 计数行（在 `:1311` 打印） | `:1283` 的赋值**没有执行** |
| `previewState is not defined` | catch warn（`:1306`） | `:1277` 抛 ReferenceError，被 `:1305` catch 吞掉 |

⇒ **`:1274` 执行了、`:1283` 没执行，中间只有 `:1276-1282`**，炸点唯一：`:1277` `previewState.status !== 'ready'`。

### 2.3 作用域取证（为什么必然炸）

| 符号 | 定义位置 | 所属函数 | `finalizePreviewResult`（`:1229`）能否访问 |
|---|---|---|---|
| `issues` | `:613` `const issues = []` | `renderViaPreviewPage`（`:597` 起） | ❌ 否 |
| `previewState` | `:760` `const previewState = await page.evaluate(...)` | `renderViaPreviewPage`（`:597` 起） | ❌ 否 |
| `finalizePreviewResult` | `:1229` | **`renderScreenshot`（`:1146` 起）** | —— |

`:1277` 引用 `previewState`、`:1278` 引用 `issues` —— **两个符号都不在闭包链上**，ReferenceError 是必然而非偶发。

`:1277` 先炸，所以 `:1278` 的 `issues.some(...)` 甚至没机会执行 —— 即使只修 `:1277`，`:1278` 会立刻接着炸第二枪。

### 2.4 失效时长

| 证据 | 值 |
|---|---|
| `previewState.status !== 'ready'` 引入 | commit `8cc3b11`，**2026-08-02 21:47** |
| 比对块 + catch warn 引入 | commit `555b5b7`（`09-16` auto-sync，真实更早） |
| `server.log` 中该 warn 次数 | **7 次，全部 ≥ 2026-11-05T05:09Z** |

结论：该引用错配**至少自 08-02 起存在**。`server.log` 只有今天的 7 次，是因为**此前任务的 `previewImage` 从未传进来**（`:1268` 条件不成立，压根没进比对块）——这正好解释了为什么长期「V15 恒 0」却没人发现炸点：**门禁的死因被「输入缺失」这层表象掩盖了**。

⚠️ 修正一个可能的误读：「今天才坏」不成立。今天是**第一次有人真的把 `previewImage` 传进比对分支**，于是三个月前埋的引用错配第一次被执行到。

### 2.5 真实危害（比「恒 0」严重得多）

```js
// :1283-1304 全部在 try 内、全部在 :1277 之后
visualFidelityDerivative = { evaluated: 1, ... }        // 从未执行
if (fidelity.verdict === BLOCK) { push VISUAL-002 }     // 从未执行
else if (fidelity.verdict === WARN) { push VISUAL-002 } // 从未执行
```

即：
1. **VISUAL-002 从未被 push 进 `runtimeGate.issues`** ⇒ 像素保真门禁**从未拦截过任何一个视觉劣化产物**。
2. `result.visualFidelity = fidelity`（`:1275`）在炸点之前，所以**比对分数算出来了但被丢弃**，也没人消费。
3. 这与「`generate` 模式无视觉迭代回路」是两个独立缺陷叠加：C3 说的是**有分数但不回流**，本条说的是**连分数都没产生**。前者是策略，后者是 bug。

---

## 3. 修复方案（改前查重 + 治本出口）

### 3.1 查重：这行该用什么替代

不新增判据，**续接既有事实源**：

| 旧写法 | 可用替代 | 等价性 |
|---|---|---|
| `previewState.status !== 'ready'` | `result.runtimeGate.issues` 中 `id === 'RUNTIME-004'` | **完全等价**：`:793-794` 正是 `if (previewState.status !== 'ready') addBlock('RUNTIME-004', 'preview-status', ...)` |
| `issues.some(...)` | `result.runtimeGate.issues` | `renderViaPreviewPage` 返回 `:858-867` 已带 `runtimeGate.issues`，同一份数组 |

⇒ `renderBroken` 的两个条件本就是**同一件事**（RUNTIME-004 即「未 ready」的证据），改后语义不减。

### 3.2 建议改法（2 行，不新增守卫、不改阈值）

```js
// :1276-1278 现状（必炸）
const renderBroken =
  previewState.status !== 'ready' &&
  issues.some((i) => i?.id === 'RUNTIME-004')

// 建议
const gateIssues = Array.isArray(result?.runtimeGate?.issues) ? result.runtimeGate.issues : []
const renderBroken = gateIssues.some((i) => i?.id === 'RUNTIME-004')
```

### 3.3 风险档：**C 档，必须显式授权**

不是因为改动大（2 行），而是因为**后果是行为突变**。已把下游判定路径查到底：

| 环节 | 事实 | 后果 |
|---|---|---|
| `RUNTIME_BLOCK_IDS`（`:34-47`） | 只有 12 个 `RUNTIME-*`，**不含 `VISUAL-002`** | 第一层 `blockingIssues` 不会因它 fail |
| `RUNTIME_INCREMENTAL_IDS`（`:49-53`） | 只有 `RUNTIME-007/008/010` | 第二层也不会接它 |
| **fallback 分支（`:265-289`）** | `issueIds.length > 0` 即进入；`unknownBlocking = issues.filter(severity === 'BLOCK')` ⇒ **`action: 'fail'`** | 🔴 **`VISUAL-002` 正是 `severity:'BLOCK'`（`:1291`）⇒ 修复后直接 fail** |
| WARN 档 | `severity:'WARN'`（`:1299`）⇒ 走 `incremental_fix` + `buildRuntimeRevisionGuidance` | 🟡 不 fail，但会驱动增量修订 |

⇒ **修复后行为突变是真实且明确的**：像素分 `< 0.6` 的任务会从当前「静默通过」变成 **`action: 'fail'`**。考虑到历史产物从未被像素保真约束、用户持续反馈样式差，**放开后大概率出现批量 fail**。

| 风险 | 说明 |
|---|---|
| 通过率骤降 | 像素分 < 0.6 即硬 fail，历史产物无此约束 |
| 与 C3 裁决冲突 | C3 裁决「只做证据治理、不动阈值」，本条会**实际启用**判据并触发 fail |
| 反向风险 | 若为了稳而长期不修，`VISUAL-002` 继续形同虚设，视觉劣化继续无拦截 |

### 3.4 四个可选档位（待用户选）

| 档位 | 做法 | 后果 | 风险 |
|---|---|---|---|
| **C1** | 只修 ReferenceError，`VISUAL-002` 照原逻辑入 gate | 门禁立即生效，`<0.6` 即 fail | 🔴 通过率可能骤降，无灰度 |
| **C2** | 修 ReferenceError，`VISUAL-002` 一律降为 **`WARN`**（含原本 BLOCK 档） | 走 `incremental_fix` + 修订指导，不 fail，但**能驱动 LLM 修** | 🟡 安全且闭环，属改 severity（需授权） |
| **C3′** | 只修 ReferenceError 并把 `fidelity.score/verdict` 打进计数行，**不 push VISUAL-002** | 纯观测，零行为变化 | 🟢 最低，多一轮但拿到真实分数分布后再定阈值 |
| **C4** | 不修，继续恒 0 | 门禁继续形同虚设 | 🔴 视觉劣化无拦截 |

**建议**：先 **C3′** 拿一次真实 `score` 分布（一轮任务即可），再据此在 **C1 / C2** 之间定阈值或降级策略。直接上 C1 等于把三个月没人看过的门禁一次性通电，谁也不知道会拦掉多少。

---

## 4. 对既有文档的口径更正（避免分叉）

| 文档 | 原口径 | 更正后 |
|---|---|---|
| `2026-11-02-写盘前pass执行顺序总纲.md :144` | 恒 0 是「`:1248` 条件未成立 ⇒ 本次未做像素比对」 | 恒 0 是「比对**已执行**（`compared=1`），但在 `:1277` 抛 `previewState is not defined` 被 catch 吞掉」 |
| `2026-11-05-真机归因-六任务证据链与既有方案冲突.md :121`（D7） | 「像素比对分支未进入」 | 「分支已进入（`preview=1,exists=1,blank=0,compared=1`），死在写 derivative 前」 |
| 同上 `:136`（刀3 状态） | 「接线完整但零覆盖，需查 `previewImage` 输入链路」 | 「接线完整、输入也到位，**判据代码自身 ReferenceError**，属 P0 缺陷」 |
| 同上 `:145`（A3） | 「非 bug：`:1248` 条件未成立」 | 「**是 bug**：作用域错配，见本文 §2.3」 |
| `2026-11-05-真机归因后续治理方案.md §13.4` | 「G2 无法离线阳性，需重投补齐」 | 「已重投补齐，并直接定性 P0，见本文」 |

---

## 5. 明确不做

- ❌ 不擅自修这 2 行（C 档，门禁行为突变，需授权）。
- ❌ 不改 `FIDELITY_VERDICTS` 阈值、不改 `RUNTIME_BLOCK_IDS`。
- ❌ 不因为「恒 0」就删掉 V15 计数行 —— 它正是发现本案的唯一入口。
- ❌ 不把「VISUAL-002 从未生效」当作视觉问题的唯一解释~~（D1 的 `imgSrcNoMountTarget=100%` 是更直接的一层）~~。
  🔴 **2026-11-05 更正**：括号内依据作废——`imgSrcNoMountTarget` 经全样本证实为**恒真判据**（`bg ∧ imgSrc` 交集 = 0），不是「更直接的一层」，**D1 已撤销**。详见 `docs/2026-11-05-真机归因后续治理方案.md` §13.5。本条原则（不把单一门禁失效当唯一解释）本身仍然成立。

---

## 6. 可复现命令

```bash
# G1/G2 真机行
cd /Users/smigoo/工作/mvgo/backend-node
grep -E "resConserveReasons:" server.log | tail -1
grep -E "visualFidelityInput:" server.log | tail -1
grep -E "渲染比对门禁执行失败" server.log | tail -3

# 作用域错配取证
grep -nE "function renderViaPreviewPage|export async function renderScreenshot" src/ai-engine/roles/screenshot-renderer.js
grep -nE "const previewState|const issues = \[\]" src/ai-engine/roles/screenshot-renderer.js
git log -S "previewState.status !== 'ready'" --format="%h | %ad | %s" --date=format:"%m-%d %H:%M" -- src/ai-engine/roles/screenshot-renderer.js
```

---

## 7. 实施记录 · C3′（2026-11-05 17:0x，用户裁决 `先C3′`）

### 7.1 改动（`screenshot-renderer.js`，3 处）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `:67`（模块级） | 新增 `const VISUAL_002_EMIT_ENABLED = false` + 完整背景注释（为何默认关、置 true 的前置条件） |
| 2 | `:1308-1313` | `renderBroken` 从越界的 `previewState.status !== 'ready' && issues.some(...)` 改为 `gateIssues = result?.runtimeGate?.issues` + `gateIssues.some(id === 'RUNTIME-004')` —— **等价替代**（RUNTIME-004 正是「未 ready」的产物 `:793-794`），修复 ReferenceError |
| 3 | `:1326` / `:1334` | 两处 `VISUAL-002` push 加开关守卫 `VISUAL_002_EMIT_ENABLED &&` ⇒ 默认不 push |
| 4 | `:1262-1267` | 新增 `vfScore` + `logVisualFidelityScore()`，`visualFidelityScore:score=…,verdict=…,renderBroken=…,emitted=…`，早退与正常出口各打一次 |

### 7.2 「零行为变化」的论证链（三层）

| 层 | 事实 |
|---|---|
| 判据层 | 改动前：`:1277` 必抛错 ⇒ `:1283` 赋值与 `:1288-1304` push **从未执行**。改动后：开关 `false` ⇒ push **仍不执行**。⇒ `runtimeGate.issues` 内容**不变** |
| 判定层 | `classifyRuntimeGate` 只看 `runtimeGate.issues`（`:239` 名单过滤 / `:270` severity 分级）。issues 不变 ⇒ `action` 不变 |
| 产物层 | `result.visualFidelity` 在炸点**之前**（`:1275`）就已赋值，改动前后一致；`vfScore` 只进日志，不写 `result`（spec 断言）；`.visualFidelity` 全仓**零消费** |

⇒ 唯一变化是**多了两行日志**（`evaluated` 由 0→1、`visualFidelityScore` 新行）。这是观测变化，不是行为变化。

### 7.3 验证

| 项 | 结果 |
|---|---|
| 新增 spec `visual-fidelity-score.spec.ts` | 9 用例（引用修复 / 事实源 / 开关守护 / 四键 / 早退+正常各一行 / 真实返回 / 不改阈值 / 不写 result / 无硬编码） |
| 定向 8 套件 | **74/74 全绿** |
| 构建 | `npm run build` EXIT=0，`dist/.build-stamp` = `2026-11-05T07:00:54.508Z git=49df58a` |
| dist 验签 | `visualFidelityScore:score=` ×1、`VISUAL_002_EMIT_ENABLED = false` ×1 |
| 全量 jest | `23 failed suites / 54 failed tests / 378 passed`，**FAIL 集合与上轮完全相同（零新增）**，且 23 个全部零引用本轮改动文件 |

### 7.4 真机验证（2026-11-05 15:08-15:09，重启后首批任务）

| 任务 | 组件 | `visualFidelityScore` | `verdict` | `renderBroken` | `emitted` | 截图 `issueCount` | 任务终态 |
|---|---|---|---|---|---|---|---|
| `mc-1793862454209-4a0b8511` | `c-vehicle-monitor-4a0b8511` | **0.4014** | block | 0 | 0 | 0 | completed |
| `mc-1793862458850-32f4423c` | `c-vehicle-monitor-32f4423c` | **0.5303** | block | 0 | 0 | 0 | completed |
| `mc-1793862476974-654dfeee` | `c-vehicle-monitor-654dfeee` | **0.5459** | block | 0 | 0 | 0 | **completed** |

**四项验证全部通过**：

1. ✅ **ReferenceError 消失**：15:03 重启后 `previewState is not defined` **零命中**（此前每次比对必报）。
2. ✅ **V15 从恒 0 转正常**：同期 `visualFidelityDerivative:evaluated=1,derivative=0,independent=1`（此前 7 次真机全 0）。
3. ✅ **分数真实可读**：`score` 严格跟在各自「预览页截图完成」之后 32-43ms，归属明确。
4. ✅ **零行为变化的铁证**：我的任务 `score=0.5459 < 0.6 ⇒ verdict=block`，**但任务状态是 `completed`**（`qualityGate="warned"`）。若 VISUAL-002 被 push，它会掉进 `classifyRuntimeGate` fallback 的 `severity==='BLOCK'` 分支 ⇒ `action:'fail'` ⇒ 任务必失败。**任务成功 = push 确实没执行 = 阻断行为与过去完全一致**。

### 7.5 分数分布（C1/C2 决策的直接依据）

3 个样本：`0.4014 / 0.5303 / 0.5459`，均值 **0.4925**，**100% `verdict=block`**（阈值 `WARN=0.6`）。

| 观察 | 含义 |
|---|---|
| 全部 < 0.6 | 若直接开 **C1**，这批任务 **100% 会被 fail** |
| `renderBroken=0`、`issueCount=0` | **不是渲染失败**，是真实视觉差异（亮度直方图 L1 距离 ≈ 0.45-0.60） |
| 分数集中在 0.40-0.55 | 与用户长期「样式一点都不好」的主观反馈**客观吻合** |

⇒ **C1 在当前产物质量下不可行**（等于 100% 拒收）。可行路径只有两条：
- **C2**：VISUAL-002 一律降 `WARN` ⇒ 走 `incremental_fix`，**不 fail、任务仍 completed**（⚠️ 但**不驱动 LLM 修**，见我下方 §7.7.1 的自我更正）；
- **C1 + 阈值重定**：先把 BLOCK 阈值降到实测分布之下（如 0.4），但这属于改阈值，需另立裁决。

### 7.7 C2 实施记录（2026-11-05 15:1x，用户裁决 `继续c2`）

#### 7.7.1 一处必须先更正的判断错误（自查）

我在 §7.5 曾写「C2 走 `incremental_fix` + `buildRuntimeRevisionGuidance`，不 fail 但**能驱动 LLM 修**」。**这个推断是错的**，实施前查证推翻了它：

```js
// mc-component-graph-phase2.js:5880 附近
if (action === 'incremental_fix') {
  logger.warn('generate 运行时门禁发现问题但不阻断（incremental_fix）', {...})
}
return { runtimeGate, renderedImage: result.renderedImage }   // ← 不含 needsRevision
```

| 事实 | 结论 |
|---|---|
| 运行时门禁节点返回 `{ runtimeGate, renderedImage }`，**不含 `needsRevision`** | 路由读到的是上一步的值 |
| `incremental_fix` 分支只 `logger.warn` 后 `return` | **不设 `needsRevision`、不触发重试** |
| `buildRuntimeRevisionGuidance(runtimeGate)` 虽在 `classifyRuntimeGate:278` 生成 | 但该返回值在 `incremental_fix` 分支**未被消费** |

⇒ **C2 的真实效果 = 「留痕 + 不阻断」**，不是「驱动修复」。要真正回流必须另立 **C2-B**（让运行时门禁节点返回 `needsRevision: true` 并消费 `revisionGuidance`，还要配重试上限防无限循环）——属新的高风险改动，需单独授权。

#### 7.7.2 实际改动（2 处，均在 `screenshot-renderer.js`）

| # | 改动 | 说明 |
|---|---|---|
| 1 | `VISUAL_002_EMIT_ENABLED: false → true` | 注释整段重写，写清 C3′→C2 演进、真机 3/3 block 依据、以及「不驱动重试」的已知边界 |
| 2 | BLOCK 档 `severity: 'BLOCK' → 'WARN'` | WARN 档本就是 `'WARN'`；**`message` 文案逐字未动**（进该分支的就是 `score < 0.6`，措辞仍准确） |

**未改**：`RUNTIME-012`（空白截图）仍是 `severity:'BLOCK'` —— 那是真阻断，不得被 C2 顺手降级（spec 有专项阴性断言）。`RUNTIME_BLOCK_IDS`、阈值、`FIDELITY_VERDICTS` 全部未动。

#### 7.7.3 生效路径（why 不会 fail）

```text
VISUAL-002 (WARN) 进入 runtimeGate.issues
  → classifyRuntimeGate:239  不在 RUNTIME_BLOCK_IDS ⇒ 跳过第一层
  → classifyRuntimeGate:250  不在 RUNTIME_INCREMENTAL_IDS ⇒ 跳过第二层
  → classifyRuntimeGate:265  issueIds.length > 0 ⇒ 进入 fallback
  → classifyRuntimeGate:270  unknownBlocking = filter(severity === 'BLOCK') ⇒ 空
  → classifyRuntimeGate:278  return { action: 'incremental_fix' }
  → phase2.js:5880           仅 logger.warn，任务继续 ⇒ completed
```

#### 7.7.4 验证

| 项 | 结果 |
|---|---|
| spec 更新 | `visual-fidelity-score.spec.ts` 改为 C2 契约：开关 `true`、两处 push 均在守护下、**VISUAL-002 范围内 `severity:'BLOCK'` 零残留且恰好 2 处 `WARN`** |
| 新增阴性断言 | `RUNTIME-012` 必须仍为 `severity:'BLOCK'`（防 C2 顺手降级真阻断） |
| 定向 8 套件 | **75/75 全绿** |
| 构建 | EXIT=0，`dist/.build-stamp` = `2026-11-05T07:16:41.473Z git=49df58a` |
| dist 验签 | `VISUAL_002_EMIT_ENABLED = true` ×1；`id:'VISUAL-002'` 后两处均 `severity: 'WARN'` |
| 全量 jest | 见 memory / 报告中结论（FAIL 集合与上轮一致） |

### 7.8 C2 真机验收（2026-11-05 15:20-15:22，部署后）

重启后单实例 `PID 76719`（干净、无抢占、`EADDRINUSE` 零新增）。投递 `mc-1793863226340-b0ffec8d`，同批还有并行会话的 `mc-max-1793863177970-72a94ab4`。

| 任务 | `score` | `verdict` | `renderBroken` | `emitted` | `VISUAL-002` | `action` | 终态 |
|---|---|---|---|---|---|---|---|
| `72a94ab4`（并行会话） | 0.3828 | block | 0 | **1** | WARN | incremental_fix | completed |
| **`b0ffec8d`（本次投递）** | **0.498** | block | 0 | **1** | **WARN** | **incremental_fix** | **completed** |

日志原文（证明三项设计全部按预期）：

```text
[S] visualFidelityScore:score=0.498,verdict=block,renderBroken=0,emitted=1
[W] generate 运行时门禁发现问题但不阻断（incremental_fix）
    {"issues":[{"id":"VISUAL-002","severity":"WARN",
      "message":"渲染产物与设计稿像素差异过大（score=0.498，阈值<0.6）"}]}
```

| 验收点 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `emitted` 由 0 变 1 | 开关生效 | `emitted=1` | ✅ |
| `VISUAL-002` 进入 `runtimeGate.issues` | 出现且 `severity=WARN` | 出现，`WARN` | ✅ |
| `classifyRuntimeGate` 分类 | `incremental_fix`（非 fail） | `incremental_fix` | ✅ |
| 任务终态 | `completed`（不被拦） | `completed`，`qualityGate="warned"` | ✅ |
| 分数持续可读 | 非 0、可解释 | 0.498 | ✅ |

#### 7.8.1 累计分数分布（5 样本，C1/C2-B 决策依据）

```text
0.4014 / 0.5303 / 0.5459 / 0.3828 / 0.498   → 均值 0.4717，5/5 verdict=block
```

- 阈值 `WARN=0.6`，**没有任何一个样本达到 0.6**；最高 0.5459，最低 0.3828。
- 全部 `renderBroken=0`、截图 `issueCount=0` ⇒ 与渲染失败无关，是真实的视觉还原度不足。
- 若改回 `severity:'BLOCK'`（= C1），**这 5 个任务会 100% 被 fail**。这一点已由数据锁死，不再是估计。

⇒ 结论：**C2 是当前产物质量下唯一可行的启用方式**；要真正把分数抬起来，必须走 **C2-B（回流）** 或从 D1/D3/D4 等产出侧治本，而不是收紧门禁。

---

> **状态**：C3′（修错配 + 只观测）已真机验证通过（3 样本，`emitted=0`、任务 completed）。
> **C2 已落地 + 已部署 + 已真机验收**（`emitted=1`、`VISUAL-002(WARN)` 进 gate、`incremental_fix`、任务仍 completed）。
> **C2 的真实效果是「留痕 + 不阻断」，不是「自动修」** —— 回流需另立 C2-B（见 §7.7.1）。
> **5 样本全部 `verdict=block`（0.3828~0.5459）**：C1 会 100% 拒收，已由数据锁死。
> 未 commit、未 push、未同步生产。

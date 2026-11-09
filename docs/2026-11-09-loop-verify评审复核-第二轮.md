# LOOP-VERIFY 第二轮评审复核（只读审计）

> 日期：2026-11-09 · 复核对象：R1(`07a916d`)/R2(`7d45912`)/R4(`563df52`)/R5(`9d1523d`)/R6(`0def83c`)/R6b(`183a9d6`)/R9R10(`2bdfaab`)
> 审计基线：backend-node `HEAD=2bdfaab`；docs 子仓 `7cde365`
> 方法：逐文件读码 + spec 对照 + 回放 JSONL 复读 + jest 失败集文件核对。**未改代码、未提交、未重启、未部署。**
> 依据：`mvgo-node-pipeline-governance` 六阶段门禁 + `2026-11-08-修复验证loop与自动回滚流程.md` §6/§9

---

## 0. 结论总览

| # | 结论 | 严重度 | 是否阻塞下一轮 |
|---|---|---|---|
| 1 | R9/R10、R6/R6b 轮**缺全量 jest 基线 diff 证据**（脚本目录无 `jest-after-r9r10-failset.txt`，仅家族 spec 绿） | P0 | **是**（Phase 6 未闭环） |
| 2 | R9-b 挂载佐证失效：`parentFlexRowClasses: ['*']` 通配 + 页面级一次性正则 ⇒ 任意横排命中即改全部子组件 | P0 | **是**（存在误杀面） |
| 3 | R10 具名插槽与游离块混存时被整段搬移，与自身注释「具名插槽原样保留」相反；`>` 截断风险 | P0 | 是（改错比不改更糟） |
| 4 | R6b 缓存补跑 fail-open，且计数行不在采集器读取通道 ⇒ 判据不可验签 | P0 | 是 |
| 5 | R2 缺成功侧计数（文档承诺 `verified>0`，代码只有失败 warn） | P1 | 否，但判分器规格失一臂 |
| 6 | R4 注释「0 也打」与控制流不符（在 `if(!ok)` 内） | P1 | 否（语义需澄清） |
| 7 | R5 `badBytes` 记的是回退后快照长度，与 `restoredBytes` 恒等 | P1 | 否（排查误导） |
| 8 | 对照样本判分口径被放宽：主对照降级仍判通过，与计划 §9「对照零退化」冲突 | P1 | **是**（判据单源失效） |
| 9 | `after-r9r10.jsonl` 第 3 条 failed（`common.less` 0 字节），与「R9/R10 判分通过」矛盾 | P1 | 是（需归因） |
| 10 | R9-b `declsForClass` 死代码；只解析首个 `<style>` 块 ⇒ 多块漏命中 | P2 | 否 |
| 11 | 回放资产 `after-r6/r6b/r9r10.jsonl` 未跟踪未入库 ⇒ 证据不在版本里 | P2 | 否 |
| 12 | R11/R12/R13 仍无立项文档（挂账未落纸） | P2 | 否 |

**修正上一轮 agent 的两条误报**：
- ❌「R6 方案文档在仓库不存在」→ **不成立**。文档在 **docs 子仓**（`/Users/smigoo/工作/mvgo/docs/2026-11-09-loop-verify-R2R4R5R6判据治本.md`，已提交 `7cde365`，6880B）。agent 只搜了 `backend-node/docs`。
- ❌「R1/R6b 在 HEAD 中无对应定义」→ **不成立**。R1 在 `microcode-engineer.js` 的 `analysisCharts` 取数（`07a916d`），R6b 在 `mc-component-graph-phase2.js:1109-1128`，均已提交。

---

## 1. P0-1 · 回归证据缺口（Phase 6 未闭环）

**事实**：`backend-node/scripts/loop-verify/` 仅有 3 个失败集文件：

```
jest-after-r1-failset.txt            20 行
jest-baseline-failset-95054ed.txt    20 行
jest-baseline-95054ed.txt             0 行
```

**没有** `jest-after-r9r10-*.txt`，也没有 R2/R5/R6/R6b 轮的全量失败集。

**问题**：R2/R5/R6/R9/R10 五轮全部只有「家族 spec N 例绿」作为回归证据。门禁 §Phase 6-1 要求「改动后全量跑，两态 FAIL diff 必须为空」。家族 spec 绿 ≠ 无新增失败（本次新增了 6 个 spec 文件，若某新 spec 在 CI 语义下被并入基线失败集，diff 会非空）。

**修法**：补跑一轮全量 jest（`--runInBand --forceExit`，`env -i`），落 `jest-after-r9r10-failset.txt`，与 `jest-baseline-failset-95054ed.txt` 双向 diff（去重后）为空才可宣布 R1–R10 收口。

---

## 2. P0-2 · R9-b 挂载佐证被降级为通配

**证据**：

- `src/ai-engine/utils/pre-write-self-healing.js:794-804`：先对 **index.vue** 跑一次 `rowWrapRx`，只要页面任意处命中「`display:flex` 容器里连排两个大写组件标签」，就把 `isRow` 置真；
- 同一函数 `:801-804` 随后遍历**所有** `.vue` 子文件，逐个传 `{ parentFlexRowClasses: ['*'] }`；
- `src/ai-engine/utils/horizontal-flex-width-heal.js:122-134`：`parentRow` 只用 `length === 0` 判空，**从不与真实 class 名比对** ⇒ `['*']` 等价于「无条件信任调用方」。

**为什么是问题**：注释（`:792-793`、`healHorizontalFlexWidth100:96-97`）声称佐证是「该组件根被横排 flex 父容器**直接包裹**」。实际口径是「页面里存在任一横排容器」。二者不等价：

- 反例形态：`index.vue` 顶部有一个横排 header，下面是一个**竖排** stack 里放的卡组件，卡自身 `width:100%`。旧口径正确跳过（父是竖排），新口径会把它改成 `flex:1 1 0; min-width:0` —— 在竖排容器里 `flex-basis:0` 会让高度语义失真，且 `min-width:0` 让本该撑满的卡不再撑满。
- 现有 5 例 spec 全部只测 helper 入参，**没有一条覆盖调用侧筛选**（即 `isRow` 假阳性路径），属无阴性对照。

**治本位置**：佐证必须在**调用侧**按结构解析出「哪个 class 的父容器是横排」，而不是布尔开关。做法：从 index.vue 解析横排容器的直接子组件标签 + 其 class，生成 `parentFlexRowClasses` 白名单传入；helper 内 `:134` 改为真实比对 `parentRow.includes(selClass)`（`'*'` 通配保留为显式测试口子，生产路径不传）。

**阳性/阴性对照**：阳性 = 设备监测 `49d23fe1` 形态（两卡直挂 switch-con 横排）；阴性 = 竖排 stack 内卡 `width:100%` 必须零改写。

---

## 3. P0-3 · R10 具名插槽混合游离块被整段搬移

**证据**：`src/ai-engine/utils/stray-template-root-relocator.js:42-65`

```js
const before = content.slice(tplStart, panelOpen)
const stripped = before.replace(/<template\s+#([\w-]+)>[\s\S]*?<\/template\s*>/gi, '')
if (!stripped.trim()) return { ... }        // 只有「纯具名插槽」才豁免
const strayBlock = before.trim()             // ← 混合时整段（含具名插槽）一起搬
```

- 注释 `:22` 写「`<template #xxx>` 具名插槽块（语法合法）原样保留不动」，**代码只做触发判定，没做内容剔除**。具名插槽与游离元素并存时，具名插槽被搬进 base-panel 默认插槽首部——虽然仍是 base-panel 直接子级（合法性尚存），但**顺序语义改变**，且若游离块本身是 `<div>` 包裹，具名插槽会落进 div 内部 ⇒ **真·非法**（Vue 不认嵌套的具名插槽）。
- `:51` `content.indexOf('>', panelOpen)` 对属性值内含 `>` 的情况会截断标签（如 `:class="a > b"`）。
- spec 4 例：阳性搬移 / 正常结构 / 无 panel / **仅**具名插槽；**无混合用例**。

**修法**：① 搬移前先按顶层元素配平切分 `before`，剔出具名插槽块后再判断是否仍有游离元素；② 保留具名插槽在原位（不进入 `strayBlock`）；③ 开标签闭合位置改用属性感知扫描（引号内不计 `>`）；④ 补 2 例：混合结构（具名插槽 + 游离 div）、开标签含 `>` 的属性值。

---

## 4. P0-4 · R6b 补跑 fail-open 且不可验签

**证据**：`src/ai-engine/graphs/mc-component-graph-phase2.js:1109-1128`

```js
try {
  const _ensured = ensureHeaderSlots(_cachedSections, ...)
  validatedCachedResult.headerSlots = _ensured.headerSlots
  logger.info('🎯 headerSlots 缓存补跑(ensureHeaderSlots)', {...})
} catch (_hse) {
  logger.warn('⚠️ headerSlots 缓存补跑失败（fail-open，维持现状）', ...)
}
```

两个问题：

1. **fail-open 静默**：异常时 `headerSlots` 仍为空，任务照常 completed ⇒ 「任务成功」不能证明 R6b 生效。这正是本 loop 反复踩的「假绿」形态。
2. **计数行不可采集**：`replay.mjs:93-107` 只从 `task.progress` 的 `type==='log'` 事件抽 `COVERAGE_LOG`；graph 侧 `logger.info` 落 `server.log`，采集器对 server.log 只 grep 缓存命中行（`:112-130`）。⇒ 判定「补跑命中几条」在现有工具链里**取不到**。实证：`after-r6b.jsonl` 两行 `coverage:null`，无任何 headerSlots 字段。

**修法**：① 计数行改走 `state.onProgress`（与 `🔍 子组件覆盖度` 同通道），采集器加一个 `HEADER_SLOTS_LOG` 提取；② `_cachedSections.length === 0` 时打独立 warn（区分「无真值」与「输入结构缺失」），不要静默成功；③ 是否保留 fail-open 需明确：建议保留（不阻断任务）但必须在判分器里作为**失败信号**而非忽略。

---

## 5. P1 级

### 5.1 R2 缺成功侧计数

`file-writer.js:2267-2288`：`_lockedOk === true` 只打「终裁覆写」warn（且仅在内容不同时打），**没有任何 `verified` 计数**。而方案文档 §6 判分表写「`rejected>0` 或 `verified>0`」。⇒ 该行判据目前**无法执行**；真机四发 `rejected=0` 时，无法区分「全部校验通过」与「根本没走到覆写点」。

修：覆写点恒打一行 `🛡️ R2 快照校验 verified=1/rejected=0`（Map 有 key 就打）。

### 5.2 R4「0 也打」与控制流不符

`file-writer.js:1629-1640`：计数行在 `if (!_lessGate.ok)` 内。注释 `:1630` 声称「0 也打——恒打铁律：0=文件干净」，实际通过路径**不打**。⇒ `defects=none` 分支几乎不可达（只有 `ok=false` 且 `defects` 为空时），日志语义必须更正为「判死成因」，不能当「该文件查过且干净」。

另外：该行记的是**首次** `_lessGate.defects`，其后 `:1641` 起还有 last-good 回退 / 注释配平复检，最终可能落盘成功。⇒ 该计数是「原始命中数」不是「最终阻断数」，下游不得当失败率用。

### 5.3 R5 `badBytes` 取值错位

`file-writer.js:1554-1557`：`sanitizedContent = _frozenSnap` 之后才打日志 `badBytes: sanitizedContent.length` ⇒ `badBytes` 恒等于 `restoredBytes`，真正的坏版长度已丢失。排查时会被误导成「坏版和好版一样长」。

修：在赋值前先 `const _badLen = sanitizedContent.length`，日志用 `_badLen`。两处（`:1555`、`:1579`）同病。

### 5.4 判分口径与计划冲突（对照样本）

计划 §9 退出条件：「1559f801 对照**零退化**」。实际 `after-r6.jsonl:3`：

```
1559f801  verdict=ok  artifactIncomplete=true
          degradedFiles=["package/components/StatsMonitor.vue"]
          degradedReason="SFC 编译失败，已隔离降级"
```

该轮仍被判「通过」。理由是「degradedFiles 属随机层，不作裁决」——但**同一份计划**又把它列为硬退出条件。⇒ **同一指标在两处口径相反**，属判据单一来源失效（门禁红线）。

需裁决（二选一，不能两存）：
- A：承认随机层豁免优先，把 §9「对照零退化」降级为「对照 status 不得 failed」；
- B：保留硬条件，则 R6 轮应回滚重跑。

建议 A（LLM 采样确实不稳），但必须**改文档**，否则后续每轮都在两套口径间挑对自己有利的。

### 5.5 R9/R10 回放有一条结构性失败

`after-r9r10.jsonl:3` 流量监测 `failed`：`resources/styles/common.less 文件为空（0 字节或仅空白）`，`artifactIncomplete=true`。

这是**产物完整性硬门禁**，不是 status 随机漂移（空文件是确定性的结构缺陷，且 R4 本轮刚动过 LESS 门禁）。R4 的 007 判据对「空文件」不判死（无声明行），所以不算 R4 回归；但与 R4 相邻、必须归因清楚才能宣布「R9/R10 通过」。

### 5.6 R9-b 死代码与单 style 块限制

- `horizontal-flex-width-heal.js:61-72` `declsForClass` 定义后无调用（死代码，`grep` 仅 1 definition 0 call）；
- `:108` `content.match(/<style[^>]*>([\s\S]*?)<\/style>/i)` 只取**第一个** style 块。若组件把 scoped 样式写在第二个块（或第一个块是 `<style lang="less">` 只有 @import），改写整体失效且**无任何日志**（静默假阴性）。

---

## 6. P2 级

- **回放资产未入库**：`after-r6.jsonl` / `after-r6b.jsonl` / `after-r9r10.jsonl` 均 `??` 未跟踪。证据不在版本里 ⇒ 事后无法复核（本次审计只能读工作区）。建议随下一轮 `#note#` 一并入库（它们只是验证产物，不含密钥）。
- **挂账未落纸**：R11（终写内容溯源链竞态）、R12（vision 段树稳定性契约）、R13（vision 输出质量门禁）只在会话里存在，`docs/` 无立项文档、memory 无条目。按 Phase 1 查重要求，不写等于下一轮会重新发明。
- **工作区清理边界**：`config/dynamic-roles/*.js` 24 个文件的改动仅为头部时间戳（11-08 → 11-09，自动生成），与 loop 无关，属并行会话 WIP。**本轮及其后续均不得提交/回退**。

---

## 7. 建议的下一轮顺序（若用户授权继续）

| 序 | 动作 | 理由 |
|---|---|---|
| 0 | 改计划文档 §9 口径（5.4 裁决） | 一切判分的前置，否则每轮都可自证通过 |
| 1 | 补全量 jest 基线 diff（P0-1） | 把「通过」补成可审计事实 |
| 2 | R9-b 佐证改为真实白名单 + 补调用侧阴性用例（P0-2） | 误杀面最大、且已有真机命中 12 次，风险已外溢 |
| 3 | R10 混合结构修正 + 属性感知开标签（P0-3） | 改错比不改更糟 |
| 4 | R6b 计数行走 progress + 采集器提取（P0-4） | 让 R6 判据第一次真正可验签 |
| 5 | R2 成功计数 / R5 badBytes / R4 注释更正（P1 三条） | 低成本、直接消除误导 |
| 6 | R11 立项（终写溯源链逐跳 md5） | R10 完全生效的前置 |

---

## 8. 明确不做（本轮）

- ❌ 不产物直改（所有结论都落到管线判据层面）
- ❌ 不重启 :13030 / 不构建上线 / 不 `git push` / 不同步 ECS
- ❌ 不触碰 `config/dynamic-roles/*` 并行 WIP
- ❌ 不在口径未裁决前继续新增修复轮（否则证据会继续叠在半可信判据上）

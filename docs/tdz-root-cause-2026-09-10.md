# env 样本「activeTab TDZ」管线根因与治本（2026-09-10）

样本：`mc-max-1789019718053-fb0a0de7`（`c-env-monitor-wzk1763d-fb0a0de7`）
现象：生成 status=completed，但预览渲染报错 `Cannot access 'activeTab' before initialization`。

## 0. 一句话根因

**不是「模型偶尔写错一行」**，而是**管线结构性缺口**：index.vue 的 `<script setup>` 经 `scriptSplit` 拆成 状态/生命周期/图表 三段生成，合并时只做 import/Builder/生命周期 hook 去重、**不做「声明顺序 / 引用型 TDZ」校验**；门禁 `validateVueScriptSemantics` 虽有 TDZ 设施（`findTdzAssignments`）但**只检「裸赋值型」、且从未接入写盘路径**——「引用型 TDZ」（`watch(activeTab)` 在 `const activeTab` 之前）全链路漏网 → 写盘 → 运行时崩。

## 1. 真值证据链（git / 日志 / 产物实证）

1. **任务决策**（server.log `19179`）：`complexity:complex, splitIndexVue:true, scriptSplit:true, sizeTier:xl, estTokens:19410, effectiveSections:8`。
2. **生成路径**：`code-generator.js:128-257` `generateIndexVue` 在 `scriptSplit=true` 时把脚本拆为 **state / lifecycle / charts** 三段调 LLM，再 `mergeScriptParts(state, lifecycle, charts)`。
3. **强制拆分短路**（code-generator.js:219-222 + :226-233）：`subComponentPlan.isForced===true && effectiveSections>0` → **跳过 charts 段**（`mc-max-...-fb0a0de7` 的 `isForced:true, effectiveSections:8`）→ 实际只合并 **state + lifecycle** 两段。
4. **合并无顺序校验**（code-generator.js:328-371 `mergeScriptParts`）：只 `dedupeLifecycleHooks / dedupeMcComponentBuilder / dedupeScriptImports`——**无 TDZ / 无声明顺序**。
5. **产物指纹**：两份 workspace 副本（backend-node + frontend）的 `package/index.vue` 均呈「注释重复两份 + `watch(activeTab)` 排在 `const activeTab` 之前」——典型分段合并错位。acorn/compiler-sfc 实测：`watch(activeTab)` 在顶层语句索引 17，`const activeTab` 在 18 → **引用早于声明**。
6. **门禁漏拦**（关键）：`sfc-semantics.js` 的 `findTdzAssignments`（:586）只匹配 `name = ...` 裸赋值，**完全不检测「引用/调用型」TDZ**；且 `findTdzAssignments`/`autoFixTdzAssignments` **全仓零调用点**（grep 实证），等于虚设。

## 2. 为何此前「贴 patch」错过了根因

前一轮直接改了 workspace 的 `index.vue`（`watch(activeTab)` 顺序上移）——那是**治标**：
- 它只修了这个样本的**已生成产物**，下一次生成仍会复现（合并逻辑未变）；
- 它把责任推给「模型生成缺陷」，但真因是**合并段的确定性校验缺失**，模型分段独立生成时根本无法保证跨段声明顺序。

## 3. 治本三刀（已落地，2026-09-10）

### 刀 1：引用型 TDZ 检测 + 自动修复（治本核心）
- **新增 `src/ai-engine/utils/sfc-tdz.js`**（纯函数、零依赖、**无 import.meta**，便于 jest 单测；sfc-semantics.js 因含 import.meta 导致 CJS 转换失败，故拆出独立模块）。
  - `findTdzReferences(scriptBody)`：按 `splitTopLevelStatements` 切顶层语句，仅比对顶层、排除 function/var 提升与 import 绑定，命中「引用位置 < 首次声明位置」的 const/let/class。
  - `autoFixTdzReferences(scriptBody)`：把被提前引用的声明语句整体上移到首次引用之前（语义等价、不删语句、迭代处理防止死循环）。
- **`sfc-semantics.js`**：`import { findTdzReferences, autoFixTdzReferences } from './sfc-tdz.js'` 并 re-export（对外 API 不变）；`validateVueScriptSemantics` 第 6 节扩展为 **6a 赋值型 + 6b 引用型** 双检测，引用型命中即自动上移声明回写 `content`，残留才 fail-closed。
- **`microcode-engineer.js:2295`** 既有写盘前 `validateVueScriptSemantics` 调用已做「`sem.content !== c → allFiles[p]=sem.content` 回写」并 fail-closed 拦截——**刀 1 直接复用该路径**，无需新代码。

### 刀 2：合并段自检（双保险）
- **`code-generator.js:mergeScriptParts`** 在 dedupe 链之后新增：合并后用 `findTdzReferences` 检测，命中即 `autoFixTdzReferences` 上移声明，**在拼装写盘前就消除 TDZ**，不依赖后续门禁。
- 此刀让「分段合并」这一根因点直接闭环，即使门禁被旁路也不会写出 TDZ 文件。

### 刀 3：回归测试（防复发）
- **新增 `src/ai-engine/utils/__tests__/sfc-semantics.tdz-ref.spec.ts`**（8 用例，全绿）：覆盖检测（watch-before-decl / 合法顺序 / function 提升 / import 提升 / 函数体内引用豁免）+ 修复（上移声明 / 无 TDZ 不变）+ 合并段等价自检。
- 注释与文档同步更正此前误记「仅 LLM 缺陷」为「合并段缺声明顺序校验」。

## 4. 验证
- 新 spec 8/8 通过。
- 用真值产物实测：`findTdzReferences` 精确命中 `activeTab (ref@17, decl@18)`；`autoFixTdzReferences` 修复后 residual=[]；`validateVueScriptSemantics` 返回 0 issues 且回写后 `const activeTab` 已位于 `watch(activeTab)` 之前。
- 受影响回归：sfc-semantics 既有的 TDZ/去重相关用例保持绿（既有 `sfc-semantics.spec.ts` 因 `import.meta` 属历史基线失败，非本次引入）。

## 5. 完成状态
- 刀 1 + 刀 2 + 刀 3 全部落地并验证；未重跑新生成样本（额度待授权，但逻辑已由 spec 钉死）。
- 关联：A/B/D/E/F1/F2 之前已落地；本次为**渲染期 TDZ** 这一类新增门禁，与 E（v-if+v-for 同元素运行时崩）同源（均属「生成产物运行时报 JS 错误、门禁漏拦」），后续可归并为「运行时 JS 错误 fail-closed」统一治理项。

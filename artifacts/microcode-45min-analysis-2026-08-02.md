# 微码简单组件 45 分钟耗时分析

## 结论
这条任务 `mc-1785691981393-80b24053` 的 45 分钟，主因不是 Figma 拉取，也不是运行时门禁，而是以下链路叠加：

1. 首轮质量检查后仍被判定 `needs_revision`
2. 第二轮进入 `microcode-engineer` 修订，并命中 `package/index.vue` 截断重试
3. 第二轮后继续执行一次重型 `layout-style-refiner`
4. 第二轮后继续执行一次重型 `adversarial-checker`
5. 在 `maxIterations = 1` 的前提下，仍完成了“首轮生成 + 第二轮完整修订链”

## 证据对应文件
- 管线决策：`backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- 微码生成：`backend-node/src/ai-engine/roles/microcode-engineer.js`
- 合并精修：`backend-node/src/ai-engine/roles/layout-style-refiner.js`
- 对抗检查：`backend-node/src/ai-engine/roles/adversarial-checker.js`
- 实际任务日志：`backend-node/logs/app-2026-08-02.log`
- 实际任务状态：`backend-node/data/tasks.json`

## 关键实现结论

### 1. 第二轮为什么会发生
`mc-component-graph-phase2.js` 的 `revision-decision` 节点中，只要：
- `checkResult.checkResult === 'needs_revision'`
- 且 `iterationCount < maxIterations`

就会进入修订。

当前 phase2 默认：
- `MAX_ITERATIONS = 1`

这不表示“只跑一轮总流程”，而是表示：
- 首轮生成后，允许再进入一次修订链

所以一次简单组件任务，依然可能跑成：
- 第 1 轮生成
- 第 2 轮修订

### 2. 为什么会被路由到重路径
`revision-decision` 的默认目标仍是：
- `target = 'microcode-engineer'`
- `_reviseTarget = 'full'`

只有在 `issueCategories` 被明确分类为 `stylistic` 或 `layout` 时，才会转去较轻的：
- `style-refiner`
- `parallel-refine`

如果分类是：
- `compliance`
- `structural`
- 或分类不足

就会继续走 `microcode-engineer`。

这意味着像：
- L4 样式块缺失
- 按钮语义问题
- base-panel 外壳类问题

这类高频规范问题，只要首轮没前置消掉，就很容易把简单组件打回全量修订。

### 3. `package/index.vue` 为什么拖时长
`microcode-engineer.js` 对简单组件虽然标注为“2 批生成”，但实际策略是：
- 先尝试一批生成 `declare.json + package/index.vue`
- 失败或截断后，再降级为：
  - `declare.json`
  - `index.vue template`
  - `index.vue script`
  - 后续样式文件

也就是说，所谓“简单组件”只是在**理想情况下**是 2 批。
一旦 `package/index.vue` 超长、被截断，立即退化为多批生成，且之前那次长调用已经花掉了时间。

从日志看，这条任务正好踩中了：
- `package/index.vue` 长调用
- 截断后重试

这是纯损耗，收益很差。

### 4. 为什么第二轮后还会继续很慢
在 `mc-component-graph-phase2.js` 中：
- `adversarial-checker -> parallel-quality-check -> revision-decision`
- 修订后又会回到质量检查链

而 `parallel-refine` 的实现里：
- 仅当 `reviseTarget === 'full'` 时，才使用 `LayoutStyleRefiner`
- 否则走 `layout-refiner -> style-refiner` 串行

当前这条任务中，第二轮后仍走了重型精修和重型对抗检查，所以总时长继续被拉长。

### 5. 为什么“视觉上简单”未必真的判成 simple
`microcode-engineer.assessComplexity(layoutStructure)` 的判定非常粗：
- 元素数 `<= 3` 且层级 `<= 2` 才是 `simple`
- 元素数 `>= 10` 或层级 `>= 4` 就进 `complex`
- 其他全是 `medium`

这意味着很多“看起来很简单的面板”，只要：
- 有几个装饰节点
- 有几层包裹
- 有图表/标题/内容块

就很容易落到 `medium`，从而触发更重的生成与检查路径。

## 这 45 分钟里最值得省的部分
按收益排序：

### A. 优先级 P0：前置消灭高频规范问题，避免进入第二轮全量修订
最值。

高频问题包括：
- `package/index.vue` 缺少 `<style lang="less" scoped>`
- 缺少 `@import '../resources/styles/index.less'`
- 图标按钮仍生成为 `div`
- `base-panel` 外壳泄漏

这几类问题不是“复杂推理”，而是模板约束问题。
如果在首轮生成模板或后处理校验里强制补齐，能直接减少：
- 第二轮 `microcode-engineer`
- 第二轮 `layout-style-refiner`
- 第二轮 `adversarial-checker`

这是最大收益点。

### B. 优先级 P0：简单/中等组件不要先赌整文件 `package/index.vue`
当前策略是：
- 先整文件
- 截断后再拆分

这会导致：
- 已经支付一次超长 LLM 调用
- 再支付 template/script 重拆成本

更合适的策略：
- 对 `medium` 组件默认直接走 `template + script` 拆分
- 对 `simple` 组件增加“预估长度/元素数/图表数”判定，命中阈值时直接拆分

这样可以直接消掉“长调用后再截断重试”这段纯浪费。

### C. 优先级 P1：重新定义 simple 判定，不要只看元素数和层级
当前 `simple` 判定过窄。
建议纳入：
- 是否包含图表
- 是否存在 headerSlots
- 是否需要 base-panel 结构
- 是否存在多个 section / card / list
- 估算 `package/index.vue` 体量

目标不是让更多组件进 `simple`，而是让分类更符合真实生成成本。

### D. 优先级 P1：对“运行时已 PASS，仅剩规范文本问题”的情况走轻修订
当前 revision-decision 仍以 `checkResult` 为主。
如果满足：
- `runtimeGate.status === PASS`
- 无视觉高优问题
- critiques 主要是 L4/语义/外壳规范类

则不应该再回到 `microcode-engineer full`。
可以改成：
- 规则修补器 / 轻量 patch
- 或 `parallel-refine` / `style-refiner` 限域修订

### E. 优先级 P1：对抗检查的复杂度评估不要在修订轮统一抬到 `medium`
`adversarial-checker.check()` 当前逻辑：
- `retryCount > 0 ? 'medium' : this._assessComplexity(...)`

也就是说，只要进入重试/修订轮，简单组件也会按 `medium` prompt 检查。
这会放大第二轮时长。

建议改为：
- 重试轮保留上轮 complexity
- 或 `Math.max(previousComplexity, detectedComplexity)`，而不是直接强制 `medium`

### F. 优先级 P2：合并精修器的调用条件可以更积极
当前 `parallel-refine` 只有：
- `reviseTarget === 'full'`

才使用合并版 `LayoutStyleRefiner`。

但对很多“未分类 critiques”或“轻度 layout + style 混合问题”，也可以直接用合并版，而不是再拆成 layout/style 两段或回到 engineer。

## 建议改动清单

### 第一批，优先改这 3 处
1. `backend-node/src/ai-engine/roles/microcode-engineer.js`
   - 将简单/中等组件的 `package/index.vue` 策略改为更早拆分
   - 不再先赌一次整文件再截断回退

2. `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
   - 在 `revision-decision` 中为“运行时 PASS + 规范类问题”增加轻修订分支
   - 对简单组件降低回到 `microcode-engineer full` 的概率

3. `backend-node/src/ai-engine/roles/microcode-engineer.js` 或首轮后置校验
   - 对 L4 样式块、`div -> button`、base-panel 外壳问题做强制模板化/自动修正
   - 目标是首轮直接消灭高频 critiques

### 第二批，再改这 2 处
4. `backend-node/src/ai-engine/roles/adversarial-checker.js`
   - 修订轮不要强制 `complexity = medium`
   - 保留简单组件 compact prompt 能力

5. `backend-node/src/ai-engine/roles/microcode-engineer.js`
   - 重新设计 `assessComplexity()`
   - 加入图表、section、header、预估文件体量等特征

## 预估收益
保守看：
- 去掉一次 `package/index.vue` 长调用 + 截断重试：可省数分钟到十分钟级
- 避免第二轮全量修订：可省十几分钟
- 第二轮不再走重型 adversarial/layout-style：还能再省数分钟

也就是说，这类“看起来简单”的组件，目标应该从 45 分钟压回到 10-20 分钟区间，而不是只做 5% 级的小优化。

## 下一步建议
最值得直接实施的是：
1. 先改 `microcode-engineer.js`，让中等组件默认拆 `template/script`
2. 再改 `revision-decision`，把“运行时 PASS + 规范类问题”从 full 修订里摘出去
3. 最后补首轮模板/校验自动修正，专门消掉 L4 与语义类高频 critique

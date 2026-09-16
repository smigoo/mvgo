# 三样本反复故障治本方案（2026-09-10）

日期：2026-09-10
样本：env `mc-max-1789016564341-14f3e113`、traffic `mc-max-1789016570637-fb959208`、device `mc-1789015934816-1003d7d3`
依据：`subcomponent-planner.js` / `tab-structure-guard.js` / `inline-header-slot-inferrer.js` / `code-healer.js` / `mc-component-graph-phase2.js` 源码实证 + git 考古（`a78a980` / `aacfa51` / `d5dc2be` / `6b1d874`）。

> 本文是**可落地修复清单**，每项标注：文件·函数·改法·验证。拒绝补丁式处理（见文末禁止项）。

## 0. 根因一句话

| 现象 | 触发 commit | 根因性质 |
|---|---|---|
| device「大 tab 应在最上」未满足 | `a78a980`（9-10 新增 `tab-structure-guard.js` 强制 `{nav,panels}`） | **层级拍平**（非方向误判）：planner 把 `slot-con` 子节点（switch 89:38 + @antd/tab 89:37 + cons）拍平成平级 section，switch 未横跨顶部。注：`89:37 @antd/tab` 真值 w=46/h=317 本就竖向，产物竖排**符合真值**，`inferTabOrientation` 为 fail-closed **不改** device 输出 |
| device 顶部插槽/标题识别错 | `aacfa51`（9-10 移除 `\btab\b` 匹配） | 修 A 漏 B：为拦内容区 tab 误进 header，连顶部 tab 行也丢了 |
| traffic 拆成 30+ 子组件 | `d5dc2be`（8-30 S3 多图表拆分） | 增强过度展开：S3 与 planner R1 正交叠加 |
| env `v-if`+`v-for` 同元素 | 9-02 门禁收紧（正确拦截） | 非退化，是旧缺陷显形 |

## 1. 治本 A：tab 横/竖方向判定（fail-closed 精度守卫，**非 device 竖排之因**）

> ⚠️ **重要更正（2026-09-10 14:0x，figma.json 真值核实）**：device 的 `89:37 @antd/tab` 真值 **w=46 / h=317，本就是竖向侧栏**；`89:38 switch` 才是横向（w=396 / h=64.8）。因此：
> - device 产物「tab 竖排」**符合 Figma 真值**，不是 A 要修的 bug；
> - 用户所说「大 tab 应该最上」实指 **`switch(89:38)` 应横跨组件最顶部**，其下才是「tabs 竖栏 + cons」——根因是 **planner 把 `slot-con(89:40)` 的子节点拍平成平级 section**（层级归属丢失），属**布局分析阶段**，见 §9 待治本项。
> - A 的真实价值：把「tab 契约是否套竖向 nav 语义」从**无脑强制**改为**按 bbox 宽高比判定**，且几何缺失时 fail-closed 回退竖向（与真值一致）。device 竖向场景走原路径、输出不变；对真正横向的 `@antd/tab` 才避免误套竖向契约。

**文件**：`src/ai-engine/roles/tab-structure-guard.js`
**函数**：`enforceTabStructure(section)` + 新增 `inferTabOrientation(section)`

**改法（已落地）**：
1. `isTabLike` 命中后，读 nav 子节点 `absoluteBoundingBox`（`visual-parser.js:453-468` 已确认该字段存在，无需另造）。
2. 取 nav 节点 bbox：`width > height * 1.5` → `'horizontal'`；否则 `'vertical'`；**无 bbox → fail-closed 回退 `'vertical'`**（保守，与 device 真值一致）。
3. `tabStructure` 增加 `orientation` 字段；`subcomponent-planner.js` plan() 消费：横向时 `effectiveType='tabs'`、职责描述「顶部横向 tab…禁止竖向侧栏布局」；竖向时保持 `{nav, panels}` 语义。

**验证（已落地）**：
- `tab-structure-guard.spec.ts`：宽扁 `@antd/tab` → `orientation:'horizontal'`；窄高 nav → `'vertical'`。**6/6 通过**。
- ⚠️ device 重跑后 tab 仍竖排是**正确的**（真值如此）；本条不改 device 输出。

## 1b. 治本 A′：slot-con 子节点层级保留（device「大 tab 应在最上」的真因，**待落地**）

> 本节为 §1 更正后确认的真实根因，**尚未实现**，列此以免遗漏。
> **2026-09-10 14:5x 代码级审计定案**（实证，非推测）。

**现象**：`switch(89:38)` 应与 `@antd/tab(89:37)`+cons 同属 `slot-con(89:40)` 容器，switch 横跨容器最上、tabs 竖栏在左。产物把三者拍成平级 section，switch 落进内容区顶、tabs 落左，空间归属错乱。

**真值（`.checkpoint/figma.json`）**：`slot-con(89:40)` 为绝对定位 FRAME（x1475 y475 w407 h380），2 子节点：`switch(89:38)` y475(顶部,396×65) 与 `@antd/tab(89:37)` y538(下方,46×317)。容器链 `2:8417 cp-设备监测 → 89:40 slot-con → {89:38, 89:37}`。

**⚠️ 真值二次取证（2026-09-10 12:59 checkpoint）推翻下方「plan() 不读 children」结论——务必先读：**

对 `c-device-monitor-hnhl49no-1003d7d3/.checkpoint/{figma.json,visual.json}` 严格取证后，下方「关键纠正」段落的前提**被证伪**：
- `visual.json` 的 `layoutStructure.layout.sections` 共 41 项，其中 **`89:40`(slot-con) 完全不存在**——既非顶层 section，也无任何 section 的 `children` 引用它（`children 里含 89:38/89:37 的 section: []`）。
- `89:38`(switch) 与 `89:37`(@antd/tab) 是**各自因内部子节点左右并列**（switch.active/default、tab.tabs/cons）被 `inline-row-merger.js` 提升为**顶层平级 inline-row section**（layoutSource='inline-row'，各带 children）。
- `89:40` 的两个直接子是**上下堆叠**（switch y475 h65；tab y538 h317；`yOverlap≈1.8`，远未达 merger 的 50% 阈值）→ 不满足 merger 的「左右并列」条件 → **容器层从未生成 section**。
- 结论反转：`plan()` 根本没有「带 children 的容器 section」可透传；`89:40` 容器层在**视觉分区阶段**就被丢弃，`plan()` 只是背锅。原 #52「planner 携带 sec.children」方案**无效**（input 里根本没有该容器）。

**真实根因**：device 的 `slot-con(89:40)` 容器层级在**视觉分区 / inline-row-merger 阶段**丢失——merger 只把「左右并列」的子节点提升为 section、把上下堆叠的容器父节点丢弃；下游 planner/engineer 拿到的是 `89:38`/`89:37` 两个平级 section，无从得知二者同属 `89:40` 且 **switch 在 tab 上方**的纵向归属 → LLM 把二者当平级区块重排（产物 `MainContent.vue` 把 tab 竖栏放最左、switch 放右区顶，而非 switch 横贯 slot-con 最顶部）。

**治本方向（待重新确权，原 #52 落点已不适用）**：
- **选项 A（上游保留容器）**：在 `inline-row-merger.js` / visual-parser 阶段，对「上下堆叠的直接子 + 自身非业务叶」的容器（如 slot-con）**保留为带 `children` 的嵌套 section**，而非丢弃父、仅提升子。改动面大、需视觉分区协同。
- **选项 B（planner 重建关系）**：`plan()` 同时持有 `figmaData`，对平级 section 按 figma 真值回查父容器与 bbox 纵向顺序，重建「switch 在 tab 上方、二者同属 slot-con」的归属提示注入 prompt。改动限于 planner，但依赖 figma 真值可达性。
- 两者都需 device 重跑（额度）验证；**均未实施**，原 #52 任务描述需按真实根因重定向。

**验证**：device 重跑后，生成产物布局满足「switch 横贯组件内容区最顶部、其下左侧 tab 竖栏 + 右侧 cons」，与 `figma.json` 89:40 子树（switch y475 顶、@antd/tab y538 左、cons y550 右）一致，而非当前「tab 最左、switch 右区顶」。

---

**🚫 以下为被推翻的原始审计段落（保留作考古，勿按此实施）**：

**关键纠正（与最初假设相反，已证伪）**：层级**并非**在 `inline-row-merger` 或 `visual-parser` 丢失——
- ~~`inline-row-merger.js` 把 `slot-con` 的两个子节点（`89:38`/`89:37`）生成为**带 `children` 的 section**……~~（实测 `89:40` 根本没进 sections，谈不上「带 children 的容器 section」）
- ~~真因在 **`subcomponent-planner.js:740` 的 `plan()`**……~~（`plan()` 没收到 `89:40`，无法背锅）
- ~~下游按 flat `effectiveSections`……~~

~~**文件**：`src/ai-engine/roles/subcomponent-planner.js`（`plan()` L740 `sections.map`）~~
~~**治本方向（非改产物）**：`plan()` 在映射时携带 `sec.children` 进 `effectiveSections[i].children`……（无效，input 无容器）~~
~~**验证**：device 重跑后 `subComponentPlan.effectiveSections` 中含 `slot-con(89:40)` 容器项……（前提不成立）~~

## 2. 治本 B：顶部 tab 行豁免进 headerSlots（修设备小类插槽丢失，已落地）

**文件**：`src/ai-engine/utils/inline-header-slot-inferrer.js`
**函数**：`inferHeaderSlotsFromInlineRows(analysisResult)`

**改法**（针对 `aacfa51` 的过度移除）：
- 当前 `isTitleBarRow` 把 `@antd/tab` 整段排除（因为删了 `\btab\b`）。
- 细分为两条规则：
  1. 内容区 tab（位于 body 中部、非顶部行）→ 仍排除（保留 `aacfa51` 的修 A 意图）。
  2. **顶部 tab 行**（行名以 `@antd/tab` / `tab` 开头且 `y` 坐标位于组件顶部 15% 区）→ 作为 `header-right` 插槽候选保留，但 `elementType` 标记为 `tab`，且 `slotType` 用 `header-tabs` 而非 `header-right`（避免与统计项混同）。
- 几何依据：行节点 bbox `y` + `height`，顶部判定阈值 = `y < 0.15 * rootHeight`。
- 同时修正 `mergeHeaderSlots`（`:117`）：对 `slotType==='header-tabs'` 与 `header-right` 不互斥合并，但与内容区重复 dom 仍按 `boxesIntersect` 过滤。

**验证**：
- `inline-header-slot-inferrer.spec.ts`：顶部 `@antd/tab` 行 → 产出 1 个 `header-tabs` slot；中部 `@antd/tab` 行 → 不产出。
- device 重跑后 `headerSlots` 含顶部 tab 条；标题不再被识别成"环境监测"。

## 3. 治本 D：S3 与 planner 内部拆分互斥（修 traffic 过细）

**文件**：`src/ai-engine/roles/subcomponent-planner.js`（R1）+ `src/ai-engine/graphs/mc-component-graph-phase2.js`（S3 接入点 `:2978`）

**改法**：
- 根因：S3（`splitMultiChartSectionIntoChunks`）消费 planner R1 已拆出的 `chart-component`，再包一层 chunk → 双重裂开。
- 互斥规则二选一（推荐前者，改动最小）：
  - **方案 D1（graph 层互斥）**：`mc-component-graph-phase2.js:2978` 在调用 S3 前，先读 `finalPlan.effectiveSections` 的 `shouldSplitInternally`；若某 section 已被 planner 内部拆分（R1 命中），**跳过 S3 对其二次拆分**，直接采用 planner 的 `internalSubcomponents`。
  - **方案 D2（planner 层互斥）**：planner 检测到 `enableInternalSplit` 且 R1 命中后，对该 section 标记 `s3Handled:true`，graph 层 S3 见 `s3Handled` 即跳过。
- 无论 D1/D2，都必须保证：**一个 section 的图表只被拆一次**（要么 planner R1，要么 S3，不叠加）。

**验证**：
- `subcomponent-planner-p2.spec.ts` 增加用例：3 图表 section → 产物 chart chunk 数 == 图表数（不翻倍）。
- traffic 重跑后 `package/components/` 子组件数回落到合理范围（按 Figma 真实图表数，而非 X轴/柱体/图例各自成件）。

## 4. 治本 E：v-if 与 v-for 同元素 fail-closed（修 env 运行时崩）

**文件**：`src/ai-engine/roles/microcode/code-healer.js`（骨架）+ `src/ai-engine/validators/code-fix-rules.js`（门禁）

**改法**：
1. `code-healer.js` 的 `buildTabBarSkeleton`（`:1325`）已生成合法 v-for 主导骨架，需新增 `stripVIfOnVFor(elementStr)`：扫描模板，若某元素**同时**含 `v-for` 和 `v-if`，把 `v-if` 提升为外层 `<template v-if>` 或改写为 `v-show`/`computed` 过滤，禁止同元素共存。
   - 注意：`SubT.vue:8` 是 `<div v-if="activeTab===tab.value" v-for="tab in tabList">` —— 正确修法是拆成 `<template v-for="tab in tabList" :key><div v-if="...">` 或改用 `filteredTabs` computed。
2. `code-fix-rules.js` 新增规则 `VUE-VIF-VFOR-001`：正则 `/<[^>]+\bv-for\b[^>]*\bv-if\b|<[^>]+\bv-if\b[^>]*\bv-for\b/` 命中即 fail-closed，L0-B 阶段拦截，不进入 runtime 门禁才暴露。

**验证**：
- `code-healer` 单测：注入 `<div v-if x v-for y>` → 输出不含同元素 v-if+v-for。
- env 重跑：`SubT.vue` 不再出现同元素冲突，runtime 门禁 `RUNTIME-004` 不触发。

## 5. 治本 C：设备小类背景图（经真值核实，判定为「非 bug，不改动」）

**实测核实（2026-09-10 13:45，`c-device-monitor-hnhl49no-1003d7d3` 的 `figma.json` + `analysis.json`）**：
- device 的 12 个 bg 节点在真值侧即 `deduplicated`（`figma-connector.js:2191` `matchedAsset.deduplicatedFrom` → 复用同一真身 `bg-8439`）。即 **Figma 设计稿本就 12 个 item 共用 1 张背景图**，资源链是**正确且诚实**的。
- `resource-manifest.js:247/268/293` 的 `buildVarToMapping` **只收 `downloadStatus==='success'`**（见 memory「downloadStatus 契约」），deduplicated 节点不各自独立注入——符合契约。
- `ConsSection.vue` 的 `bgList = [bg3, bg4, ...]` 里 `bg4~bg13` 未声明、`getItemBg` fallback 到 `bg3`，属于 **LLM 在生成时臆造了不存在的变量名**（模型缺陷，非资源链 bug）。真值侧只应注入 1 个 bg 变量（bg3），行为与真值一致。

**结论**：C 原方案（connector 重试 + 诚实契约）**与事实不符，撤回**——资源链无需改动。唯一真实瑕疵是 LLM 臆造 `bg4~bg14` 变量名，属治本 E 之外的模型语义问题，靠 F2 的 prompt 约束 + 门禁兜底即可（见 5b-F2），不单独改 connector。

**仍建议（非阻塞、可后续独立做）**：`figma-connector` 的 bg 下载失败（非 deduplicated 而是真 network_error）已有重试与 `downloadStatus='network_error'` 如实回写（`:2200`），契约已诚实，无需额外改动。

## 5b. 治本 F：设备小类样式/数据小瑕疵（漏项补全）

**F1 字体 `calc` 默认值双写**（`ConsSection.vue:127`）
- 现状：`font-size: calc(var(--fontSize, var(--fontSize)) * 0.857)` —— 默认值重复写两遍，`var(--fontSize, var(--fontSize))` 无意义（第二个是第一个的 fallback，永远命中第一个）。
- 改法：`microcode-engineer` 的样式生成 prompt / `style-class-consolidator` 增加铁律「`calc(var(--x, DEF) * n)` 的默认值 DEF 只能写一次，禁止 `var(--x, var(--x))` 自引用兜底」；`code-fix-rules.js` 加 `CSS-CALC-SELFREF-001` 正则 `/\bvar\((--[\w-]+),\s*var\(\1\)\)/` 命中即 fail-closed。
- 验证：ConsSection 重跑后 `font-size: calc(var(--fontSize, 14px) * 0.857)`。

**F2 异常数/总数拆成字符串**（`ConsSection.vue:60-72`）
- 现状：`deviceItems` 用 `anomalyCount:'2'` + `totalSuffix:'/484'` 两个字段拼出「2/484」，是模型把 Figma 数字硬拆字符串的语义缺陷（TEXT-001 同类）。
- 改法：`microcode-engineer` 注入数据时，对「数字+单位/分母」结构用**数值字段** `{ anomaly: 2, total: 484 }`，模板里 `{{ item.anomaly }}/{{ item.total }}` 渲染；`validateVueScriptSemantics` 增加「统计类字段不得为纯字符串拼接」的软提示，或 `code-fix-rules` 加 `DATA-NUMERIC-001` 校验。
- 验证：device 重跑后 `deviceItems` 为数值字段，模板无 `'/484'` 字面值。

## 6. 实施顺序（对齐 Loop 锁序，已落地部分）

1. ~~A（tab 方向判定）→ 先解 device 竖排~~ → **A 经真值核实为 fail-closed 精度守卫，不修 device 输出**（见 §1 更正）；A 代码已落地，对真横向 tab 生效。
2. B（顶部 tab 行豁免）→ 已落地，解设备小类顶部插槽丢失（依赖 A 的 orientation 字段）。
3. C（bg 资源链重试 + 诚实契约）→ **经真值核实撤回**：deduplicated 资源链诚实正确，bg4~bg13 是 LLM 臆造变量名（非资源链 bug）。不改动 connector。
4. D（S3 互斥）→ 已落地，解 traffic 过细。
5. E（v-if/v-for fail-closed）→ 已落地，解 env 运行时崩。
6. F1/F2（calc 双写 + 数值字段）→ 已落地，解 device 小类样式/数据瑕疵。
7. 待落地：**A′（slot-con 层级保留）**——device「大 tab 应在最上」的真实根因（层级拍平），属布局分析阶段，需独立立项。
8. 每项落地后：jest 单测 → `npm run build` → `env -i node start-node.js` 重启 13030 → 重跑三样本肉眼验收（本轮因额度未擅自重跑）。

## 7. 禁止的补丁式处理（完成标准红线）

- 在 `MainContent.vue` 里把 `writing-mode:vertical-rl` 删掉 / 改成 `horizontal-tb` 假装修复（应改 planner 契约）。
- 手动给 device 顶部加一个 `headerSlots` 写死的 tab（应改推断器）。
- 在 traffic 产物里删子组件、把 30+ 文件手工合并（应改 S3/planner 互斥）。
- 在 `SubT.vue` 手工去掉 `v-if` 让页面不崩（应改 healer 骨架 + 门禁）。
- 给 bg 失败节点硬编码 CSS 背景图（应改资源下载链重试 + 诚实契约）。
- 在 `ConsSection.vue` 手工把 `bg4~bg13` 补成 `bg3` 假装 12 张齐了（应改 connector 重试 + 不臆造变量）。
- 把 `calc(var(--fontSize, var(--fontSize)))` 直接改成 `calc(var(--fontSize) * 0.857)` 删默认值（应保留合理回退默认值、去掉自引用双写）。

## 8. 当前状态

- **A（fail-closed 守卫，已落地）/ B / D / E / F1 / F2（已落地）**：代码已改 + 单测 9/9 + 6/6 通过 + 三样本未重跑（额度待授权）。
- **C 经真值核实撤回**（deduplicated 资源链诚实正确，bg4~bg13 为 LLM 臆造变量名，非资源链 bug，不改动 connector）。
- **A′（slot-con 层级保留）待落地**：device「大 tab 应在最上」的真实根因（planner 把容器子节点拍平为平级 section），属布局分析阶段，需独立立项。
- 关联文档：`traffic-device-monitor-root-cause-2026-09-10.md`（资源/结构/尺寸根因）、`pipeline-governance-v2-2026-09-10.md`（Loop 锁序）。

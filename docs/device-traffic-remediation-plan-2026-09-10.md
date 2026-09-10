# 三样本反复故障治本方案（2026-09-10）

日期：2026-09-10
样本：env `mc-max-1789016564341-14f3e113`、traffic `mc-max-1789016570637-fb959208`、device `mc-1789015934816-1003d7d3`
依据：`subcomponent-planner.js` / `tab-structure-guard.js` / `inline-header-slot-inferrer.js` / `code-healer.js` / `mc-component-graph-phase2.js` 源码实证 + git 考古（`a78a980` / `aacfa51` / `d5dc2be` / `6b1d874`）。

> 本文是**可落地修复清单**，每项标注：文件·函数·改法·验证。拒绝补丁式处理（见文末禁止项）。

## 0. 根因一句话

| 现象 | 触发 commit | 根因性质 |
|---|---|---|
| device 大 tab 竖排到左下 | `a78a980`（9-10 新增 `tab-structure-guard.js`） | 规则过度泛化：把横向 `@antd/tab` 误判为竖向 nav |
| device 顶部插槽/标题识别错 | `aacfa51`（9-10 移除 `\btab\b` 匹配） | 修 A 漏 B：为拦内容区 tab 误进 header，连顶部 tab 行也丢了 |
| traffic 拆成 30+ 子组件 | `d5dc2be`（8-30 S3 多图表拆分） | 增强过度展开：S3 与 planner R1 正交叠加 |
| env `v-if`+`v-for` 同元素 | 9-02 门禁收紧（正确拦截） | 非退化，是旧缺陷显形 |

## 1. 治本 A：tab 横/竖方向判定（修 device 竖排）

**文件**：`src/ai-engine/roles/tab-structure-guard.js`
**函数**：`enforceTabStructure(section)` + 新增 `inferTabOrientation(section)`

**改法**：
1. 在 `isTabLike` 命中后，读取 `section.body.children` 各子节点 `absoluteBoundingBox`（`visual-parser` 已确认该字段存在，无需另造）。
2. 取 nav 子节点（已用 `isNavNode` 找到的 `navNode`）与其相邻 panel 子节点的 bbox：
   - 若 nav 节点宽度 `> 高度 * 1.5` → **横向顶部 tab**（device 的 `@antd/tab(89:37)` 即此）——不应套竖向 nav 契约。
   - 否则 → 竖向侧栏 nav（保持原 `{nav, panels}` 二元结构）。
3. 横向 tab 的 `tabStructure` 改为 `{ orientation: 'horizontal', nav: {present:true, figmaNode}, panels: [...] }`，**不**走 `nav` 竖向语义；planner 的 `TYPE_RESPONSIBILITY['nav']` 仅在竖向时生效。
4. `subcomponent-planner.js:772-793` 处：消费 `tabStructure.orientation`，横向时把该 section 当普通 `tabs` 区块（横向 tab 条 + 下方内容），不再注入竖向 `nav` 职责描述。

**验证**：
- 新增 `tab-structure-guard.spec.ts`：`@antd/tab` 宽>高1.5 → `orientation:'horizontal'`；窄高 nav → `orientation:'vertical'`。
- device 重跑后 `MainContent.vue` 的 tab 栏回到顶部横向，不再 `width:46px; writing-mode:vertical-rl`。

## 2. 治本 B：顶部 tab 行豁免进 headerSlots（修 device 插槽丢失）

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

## 5. 治本 C：bg 节点下载失败 → 设备小类背景图塌缩（资源链函数级）

**文件**：`src/ai-engine/roles/figma-connector.js`（下载链）+ `src/ai-engine/utils/resource-manifest.js`（资源事实源）+ `microcode-engineer.js`（注入兜底）

**现象（device 实测）**：`ConsSection.vue` 的 `bgList = [bg3, bg4, ... bg14]`，但只有 `bg3` 真正 `import bg3 from 'bg-8439.png'`，`bg4~bg13` 未声明 → `getItemBg(i>=1)` 全部 fallback 到 `bg3`；`MainContent.vue` 同样 `bg4~bg13 = bg3`。结果 **12 个设备小类全部共用同一张 `bg-8439`**，崩成 1 张背景。

**根因（两处叠加）**：
1. **真值侧**：`visualElements.background="bg节点下载失败，使用CSS纯色替代"` —— 12 个 bg 节点只有 `bg-8439` 成功下载，其余在 `figma-connector` 下载阶段失败且**被静默回退**，未记录哪些节点缺失、也未重试。
2. **注入侧**：`resource-manifest.js` 只把"成功下载"的 bg 注入为系统变量；失败节点既不进 `downloadStatus`，也不在 `declare.json`/`props` 暴露占位，导致 LLM 在生成时**臆造了 bg4~bg14 变量名**（引用不存在的 image，运行时塌缩到 bg3）。

**改法（函数级，治本）**：
1. `figma-connector.js` 下载 bg/image 节点处，新增 `downloadWithRetry(node, { retries: 2, backoffMs: 300 })`：失败重试 2 次；仍失败则记入 `failedNodes[]`，**不静默回退**。
2. `resource-manifest.js` 在构建资源事实源时，对 `failedNodes` 每个节点生成 **fallbackHint**（从 mapping/fallback 提示取同组替代图，或明确标记 `missing`）；`downloadStatus` 如实回写 `success/failed/missing`，**禁止把失败当成 success 灌入白名单**。
3. `microcode-engineer.js` 注入系统资源变量时，仅注入 `downloadStatus==='success'` 的图；对 `missing` 的 bg 节点**不臆造变量名**，改为在 contract 里标注 `placeholder: true`，让 LLM 用 `v-if="bgX"` 条件渲染、缺图时不绑定背景（而非引用不存在的 `bg4`）。
4. 真值侧 12 个设备小类**本就共用同一张背景设计**（Figma 里 bg 节点可能为 1 个复用），需先用 `failedNodes[]` 确认是否真的 12 张都缺失；若真值就是 1 张复用，则 C 改法只保证"契约诚实"，不强行伪造 12 张。

**验证**：
- `figma-connector` 单测：模拟 bg 节点第 1 次失败、第 2 次成功 → `failedNodes` 不含该节点；连续失败 → 入 `failedNodes` 且 `downloadStatus:'failed'`（非 success）。
- device 重跑后 `declare.json.resources` 与实际 `resources/images/*.png` 文件数一致；`ConsSection.vue` 的 `bgList` 只含真实存在的变量，无 `bg4~bg13` 臆造引用。

## 5b. 治本 F：设备小类样式/数据小瑕疵（漏项补全）

**F1 字体 `calc` 默认值双写**（`ConsSection.vue:127`）
- 现状：`font-size: calc(var(--fontSize, var(--fontSize)) * 0.857)` —— 默认值重复写两遍，`var(--fontSize, var(--fontSize))` 无意义（第二个是第一个的 fallback，永远命中第一个）。
- 改法：`microcode-engineer` 的样式生成 prompt / `style-class-consolidator` 增加铁律「`calc(var(--x, DEF) * n)` 的默认值 DEF 只能写一次，禁止 `var(--x, var(--x))` 自引用兜底」；`code-fix-rules.js` 加 `CSS-CALC-SELFREF-001` 正则 `/\bvar\((--[\w-]+),\s*var\(\1\)\)/` 命中即 fail-closed。
- 验证：ConsSection 重跑后 `font-size: calc(var(--fontSize, 14px) * 0.857)`。

**F2 异常数/总数拆成字符串**（`ConsSection.vue:60-72`）
- 现状：`deviceItems` 用 `anomalyCount:'2'` + `totalSuffix:'/484'` 两个字段拼出「2/484」，是模型把 Figma 数字硬拆字符串的语义缺陷（TEXT-001 同类）。
- 改法：`microcode-engineer` 注入数据时，对「数字+单位/分母」结构用**数值字段** `{ anomaly: 2, total: 484 }`，模板里 `{{ item.anomaly }}/{{ item.total }}` 渲染；`validateVueScriptSemantics` 增加「统计类字段不得为纯字符串拼接」的软提示，或 `code-fix-rules` 加 `DATA-NUMERIC-001` 校验。
- 验证：device 重跑后 `deviceItems` 为数值字段，模板无 `'/484'` 字面值。

## 6. 实施顺序（对齐 Loop 锁序）

1. A（tab 方向判定）→ 先解 device 竖排。
2. B（顶部 tab 行豁免）→ 解 device 插槽丢失，依赖 A 的 orientation 字段。
3. C（bg 资源链重试 + 诚实契约）→ 解设备小类背景塌缩（含 F1/F2 同轮落地）。
4. D（S3 互斥）→ 解 traffic 过细。
5. E（v-if/v-for fail-closed）→ 解 env 运行时崩。
6. 每项落地后：jest 单测 → `npm run build` → `env -i node start-node.js` 重启 13030 → 重跑三样本肉眼验收。

## 7. 禁止的补丁式处理（完成标准红线）

- 在 `MainContent.vue` 里把 `writing-mode:vertical-rl` 删掉 / 改成 `horizontal-tb` 假装修复（应改 planner 契约）。
- 手动给 device 顶部加一个 `headerSlots` 写死的 tab（应改推断器）。
- 在 traffic 产物里删子组件、把 30+ 文件手工合并（应改 S3/planner 互斥）。
- 在 `SubT.vue` 手工去掉 `v-if` 让页面不崩（应改 healer 骨架 + 门禁）。
- 给 bg 失败节点硬编码 CSS 背景图（应改资源下载链重试 + 诚实契约）。
- 在 `ConsSection.vue` 手工把 `bg4~bg13` 补成 `bg3` 假装 12 张齐了（应改 connector 重试 + 不臆造变量）。
- 把 `calc(var(--fontSize, var(--fontSize)))` 直接改成 `calc(var(--fontSize) * 0.857)` 删默认值（应保留合理回退默认值、去掉自引用双写）。

## 8. 当前状态

- 本文为函数级治本方案，尚未改任何源码。
- 待用户拍板 A/B/C/D/E/F 落地顺序后执行（C 已展开为函数级；F1/F2 为补全漏项）。
- 关联文档：`traffic-device-monitor-root-cause-2026-09-10.md`（资源/结构/尺寸根因）、`pipeline-governance-v2-2026-09-10.md`（Loop 锁序）。

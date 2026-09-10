/**
 * Vue3 Prompt 构建模块（从 vue3-engineer.js 拆分，2026-08-30）
 *
 * 职责：Vue3 组件的 prompt 构建与分块 middle 生成
 * - buildVue3CodePrompt：完整代码生成 prompt（面板头部/背景真实还原路径）
 * - buildVue3TrustGuidance：上下文裁决约束文本
 * - buildVue3*Middle：整文件 / template / script / style 四类分块 middle
 *
 * 纯函数导出 + options 依赖注入模式（this → options）：
 *   buildVue3CodePrompt(input, chunkSpec, { resolveSubComponentPlan, vue3Specs })
 */

import { formatFigmaStyleData } from '../../utils/figma-format.js';
import { formatResourceMapping } from '../../utils/resource-mapping-formatter.js';
import {
  collectLeafSections,
  formatSectionTreeForPrompt,
} from '../../utils/section-tree.js';

/**
 * 构建上下文裁决约束文本（与 microcode-engineer 对齐）。
 * 从 generationInput 提取 trustVerdict/currentIssues/designFacts，生成 prompt 约束段落。
 */
export function buildVue3TrustGuidance(generationInput) {
    if (!generationInput || generationInput.schemaVersion < 1) return '';
    const lines = [];
    const restrictions = generationInput.trustVerdict?.restrictions || [];
    if (restrictions.includes('no-unsupported-decoration'))
      lines.push('- 禁止生成无 Figma 证据支撑的装饰元素');
    if (restrictions.includes('no-style-fallback'))
      lines.push(
        '- 禁止使用合成 fallback 样式（主题变量必须以 Figma 真值为准）',
      );
    if (restrictions.includes('resolve-legend-owner'))
      lines.push(
        '- 必须明确每个图表图例的归属（DOM 容器 或 echarts 内建），禁止悬空图例',
      );

    const actionMap = {
      'do-not-generate-root-background':
        '- 根背景与 Figma 填充证据冲突，**禁止生成根容器背景**',
      'ignore-review-as-design-fact':
        '- 布局审查结果已降级，不得将其当作设计事实照搬',
      'exclude-fallback-style-facts':
        '- 排除 Style Mapper 的合成 fallback 样式事实',
      'choose-dom-or-echarts-owner': '- 为图表图例选择归属（DOM 或 echarts）',
    };
    for (const issue of generationInput.currentIssues || []) {
      const line = issue?.expectedAction
        ? actionMap[issue.expectedAction]
        : null;
      if (line && !lines.includes(line)) lines.push(line);
    }

    const styleEvidence = generationInput?.designFacts?.root?.styleEvidence;
    if (styleEvidence && typeof styleEvidence === 'object') {
      const forbidden = [];
      if (styleEvidence.background?.allowed === false)
        forbidden.push('背景色/背景图/渐变（figma-api 确认根容器无填充）');
      if (styleEvidence.border?.allowed === false)
        forbidden.push('边框 border（figma-api 确认根容器无描边）');
      if (styleEvidence.borderRadius?.allowed === false)
        forbidden.push('圆角 border-radius（figma-api 确认根容器无圆角）');
      if (styleEvidence.boxShadow?.allowed === false)
        forbidden.push('阴影 box-shadow（figma-api 确认根容器无阴影）');
      if (forbidden.length > 0) {
        lines.push(
          `- 🚫 根容器（.c-mc-max-* 根类及其直接作用域）**严禁**使用以下装饰，因其 Figma 真值不存在：${forbidden.join('、')}。` +
            ' 若违反，L0-B 门禁（CODE-014）将直接判失败并要求重生成，不允许以「美观」为由臆造。',
        );
      }
    }

    if (lines.length === 0) return '';
    const level = generationInput.trustVerdict?.level || 'trusted';
    return (
      `\n\n# ⚠️ 上下文裁决约束（可信度：${level}，必须遵守）\n\n` +
      lines.join('\n') +
      '\n'
    );
}

/**
 * Vue3 完整代码生成 prompt（自包含，不引用微码规范）
 * chunkSpec.middle 由各分块 middle builder 提供「任务要求 + 输出格式」段落
 * @param {object} input - 生成输入
 * @param {object} chunkSpec - 分块规格
 * @param {object} options - { resolveSubComponentPlan, vue3Specs }（this 依赖注入）
 */
export function buildVue3CodePrompt(input, chunkSpec, options = {}) {
    const {
      layoutStructure,
      visualElements,
      componentName,
      previousCritiques,
      charts,
      interactions,
      figmaNodeData,
      figmaStyleTree,
      styleMappings,
      assets,
      headerSlots,
      elementStyleMap,
      backgroundBrightness = 'dark',
      resourceDomMapping,
    } = input;

    if (!componentName || typeof componentName !== 'string') {
      throw new Error(`Invalid componentName: ${typeof componentName}`);
    }

    const isRevision = previousCritiques && previousCritiques.length > 0;

    // 强制子组件清单（来自结构规划阶段 subcomponent-planner）—— 统一由 resolveSubComponentPlan 解析
    const {
      subPlan,
      effectiveSections,
      requiredSubComps,
      internalSubcomponents,
    } = options.resolveSubComponentPlan(input);
    const leafSections = collectLeafSections(effectiveSections);

    // vue3 规范注入（截断防止 prompt 过大）
    const spec = (key, max) => {
      const content = options.vue3Specs[`references/vue3/${key}`] || '';
      return content.length > max
        ? content.slice(0, max) + '\n...(截断)'
        : content;
    };

    // 🛡️ 上下文裁决约束（与 microcode-engineer 对齐：trustVerdict/currentIssues/styleEvidence）
    const trustGuidance = buildVue3TrustGuidance(input.generationInput);

    let prompt = `你是专业的 Vue3 前端工程师，负责把 Figma 设计稿还原为一个**标准 Vue3 组件（主组件 + 子组件 + 共享 less）**。${trustGuidance}

# 🎯 产物形态（与微码组件的本质区别，必须遵守）

1. 输出**标准 Vue3 组件包**：主组件 \`package/index.vue\` + 子组件 \`package/components/*.vue\`（按功能拆分：头部、卡片、图表卡、列表项等）+ 根共享样式 \`resources/styles/{index,common,theme-vars}.less\`。
2. 每个 \`.vue\` 文件三段齐全：\`<template>\` + \`<script setup>\`（**JavaScript，非 TS**）+ \`<style lang="less" scoped">\`。
3. **禁止**出现以下微码运行时体系内容（出现即为严重错误）：
   - \`<base-panel>\` / \`panelKey\` / 具名插槽 \`#title-left\` / \`#title-right\` / \`#header-right\`
   - \`$mcComponentBuilder\` / \`runtimeBuilder\` / \`$createMcDeclare\`
   - \`declare.json\` / \`component.js\`
4. **LESS 与样式隔离（强制）**：
   - 每个 \`.vue\` 的样式写在 \`<style lang="less" scoped">\` 内，**必须**通过 \`@import\` 引入共享 less。
   - ⚠️ **@import 路径规则**：产物保持 \`package/\` 与根 \`resources/\` 两个目录，所以主组件 \`package/index.vue\` 必须写 \`@import '../resources/styles/index.less';\`；子组件 \`package/components/*.vue\` 必须写 \`@import '../../resources/styles/index.less';\`。禁止按扁平目录使用 \`./resources/\` 或 \`../resources/\`。
   - \`resources/styles/theme-vars.less\`：**仅定义变量与 mixin（不产出实际 class）**，被各组件 @import 共享主题 token；必须定义三个 mixin \`.common()\` / \`.theme-dark()\` / \`.theme-light()\`。
   - ⚠️ **主题 token 一律用 less 变量 \`@xxx\`（编译期替换），禁止用运行时 CSS 变量 \`var(--xxx)\`**。原因：这些 less 经 \`<style scoped>\` 的 \`@import\` 引入后，\`:root { --xxx }\` 会被编译成 \`:root[data-v-hash]\`，而 html 元素不在组件模板内、没有 data-v 属性 → 变量永不生效，导致标题渐变文字透明消失、tab 文字颜色回退。正确写法：\`@color-primary: #1890ff;\`（顶层 less 变量），\`common.less\` 里用 \`color: @color-primary;\` 引用；\`<style>\` 内也直接写 \`@color-primary\` 或字面量，**严禁 \`var(--color-primary)\`**。三个 mixin \`.common()\` / \`.theme-dark()\` / \`.theme-light()\` 保留为空占位即可（末尾调用 \`.theme-light();\` 兼容既有结构）。
   - \`resources/styles/common.less\`：组件内共享的业务 class（**按功能语义命名**，如 \`.vehicle-card\` / \`.chart-header\` / \`.stat-panel\`，**禁止用组件 ID 作前缀**），主组件与子组件按需 @import。
   - \`resources/styles/index.less\`：\`@import './theme-vars.less';\` + \`@import './common.less';\`。
   - 样式隔离靠 Vue 的 \`scoped\` 实现，每个组件样式互不污染；**禁止**写全局/裸 class 污染其它组件。
   - **禁止依赖宿主 Tailwind / Inspira**：禁止使用 Tailwind utility class、\`@apply\`、\`@tailwind\`、\`@layer\`，禁止导入 \`tailwindcss\`、\`tw-animate-css\`、\`@inspira-ui/plugins\`。所有布局和视觉样式必须在组件自己的 less 中完整定义。

#  面板头部与背景【必须真实还原】（核心差异）

微码流程会忽略面板背景与标题栏（由宿主面板提供）；**本任务相反**——它们必须渲染为真实 DOM/CSS：

- **外层背景**：若 \`layoutStructure\`、\`visualElements\`、\`resourceDomMapping\` 或 Figma 资源提示表明根面板存在背景（背景图/纯色/渐变），必须在根容器 class 上直接落地真实 CSS。
  背景图必须精确还原 \`background-size / background-position / background-repeat\`（禁止无脑 cover/center/no-repeat）；纯色/渐变用 \`background\`。
- **禁止把根背景降级成主题变量链路**：根容器的关键可见背景、边框、阴影、圆角必须直接写成 Figma 对应值，禁止写成 \`background: var(--color-bg)\`、\`background: var(--colorBg)\`、\`background: transparent\`、\`background: inherit\` 这类间接或失真写法。
- \`theme-vars.less\` 只用于共享 token（文本色、辅助色、spacing 等），不要把根面板是否可见这件事交给 \`:root\` / CSS 自定义属性兜底。
- **标题栏**：渲染真实 \`<div class="xxx-header">\`，包含标题文本、副标题、更新时间、单位等。
- **标题栏右侧控件**：Tab 切换、统计指标、图标按钮等渲染为真实 DOM，位置与 Figma 一致。
- **headerSlots 数据**（下方提供）中的 title-left / title-right / header-right 元素必须渲染为真实 DOM，**不要忽略**。
- 承载背景的容器按需 \`overflow: hidden\`。
- 面板整体尺寸、内边距、圆角、边框、阴影都取自 Figma 数据。

> ⚠️ **根容器零添加铁律**：预览图里没有的样式，绝对禁止自行添加。
> - ❌ 禁止给根容器加预览图中不存在的 \`background\` 纯色（如 \`#0b0f11\`、\`#1a1a1a\`）
> - ❌ 禁止给根容器加预览图中不存在的 \`padding\`（如 \`8px 14px\`）
> - ❌ 禁止给根容器加预览图中不存在的 \`border-radius\` / \`box-shadow\`
> - ✅ 只有 \`layoutStructure\` / \`elementStyleMap\` / Figma 资源**明确标注**的背景/内边距/圆角/阴影才还原，其余一律不加

# 📊 图表与面板 UI 还原红线（6 类高频缺陷，强制）

生成图表/面板类组件（流量监测、关键车辆统计等）必须逐条满足，缺一则效果图不合格：

1. **背景图精确还原（bg-size）**：Figma 节点带背景图时，用真实 CSS 还原 \`background-size / background-position / background-repeat\`，**禁止无脑 cover/center/no-repeat**；Figma 标注具体尺寸/位置则逐值对应。
2. **环形图环厚（radius）**：ECharts 环形图必须用 \`radius: [内, 外]\` 数组精确控制环厚（如 \`['55%','75%']\`），**禁止默认 \`radius:'50%'\` 过细或单值失真**；环厚按 Figma 视觉比例设定。
3. **边框生成（border）**：Figma 标注 stroke 的面板/卡片/分区**必须**生成 \`border: <width>px solid <color>\`（圆角对应 \`border-radius\`），**禁止只设背景色漏边框**。
4. **图例位置（legend.position）**：\`legend\` 的 top/bottom/left/right 必须对齐 Figma 图例实际方位，禁止默认堆顶部；多图共享图例时位置一致。
5. **图例存在性（legend 必生成）**：Figma 有图例则**必须**生成对应 \`legend\` 配置，禁止只画 series 不画 legend（导致无法区分数据系列）。
6. **交通预测/趋势卡片（区块还原）**：设计含"交通预测/趋势/预警"等卡片区块时，必须还原为真实 DOM（数值+单位+环比/趋势箭头/状态色），**禁止整块遗漏或用占位文本**。

# 🧩 通用强制约束（与微码共用红线，必须）

以下红线与微码组件完全一致，违反即视为还原失败：

1. **echarts 坐标轴刻度/标签必须渲染**：\`yAxis\`/\`xAxis\` 的 \`axisLabel\`/\`axisTick\` 必须 \`show:true\`；刻度数值/类目/单位（如 Y 轴 40/30/20/10/0、X 轴时间刻度与单位"时"）从 Figma 文本提取真实值写入，禁止空 \`data:[]\` 与无刻度空轴。
2. **禁止臆造交互控件**：Figma 节点树中不存在的 \`<select>\`/\`<input>\`/UI 库下拉（默认项"使用默认/监测类型/请选择"）禁止生成；缺失数据用静态文本/布局呈现，不得套可交互壳。
3. **分段/标签形态对齐 Figma**：设计是箭头连接连续标签 → 相邻共享边框（\`border-right:none\` + 负 margin）；设计是独立圆角矩形才各自 \`border-radius\`；禁止一律渲染成孤立圆角矩形。
4. **渐变背景与统计卡还原**：Figma 填充是 \`linear-gradient\` 必须生成 \`background: linear-gradient(...)\`（禁止降级纯灰）；统计卡（设备总数/完好率等）标签+数值从 Figma 提取并真实绑定，禁止整块缺失。
5. **图标/实景图/关闭X 不得丢弃**：资源映射提供的 icon 必须用 \`<img :src>\` 渲染；关闭按钮/实景照片/Figma 存在且资源已提供的元素必须真实呈现，禁止当噪声丢弃或挪用其他图标。

# 📊 图表布局与 echarts 初始化强制规范（违反则质量门禁阻断）

生成含 echarts 图表的组件必须遵守以下三条铁律，否则 CODE-011/CODE-012 会阻断：

1. **容器布局链贯通**：
   - chart 容器父链必须全部 \`height: 100%\` + \`display: flex; flex-direction: column;\`
   - chart 容器本身 \`flex: 1; min-height: 0;\`（**min-height: 0 是关键**，让 flex 自然拉伸）
   - chart 元素 \`width: 100%; height: 100%;\`
   - **严禁** chart 容器设置 \`min-height: 300px\` 等固定像素兜底（会反向挤压 tab/header）

2. **echarts 初始化时序**：
   - onMounted 中**必须先 await nextTick() 再 requestAnimationFrame(() => init)**
   - 禁止同步 \`echarts.init(chartRef.value)\`（flex 百分比高度未 settle，canvas 会定格在小尺寸）

   ✅ 正确：
   \`\`\`js
   onMounted(async () => {
     await nextTick()
     requestAnimationFrame(() => {
       if (chartRef.value) {
         chartInstance = echarts.init(chartRef.value)
         chartInstance.setOption(option)
       }
     })
   })
   \`\`\`

   ❌ 错误：
   \`\`\`js
   onMounted(() => {
     chartInstance = echarts.init(chartRef.value)  // 同步 init，不等待 layout settle
     chartInstance.setOption(option)
   })
   \`\`\`

3. **resize 监听**：
   - echarts 实例创建后**必须挂 ResizeObserver**（或 window.resize 监听）
   - 监听回调中调用 \`chartInstance.resize()\`
   - onUnmounted 中 disconnect observer + dispose 实例

   ✅ 正确：
   \`\`\`js
   let resizeObserver
   onMounted(async () => {
     await nextTick()
     requestAnimationFrame(() => {
       if (chartRef.value) {
         chartInstance = echarts.init(chartRef.value)
         chartInstance.setOption(option)
         resizeObserver = new ResizeObserver(() => chartInstance?.resize())
         resizeObserver.observe(chartRef.value)
       }
     })
   })
   onUnmounted(() => {
     resizeObserver?.disconnect()
     chartInstance?.dispose()
   })
   \`\`\`

# 📐 布局还原规则

- 根容器（最外层 div）必须设置 \`width: 100%; height: 100%;\`，**禁止使用 Figma 固定像素宽高**，确保组件在预览 iframe 中完全盛满。
- 根容器使用 \`display: flex; flex-direction: column;\` 组织内部结构，内容区用 \`flex: 1; min-height: 0;\` 自适应填充剩余空间。
- **每个容器节点（含根容器及所有子容器）必须单独判断 Figma layoutMode**：
  - HORIZONTAL → \`display:flex; flex-direction:row\`；VERTICAL → \`flex-direction:column\`。
  - **严禁假设所有子容器都与父容器同方向**——逐节点检查 figmaNodeData 中的 layoutMode 字段。
- primaryAxisAlignItems: MIN→flex-start / CENTER→center / MAX→flex-end / SPACE_BETWEEN→space-between（justify-content）。
- counterAxisAlignItems 同理映射 align-items。
- itemSpacing → gap；padding 逐边精确还原。
- 子元素尺寸按 Figma absoluteBoundingBox 真实比例分配，禁止平分。
- flex 子项补 \`min-height: 0\` / \`min-width: 0\`（尤其图表容器）。

## 🃏 卡片 / 列表项布局规则（CARD_LAYOUT，最高优先级，违反即不合格）

当元素是卡片类（card / stat-card / info-card / device-card / list-item 等），且其子元素**同时包含图标类（icon/image/img）和文字类（text/label/value/name）**时：

- **必须 \`flex-direction: row\`（图标在左、文字在右）**，这是默认且唯一正确的形态。
- 文字部分单独包一层容器，内部才用 \`flex-direction: column\` 纵向堆叠（label 在上、value 在下）。
- 图标必须 \`flex-shrink: 0\`，防止被压缩。
- **严禁**把卡片整体写成 \`flex-direction: column; align-items: center; justify-content: center\` —— 那会变成"图标在上、文字在下、整体居中"，与设计稿完全不符。
- **唯一例外**：figmaNodeData 中该节点明确标注 \`layoutMode: VERTICAL\`，或卡片内**纯文字无图标**时，才可用 column。

**✅ 正确（icon 左 + 文字右）：**
\`\`\`vue
<div v-for="item in list" :key="item.name" class="card-item">
  <img :src="item.icon" class="card-icon" />
  <div class="card-text">
    <div class="card-name">{{ item.name }}</div>
    <div class="card-value">{{ item.value }}</div>
  </div>
</div>
\`\`\`
\`\`\`css
.card-item { display: flex; flex-direction: row; align-items: center; gap: 12px; }
.card-icon { flex-shrink: 0; object-fit: contain; }
.card-text { display: flex; flex-direction: column; gap: 4px; }
\`\`\`

**❌ 错误（整体纵向居中堆叠）：**
\`\`\`css
.card-item { display: flex; flex-direction: column; align-items: center; justify-content: center; }
\`\`\`

**判断口诀**：只要该元素的 children 同时有「图标」和「文字」，就是 row；只有纯文字堆叠才是 column。

## 🔢 文本格式精确还原（强制）

- 数字、比值、单位、括号、分隔符等**必须与 Figma 文本内容逐字符一致**。
- 例：Figma 显示 \`(2/484)\` 就必须输出 \`(2/484)\`，**不得**擅自去掉括号写成 \`2/484\`；Figma 写 \`98%\` 就不得写成 \`98\`。
- 前后缀符号（\`(\` \`)\` \`/\` \`:\` \`~\` \`+\` \`-\` 单位等）一律照抄，禁止"美化"或简化。

#  图标与图片还原规则（强制）

本流程系统会**自动注入图片变量**（bg1 / icon1 / img1 及语义名），你**只能引用变量，禁止手写路径、禁止手写 import**：

- **图标 / 插图 / 3D 模型**：用 \`<img :src="icon1">\` 变量渲染，禁止写 \`<img src="./resources/...">\` 字面量，禁止用 CSS background-image 或空 div 替代。
- **卡片 / 容器背景图**：用 \`:style\` 绑定变量（backgroundImage: url(bg1)），禁止写 \`background-image: url('./resources/...')\` 等字面量 CSS。
- ⚠️ **注入的图片变量（bg1/icon1/img1 及语义名）是静态 import 的「字符串」**（值就是 \`'../resources/images/xx.png'\`），**不是 ref/reactive**。必须直接写 \`url(\${bg1})\` / \`:src="bg1"\`，**严禁写 \`.value\`**（\`bg1.value\` 恒为 \`undefined\`，会导致背景图失效、回退到 CSS 渐变）。
- \`<img>\` 必须 \`object-fit: contain\`；容器尺寸取自 Figma 节点 absoluteBoundingBox（width/height）或图片自然比例，**禁止硬编码固定尺寸**（如 40×30）导致截断 / 拉伸。
- **禁止**自行编写 \`import xxx from '...'\` 语句——系统会按下方「🎨 资源使用映射」段自动注入。
- 含半透明 / 特殊效果的图片必须用 \`<img>\` 而非 background，确保透明通道正确。
- 具体变量名、用途、尺寸见下文「🎨 资源使用映射」，必须严格对照使用。
# 📏 Vue3 编码规范（必须遵守）

${spec('component-development.md', 4000)}

## 命名规范
${spec('naming-conventions.md', 1500)}

## 📝 中文注释规范（强制）
- **关键逻辑、复杂样式计算、交互处理、生命周期钩子必须写中文注释**，说明"为什么这么做"。
- 组件/子组件 \`<script setup>\` 顶部写一段中文说明：组件用途、数据来源、关键交互。
- \`<style lang="less" scoped">\` 内对非常规样式（flex 布局、定位、伪元素、响应式断点）也要简要注释。
- 禁止只写代码无注释；也禁止无意义注释（如 \`// 赋值\`）。
- 示例：\`// 监听选中项变化，联动刷新图表数据（避免切换 Tab 后图表不更新）\`。

## 🖱️ 交互实现规范（强制）
- **必须根据 \`interactions\` 数组生成对应的交互代码——不能只识别不实现**。
- 交互必须完整可用：包含 UI、状态管理（ref/watch）、事件处理、数据刷新逻辑。
- 使用 Vue 3 Composition API（ref、watch、onMounted 等）。
- 常见交互实现模板：
  - **Tab 切换（type:"tab-switch"）**：\`ref\` 存当前激活 tab + tab 按钮 \`v-for\` 绑定 \`@click\` 切换 + 高亮 \`active\` 样式 + 切换时刷新数据。
  - **下拉选择（type:"select"）**：\`<select>\` 或自定义下拉 + \`v-model\` 选中值 + \`watch\` 选中值变化刷新数据。
  - **图表 Tooltip**：所有图表必须配 \`tooltip\`（trigger:'axis' 或 'item'），悬停显示详情，\`formatter\` 自定义格式（含单位）。
  - **开关/Toggle（type:"toggle"）**：\`<input type="checkbox" v-model>\` + \`watch\` 触发动作。
- 交互行为清单（来自 interactions，必须在组件中实现）：
${interactions && interactions.length > 0 ? interactions.map((it) => `- **${it.trigger}** → ${it.behavior}${it.target ? `（目标: ${it.target}）` : ''}`).join('\n') : '（interactions 为空时，按设计稿中可见的按钮/切换/展开等交互自行合理实现，并保持一致的交互体验）'}

## 质量红线
- **按功能拆分为子组件**：主组件 \`package/index.vue\` + 子组件 \`package/components/*.vue\`（头部 Header、卡片 Card、图表卡 ChartCard、列表项 ListItem 等）；单一职责，每个子组件 ≤300 行、每个函数 ≤50 行
${
  effectiveSections.length > 0
    ? subPlan.isForced
      ? `- 🚨 **强制子组件拆分（subcomponent-planner 规划产物）**：本组件**必须**拆分为 **${leafSections.length + (internalSubcomponents?.length || 0)}** 个独立子组件文件${internalSubcomponents?.length > 0 ? `（${leafSections.length} 个叶子 section + ${internalSubcomponents.length} 个内部子组件）` : ''}。**布局容器不单独生成 .vue**，必须按下方树在父模板内组装：
${formatSectionTreeForPrompt(effectiveSections)}
   **关键约束**：每个**叶子** section 必须对应一个独立的 \`package/components/{YourName}.vue\` 文件；标「容器」的节点只做纵向 flex 包裹，禁止为其单独建文件、禁止把 children 打平到根模板。\`package/index.vue\` 必须按树组装（容器的子组件出现在该容器对应的 DOM 内，或由 index 用 column 直接包住这些子组件）。
${internalSubcomponents?.length > 0 ? `   **内部子组件说明**：图表子组件使用 echarts 渲染，根元素设置 width: 100%; height: 100%，禁止 margin。\n` : ''}`
      : `- 💡 **建议拆分子组件（非强制）**：以下 section 建议你按功能拆为独立 \`package/components/*.vue\`，可酌情合并：
${formatSectionTreeForPrompt(effectiveSections)}\n`
    : ''
}
- defineProps({...}) 对象语法带类型与默认值；defineEmits([...])
- 列表渲染必须绑定稳定 key；避免 v-html
- onUnmounted 清理定时器/监听器/图表实例
- 图表用 ECharts 时：容器 ref + onMounted 初始化 + resize 监听 + onUnmounted dispose
- **🚫 CSS 类名语义化（强制）**：
  - **禁止使用组件 ID 作为 class 前缀**：组件 ID 是运行时随机标识符，不应出现在 CSS 中。
    - ❌ 错误：\`mv3-mv-max-<时间戳>-<ID>-root\`、\`mv3-36f0218a-header\`
    - ✅ 正确：\`vehicle-monitor-root\`、\`chart-card\`、\`tab-header\`、\`data-list\`、\`stat-panel\`
  - **必须基于功能/语义命名**，class 名反映元素用途，根容器用 \`{功能}-root\` 而非 \`{组件ID}-root\`。
  - 禁止含中文/非 ASCII 字符：如 \`vehicle-type-value客车\` 是非法的，LESS 编译会报 \`Unrecognised input\`。中文语义用 BEM 修饰符替代：\`vehicle-type-value--bus\` / \`vehicle-type-value--truck\`。
- **SFC 标签闭合顺序**：\`<template>\` → \`</template>\` → \`<script setup>\` → \`</script>\` → \`<style lang="less" scoped>\` → \`</style>\`。严禁在 \`</style>\` 后面多加 \`</script>\`，严禁标签交叉闭合。

## 🔗 API 绑定兼容（强制 — 违反将导致绑定失败）

> **核心规则**：所有可能在模板中展示或被 API 接口赋值的数据变量，**必须使用 \`ref()\` 或 \`reactive()\` 包裹**，**严禁**使用裸 \`const\` / \`let\` 定义。
>
> 原因：系统会在生成后对组件执行"API 绑定"，通过替换 \`ref()\` 变量的值来注入真实接口数据。裸 \`const\` 是只读的，无法被赋值覆盖，会直接触发绑定失败（符号冲突错误）。
>
> **✅ 正确写法：**
> \`\`\`js
> import { ref, onMounted } from 'vue'
> const tabs = ref(['选项一', '选项二', '选项三'])
> const cards = ref([])
> const activeTab = ref(0)
> const chartData = ref([])
> \`\`\`
>
> **❌ 错误写法（禁止）：**
> \`\`\`js
> const tabs = ['选项一', '选项二']        // 裸数组，不可写
> const cards = [{ name: 'A' }, ...]      // 裸对象数组，不可写
> let count = 0                           // 裸 let，虽然可写但失去响应式
> const title = '实时监测'                // 纯展示文本可用 const，但含动态数据时必须 ref
> \`\`\`
>
> **判断口诀**：只要这个变量的值来源于接口、用户交互、或未来可能被 API 绑定替换，就必须 \`ref()\`。纯静态常量（如固定标题文字、配置枚举）可以 \`const\`。
>
> **📊 图表/列表/表格数据驱动（强制）**：echarts 的 \`series.data\`、\`xAxis.data\`，以及表格的 \`:data-source\`、列表的 \`v-for\`，**必须绑定 ref() 变量**，**严禁**在 \`setOption({...})\` 里硬编码数字字面量（如 \`data: [5, 7, 6, 4]\`）。
>
> 原因：绑定系统会把 API 数据写进 \`chartData\` 这类 ref 变量来驱动图表；若数据写死在 option 字面量里，绑定后图表仍显示旧数据（无效绑定）。
>
> **✅ 正确写法：**
> \`\`\`js
> const chartData = ref([5, 7, 6, 4, 3])
> onMounted(() => {
>   chart.setOption({ series: [{ type: 'line', data: chartData.value }] })
> })
> \`\`\`
> **❌ 错误写法（禁止）：**
> \`\`\`js
> chart.setOption({ series: [{ type: 'line', data: [5, 7, 6, 4, 3] }] })  // 硬编码字面量，API 绑定后无法驱动图表
> \`\`\`
`;

    if (isRevision) {
      prompt += `\n# ⚠️ 修订指导（第 ${(input.iterationCount || 0) + 2} 轮）\n\n必须修复以下问题（HIGH 优先）：\n`;
      previousCritiques.slice(0, 20).forEach((c, i) => {
        prompt += `${i + 1}. [${c.severity}/${c.category}] ${c.issue}${c.location ? `（位置: ${c.location}）` : ''}\n`;
      });
    }

    // ── 数据段 ──
    prompt += `\n# 📎 设计稿数据

## 组件名
\`${componentName}\`（面板明暗：${backgroundBrightness}）

## 布局结构（layoutStructure — 含 background/header 节点，全部要真实还原）
\`\`\`json
${JSON.stringify(layoutStructure || {}, null, 1)}
\`\`\`

## 视觉元素（visualElements）
\`\`\`json
${JSON.stringify(visualElements || {}, null, 1)}
\`\`\`

## 📐 flex 布局铁律（P0-4）
- 纵向堆叠（从上到下）**优先用块级流（默认 block）**，不要为了"看起来整齐"给每个容器都加 \`display:flex; flex-direction:column\`。
- **仅当需要以下能力时才使用 \`flex-direction: column\`**：
  1. 剩余空间分配：某子元素要 \`flex: 1\` 吃满父级剩余高度（如"固定 header/footer + 弹性中间"的面板结构）；
  2. 垂直对齐：需要 \`align-items\` / \`justify-content\` 对齐多个子元素。
- **硬性配套（必须成对）**：凡 column-flex 容器内存在 \`flex: 1\` 子元素，父容器与子元素**都必须写 \`min-height: 0\`**（flex 子项默认 \`min-height:auto\`，内容一多就会撑破父级，echarts/表格类容器尤其致命）。
- ❌ 禁止：单层只放一两个块级子元素、无 flex 子属性（无 flex:1 / 无 align / 无 justify）却加 \`display:flex; flex-direction:column\` —— 与块布局完全等价，纯冗余，还会引入 flex 格式化上下文。
- ✅ 横向排列（图标+文字、tab 列表、统计卡）才用 \`flex-direction: row\`。
`;

    //Figma 原始节点样式数据（含 layoutMode / 对齐 / 间距 / 尺寸 / fills / 字体）
    // ⚠️ 这是判断每个容器 flex-direction 的**唯一权威依据**，此前遗漏未注入导致
    //    LLM 只能凭经验猜测卡片方向（把 icon+text 卡片错误生成为纵向居中堆叠）。
    if (figmaNodeData) {
      const figmaStyleBlock =
        figmaStyleTree ?? formatFigmaStyleData(figmaNodeData);
      if (figmaStyleBlock && figmaStyleBlock.trim()) {
        prompt += `\n## Figma 节点样式树（figmaNodeData — flex-direction 的权威依据）

> **逐节点比对**：节点标注 \`布局: HORIZONTAL\` → 该容器必须 \`flex-direction: row\`；
> \`布局: VERTICAL\` → \`flex-direction: column\`。**严禁**假设子容器与父容器同方向。
> 节点未标注 layoutMode 时，按上文「🃏 卡片 / 列表项布局规则」判断（有图标+文字即 row）。

${figmaStyleBlock}
`;
      }
    }

    if (headerSlots && headerSlots.length > 0) {
      prompt += `\n## 面板头部元素（headerSlots — 必须全部渲染为真实 DOM）
\`\`\`json
${JSON.stringify(headerSlots, null, 1)}
\`\`\`
`;
    }

    if (styleMappings) {
      const sm = elementStyleMap
        ? { ...styleMappings, elementStyleMap }
        : styleMappings;
      prompt += `\n## 样式映射（styleMappings — 颜色/字体/阴影/圆角精确值）
\`\`\`json
${JSON.stringify(sm, null, 1)}
\`\`\`
`;
    }

    if (charts && charts.length > 0) {
      prompt += `\n## 图表配置\n\`\`\`json\n${JSON.stringify(charts, null, 1)}\n\`\`\`\n`;
    }
    if (interactions && interactions.length > 0) {
      prompt += `\n## 交互配置\n\`\`\`json\n${JSON.stringify(interactions, null, 1)}\n\`\`\`\n`;
    }
    if (assets && Object.keys(assets || {}).length > 0) {
      //  分离 CSS 替代资源和图片资源，给 LLM 明确指令
      const assetEntries = Object.values(assets).flat
        ? Object.values(assets)
        : [assets];
      const flatAssets = assetEntries.flat();
      const cssAssets = flatAssets.filter((a) => a.cssInsteadOfImage);
      const imageAssets = flatAssets.filter((a) => !a.cssInsteadOfImage);

      if (cssAssets.length > 0) {
        prompt += `\n## ⚡ CSS 替代资源（不要使用 <img> 标签，直接用 CSS background）
以下资源的 fill 是纯色或渐变，已自动生成 CSS 值，**禁止引用图片文件**，必须在 <style> 中使用对应的 CSS：

\`\`\`json
${JSON.stringify(
  cssAssets.map((a) => ({
    name: a.name,
    nodeId: a.ref,
    cssValue: a.cssValue,
    cssUsage: `background: ${a.cssValue};`,
  })),
  null,
  1,
)}
\`\`\`

**规则**：
1. 这些资源 **不要** import 图片文件，**不要** 使用 \`<img>\` 标签
2. 直接在 <style scoped> 中用 \`background: <cssValue>;\` 实现
3. 如果资源是 bg 类型，应用到对应容器的 \`background\` 属性
4. 如果资源是 icon 类型但纯色/渐变可复现，用 CSS \`background\` + 尺寸定位实现
`;
      }

      if (imageAssets.length > 0) {
        prompt += `\n## 资源文件（图片由系统按 SFC 深度注入：主组件 ../resources/images/，子组件 ../../resources/images/）
\`\`\`json
${JSON.stringify(imageAssets, null, 1)}
\`\`\`
`;
      }
    }

    //资源变量映射（系统自动注入 import，LLM 必须使用 bg1/icon1 等变量引用图片）
    if (resourceDomMapping && resourceDomMapping.length > 0) {
      prompt +=
        '\n' +
        formatResourceMapping(resourceDomMapping, {
          filterPanelResources: false,
          semanticLocation: true,
          importPrefix: './',
        }) +
        '\n';
    }

    // ── 任务要求 + 输出格式（由分块 middle 提供）──
    if (chunkSpec?.middle) {
      prompt += chunkSpec.middle;
    }

    return prompt;
}

/**
 * Vue3 整文件分块 middle（默认路径：单批输出完整 SFC）
 */
export function buildVue3ChunkMiddle(chunk) {
    const fileList = chunk.files.map((f) => `- \`${f}\``).join('\n');
    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件（必须保持命名/接口/class 一致）\n\n' +
        chunk.contextFiles
          .map(
            (cf) =>
              `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}\n`,
          )
          .join('\n');
    }
    return `
# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次生成以下文件，每个 \`.vue\` 输出**完整的 Vue3 SFC**（<template> + <script setup> + <style lang="less" scoped> 三段齐全），每个 \`.less\` 输出完整样式文件：

${fileList}
${contextBlock}
# 输出格式

使用文件分隔符格式（不要 JSON、不要 markdown 代码块包裹）：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

- 每个文件用 \`// === 文件路径 ===\` 分隔符开头，内容为原始代码（不转义换行/引号）
- 分隔符只能标记文件开始，禁止在注释/说明中使用
- **不要**输出 declare.json / component.js / base-panel 等微码运行时文件
- \`.less\` 文件必须输出：\`theme-vars.less\`（变量+mixin，末尾调用 \`.theme-dark()\`）、\`common.less\`（业务 class，建议前缀 \`.mv3-<组件名>-\`）。\`index.less\` 由系统自动生成（@import 前两者），**无需**输出。
- 每个 \`.vue\` 的 \`<style lang="less" scoped">\` 顶部必须 \`@import\` 根共享 less（主组件 \`../resources/styles/index.less\`、子组件 \`../../resources/styles/index.less\`）；禁止按扁平目录少退一级
- 若根面板存在背景，\`package/index.vue\` 的根选择器必须直接出现可执行的 \`background\` / \`background-image\` / \`background-color\` 字面量值，不能只引用 \`var(--color-bg)\` / \`var(--colorBg)\`
`;
}

/**
 * Vue3 模板段 middle（降级路径）
 */
export function buildVue3TemplateMiddle(chunk) {
    const ctx = (chunk.contextFiles || [])
      .map(
        (cf) => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 8000)}`,
      )
      .join('\n');
    // 🛡️ 修订模式约束（2026-09-02，P1 子组件清单漂移）：contextFiles 含「旧版基线」时，
    // 明确要求只修 L0-B 反馈问题、子组件引用原样保留——否则 LLM 自由重命名子组件会破坏
    // 既有子组件结构（旧子组件成孤儿 + 新空壳），导致图表/资源丢失。
    const isRevision = (chunk.contextFiles || []).some((cf) =>
      /旧版基线|原样保留|仅修复/.test(cf.path || ''),
    );
    const revisionRule = isRevision
      ? `
# ⚠️ 修订模式约束（必须遵守）
这是对既有产物的**局部修复**，不是全新生成：
1. **只修复 L0-B 反馈中列出的具体问题**（如根容器背景/阴影、flex 量纲等），其余内容一律保持旧版原样；
2. **子组件引用必须原样保留**——旧版模板里引用的每个子组件标签（如 <AreaChart>）名、个数、顺序都不许改变，**严禁重命名/新增/删除子组件**；
3. 若旧版子组件与你认为的「更合适命名」不同，仍以旧版为准，不要擅自改名。
`
      : '';
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 模板段）

只输出 \`package/index.vue\` 的 **<template> 段**（含面板头部真实 DOM 与背景容器结构），不要输出 <script> 和 <style>。
${revisionRule}${ctx ? `\n# 参考上下文\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<template>
  ...完整模板...
</template>
\`\`\`
`;
}

/**
 * Vue3 脚本段 middle（降级路径）
 */
export function buildVue3ScriptMiddle(chunk) {
    const ctx = (chunk.contextFiles || [])
      .map(
        (cf) => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}`,
      )
      .join('\n');
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 脚本段）

只输出 \`package/index.vue\` 的 **<script setup> 段**（JavaScript），与下方模板段的 ref/事件/子组件引用严格一致。不要输出 <template> 和 <style>。
${ctx ? `\n# 参考上下文（模板段）\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<script setup>
...完整脚本...
</script>
\`\`\`
`;
}

/**
 * Vue3 样式段 middle（降级路径）
 */
export function buildVue3StyleMiddle(chunk) {
    const ctx = (chunk.contextFiles || [])
      .map(
        (cf) => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}`,
      )
      .join('\n');
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 样式段）

只输出 \`package/index.vue\` 的 **<style lang="less" scoped> 段**，class 与下方模板段严格一致，含面板背景/标题栏样式精确还原；顶部必须通过 \`@import '../resources/styles/index.less';\` 引入根共享 less（theme-vars/common），禁止使用 \`./resources/\`。
${ctx ? `\n# 参考上下文（模板+脚本）\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<style scoped>
...完整样式...
</style>
\`\`\`
`;
}

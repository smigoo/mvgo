/**
 * 🎯 Phase 2 方案5: 规则约束强化模块
 *
 * 在关键位置注入强化版约束文本，显著降低LLM违规率
 */

/**
 * 布局约束强化文本
 * 在 template 生成段注入，防止臆造结构
 */
export function buildLayoutConstraintReinforcement(layoutStructure) {
  if (!layoutStructure || !layoutStructure.sections || layoutStructure.sections.length === 0) {
    return ''
  }

  const sections = layoutStructure.sections || []
  const sectionCount = sections.length
  const hasNestedGrid = sections.some(
    (s) => (s.gridColumns ?? (s.body && s.body.gridColumns)) && (s.layout || (s.body && s.body.layout)) !== 'grid',
  )

  return `
## 🚫 布局约束铁律（违反将被L0-B门禁拦截）

### 禁止臆造的三大场景

**1. 统计卡片区域**
- ❌ 错误：layoutStructure 标注3个统计卡片，你生成了4个
- ✅ 正确：严格按 layoutStructure.sections[].body.children 数量生成
- 📋 验证清单：数一数 layoutStructure 中有几个 stat/card 类型的节点

**2. 列表/表格列数**
- ❌ 错误：layoutStructure 标注5列（序号/车牌/时间/类型/状态），你添加了"操作"列
- ✅ 正确：表格列必须与 layoutStructure 中的 column 节点一一对应
- 📋 验证清单：每个表格列是否都能在 layoutStructure 中找到对应节点

**3. 图表数量**
- ❌ 错误：layoutStructure 标注2个图表，你生成了3个
- ✅ 正确：图表数量必须与 charts 数组长度完全一致
- 📋 验证清单：生成的图表数量 === charts.length

### ⚠️ 布局方向由系统注入（LLM 勿写勿改）

> 🛡️ 删减法批次 3 loop 3b（2026-09-14）：布局的 **display / flex-direction / 栅格列数**
> 已由 sectionLayoutFacts（来自 Figma 真值：flexGrow / figmaHeightPx / layout / gridColumns）**确定性注入**，
> 后处理按事实表「缺则补」（规则⑤）。LLM **不要再为 section 根手写这些布局属性**，也不要覆盖它们——
> 手写 flex/grid 值会覆盖注入事实，引发布局错乱（卡片挤成单行等实锤）。
> **你只需保证 section 的 DOM 结构与数量正确，布局交给系统。**
>
> ⚠️ **例外（双层结构内层栅格）**：当某一 section 外层是横排、内部还有 N 列栅格（如 @antd/tab 外层 tab + 右内容区 3 列设备栅格）
> 时，内层内容区的栅格**目前事实表尚不能表达**（事实表是 section 级单层），故内层栅格的硬约束**仍由你遵守**
> （见下方「内层栅格铁律」）。这是 3b 的唯一例外，待事实表支持双层内层后一并摘除。

${sections.map((s, i) => {
  const name = s.name || s.title || s.responsibility || 'unnamed'
  const layout = s.layout || (s.body && s.body.layout) || 'vertical'
  const gridCols = (s.gridColumns ?? (s.body && s.body.gridColumns)) || null
  let rule = `**Section ${i + 1}: ${name}**\n`
  rule += `- 布局形态：${layout === 'horizontal' || /2-?col/i.test(layout) ? '横向排列（row / 两列并排）' : layout === 'grid' || gridCols ? (gridCols ? `网格（${gridCols} 列）` : '网格') : '竖向堆叠（column）'}（section 根 display/flex/grid 由系统注入，勿手写）\n`
  // 🛡️ 双层结构内层栅格（事实表未覆盖，必须保留硬约束，否则内层塌缩为单行 —— 80021ec7 实锤）：
  if (gridCols && layout !== 'grid') {
    rule += `- ⚠️ 内层内容区（设备/卡片网格）必须用 \`display: grid; grid-template-columns: repeat(${gridCols}, 1fr)\`（系统暂不能注入，必须手动遵守）\n`
    rule += `  - ❌ 内层网格禁止用 \`flex-direction: row\` 把卡片排成单行\n`
    rule += `  - ❌ 内层列数禁止改为 ${gridCols} 之外的值\n`
  }
  return rule
}).join('\n')}

### 自检清单（生成后必须检查）

- [ ] Section 数量 === layoutStructure.sections.length (${sectionCount}个)
- [ ] 没有臆造额外的统计卡片/列表列/图表
- [ ] 没有为 section 根手写 display:flex/grid 或 flex-direction（已由系统注入）
${hasNestedGrid ? '- [ ] 双层结构的内层栅格仍按要求用 grid + 正确列数（系统暂不能注入）\n' : ''}- [ ] 所有元素都能在 layoutStructure 中找到对应节点
`
}

/**
 * 资源约束强化文本
 * 在 template/script 生成段注入，防止资源变量误用
 */
export function buildResourceConstraintReinforcement(availableResources) {
  if (!availableResources || availableResources.length === 0) {
    return `
## ⚠️ 资源约束

**本组件无可用资源变量**
- 禁止在代码中使用 \`bg1\`、\`icon1\`、\`img1\` 等资源变量
- 禁止在 CSS 中写 \`url()\` 引用任何图片
- 若需装饰性图标，使用 SVG 或 iconfont
`
  }

  const varList = availableResources.map(r => r.assignedVarName || r.semanticVarName).filter(Boolean)
  const bgVars = varList.filter(v => v.startsWith('bg'))
  const iconVars = varList.filter(v => v.startsWith('icon'))
  const imgVars = varList.filter(v => v.startsWith('img'))

  return `
## 🖼️ 资源约束铁律（违反将导致LESS编译崩溃）

### 可用资源变量白名单

**本次仅以下 ${varList.length} 个资源变量可用**：

${bgVars.length > 0 ? `**背景图** (${bgVars.length}个): \`${bgVars.join('`、`')}\`\n` : ''}${iconVars.length > 0 ? `**图标** (${iconVars.length}个): \`${iconVars.join('`、`')}\`\n` : ''}${imgVars.length > 0 ? `**图片** (${imgVars.length}个): \`${imgVars.join('`、`')}\`\n` : ''}
**⚠️ 清单外的变量不存在**：如 \`icon${iconVars.length + 1}\`、\`bg${bgVars.length + 1}\` 若不在上述清单中，则**不存在**，禁止使用！

### 正确用法（模板插值）

\`\`\`vue
<!-- ✅ 正确：图标 -->
<img :src="icon1" class="c-icon" />

<!-- ✅ 正确：背景图 -->
<div :style="{ backgroundImage: 'url(' + bg1 + ')' }" class="c-bg-container"></div>

<!-- ✅ 正确：动态背景图 -->
<div :style="{ backgroundImage: \`url(\${bg1})\` }" class="c-bg"></div>
\`\`\`

### 错误用法（写进CSS）- 会导致LESS编译崩溃

\`\`\`less
/* ❌ 错误：url(\${变量名}) - LESS无法识别 */
.c-bg {
  background-image: url(\${bg1}); /* 编译崩溃 */
}

/* ❌ 错误：url(@变量名) - 未声明 */
.c-bg {
  background-image: url(@bg1); /* 编译崩溃 */
}

/* ❌ 错误：url($变量名) - 语法错误 */
.c-bg {
  background-image: url($bg1); /* 编译崩溃 */
}
\`\`\`

### 自检清单

- [ ] 所有资源变量都在白名单内（不使用 icon${iconVars.length + 1}、bg${bgVars.length + 1} 等不存在的变量）
- [ ] 资源变量只在 <template> 中通过 :src 或 :style 使用
- [ ] <style> 块中没有任何 url(\${...})/url(@...)/url($...) 语法
- [ ] 没有手写 import 语句导入资源（由系统自动注入）
`
}

/**
 * 样式约束强化文本
 * 在 style 生成段注入，防止样式隔离问题
 */
export function buildStyleConstraintReinforcement() {
  return `
## 🎨 样式约束铁律（违反将被L0-B门禁拦截）

### common.less 必须写在根层

**🔴 错误示例（被外层选择器包裹）**：
\`\`\`less
// ❌ 错误：被 .dark 包裹
.dark {
  .c-env-monitor-root {
    background: #1a1a1a;
  }
  .c-env-monitor-header {
    color: #fff;
  }
}
\`\`\`

**✅ 正确示例（写在根层）**：
\`\`\`less
// ✅ 正确：直接写在文件根层
.c-env-monitor-root {
  background: #1a1a1a;
}
.c-env-monitor-header {
  color: #fff;
}
\`\`\`

**原因**：宿主环境不给组件根元素添加 .dark/.light 类，包裹后编译成 \`.dark .c-xxx\`，真实DOM上0命中 → 样式全部失效

### Class 命名约束

**1. 必须使用 .c- 前缀**
\`\`\`less
// ✅ 正确
.c-vehicle-card { }
.c-chart-container { }

// ❌ 错误：缺少 c- 前缀
.vehicle-card { }
.chart-container { }
\`\`\`

**2. 禁止使用实例ID作为前缀**
\`\`\`less
// ❌ 错误：使用实例ID
.c-f0abee-container { }
.c-mc-max-1234567890-header { }

// ✅ 正确：使用功能语义
.c-env-monitor-container { }
.c-env-monitor-header { }
\`\`\`

**原因**：实例ID是运行时随机标识符，写进CSS后其他实例无法复用样式

### 子组件样式约束

**父组件职责**：布局协调（位置、间距、尺寸约束）
\`\`\`less
.c-parent-container {
  display: flex;
  gap: 16px;

  // ✅ 正确：约束子组件的外部尺寸
  .c-child-component {
    width: 300px;
    margin-right: 20px;
  }
}
\`\`\`

**子组件职责**：内部样式（颜色、边框、内边距）
\`\`\`less
.c-child-root {
  // ✅ 正确：填充父组件给定的空间
  width: 100%;
  height: 100%;

  // ✅ 正确：内部样式
  padding: 12px;
  color: @color-text;
  border: 1px solid @color-border;

  // ❌ 错误：子组件设置 margin
  // margin: 20px;  /* 由父组件控制 */
}
\`\`\`

### 自检清单

- [ ] common.less 中所有 class 都写在文件根层（没有被 .dark/.light 包裹）
- [ ] 所有 class 都有 .c- 前缀
- [ ] 没有使用实例ID（如 f0abee、mc-max-1234567890）作为 class 前缀
- [ ] 子组件根元素使用 width: 100%; height: 100%;
- [ ] 子组件根元素没有设置 margin（由父组件控制）
`
}

/**
 * 组合所有约束强化文本
 * 在主 prompt 中注入
 */
export function buildAllConstraintReinforcements(options = {}) {
  const { layoutStructure, availableResources } = options

  let reinforcement = '\n\n# 🔴 关键约束铁律（生成前必读）\n\n'
  reinforcement += '以下约束来自视觉分析和系统规范，违反将导致L0-B门禁拦截或编译崩溃。\n\n'

  if (layoutStructure) {
    reinforcement += buildLayoutConstraintReinforcement(layoutStructure)
  }

  if (availableResources) {
    reinforcement += buildResourceConstraintReinforcement(availableResources)
  }

  reinforcement += buildStyleConstraintReinforcement()

  return reinforcement
}

export default {
  buildLayoutConstraintReinforcement,
  buildResourceConstraintReinforcement,
  buildStyleConstraintReinforcement,
  buildAllConstraintReinforcements
}

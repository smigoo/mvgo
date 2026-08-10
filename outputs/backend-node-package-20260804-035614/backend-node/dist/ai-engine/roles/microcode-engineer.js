/**
 * Microcode Engineer - 微码工程师
 * 职责：生成符合微码规范的Vue组件代码
 * 输入：layoutStructure + visualElements + styleMappings
 * 输出：完整的组件文件集合
 */

import { BaseAgent } from '../agents/base-agent.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMText, getMaxTokens } from '../utils/model-config.js'
import { robustJSONParse } from '../utils/json-parser.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'
import { generateDeclareJson as _templateDeclareJson } from '../templates/component-template.js'

const logger = createLogger({ name: 'microcode-engineer' })

export class MicrocodeEngineer extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'microcode-engineer',
      description: '微码组件代码生成器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || getMaxTokens(config.model, 16000),
      ...config
    })

    // 加载规范文档
    this.constraints = this.loadReferenceFiles([
      'references/constraints/ai-generation-constraints.md',
      'references/patterns/code-patterns.md',
      'references/specs/declare-json.md',
      'references/specs/style-guide.md',
      'references/rules/stage-execution-rules.md',
      'references/prompts/figma.md',
      // 🆕 v3.0 样式标准（Phase 1）
      'references/standards/vue-style-standard.md',
      'references/standards/less-naming-convention.md'
    ])

    logger.info('Microcode Engineer 已初始化')

    // 绑定方法以保持this上下文（修复 _parseDelimitedFormat is not a function 错误）
    this.parseCodeOutput = this.parseCodeOutput.bind(this)
    this.parseOutput = this.parseOutput.bind(this)
  }

  /**
   * 🆕 P1优化: 评估组件复杂度
   * 用于动态调整prompt详细程度
   */
  assessComplexity(layoutStructure) {
    if (!layoutStructure || !layoutStructure.elements) {
      return 'medium'
    }

    const elements = layoutStructure.elements || []
    const elementCount = elements.length

    // 计算嵌套层级（简化版）
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length
      return Math.max(max, depth)
    }, 1)

    // 复杂度判断
    if (elementCount <= 3 && maxDepth <= 2) {
      return 'simple'      // 简单：元素少，层级浅
    } else if (elementCount >= 10 || maxDepth >= 4) {
      return 'complex'     // 复杂：元素多或层级深
    } else {
      return 'medium'      // 中等
    }
  }

  /**
   * 🆕 #9a: 预估 index.vue 输出规模（启发式 token 估计）
   * 用于在生成前直接选择分块粒度，避免首个长调用中途截断、已生成 token 全废。
   * 返回 { tokens, tier, elementCount, maxDepth, sectionCount, charts, interactions }
   *   tier ∈ 's' | 'm' | 'l' | 'xl'
   */
  estimateIndexVueSize(input = {}) {
    const layoutStructure = input.layoutStructure || {}
    const elements = Array.isArray(layoutStructure.elements) ? layoutStructure.elements : []
    const elementCount = elements.length
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length
      return Math.max(max, depth)
    }, 1)
    const sections = Array.isArray(layoutStructure.sections)
      ? layoutStructure.sections
      : (Array.isArray(layoutStructure.layoutStructure?.sections) ? layoutStructure.layoutStructure.sections : [])
    const sectionCount = sections.length

    const charts = Array.isArray(input.charts) ? input.charts.length : 0
    const interactions = Array.isArray(input.interactions) ? input.interactions.length : 0
    const visualElements = Array.isArray(input.visualElements) ? input.visualElements : []
    const visualLen = visualElements.reduce((s, v) => s + (v?.label?.length || 0) + (v?.value?.length || 0), 0)

    // 经验系数：每个维度对输出 token 的近似贡献
    let est = 0
    est += elementCount * 220        // 每元素：模板 + class + 绑定
    est += (maxDepth - 1) * 320      // 每多一层嵌套
    est += sectionCount * 420        // 每个 section 区块
    est += charts * 950              // 每个图表：echarts option 冗长
    est += interactions * 600         // 每个交互：方法 + 事件
    est += Math.floor(visualLen / 4) // 文本
    est += 1200                      // base-panel 外壳 + 固定样板

    let tier = 's'
    if (est >= 8000) tier = 'xl'
    else if (est >= 4500) tier = 'l'
    else if (est >= 2500) tier = 'm'
    else tier = 's'

    return { tokens: est, tier, elementCount, maxDepth, sectionCount, charts, interactions }
  }

  /**
   * 🆕 #9a: 判断 package/index.vue 是否应分段生成，并在生成前直接选定粒度。
   * 返回 { split, reason, scriptSplit, sizeTier, estTokens }
   *   - split: 是否拆分 index.vue（template + script 分两批）
   *   - scriptSplit: 超大组件再把 <script> 拆为「状态 / 行为」两段（避免单段超长截断）
   *   - sizeTier: 预估规模等级 's'|'m'|'l'|'xl'
   */
  shouldSplitIndexVue(complexity, input = {}) {
    const size = this.estimateIndexVueSize(input)
    const tier = size.tier

    if (complexity === 'complex' || complexity === 'medium') {
      // 复杂/中等默认拆分；超大（xl）再把脚本拆两段
      return {
        split: true,
        reason: `${complexity}-${tier}`,
        scriptSplit: tier === 'xl',
        sizeTier: tier,
        estTokens: size.tokens
      }
    }

    // simple：仅在存在高截断风险信号，或预估规模偏大时拆分
    const layoutStructure = input.layoutStructure || {}
    const elements = Array.isArray(layoutStructure.elements) ? layoutStructure.elements : []
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length
      return Math.max(max, depth)
    }, 1)
    const sectionCount = Array.isArray(layoutStructure.sections)
      ? layoutStructure.sections.length
      : (Array.isArray(layoutStructure.layoutStructure?.sections) ? layoutStructure.layoutStructure.sections.length : 0)

    const hasCharts = Array.isArray(input.charts) && input.charts.length > 0
    const hasHeaderSlots = Array.isArray(input.headerSlots) && input.headerSlots.length > 0
    const hasInteractions = Array.isArray(input.interactions) && input.interactions.length > 0
    const hasDenseLayout = elements.length >= 5 || maxDepth >= 3 || sectionCount > 1

    const risky = hasCharts || hasHeaderSlots || hasInteractions || hasDenseLayout
    // 即便没有显式风险信号，若预估规模偏大（l/xl）也按 size 直接选分段
    if (risky || tier === 'l' || tier === 'xl') {
      return {
        split: true,
        reason: risky ? 'simple-risky' : 'simple-size-up',
        scriptSplit: tier === 'xl',
        sizeTier: tier,
        estTokens: size.tokens
      }
    }

    return { split: false, reason: 'simple-low-risk', scriptSplit: false, sizeTier: tier, estTokens: size.tokens }
  }

  /**
   * 🆕 P2优化: 根据复杂度和上下文按需加载规则（减少Prompt大小）
   */
  getOptimizedConstraints(complexity, isRevision, category = 'all') {
    const constraints = {}

    // 核心规则（总是加载）
    constraints.core = this.constraints['ai-generation-constraints.md']

    // 只在修订模式加载修订规则
    if (isRevision) {
      constraints.revision = this.constraints['references/rules/stage-execution-rules.md']
    }

    // 根据复杂度调整规则详细程度
    if (complexity === 'complex') {
      constraints.patterns = this.constraints['references/patterns/code-patterns.md']
    }

    // 总是加载的关键规则
    constraints.style = this.constraints['references/standards/vue-style-standard.md']
    constraints.lessNaming = this.constraints['references/standards/less-naming-convention.md']

    return constraints
  }

  /**
   * 🆕 P2优化: 压缩Prompt - 只包含必要的规则
   */
  buildCompressedPrompt(input, constraints) {
    const { layoutStructure, visualElements, componentName, stage = 'preview', previousCritiques, charts, interactions } = input
    const complexity = this.assessComplexity(layoutStructure)
    const isRevision = previousCritiques && previousCritiques.length > 0

    // 核心Prompt（精简版）
    let prompt = `你是专业的微码组件开发工程师。生成符合微码规范的Vue 3组件。

${complexity === 'simple' ? '⚡ 简单组件 - 保持代码简洁' : complexity === 'complex' ? '🔧 复杂组件 - 注意性能和代码组织' : ''}

## 核心规范（必须执行）
`

    // 只在有约束时添加规则
    if (constraints.core) {
      prompt += `\n${constraints.core}\n`
    }

    // 修订指导（仅修订模式）
    if (isRevision && previousCritiques.length > 0) {
      prompt += `\n## 修订指导\n这是第${(input.iterationCount || 0) + 2}轮修订。必须修复标记为HIGH的问题：\n`
      prompt += previousCritiques
        .filter(c => c.severity === 'high')
        .map((c, i) => `${i + 1}. [${c.category}] ${c.issue}`)
        .join('\n')
    }

    // 样式规范（总是需要）
    if (constraints.style) {
      prompt += `\n## 样式标准\n${constraints.style.substring(0, 1000)}...`  // 只取前1000字
    }

    return prompt
  }

  /**
   * 构建代码生成提示词
   */
  buildCodePrompt(input, chunkSpec) {
    try {
      const { layoutStructure, visualElements, componentName, displayName, stage = 'preview', previousCritiques, charts, interactions,
              analysisType, analysisTarget, analysisDescription, analysisEvidence,
              figmaNodeData, styleMappings, assets, resourceDomMapping, headerSlots, panelType = 'default-panel',
              elementStyleMap, backgroundBrightness = 'dark' } = input

      // 参数验证：确保componentName是有效的字符串
      if (!componentName || typeof componentName !== 'string') {
        throw new Error(`Invalid componentName: ${typeof componentName} ${JSON.stringify(componentName)}`)
      }

      // 🆕 根据面板明暗确定 theme-vars.less 默认主题
      const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark'

    // 🆕 P1优化: 评估组件复杂度
    const complexity = this.assessComplexity(layoutStructure)

    // ✅ 判断是否为修订模式
    const isRevision = previousCritiques && previousCritiques.length > 0

    // ✅ 构建修订指导部分
    const revisionSection = isRevision ? `
# ⚠️ 代码修订指导

**这是第${(input.iterationCount || 0) + 2}轮修订**，上一版本代码存在以下问题，请针对性修复：

${previousCritiques.map((critique, index) => `
## 问题 ${index + 1}: ${critique.issue}

- **严重程度**: ${critique.severity === 'high' ? '🔴 HIGH (必须修复)' : critique.severity === 'medium' ? '🟡 MEDIUM (建议修复)' : '🟢 LOW (可选)'}
- **类别**: ${critique.category}
- **位置**: ${critique.location || '未指定'}
- **修复建议**: ${critique.fix || '请根据问题描述自行判断'}

`).join('\n')}

**修订要求**：
1. ✅ **必须修复所有 HIGH 级别问题**
2. ⚡ **尽量修复 MEDIUM 级别问题**
3. 🎯 **使用外科手术式修改** - 只修改有问题的部分，保持其他代码不变
4. 📝 **在修复的代码附近添加注释**，说明修复了什么问题（例如：\`// Fixed: 添加aria-label以提升可访问性\`）

---

` : ''

    // 🆕 P1优化: 根据复杂度添加生成提示
    const complexityHint = complexity === 'simple'
      ? '\n\n⚡ **组件复杂度**: 简单组件 - 请保持代码简洁，避免过度设计\n'
      : complexity === 'complex'
      ? '\n\n🔧 **组件复杂度**: 复杂组件 - 请注意代码组织和性能优化\n'
      : ''

      // 🆕 运行时修订指导（来自 classifyRuntimeGate）
      const runtimeRevisionSection = input._runtimeRevisionGuidance ? `
# ⚠️ 运行时问题修订指导

上一版本在运行时预览中出现以下问题，必须修复：

**问题范围**: ${input._runtimeRevisionGuidance.scope || 'runtime'}
**修订目标**: ${input._runtimeRevisionGuidance.reviseTarget || 'incremental'}

## 需要修复的问题
${(input._runtimeRevisionGuidance.focusAreas || []).map((area, i) => `${i + 1}. ${area}`).join('\n')}

## 证据
${JSON.stringify(input._runtimeRevisionGuidance.evidence || [], null, 2)}

## 修复规则
${(input._runtimeRevisionGuidance.rules || []).map(rule => `- ${rule}`).join('\n')}

**重要**：只修复上述运行时问题，不要改动其他功能。

---

` : ''

      const shared = `
你是一个专业的微码组件开发工程师，负责生成符合微码规范的Vue 3组件代码。
${complexityHint}

# 🚫 代码生成强制规范清单（违反即失败）

**在开始编写代码前，必须确保以下规范100%执行：**

## 1️⃣ 资源使用（RESOURCE_UTILIZATION）

🔴 **bg 资源（背景图）— 必须使用**：
- 已下载的 bg1, bg2, bg3 等背景图资源**必须**在模板中通过 :style backgroundImage 引用
- **禁止**用 CSS gradient 替代已下载的 bg 资源
- **禁止**用纯色 background 替代图片背景资源

🟡 **icon 资源（图标）— 按需使用，不强求**：
- 已下载的 icon1, icon2 等图标资源**建议使用，但不强制**
- 只有当该 icon 在布局结构（layoutStructure）中有**明确的自然位置**时才使用
- **如果找不到自然使用位置，不要强行插入！**强行塞入会破坏布局（如 icon 跑到 subheader 或卡片右上角）
- **禁止**用内联 SVG 替代可用 icon 资源（仅当使用该 icon 时适用）

✅ **通用规则**：
- 在模板中通过 :src 或 :style backgroundImage 引用这些变量
- **禁止自行编写 import 语句**，系统会自动注入

**正确示例**：
\`\`\`vue
<template>
  <div :style="{ backgroundImage: \\\`url(\\\${bg1})\\\`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <img :src="icon1" />
  </div>
</template>
<script setup>
// 不要写 import！系统会自动注入 bg1, icon1 等变量
</script>
\`\`\`

## 2️⃣ 混合布局规则（MIXED_LAYOUT）- 代码结构优先级

当 layoutStructure 中出现 stat-item 等数据指标项，且内部包含 \`type: 'row'\` / \`layout: 'horizontal'\` 的嵌套子结构时，**必须生成对应的嵌套 flex 容器**，禁止将所有子元素平铺为纯 vertical flex。

**正确示例（icon+label 同行，value 在下方）**：
\`\`\`vue
<template>
  <div v-for="item in stats" :key="item.label" class="c-\${componentName}-stat-item">
    <!-- row 容器：icon 和 label 同行 -->
    <div class="c-\${componentName}-stat-row">
      <img :src="item.icon" class="c-\${componentName}-stat-icon" />
      <span class="c-\${componentName}-stat-label">{{ item.label }}</span>
    </div>
    <!-- value 在下方 -->
    <span class="c-\${componentName}-stat-value">{{ item.value }}</span>
  </div>
</template>
\`\`\`
\`\`\`less
.c-\${componentName}-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.c-\${componentName}-stat-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
\`\`\`

**错误示例 ❌**（纯 vertical 平铺，icon/label/value 全部垂直排列）：
\`\`\`less
.c-\${componentName}-stat-item {
  display: flex;
  flex-direction: column;  // ❌ 所有子元素垂直排列
}
// ❌ icon、label、value 是兄弟节点，不在同一行
\`\`\`

**判断规则**：如果 layoutStructure 的 stat-item children 中有 \`type: 'row'\` 且 \`layout: 'horizontal'\`，则模板必须生成一个 flex-direction: row 的容器包裹 row 的 children（icon + label），其余 children（value 等）放在 stat-item 的下一层。

## 2.1️⃣ stat-item 自身布局方向规则（STAT_ITEM_DIRECTION）

stat-item 元素的 \`layout\` 属性决定了其自身的 flex-direction，**必须严格遵守**：
- \`layout: "horizontal"\` → \`.stat-item { flex-direction: row; }\`（icon 和 text-group 横向排列）
- \`layout: "vertical"\` → \`.stat-item { flex-direction: column; }\`（icon 和 text-group 纵向排列）

**当 stat-item 的 layout 为 horizontal 且 children 包含 icon + container(text-group) 时**：
- icon 在左，text-group（label + value 纵向堆叠）在右
- 禁止将 icon 和 label 拆到单独的 row 容器中（除非 layoutStructure 显式有 \`type: 'row'\` 子节点）
- 禁止将 value 放到 text-group 外部

**正确示例**（stat-item layout: "horizontal"，children: icon + text-group）：
\`\`\`vue
<div class="c-\${componentName}-stat-item">
  <img :src="icon1" class="c-\${componentName}-stat-icon" />
  <div class="c-\${componentName}-text-group">
    <span class="c-\${componentName}-stat-label">{{ item.label }}</span>
    <span class="c-\${componentName}-stat-value">{{ item.value }}</span>
  </div>
</div>
\`\`\`
\`\`\`less
.c-\${componentName}-stat-item {
  display: flex;
  flex-direction: row;  /* ← 跟随 layout: "horizontal" */
  align-items: center;
  gap: 6px;
}
.c-\${componentName}-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
\`\`\`

**错误示例** ❌（把 icon+label 拆成 row，value 放到外部，破坏了 text-group 结构）：
\`\`\`vue
<div class="c-\${componentName}-stat-item">
  <div class="c-\${componentName}-stat-row">
    <img :src="icon1" />
    <span>{{ item.label }}</span>
  </div>
  <span>{{ item.value }}</span>
</div>
\`\`\`

**关键原则**：stat-item 的 children 结构决定了 DOM 结构。如果 children 是 \`[icon, container]\`，DOM 就应该是 \`<img> + <div>text-group</div>\`，不要拆分 container 的子元素到 stat-item 层级。

**内容区背景图规则（CONTENT_BG）**：
如果 layoutStructure 的 content/body 节点有 \`backgroundImage.src\` 字段，内容区容器必须使用该背景图，而非纯色或 CSS 渐变。

## 2.2️⃣ 元素样式差异化规则（ELEMENT_STYLE_DIFF）

当 layoutStructure 或 elementStyleMap 中存在**不同 element id** 的同类元素（如 \`text-value-mainline\` 和 \`text-value-tunnel\`），**必须为每种样式生成独立的 CSS class**，禁止用伪类区分。

**正确示例**（主线 20px bold，其他 16px）：
\`\`\`vue
<template>
  <div v-for="item in stats" :key="item.label" class="c-\${componentName}-stat-item">
    <span :class="item.isMain ? 'c-\${componentName}-stat-value-main' : 'c-\${componentName}-stat-value-normal'">{{ item.value }}</span>
  </div>
</template>
\`\`\`
\`\`\`less
.c-\${componentName}-stat-value-main {
  font-size: 20px;
  font-weight: bold;
  color: #ffffff;
}
.c-\${componentName}-stat-value-normal {
  font-size: 16px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.8);
}
\`\`\`

**错误示例** ❌（用伪类区分，不同 element id 被合并为同一 class）：
\`\`\`less
.c-\${componentName}-stat-value {
  font-size: 20px;  // ❌ 统一样式
  font-weight: bold;
}
.c-\${componentName}-stat-item:first-child .c-\${componentName}-stat-value {
  font-size: 20px;  // ❌ 用伪类区分
}
.c-\${componentName}-stat-item:not(:first-child) .c-\${componentName}-stat-value {
  font-size: 16px;  // ❌ 用伪类区分
}
\`\`\`

**判断规则**：如果 elementStyleMap 或 elements 数组中两个元素的 \`font-size\`、\`font-weight\`、\`color\` 等属性不同，必须生成两个独立的 class，禁止用 \`:first-child\` / \`:not(:first-child)\` / \`:nth-child()\` 等伪类来区分。

\`\`\`vue
<div class="c-\${componentName}-content" :style="{ backgroundImage: \`url(\${bgX})\`, backgroundSize: layoutStructure.backgroundSize || '100% 100%', backgroundPosition: layoutStructure.backgroundPosition || 'center center', backgroundRepeat: layoutStructure.backgroundRepeat || 'no-repeat' }">
  <!-- stat-item 等内容 -->
</div>
\`\`\`

## 2.2️⃣ 卡片布局规则（CARD_LAYOUT）

当 layoutStructure 中出现类似卡片的元素（card、info-card、stat-card 等），且其 children 包含 icon/image + 文字内容时，**默认使用横向布局**：

- **icon + text 结构 → flex-direction: row（水平排列）**
- icon/image 在左侧，文字内容（label + value）在右侧堆叠
- 禁止将所有子元素全部垂直排列（column）—— 这会导致 icon 在上、文字在下，与设计稿不符

**正确示例**（卡片：icon 左 + 文字右）：
\`\`\`vue
<template>
  <div v-for="item in cards" :key="item.label" class="c-\${componentName}-card-item">
    <img :src="item.icon" class="c-\${componentName}-card-icon" />
    <div class="c-\${componentName}-card-text">
      <span class="c-\${componentName}-card-label">{{ item.label }}</span>
      <span class="c-\${componentName}-card-value">{{ item.value }} <small>{{ item.unit }}</small></span>
    </div>
  </div>
</template>
\`\`\`
\`\`\`less
.c-\${componentName}-card-item {
  display: flex;
  flex-direction: row;       /* ← 水平排列：icon 左 + 文字右 */
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.c-\${componentName}-card-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;            /* ← icon 不缩放 */
}
.c-\${componentName}-card-text {
  display: flex;
  flex-direction: column;    /* ← label 和 value 纵向堆叠 */
  gap: 4px;
}
.c-\${componentName}-card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
}
.c-\${componentName}-card-value {
  font-size: 24px;
  font-weight: bold;
  color: #ffffff;
}
.c-\${componentName}-card-value small {
  font-size: 12px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.5);
}
\`\`\`

**错误示例** ❌（全部垂直排列，icon在上、文字在下）：
\`\`\`less
.c-\${componentName}-card-item {
  display: flex;
  flex-direction: column;    // ❌ 所有子元素纵向堆叠
  align-items: center;
}
\`\`\`

**判断规则**：只要 layoutStructure 中某个元素的 children 同时包含图标类（icon/image）和文字类（text/label/value）子元素，就使用横向布局。只有纯文字堆叠的卡片才用竖向布局。

**图标尺寸规则**：卡片/列表项中的业务图标尺寸取自 Figma 节点 absoluteBoundingBox，且 \`flex-shrink: 0\`。
≤12px 的圆点/短线属于**装饰元素**（资源映射中会标注 \`🔸[装饰元素·非业务图标]\`），**禁止**把它当作卡片或标题的主图标使用。

## 2.3️⃣ 文本格式精确还原（TEXT_FIDELITY）

- 数字、比值、单位、括号、分隔符**必须与 Figma 文本逐字符一致**。
- 例：Figma 显示 \`(2/484)\` 就必须输出 \`(2/484)\`，**不得**去掉括号写成 \`2/484\`；\`98%\` 不得写成 \`98\`。
- 前后缀符号（\`(\` \`)\` \`/\` \`:\` \`~\` \`+\` \`-\` 及单位）一律照抄，禁止"美化"或简化。

## 3️⃣ Class 命名规范（L4-003）

✅ **必须做**：
- common.less 中的所有 class 必须以 \`.c-\${componentName}-\` 为前缀
- 格式：\`.c-\${componentName}-{语义名称}\`
- 语义名称使用 kebab-case：tabs-container, stat-item, chart-wrapper

❌ **绝对禁止**：
- 使用无前缀的通用 class：.item, .box, .wrapper, .container
- 使用错误的前缀或不完整的前缀

**正确示例**：
\`\`\`less
// common.less
.c-\${componentName}-tabs-container { display: flex; }
.c-\${componentName}-stat-item { padding: 12px; }
.c-\${componentName}-chart-wrapper { width: 100%; height: 300px; }
\`\`\`

## 3.1️⃣ $mcComponentBuilder 调用（必须）

⚠️ **API 返回值结构**：
\`\`\`javascript
{
  runtimeBuilder,    // ← 事件总线（不是 eventBus！）
  componentProps,    // 组件配置
  componentApi,      // API 请求方法
  // ... 其他属性
}
\`\`\`

✅ **必须做**：
\`\`\`vue
<script setup>
import { onMounted } from 'vue'

// 组件配置（根据实际需求定义）
const componentProps = {}

// 1. 调用 $mcComponentBuilder 并解构 runtimeBuilder
const { runtimeBuilder } = window.$mcComponentBuilder({
  componentId: '\${componentName}',
  componentProps,
  componentName: '\${componentName}'
})

// 2. 在 onMounted 中触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('\${componentName}-onload', {
    componentId: '\${componentName}',
    timestamp: Date.now()
  })
})
</script>
\`\`\`

❌ **绝对禁止**：
- ❌ 使用 \`eventBus\` 解构：\`const { eventBus } = ...\`（API中不存在此属性）
- ❌ 调用 \`eventBus.emit()\`（正确的是 \`runtimeBuilder.publishEvent()\`）
- ❌ 缺少 $mcComponentBuilder 调用
- ❌ 缺少必要参数：componentId、componentProps、componentName
- ❌ 缺少 onload 事件触发

## 4️⃣ 样式文件结构（index.less 必须完整）

✅ **必须生成的文件**（核心样式，由你输出）：
\`\`\`
resources/styles/
├── common.less      (所有业务样式，使用 .c-\${componentName}- 前缀)
└── themes/theme-vars.less   (主题变量：.common() .theme-dark() .theme-light())
\`\`\`

✅ **自动生成文件**（固定模板，你不要输出）：
\`\`\`
resources/styles/
├── index.less       (入口：自动导入 theme-vars.less / common.less / dark.less / light.less)
├── themes/dark.less (固定模板：&.dark { .theme-dark(); @import (multiple) '../common.less'; })
└── themes/light.less (固定模板：&.light { .theme-light(); @import (multiple) '../common.less'; })
\`\`\`

**index.less 最终由系统生成，你不要输出它。**

**package/index.vue 必须包含**：
\`\`\`vue
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
\`\`\`

❌ **绝对禁止**：
- 使用组件名命名的样式文件（如 c-xxx-component.less）
- 子组件添加 <style scoped> 块（只有主组件需要）

---

# ⚠️ 面板类型要求（最高优先级）

**必须使用指定的面板类型：**
- 面板类型已指定为：\`\${panelType || 'default-panel'}\`
- 生成的组件必须使用：\`<base-panel panelKey="\${panelType || 'default-panel'}">\`
- 不要使用其他panelKey值，必须严格使用指定的值

# 🎯 base-panel 插槽映射（必须遵循）

base-panel 已提供完整面板框架（标题栏、背景、边框），你只需通过**具名插槽**填充内容。

**禁止**在 base-panel 内部生成 \`<div class="header">\`、\`<div class="bg">\`、\`<div class="bg-layer">\`、\`<div class="panel-header">\` 等结构元素，所有头部内容必须通过插槽分发。

**关键过滤规则（CRITICAL）**：
- 如果 \`layoutStructure.structure\` 存在 \`background\` 字段（outer panel bg），**忽略它** —— 这是 base-panel 的面板背景，不是组件内容。
- 如果 \`layoutStructure.structure.children\` 中有 \`type: "header"\` / \`type: "panel-header"\` 的元素，**忽略它** —— base-panel 已经渲染标题栏。
- 这些被忽略的元素**不产生任何 DOM、不引用任何 bg/icon 资源、不写任何 class**。
- 只有标题栏装饰图标应通过 \`<template #title-left>\` / \`<template #title-right>\` / \`<template #header-right>\` 插入 base-panel 插槽。

**背景图应用规则（BACKGROUND_AS_CSS）**：
- 任何保留的背景图必须作为**父容器 CSS 的 background-image** 使用，例如：
  \`\`\`vue
  <div class="c-\${componentName}-content" :style="{ backgroundImage: \`url(\${bgX})\`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">...</div>
  \`\`\`
- **backgroundSize / backgroundPosition / backgroundRepeat 必须与 layoutStructure 中的值一致**。如果 layoutStructure 的 background/backgroundImage 字段包含 backgroundSize/backgroundPosition/backgroundRepeat，必须在 :style 绑定中精确还原这些值，不要自行推测或使用 cover/center/no-repeat 默认值。
- **禁止**为背景图单独创建一个空 \`<div>\`（如 \`bg-layer\`），再叠加其他内容。这是视觉错误的主要来源。
- **溢出裁切规则（OVERFLOW_HIDDEN）**：当 layoutStructure 的 background 或 backgroundImage 字段标记 \`needsOverflowHidden: true\` 时，承载该背景图的容器元素**必须添加 \`overflow: hidden\`**（通过 CSS class 或 :style），否则背景图溢出部分会穿透容器边界。示例：
  \`\`\`vue
  <div class="c-\${componentName}-content" :style="{ backgroundImage: \`url(\${bgX})\`, backgroundSize: 'auto 100%', overflow: 'hidden' }">...</div>
  \`\`\`

可用插槽（从左到右排列）：

| 插槽名 | 位置 | 用途 | 你的内容 |
|--------|------|------|----------|
| #title-left | 标题栏左侧 | 装饰图标、状态标识 | ${(headerSlots || []).filter(s => s.slotType === 'title-left').map(s => s.content || s.elementType).join('、') || '(无)'} |
| #title-right | 标题右侧紧邻 | 副标题、更新时间、单位 | ${(headerSlots || []).filter(s => s.slotType === 'title-right').map(s => s.content || s.elementType).join('、') || '(无)'} |
| #header-right | 标题右侧靠右 | 统计指标、Tab切换、图标操作按钮 | ${(headerSlots || []).filter(s => s.slotType === 'header-right').map(s => s.content || s.elementType).join('、') || '(无)'} |
| #close | 最右侧关闭 | 关闭按钮 | (base-panel 已默认提供) |
| 默认插槽 | 内容区 | 所有业务内容 | (布局结构中的 body 部分) |

**必须按以下方式使用**：
\`\`\`vue
<base-panel panelKey="\${panelType || 'default-panel'}">
  <template #title-left>
    <!-- 左侧装饰内容 -->
  </template>
  <template #title-right>
    <!-- 副标题/时间/单位 -->
  </template>
  <template #header-right>
    <!-- 右侧控件：Tab按钮、统计指标、图标操作 -->
  </template>
  <!-- 业务内容放在默认插槽 -->
  <div class="component-body">...</div>
</base-panel>
\`\`\`

**禁止行为**：
- ❌ 不要在默认插槽内生成 \`<div class="header">\` 或 \`<div class="panel-title">\` — 标题栏由 base-panel 提供
- ❌ 不要用 \`<h2>\` / \`<h3>\` 包裹标题 — base-panel 已渲染标题
- ❌ 不要在默认插槽内放置 header-right 的控件 — 它们必须在 \`<template #header-right>\` 中

**禁止渲染设计师注释**：
- ❌ 不要将 Figma 中以 \`*\` / \`#\` 开头或包含 \`TODO\`/\`注\`/\`标注\` 的文本渲染为 UI 内容（它们是设计稿标注，不是业务数据）
- ❌ 如果 visualElements 中有以 \`*\` 或 \`#\` 开头的注释文本，忽略它——它们不是最终产品的文字内容

# 当前阶段
${stage}${isRevision ? ' (修订模式)' : ''}

${revisionSection}
${runtimeRevisionSection}
# 输入信息

## 布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

## 视觉元素
\`\`\`json
${JSON.stringify(visualElements, null, 2)}
\`\`\`

${this._formatVisualStyle(visualElements)}

${charts && charts.length > 0 ? `
## 图表信息
\`\`\`json
${JSON.stringify(charts, null, 2)}
\`\`\`
` : ''}
${input.chartDataHints && input.chartDataHints.length > 0 ? `
## 📊 图表数据提示（从 Figma 节点提取的数值，必须使用！）

**🔴 铁律：图表中的数据值必须从以下提示中获取，禁止编造数值！**

\`\`\`json
${JSON.stringify(input.chartDataHints, null, 2)}
\`\`\`

**使用规则**：
1. ✅ labels 数组中的值 → 用作 xAxis.data / legend.data / 系列名称
2. ✅ values 数组中的值 → 用作 series[].data，保持数值精确
3. ❌ 禁止使用 100, 200, 300 等编造数据
4. ❌ 禁止使用 '数据1', '数据2' 等占位标签
` : ''}
${interactions && interactions.length > 0 ? `
## 交互信息
\`\`\`json
${JSON.stringify(interactions, null, 2)}
\`\`\`
` : ''}
${analysisType ? `
# 🎯 组件类型上下文（视觉分析识别的组件类型）

- **组件类型**: ${analysisType}${analysisTarget ? `\n- **目标区域**: ${analysisTarget}` : ''}${analysisDescription ? `\n- **功能描述**: ${analysisDescription}` : ''}${analysisEvidence && analysisEvidence.length > 0 ? `\n- **视觉证据**:\n${analysisEvidence.map(e => `  - ${e}`).join('\n')}` : ''}

⚠️ **重要**：以上是视觉分析从设计图中识别出的组件类型和描述。即使 layoutStructure.sections 为空，你也必须根据这些信息生成完整的组件代码。例如：
- 如果 type=tab-switch → 生成带有多个可切换标签的导航组件
- 如果 type=chart → 生成图表展示组件
- 如果 type=form → 生成表单组件
- description 中提到的标签名称必须作为 tab 项，例如 "监控、照明、通风、供配电、消防、交通诱导" 应生成 6 个 tab 标签

` : ''}
${stage === 'figma' ? `
# 🔴 Figma 精修规则（Figma阶段专属，最高优先级）

> 以下规则仅适用于 Figma 阶段。Preview 阶段忽略此部分。

${this.constraints['references/prompts/figma.md'] || ''}

## Figma 关键节点样式数据（用于精确样式还原）

${figmaNodeData ? this._formatFigmaStyleData(figmaNodeData) : '(无Figma节点数据)'}

## 样式映射结果

${styleMappings ? '\`\`\`json\n' + JSON.stringify(styleMappings, null, 2) + '\n\`\`\`' : '(无样式映射)'}

${elementStyleMap && Object.keys(elementStyleMap).length > 0 ? `
## 🆕 Per-Element 样式映射（elementStyleMap — 必须遵守）

以下是从 Visual Parser 输出的 elements[] 程序化提取的每个元素的完整 CSS 属性。
**这些值是从设计稿分析得出的明确值，必须直接写入 CSS，禁止用主题变量覆盖。**

\`\`\`json
${JSON.stringify(elementStyleMap, null, 2)}
\`\`\`

⚠️ **样式直接值优先规则（CRITICAL）**：

1. 当 elementStyleMap 中有明确的 \`color: "rgba(255,255,255,0.8)"\` 时，CSS 必须直接写 \`color: rgba(255,255,255,0.8)\`，**禁止写** \`color: \\@color-stat-label\`
2. 当 elementStyleMap 中有明确的 \`font-size: "20px"\` 时，CSS 必须直接写 \`font-size: 20px\`
3. 主题变量（themeVars/lessVariables）只用于**JSON中没有明确值**的属性
4. **深色面板的文字颜色必须是白色系** — 如果 backgroundBrightness=dark，所有文字颜色禁止使用黑色系（rgba(0,0,0,...)）

**正确示例**：
\`\`\`less
.stat-label {
  font-size: 12px;          // ← 直接值，来自 elementStyleMap
  color: rgba(255,255,255,0.8);  // ← 直接值，禁止用 \\@color-stat-label 替换
}
\`\`\`

**错误示例** ❌：
\`\`\`less
.stat-label {
  font-size: 12px;
  color: \\@color-stat-label;  // ← 主题变量可能默认是 rgba(0,0,0,0.65)（黑字！），覆盖了设计稿的白字
}
\`\`\`
` : ''}

## 已下载资源清单

${(() => {
  // 🆕 v2.2: 分离 CSS 替代资源和图片资源，给 LLM 明确指令
  if (!assets || (Array.isArray(assets) ? assets.length === 0 : Object.keys(assets).length === 0)) {
    return '(无已下载资源)'
  }
  const assetEntries = Object.values(assets).flat ? Object.values(assets) : [assets]
  const flatAssets = assetEntries.flat()
  const cssAssets = flatAssets.filter(a => a.cssInsteadOfImage)
  const imageAssets = flatAssets.filter(a => !a.cssInsteadOfImage)
  let out = ''
  if (cssAssets.length > 0) {
    out += '### ⚡ CSS 替代资源（纯色/渐变，已自动生成 CSS 值，**禁止引用图片文件**）\n\n'
    out += '\`\`\`json\n' + JSON.stringify(cssAssets.map(a => ({
      name: a.name,
      nodeId: a.ref,
      cssValue: a.cssValue,
      cssUsage: 'background: ' + a.cssValue + ';'
    })), null, 1) + '\n\`\`\`\n\n'
    out += '**规则**：\n1. 这些资源 **不要** 使用 \`<img>\` 标签，**不要** 通过 :style backgroundImage 引用图片\n'
    out += '2. 直接在 common.less 或 :style 中用 \`background: <cssValue>;\` 实现\n'
    out += '3. bg 类型应用到容器 \`background\` 属性；icon 类型用 CSS background + 尺寸定位\n\n'
  }
  if (imageAssets.length > 0) {
    out += '### 图片资源（引用系统注入的变量 bg1/icon1 等）\n\n'
    out += imageAssets.map(a => '- ' + (a.name || a.path) + ': ' + (a.type || 'image') + ' (' + (a.width || '?') + 'x' + (a.height || '?') + ')').join('\n')
  }
  return out || '(无已下载资源)'
})()}

${resourceDomMapping ? this._formatResourceMapping(resourceDomMapping) : ''}

## 🚫 资源导入规则（强制执行）

**禁止自行编写import语句！**系统会自动注入正确的import。

**你只需要：**
1. 使用标准变量名：bg1, bg2, icon1, icon2, img1, img2 等
2. 在模板中直接使用这些变量（:style、:src等）
3. 不要编写任何 import xxx from '...' 语句

**示例（正确）：**
\`\`\`vue
<template>
  <div :style="{ backgroundImage: \`url(\${bg1})\`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <img :src="icon1" />
  </div>
</template>

<script setup>
// 不要写import！系统会自动注入
const data = ref([...])
</script>
\`\`\`

⚠️ **重要提醒**：
- 必须使用 Figma 数据的精确像素值（禁止估算）
- 颜色从 fills.color 确转换（r*255, g*255, b*255）
- 圆角从 cornerRadius 提取
- 阴影从 effects 提取（DROP_SHADOW → box-shadow）
- 边框从 strokes 提取
- 子组件高度按 Figma bbox 真实比例分配（禁止平分）
- 纯色背景用 CSS，禁止用 background-image
- **backgroundSize/backgroundPosition/backgroundRepeat 必须从 layoutStructure 中精确还原，不要默认使用 cover/center/no-repeat**

❌ **绝对禁止**：用 CSS gradient 替代可用 bg **图片** 资源（bg **图片** 资源必须使用）。icon 资源建议使用但非强制——如果布局中没有自然位置，不要强行插入。可用图片资源（downloadStatus=success）必须以 img/:src 或 :style backgroundImage 方式引用。**CSS 替代资源**（cssInsteadOfImage=true）不要引用图片文件，直接用 CSS background 值。

` : ''}
# 开发规范

${this.constraints['references/constraints/ai-generation-constraints.md'] || ''}

${this.constraints['references/patterns/code-patterns.md'] || ''}

${this.constraints['references/specs/declare-json.md'] || ''}

# 🆕 Vue 样式标准（v3.0 Phase 1 - 强制 scoped + less + 前缀）

${this.constraints['references/standards/vue-style-standard.md'] || ''}

${this.constraints['references/standards/less-naming-convention.md'] || ''}
${interactions && interactions.length > 0 ? `

# 常见交互实现指南

根据 **交互信息（interactions）** 中识别出的交互类型，必须实现相应的功能代码。以下是常见交互的实现模板：

## 1. Tab 切换交互 (type: "tab-switch")

当 interactions 中包含 \`type: "tab-switch"\` 时，必须生成完整的标签页切换功能：

**实现要点：**
- 使用 \`ref\` 存储当前激活的 tab
- 渲染 tab 按钮列表，绑定点击事件
- 点击时更新激活状态，并触发数据刷新
- 为激活的 tab 添加高亮样式

**代码模板（基础版 - 纯文字标签）：**
\`\`\`vue
<template>
  <div class="component-root">
    <!-- Tab 按钮组 -->
    <div class="tab-buttons">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['tab-item', { active: currentTab === tab.value }]"
        @click="handleTabChange(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="tab-content">
      <div ref="chartRef" class="chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 选项（从 interactions[0].options 提取）
const tabs = ref([
  { label: '二氧化碳', value: 'co2' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 tab
const currentTab = ref('co2')

// 图表数据
const chartData = ref(null)
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 加载数据
const loadData = async () => {
  // 根据 currentTab 调用不同的 API 或加载不同的数据
  if (!runtimeBuilder?.callApi) {
    console.warn('runtimeBuilder.callApi 不可用')
    return
  }

  try {
    const res = await runtimeBuilder.callApi('your_api_name', {
      type: currentTab.value,
      // 其他参数
    })
    chartData.value = res?.data || null
    updateChart()
  } catch (e) {
    console.error('数据加载失败', e)
  }
}

// Tab 切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  loadData() // 切换后重新加载数据
}

// 监听 currentTab 变化
watch(currentTab, () => {
  loadData()
})

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 更新图表
const updateChart = () => {
  if (!chart) return
  const option = {
    // 根据 chartData 构建 ECharts option
  }
  chart.setOption(option, true)
}

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style scoped lang="less">
.tab-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-item {
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.65);
  transition: all 0.3s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    background: #1890ff;
    color: #ffffff;
  }
}
</style>
\`\`\`

## 2. 下拉框选择交互 (type: "select-change")

当 interactions 中包含 \`type: "select-change"\` 或识别出下拉框元素时：

**实现要点：**
- 使用 \`ref\` 存储选中值
- 渲染 \`<select>\` 元素，绑定 \`v-model\`
- 监听选中值变化，触发数据刷新

**代码模板：**
\`\`\`vue
<template>
  <div class="component-root">
    <!-- 下拉框 -->
    <div class="select-wrapper">
      <select v-model="selectedValue" class="custom-select">
        <option v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- 内容区域 -->
    <div class="content">
      <div v-if="chartData" ref="chartRef" class="chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

// 下拉框选项
const options = ref([
  { label: '选项1', value: 'opt1' },
  { label: '选项2', value: 'opt2' }
])

// 选中值
const selectedValue = ref('opt1')

// 数据
const chartData = ref(null)
const chartRef = ref(null)

// 加载数据
const loadData = async () => {
  if (!runtimeBuilder?.callApi) return

  try {
    const res = await runtimeBuilder.callApi('your_api_name', {
      filter: selectedValue.value
    })
    chartData.value = res?.data || null
    updateChart()
  } catch (e) {
    console.error('数据加载失败', e)
  }
}

// 监听选中值变化
watch(selectedValue, () => {
  loadData()
})

const updateChart = () => {
  if (!chartRef.value || !chartData.value) return
  // 构建图表配置
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="less">
.custom-select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  cursor: pointer;
}
</style>
\`\`\`

## 3. 图表 Tooltip 交互

所有图表都应该包含 tooltip 配置，实现鼠标悬停显示详情：

**ECharts Tooltip 配置模板：**
\`\`\`javascript
const option = {
  tooltip: {
    trigger: 'axis', // 或 'item'（饼图等）
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    textStyle: {
      color: '#ffffff',
      fontSize: 12
    },
    formatter: (params) => {
      // 自定义格式
      const p = Array.isArray(params) ? params[0] : params
      return \`\${p.name}<br/>\${p.seriesName}: \${p.value} \${unit || ''}\`
    }
  },
  // 其他配置...
}
\`\`\`

## 4. 开关/Toggle 交互 (type: "toggle")

**代码模板：**
\`\`\`vue
<template>
  <div class="toggle-wrapper">
    <label class="toggle-switch">
      <input type="checkbox" v-model="isEnabled" />
      <span class="slider"></span>
    </label>
    <span class="toggle-label">{{ isEnabled ? '开启' : '关闭' }}</span>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const isEnabled = ref(false)

watch(isEnabled, (newVal) => {
  // 触发相应的动作
  console.log('Toggle changed:', newVal)
  // 可以调用 API 或更新数据
})
</script>

<style scoped lang="less">
.toggle-switch {
  position: relative;
  width: 44px;
  height: 22px;

  input { display: none; }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 22px;
    transition: 0.3s;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      border-radius: 50%;
      transition: 0.3s;
    }
  }

  input:checked + .slider {
    background-color: #1890ff;

    &:before {
      transform: translateX(22px);
    }
  }
}
</style>
\`\`\`

## 实现原则

1. **必须根据 interactions 数组生成对应的交互代码** - 不能只识别不实现
2. **交互必须是完整可用的** - 包含 UI、状态管理、事件处理、数据刷新
3. **使用 Vue 3 Composition API** - ref、watch、onMounted 等
4. **样式要与设计稿一致** - 激活状态、悬停效果等
5. **数据刷新要调用 runtimeBuilder.callApi** - 不能只是静态展示
` : ''}
`

    const middleFull = `
# 任务要求

请生成完整的微码组件核心代码，包括：

1. **declare.json** - 组件配置文件
2. **package/index.vue** - 主组件文件
3. **package/components/*.vue** - 子组件文件（如需要）
4. **resources/styles/index.less** - 主样式文件（入口）
5. **resources/styles/common.less** - 业务样式
6. **resources/styles/themes/theme-vars.less** - 主题变量 mixin

注意：**dark.less** 和 **light.less** 是固定模板，由生成器自动补充，你不需要输出。

## 关键约束

**组件ID规范**：
- declare.json 中的 componentId 必须使用：\`\${componentName}\`
- declare.json 中的 componentName（中文显示名称）必须使用：\`\${displayName || componentName}\`
- 不要自行创造组件ID或名称，必须严格使用上面指定的值

**Less变量规范（纯 Less 变量主题模式）**：
- theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`
- 颜色变量定义在 mixin 内部，theme-vars.less 末尾全局调用 \`.theme-${defaultTheme}()\` 作为默认值
  - 理由：当前面板 backgroundBrightness=${backgroundBrightness}，默认主题必须匹配面板明暗，否则文字颜色会在面板上显示错误
- dark.less / light.less 由生成器自动补充，格式为：
  \`\`\`less
  &.dark { .theme-dark(); @import (multiple) '../common.less'; }
  \`\`\`
- 正确格式示例：
\`\`\`less
// theme-vars.less
.common() {
  // 可放置跨主题共享变量
}
.theme-dark() {
  @color-card-bg: rgba(255, 255, 255, 0.05);
  @color-text-primary: #ffffff;
  @color-text-secondary: rgba(255, 255, 255, 0.65);
}
.theme-light() {
  @color-card-bg: #ffffff;
  @color-text-primary: #333333;
  @color-text-secondary: rgba(0, 0, 0, 0.65);
}
.theme-${defaultTheme}(); /* 全局默认：与面板 backgroundBrightness=${backgroundBrightness} 一致 */
\`\`\`
- **dark.less / light.less 由生成器自动创建，不要输出**

**Figma精修要求**：
- 严格按照布局结构和视觉元素生成代码
- 使用真实的尺寸、间距、字体大小
- 不要使用占位符数据，根据设计推断合理的示例数据
- 颜色、圆角、阴影等样式要与设计稿一致

**容器约束规范**（防止内容溢出）：
- 组件顶层容器必须设置：\`width: 100%; height: 100%;\`
- 所有容器使用：\`box-sizing: border-box;\`
- 根容器设置：\`overflow: hidden;\` 防止内容溢出
- 使用 flexbox 或 grid 布局使内容自适应容器尺寸
- 内部元素避免使用固定宽高，优先使用百分比或flex属性
- 示例：
\`\`\`less
.component-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
\`\`\`

# 输出格式

请按照以下格式输出（**不要用 JSON**，用文件分隔符格式，更节省 token 避免截断）：

\`\`\`
// === declare.json ===
{
  "componentId": "\${componentName}",
  "componentName": "\${displayName || componentName}",
  ...
}

// === package/index.vue ===
<template>
  ...
</template>
<script setup>
...
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

// === resources/styles/index.less ===
@import './themes/theme-vars.less';
@import (multiple) './common.less';
@import './themes/dark.less';
@import './themes/light.less';

// === resources/styles/common.less ===
.c-\${componentName}-root { ... }

// === resources/styles/themes/theme-vars.less ===
.common() { /* 跨主题共享变量 */ }
.theme-dark() { /* 深色变量 */ }
.theme-light() { /* 浅色变量 */ }
.theme-${defaultTheme}(); /* 默认与面板 backgroundBrightness=${backgroundBrightness} 一致 */
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，**不要转义换行符和引号**（不要用 \\n 和 \\" ）
- 文件之间用空行分隔
- 不要包裹在 JSON 中，不要用 \`\`\`json 代码块
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程、检查清单等非文件内容中使用此前缀**

**⚠️ 不要生成以下文件**（由系统自动生成标准模板）：
- \`component.js\` - 系统将自动生成正确的样式引用（.less）
- \`declare.js\` - 系统将自动生成标准的声明文件
- \`resources/styles/index.less\` - 系统将自动生成入口导入
- \`resources/styles/themes/dark.less\` 和 \`resources/styles/themes/light.less\` - 系统将自动生成固定主题包装
`

    const coreAndChecklist = `
# 核心约束

1. 严格遵循preview阶段规则
2. 不要添加设计稿中没有的装饰元素
3. 正确区分section的header和body层级
4. 图表图例使用ECharts内置组件
5. 所有业务样式写在common.less中

# ⚠️ ECharts 图表规范（强制要求）

**使用 echarts.init() 初始化图表，必须满足以下所有条件**：

1. **\`$mcComponentBuilder()\` 必须用 try-catch 包裹**（防止框架未就绪时模块加载失败导致整个组件不可见）
2. **必须使用 \`watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })\`**（处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景）
3. **必须使用 ResizeObserver 等待容器就绪**（处理尺寸为 0 的情况）
4. **禁止导入不存在的模块导出**（如 \`import { set } from '@vueuse/core'\`）

# 🎯 图表与面板 UI 还原红线（6 类高频缺陷，强制）

生成图表/面板类组件（流量监测、关键车辆统计等）必须逐条满足，缺一则效果图不合格：

1. **背景图精确还原（bg-size）**：Figma 节点带背景图时，用真实 CSS 还原 \`background-size / background-position / background-repeat\`，**禁止无脑 cover/center/no-repeat**；Figma 标注具体尺寸/位置则逐值对应。
2. **环形图环厚（radius）**：ECharts 环形图必须用 \`radius: [内, 外]\` 数组精确控制环厚（如 \`['55%','75%']\`），**禁止默认 \`radius:'50%'\` 过细或单值失真**；环厚按 Figma 视觉比例设定。
3. **边框生成（border）**：Figma 标注 stroke 的面板/卡片/分区**必须**生成 \`border: <width>px solid <color>\`（圆角对应 \`border-radius\`），**禁止只设背景色漏边框**。
4. **图例位置（legend.position）**：\`legend\` 的 top/bottom/left/right 必须对齐 Figma 图例实际方位，禁止默认堆顶部；多图共享图例时位置一致。
5. **图例存在性（legend 必生成）**：Figma 有图例则**必须**生成对应 \`legend\` 配置，禁止只画 series 不画 legend（导致无法区分数据系列）。
6. **交通预测/趋势卡片（区块还原）**：设计含"交通预测/趋势/预警"等卡片区块时，必须还原为真实 DOM（数值+单位+环比/趋势箭头/状态色），**禁止整块遗漏或用占位文本**。

参考示例：
\`\`\`vue
<template>
  <div class="chart-wrapper">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn('[组件] $mcComponentBuilder 失败:', e) }

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [] }]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>
<style scoped lang="less">
.chart-wrapper { width: 100%; height: 100%; }
.chart-container { width: 100%; height: 100%; min-width: 0; min-height: 0; }
</style>
\`\`\`

---

# ✅ 生成前强制自检清单

**在返回生成的代码之前，你必须逐项检查以下内容：**

## 📋 核心规范自检

- [ ] **RESOURCE_UTILIZATION**: 所有 bg1/bg2/icon1/icon2 等资源变量都通过 :src 或 :style 使用，没有自行编写 import 语句
- [ ] **L4-003**: common.less 中所有 class 都使用了 \`.c-\\${componentName}-\` 前缀（没有 .item、.box、.wrapper 等通用名）
- [ ] **$mcComponentBuilder**: 在 package/index.vue 的 <script setup> 中正确调用并解构（使用 try-catch 包裹）
- [ ] **onload 事件**: 在 onMounted 中调用 runtimeBuilder.publishEvent('\\${componentName}-onload', {...})
- [ ] **index.less**: resources/styles/index.less 包含 @import './themes/theme-vars.less'、@import (multiple) './common.less'、@import './themes/dark.less'、@import './themes/light.less'
- [ ] **style 块**: package/index.vue 末尾有 <style lang="less" scoped> 并 @import '../resources/styles/index.less'
- [ ] **panelKey**: <base-panel panelKey="\\${panelType || 'default-panel'}"> 使用了正确的面板类型
- [ ] **declare.json**: businessEvents 包含 '\\${componentName}-onload' 事件声明；eventDataSchema 至少声明 componentId 和 timestamp（禁止空对象 {}）；componentName 必须是纯中文标题，不要带 cp-/mc-/mc-doc- 等前缀

## 🔍 样式自检（高频违规）

- [ ] **theme-vars.less 变量类型**：无 CSS 变量（禁止 var(--xxx)），只使用 Less 变量 @xxx
- [ ] **theme-vars.less 默认主题**：末尾全局调用 .theme-light()（不是 .theme-dark()）
- [ ] **面板外壳**：common.less 中 .c-\\${componentName}-content 无 background/box-shadow/border-radius（base-panel 已提供）
- [ ] **theme-vars.less 完整性**：三个 mixin .common()、.theme-dark()、.theme-light() 均已定义且闭合

## 🔍 常见错误自查

- [ ] 没有在 script 中 import 样式文件（样式只在 <style> 块中 @import）
- [ ] 没有在子组件中添加 <style scoped> 块（只有主组件需要）
- [ ] 没有生成组件名命名的 less 文件（如 c-xxx-component.less）
- [ ] 没有用 CSS gradient 替代已下载的 bg 资源
- [ ] 没有遗漏 $mcComponentBuilder 的 runtimeBuilder 解构
- [ ] 没有忘记 onMounted 中的 emitLoadEvent 调用

**如果以上任何一项未满足，立即修正后再返回代码。**

---

`

    // 🧩 分块生成：若传入 chunkSpec.middle 则使用分块版"任务要求+输出格式"，否则用完整版
    const middle = (chunkSpec && chunkSpec.middle) ? chunkSpec.middle : middleFull

    // 🆕 v3.7: type-aware shared 段裁剪 — 按文件类型移除无关规范
    const sharedFilter = chunkSpec?.sharedFilter || 'full'
    const trimmedShared = sharedFilter !== 'full' ? this._trimSharedForFileType(shared, sharedFilter) : shared

    const prompt = trimmedShared + middle + coreAndChecklist + '\n开始生成代码：\n'
    return prompt
    } catch (error) {
      logger.error('buildCodePrompt 执行失败', {
        error: error.message,
        componentName: input?.componentName,
        stage: input?.stage
      })
      throw error
    }
  }

  /**
   * 🆕 v3.7: type-aware shared 段裁剪
   * 按文件类型移除无关规范段，减少 prompt token 消耗
   */
  _trimSharedForFileType(shared, filter) {
    if (!shared || filter === 'full') return shared

    const removeSections = {
      template: [
        '## 3.1️⃣ $mcComponentBuilder',
        '## 4️⃣ 样式文件结构',
        '## 2.2️⃣ 元素样式差异化规则'
      ],
      script: [
        '## 4️⃣ 样式文件结构',
        '## 2️⃣ 混合布局规则',
        '## 2.1️⃣ stat-item 自身布局方向规则',
        '## 2.2️⃣ 卡片布局规则'
      ]
    }

    const sections = removeSections[filter] || []
    if (sections.length === 0) return shared

    let trimmed = shared
    for (const sectionHeader of sections) {
      const escaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sectionRx = new RegExp(`${escaped}[\\s\\S]*?(?=\\n## \\d|$)`, 'g')
      const before = trimmed.length
      trimmed = trimmed.replace(sectionRx, `/* [已移除] ${sectionHeader} — ${filter} 分块无需此规范 */\n`)
    }

    const saved = shared.length - trimmed.length
    if (saved > 0) {
      logger.info(`🧹 type-aware shared 裁剪: ${filter}`, { savedChars: saved, pct: Math.round(saved / shared.length * 100) + '%' })
    }
    return trimmed
  }

  /**
   * 🆕 S8: 需求文档设计注入块（doc-analysis.json → prompt，机械转换，零业务词）
   * 注入四维：events / dataBinding / config(businessConfig+cssVariableConfig) / interactions
   * 不注入 uiElements（元素覆盖率校验在 L0-B 进行，保持 prompt 精简）
   */
  _buildDocDesignBlock(docAnalysis) {
    if (!docAnalysis || typeof docAnalysis !== 'object') return ''

    let block = '\n\n# 📄 需求文档业务设计（必须完整实现，优先级高于自行推断）\n\n'
    block += '以下设计来自需求文档的结构化解析，是业务实现的**权威依据**。生成代码时必须完整落地，不得擅自更改事件名/配置 key/字段名。\n'
    let hasContent = false

    // ① 业务事件（declare.json businessEvents + publishEvent 调用点）
    const events = docAnalysis.events || []
    if (events.length) {
      hasContent = true
      block += '\n## 业务事件（businessEvents — 必须声明 + 在对应时机 publishEvent）\n\n'
      for (const e of events) {
        block += `- **${e.eventId}**${e.description ? `：${e.description}` : ''}`
        if (e.payload && typeof e.payload === 'object' && Object.keys(e.payload).length) {
          block += `，payload: \`${JSON.stringify(e.payload)}\``
        } else if (typeof e.payload === 'string' && e.payload) {
          block += `，payload: ${e.payload}`
        }
        block += '\n'
      }
      block += '\n要求：declare.json 的 businessEvents 必须包含以上全部事件；代码中在对应业务时机调用 runtimeBuilder.publishEvent()。\n'
    }

    // ② 业务状态（对外可调用方法 — 名称+参数+行为）
    const statuses = docAnalysis.statuses || []
    if (statuses.length) {
      hasContent = true
      block += '\n## 业务状态方法（businessStatuses — 组件对外暴露的可调用操作）\n\n'
      for (const s of statuses) {
        block += `- **${s.statusId}**${s.description ? `：${s.description}` : ''}`
        if (s.params && typeof s.params === 'string' && s.params) block += `，参数: ${s.params}`
        block += '\n'
      }
      block += '\n要求：declare.json 的 businessStatuses 声明这些方法，代码中实现对应的可外部调用处理函数。\n'
    }

    // ③ 数据对接（接口 + 字段映射）
    const apis = docAnalysis.dataBinding?.apis || []
    const fieldMappings = docAnalysis.dataBinding?.fieldMappings || []
    if (apis.length || fieldMappings.length) {
      hasContent = true
      block += '\n## 数据对接（接口调用 + 字段映射）\n\n'
      for (const api of apis) {
        block += `- 接口 **${api.apiCode}**`
        if (api.method && api.path) block += `：\`${api.method} ${api.path}\``
        if (api.usage) block += `（${api.usage}）`
        block += '\n'
      }
      if (fieldMappings.length) {
        block += '\n字段映射（响应字段 → UI 元素，渲染时必须按此取数）：\n\n'
        for (const fm of fieldMappings) {
          block += `- \`${fm.field}\` → ${fm.element}${fm.control ? `（${fm.control}）` : ''}`
          if (fm.condition) block += ` ⚠️ 条件显示：${fm.condition}`
          block += '\n'
        }
      }
      block += '\n要求：父组件统一调用接口（同一接口只调一次），provide/inject 下发数据，子组件 watch 响应；字段取用严格按映射表。\n'
    }

    // ④ 业务配置（businessConfig → declare.json + getConfig 消费）
    const businessConfig = docAnalysis.businessConfig || []
    if (businessConfig.length) {
      hasContent = true
      block += '\n## 业务配置（businessConfig — declare.json 声明 + getConfig 消费）\n\n'
      block += '```json\n' + JSON.stringify(businessConfig, null, 2) + '\n```\n'
      block += '\n要求：declare.json businessConfig 按此声明（key/type/default/renderType 保持一致）；代码中通过 getConfig 三级优先级链读取，配置变更需真实生效（如刷新间隔/显隐/阈值）。\n'
    }

    // ⑤ CSS 变量配置（cssVariableConfig → theme-vars.less）
    const cssVars = docAnalysis.cssVariableConfig || []
    if (cssVars.length) {
      hasContent = true
      block += '\n## CSS 变量配置（cssVariableConfig → theme-vars.less）\n\n'
      block += '```json\n' + JSON.stringify(cssVars, null, 2) + '\n```\n'
      block += '\n要求：declare.json cssVariableConfig 按此声明；theme-vars.less 中定义对应变量，样式中引用变量而非硬编码色值。\n'
    }

    // ⑥ 简单交互
    const interactions = docAnalysis.interactions || []
    if (interactions.length) {
      hasContent = true
      block += '\n## 交互行为（必须在组件中实现）\n\n'
      for (const it of interactions) {
        block += `- **${it.trigger}** → ${it.behavior}`
        if (it.target) block += `（目标: ${it.target}）`
        block += '\n'
      }
    }

    // ⑦ onload 流程（首屏调用/首屏渲染/轮询）
    const onload = docAnalysis.onloadFlow || {}
    if (onload.initCalls?.length || onload.polling) {
      hasContent = true
      block += '\n## 初始化流程（onload 骨架）\n\n'
      if (onload.initCalls?.length) block += `- 首屏数据调用：${onload.initCalls.join(', ')}\n`
      if (onload.polling?.default) block += `- 轮询间隔：${onload.polling.default}ms（从配置项读取，父组件统一维护定时器）\n`
      block += '- 必须触发 onload 事件（微码规范强制）\n'
    }

    // 推断项提示（若有）
    const inferredItems = (docAnalysis.extractionMeta?.inferredItems || []).filter(Boolean)
    if (inferredItems.length) {
      block += '\n⚠️ 以下为 AI 推断的配置项（文档未明确），请按声明生成但标记为待确认：\n'
      inferredItems.forEach((i) => { block += `- ${i}\n` })
    }

    return hasContent ? block : ''
  }

  /**
   * 生成组件代码
   */
  async generateCode(input) {
    logger.info('开始生成组件代码（自适应分块生成模式）', { stage: input.stage })

    const { _l0CodeRetryGuidance, techStackHints, _selfOptimization, layoutStructure, docAnalysis, outputPath, targetFiles, reviseTarget } = input

    // 🆕 P1: 按问题类别只修目标文件
    // 仅在“修订模式 + 给定目标文件 + 非全量修订”时启用：只让 LLM 重新生成 targetFiles，
    // 其余文件从磁盘读取现有内容并保留，避免再次全量重做浪费模型调用与时间。
    const targetFileSet = new Set(Array.isArray(targetFiles) && targetFiles.length ? targetFiles : [])
    const isPartialRevision = !!input.isRevision && targetFileSet.size > 0 && reviseTarget && reviseTarget !== 'full'
    const diskContent = (rel) => {
      if (!outputPath) return null
      try {
        return readFileSync(join(outputPath, rel), 'utf-8')
      } catch {
        return null
      }
    }
    if (isPartialRevision) {
      logger.info('🎯 P1: 部分修订模式，仅重做目标文件，其余从磁盘保留', {
        targetFiles: [...targetFileSet],
        reviseTarget
      })
    }
    const complexity = this.assessComplexity(layoutStructure)
    const splitDecision = this.shouldSplitIndexVue(complexity, input)
    logger.info('🧩 组件复杂度评估', {
      complexity,
      stage: input.stage,
      splitIndexVue: splitDecision.split,
      splitReason: splitDecision.reason,
      scriptSplit: splitDecision.scriptSplit,
      sizeTier: splitDecision.sizeTier,
      estTokens: splitDecision.estTokens,
    })

    // 🆕 S8: 需求文档设计注入块（机械转换一次构建，所有分块共享）
    const docDesignBlock = this._buildDocDesignBlock(docAnalysis)
    if (docDesignBlock) {
      logger.info('📄 需求文档设计注入块已构建', {
        events: docAnalysis?.events?.length || 0,
        apis: docAnalysis?.dataBinding?.apis?.length || 0,
        businessConfig: docAnalysis?.businessConfig?.length || 0,
        blockChars: docDesignBlock.length
      })
    }

    const allFiles = {}
    const chunkDebug = []
    // 🆕 v3.5: 程序化提取的模板 class 名列表，用于 CSS batch 硬约束 + 校验自动修复
    let classNamesList = []

    const appendGlobalGuidance = (p) => {
      if (docDesignBlock) p += docDesignBlock  // 🆕 S8: 文档设计注入（位于重试/技术栈之前，权威依据优先展示）
      if (_l0CodeRetryGuidance) p += _l0CodeRetryGuidance

      // 默认技术栈规则（无论是否有 @xxx 标记都生效）
      p += '\n\n## 🔧 默认技术栈规则（强制）\n\n'
      p += '本项目已全局注册 ant-design-vue，组件中直接使用 `<a-xxx>` 标签即可，无需 import。\n\n'
      p += '| 场景 | 默认技术栈 | 说明 |\n|------|-----------|------|\n'
      p += '| 表单组件（输入框/下拉/日期/开关/单选/多选） | ant-design-vue | `<a-input>` / `<a-select>` / `<a-date-picker>` / `<a-switch>` / `<a-radio-group>` / `<a-checkbox-group>` |\n'
      p += '| 数据表格 | ant-design-vue | `<a-table>` |\n'
      p += '| 弹窗 | ant-design-vue | `<a-modal>` |\n'
      p += '| 标签页 | ant-design-vue | `<a-tabs>` + `<a-tab-pane>` |\n'
      p += '| 按钮 | ant-design-vue | `<a-button>` |\n'
      p += '| 图表 | ECharts | `echarts.init()` + `ResizeObserver` + `watch(chartRef)` |\n\n'
      p += 'Figma 节点名标注 `@antd/xxx` 时按标注匹配对应组件；未标注时按上表默认规则选择技术栈。\n\n'
      p += '### ⚠️ antd 样式覆盖必须使用 :deep()\n\n'
      p += '组件使用 `<style lang="less" scoped>`，antd 内部 DOM（`.ant-xxx`）不携带 `data-v-xxx`，直接写 `.ant-xxx` **不生效**。\n\n'
      p += '```less\n/* ✅ 正确 */\n:deep(.ant-input) { background: transparent; border-color: var(--border-color); }\n:deep(.ant-select-selector) { background: transparent; }\n:deep(.ant-table-thead) { background: rgba(0,0,0,0.3); }\n:deep(.ant-table-tbody > tr > td) { border-bottom: 1px solid var(--border-color); }\n:deep(.ant-btn) { border-radius: 4px; }\n\n/* ❌ 错误 — scoped 下不生效 */\n.ant-input { background: transparent; }\n```\n\n'

      if (techStackHints && techStackHints.length > 0) {
        p += '\n## 🔧 Figma 技术栈标记\n\n'
        p += 'Figma 设计文件中包含以下技术栈标记，请优先使用对应的库和组件：\n\n'
        techStackHints.forEach(hint => {
          p += `- **${hint.library}**${hint.component ? ` / ${hint.component}` : ''}\n`
          p += `  节点：${hint.nodeName}\n`
        })
        p += '\n请根据组件描述匹配对应的技术栈。\n'
      }
      if (_selfOptimization?.promptAugmentation) {
        p += '\n\n## 🧠 自优化增强（基于历史运行数据）\n\n'
        p += _selfOptimization.promptAugmentation + '\n'
      }
      return p
    }

    // 通用：执行单个分块（middleBuilder 决定"任务要求+输出格式"段落）
    const runChunk = async (chunk, middleBuilder) => {
      // 🆕 暂停检查：每个分块生成前等恢复（pauseChecker 由 phase2.service 注入）
      const pauseStatus = await this._awaitIfPaused(input.pauseChecker)
      if (pauseStatus === 'cancelled') {
        throw new Error('任务已被用户取消')
      }

      // 🆕 P1: 部分修订 —— 非目标文件从磁盘保留，跳过 LLM 生成
      if (isPartialRevision) {
        const touchesTarget = (chunk.files || []).some((f) => targetFileSet.has(f))
        if (!touchesTarget) {
          let primed = false
          for (const f of (chunk.files || [])) {
            if (allFiles[f] != null) continue
            const c = diskContent(f)
            if (c != null) {
              allFiles[f] = c
              primed = true
            }
          }
          // 文件均已在内存中（已生成或已从磁盘读取）→ 跳过；
          // 若某文件既不在内存也不在磁盘（新引用子组件等），仍交给 LLM 生成，避免缺失。
          if (primed || (chunk.files || []).every((f) => allFiles[f] != null)) {
            logger.info('⏩ P1: 跳过未变更文件（从磁盘保留）', { files: chunk.files })
            return { files: {}, debug: { skipped: true, reason: 'not-target' } }
          }
        }
      }

      // 🆕 文件类型感知：不同文件类型使用不同的 prompt 构建器，减少无关约束
      const fileType = this._getChunkFileType(chunk)
      let prompt
      if (fileType === 'declare') {
        prompt = this._buildDeclareChunkPrompt(input, chunk)
      } else if (fileType === 'style') {
        prompt = this._buildStyleChunkPrompt(input, chunk)
      } else {
        prompt = this.buildCodePrompt(input, { middle: middleBuilder.call(this, chunk, input), sharedFilter: chunk.segmentType })
      }
      prompt = appendGlobalGuidance(prompt)
      const res = await this._generateSingleChunk(prompt, chunk, input)
      chunkDebug.push(res.debug)
      return res
    }

    try {
      if (splitDecision.split && complexity !== 'medium') {
        // ═══ 统一分块路径：complex / simple-risky 共用（medium 回滚实验：恢复整文件优先）═══
        // index.vue 默认拆为 <template> + <script> 两段；超大组件（scriptSplit）再把 script 拆为 状态/行为 两段（#9a）
        logger.info('🧩 分块生成组件（统一路径）', {
          complexity,
          splitReason: splitDecision.reason,
          scriptSplit: !!splitDecision.scriptSplit,
          sizeTier: splitDecision.sizeTier,
          estTokens: splitDecision.estTokens
        })

        // 批1: declare.json（🛡️ P0：带降级兜底）
        const chunkD = { title: '声明文件', files: ['declare.json'], index: 1, total: 6, contextFiles: [] }
        const resD = await this._safeGenerateDeclareJson(runChunk, input, chunkD)
        Object.assign(allFiles, resD.files)

        // 批2-4: index.vue（template + script，超大组件 script 拆两段）
        const indexVue = await this._generateIndexVue(runChunk, input, { splitDecision, allFiles })
        if (indexVue) {
          allFiles['package/index.vue'] = indexVue
        }

        // 批5: 子组件（据 index.vue import 引用动态补生成）
        const subComps = this._detectSubComponents(allFiles['package/index.vue'] || '')
        let idx = 5
        for (const subPath of subComps) {
          const subChunk = {
            title: '子组件 ' + subPath, files: [subPath],
            index: idx++, total: 5 + subComps.length,
            contextFiles: [{ path: 'package/index.vue', content: allFiles['package/index.vue'] || '' }]
          }
          const resSub = await runChunk(subChunk, this._buildChunkMiddle)
          Object.assign(allFiles, resSub.files)
        }

        // 批6: 样式（回填 index.vue + 子组件上下文，保证 class 命名一致）
        // 🆕 v3.5: 程序化提取模板 class 名，注入为硬约束
        const extractedSplit = this._extractTemplateClassNames(allFiles, input.componentName)
        classNamesList = extractedSplit.fullList

        const styleCtxSplit = this._collectVueContextFiles(allFiles)
        const chunkStyle = {
          title: '样式文件',
          files: ['resources/styles/common.less', 'resources/styles/themes/theme-vars.less'],
          index: idx, total: idx,
          contextFiles: styleCtxSplit,
          classNamesList
        }
        const resStyle = await runChunk(chunkStyle, this._buildChunkMiddle)
        Object.assign(allFiles, resStyle.files)

      } else if (complexity === 'medium') {
        // ═══ 回滚实验：medium 恢复"整文件优先"策略 ═══
        logger.info('⚡ 回滚实验：medium 组件恢复整文件优先', {
          splitReason: splitDecision.reason,
          sizeTier: splitDecision.sizeTier,
          estTokens: splitDecision.estTokens
        })

        // 批1: declare.json
        const chunkD = { title: '声明文件', files: ['declare.json'], index: 1, total: 3, contextFiles: [] }
        const resD = await this._safeGenerateDeclareJson(runChunk, input, chunkD)
        Object.assign(allFiles, resD.files)

        // 批2: index.vue 整文件优先，截断才降级拆分
        try {
          const chunkI = {
            title: '主组件', files: ['package/index.vue'], index: 2, total: 3,
            contextFiles: [{ path: 'declare.json', content: allFiles['declare.json'] || '' }]
          }
          const resI = await runChunk(chunkI, this._buildChunkMiddle)
          Object.assign(allFiles, resI.files)
        } catch (truncErr) {
          logger.warn('⚠️ 回滚实验：medium 组件 index.vue 整文件截断，降级为 template/script 拆分', { error: truncErr.message })
          const fallbackSplit = { ...splitDecision }
          const indexVue = await this._generateIndexVue(runChunk, input, { splitDecision: fallbackSplit, allFiles })
          if (indexVue) {
            allFiles['package/index.vue'] = indexVue
          }
        }

        // 批3: 子组件
        const subComps = this._detectSubComponents(allFiles['package/index.vue'] || '')
        let idx = 3
        for (const subPath of subComps) {
          const subChunk = {
            title: '子组件 ' + subPath, files: [subPath],
            index: idx++, total: 3 + subComps.length,
            contextFiles: [{ path: 'package/index.vue', content: allFiles['package/index.vue'] || '' }]
          }
          const resSub = await runChunk(subChunk, this._buildChunkMiddle)
          Object.assign(allFiles, resSub.files)
        }

        // 批4: 样式
        const extractedMedium = this._extractTemplateClassNames(allFiles, input.componentName)
        classNamesList = extractedMedium.fullList

        const styleCtxAllVueMed = this._collectVueContextFiles(allFiles)
        const chunkStyle = {
          title: '样式文件',
          files: ['resources/styles/common.less', 'resources/styles/themes/theme-vars.less'],
          index: idx, total: idx,
          contextFiles: styleCtxAllVueMed,
          classNamesList
        }
        const resStyle = await runChunk(chunkStyle, this._buildChunkMiddle)
        Object.assign(allFiles, resStyle.files)

      } else {
        // ═══ 简单低风险：decl + index 两批（不拆分 index.vue）═══
        logger.info('⚡ 简单组件：低风险，保留 declare + index.vue 两批生成', {
          reason: splitDecision.reason,
          sizeTier: splitDecision.sizeTier,
          estTokens: splitDecision.estTokens
        })

        const chunkA = { title: '主组件 + 声明', files: ['declare.json', 'package/index.vue'], index: 1, total: 2, contextFiles: [] }
        const resA = await runChunk(chunkA, this._buildChunkMiddle)
        Object.assign(allFiles, resA.files)

        const subComps = this._detectSubComponents(allFiles['package/index.vue'] || '')
        let idx = 2
        for (const subPath of subComps) {
          const subChunk = {
            title: '子组件 ' + subPath, files: [subPath],
            index: idx++, total: 2 + subComps.length,
            contextFiles: [{ path: 'package/index.vue', content: allFiles['package/index.vue'] || '' }]
          }
          const resSub = await runChunk(subChunk, this._buildChunkMiddle)
          Object.assign(allFiles, resSub.files)
        }

        // 🆕 v3.5: 程序化提取模板 class 名
        const extractedSimple = this._extractTemplateClassNames(allFiles, input.componentName)
        classNamesList = extractedSimple.fullList

        const styleCtxAllVueSim = this._collectVueContextFiles(allFiles)
        const chunkB = {
          title: '样式文件',
          files: ['resources/styles/common.less', 'resources/styles/themes/theme-vars.less'],
          index: idx, total: idx,
          contextFiles: styleCtxAllVueSim,
          classNamesList
        }
        const resB = await runChunk(chunkB, this._buildChunkMiddle)
        Object.assign(allFiles, resB.files)
      }

      // 🔍 诊断：保存分块聚合响应（便于排查真实 LLM 输出 / 截断）
      try {
        const debugDir = dirname(input.outputPath || process.cwd())
        if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true })
        const debugPath = join(debugDir, 'debug-microcode-ai-response.txt')
        writeFileSync(debugPath, JSON.stringify({ mode: 'chunked-adaptive', complexity, chunks: chunkDebug }, null, 2), 'utf-8')
        logger.info('🔍 [诊断] 分块 AI 响应已保存', { path: debugPath, chunkCount: chunkDebug.length, complexity })
      } catch (e) {
        logger.warn('保存调试文件失败', { error: e.message })
      }

      // 合并后全量截断检测
      const truncationIssues = this._detectFileTruncation(allFiles)

      // 🛡️ P1-3: declare.json 截断时跳过 JSON 修复链，直接模板兜底
      // declare.json 是配置文件，截断后走 JSON 修复链（_repairJSON）成功率极低且浪费时间，
      // 直接用模板兜底更快更可靠。其他文件的截断仍需报错。
      const declareTruncationIssues = truncationIssues.filter(issue => issue.includes('declare.json'))
      const otherTruncationIssues = truncationIssues.filter(issue => !issue.includes('declare.json'))

      if (declareTruncationIssues.length > 0) {
        logger.warn('⚠️ declare.json 被截断，跳过 JSON 修复链直接模板兜底', { issues: declareTruncationIssues })
        const fallbackDeclare = _templateDeclareJson({
          componentId: (input.componentName || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          componentName: input.componentName || '未知组件',
          nodeData: {},
          backgroundBrightness: input.backgroundBrightness || 'dark'
        })
        allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2)
      }

      if (otherTruncationIssues.length > 0) {
        logger.error('🚨 分块合并后仍存在文件截断（非 declare.json）', { truncationIssues: otherTruncationIssues })
        throw new Error(`LLM 输出文件不完整：${otherTruncationIssues.join('；')}`)
      }

      // 🆕 v3.5: Class 名交叉校验（模板 vs common.less）+ 自动修复
      const validationResult = this._validateClassNames(allFiles, input.componentName, classNamesList, input.elementStyleMap)
      const classMismatches = validationResult.mismatches
      if (classMismatches.length > 0) {
        logger.warn('⚠️ Class name mismatches (template vs common.less)', {
          count: classMismatches.length,
          sample: classMismatches.slice(0, 5)
        })
        // 透出 warning 到前端进度流
        const status = validationResult.fixed ? 'warning' : 'warning'
        const fixMsg = validationResult.fixed
          ? `，已自动从 elementStyleMap 生成 ${classMismatches.length} 条 fallback 规则补救`
          : ''
        input.onProgress?.({
          stage: '样式校验',
          message: `⚠️ 检测到 ${classMismatches.length} 个 class 名不匹配（模板使用了但 common.less 未定义）${fixMsg}`,
          status,
          details: classMismatches.slice(0, 10)
        })

        // 🆕 v3.5: 自动修复 — 将 fallback CSS 追加到 common.less
        if (validationResult.fixed && validationResult.fallbackCss) {
          const currentLess = allFiles['resources/styles/common.less'] || ''
          allFiles['resources/styles/common.less'] = currentLess + '\n\n/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n' + validationResult.fallbackCss
          logger.info('🔧 已将 fallback CSS 规则追加到 common.less', {
            addedBytes: validationResult.fallbackCss.length
          })
        }
      }

      // 🆕 v3.7: 跨文件一致性校验（template ↔ script 变量名/事件名/数据源）
      const templateBindings = this._extractTemplateBindings(allFiles)
      const consistencyResult = this._validateCrossFileConsistency(allFiles, templateBindings)
      if (consistencyResult.mismatches.length > 0) {
        logger.warn('⚠️ 跨文件一致性不匹配', {
          count: consistencyResult.mismatches.length,
          sample: consistencyResult.mismatches.slice(0, 5).map(m => `${m.type}:${m.variable}`)
        })
        input.onProgress?.({
          stage: '一致性校验',
          message: `⚠️ ${consistencyResult.mismatches.length} 个跨文件变量名不一致（ref/事件/数据源缺少声明）`,
          status: 'warning',
          details: consistencyResult.mismatches.slice(0, 10)
        })
      }

      if (!allFiles || typeof allFiles !== 'object' || Object.keys(allFiles).length === 0) {
        throw new Error('LLM 返回的 files 对象为空')
      }

      // 🛡️ P0 修复：最终校验 declare.json（缺失或无效则用模板兜底）
      if (!allFiles['declare.json'] || typeof allFiles['declare.json'] !== 'string') {
        logger.warn('⚠️ declare.json 缺失或格式异常，启用模板兜底', { type: typeof allFiles['declare.json'] })
        const fallbackDeclare = _templateDeclareJson({
          componentId: (input.componentName || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          componentName: input.componentName || '未知组件',
          nodeData: {},
          backgroundBrightness: input.backgroundBrightness || 'dark'
        })
        allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2)
      } else {
        // 验证是否是有效 JSON
        try {
          JSON.parse(allFiles['declare.json'])
        } catch (jsonErr) {
          logger.warn('⚠️ declare.json 非有效 JSON，启用模板兜底', { error: jsonErr.message })
          const fallbackDeclare = _templateDeclareJson({
            componentId: (input.componentName || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            componentName: input.componentName || '未知组件',
            nodeData: {},
            backgroundBrightness: input.backgroundBrightness || 'dark'
          })
          allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2)
        }
      }

      logger.info('✅ 组件代码分块生成完成', { fileCount: Object.keys(allFiles).length, complexity })
      return { files: allFiles }
    } catch (error) {
      logger.error('组件代码生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 构建单个分块的"任务要求 + 输出格式"段落（替换完整版 middleFull）
   */
  _buildChunkMiddle(chunk, input) {
    const { componentName, backgroundBrightness = 'dark' } = input
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark'
    const fileList = chunk.files.map(f => `- \`${f}\``).join('\n')
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成参考文件（必须保持命名 / 接口 / class 命名一致）\n\n' +
        chunk.contextFiles.map(cf => {
          const content = cf.content || ''
          const isTemplateCtx = cf.path.includes('index.vue') || cf.path.includes('template')
          let snippet
          if (isTemplateCtx && content.length > 12000) {
            // 模板内容过长：提取结构化摘要（ref 名称、class 名、事件绑定），避免硬截断丢失关键信息
            snippet = this._extractTemplateSummary(content)
          } else if (isTemplateCtx) {
            snippet = content // <= 12000 全量传入
          } else {
            snippet = content.slice(0, 8000) // 非模板文件适度放宽到 8000
          }
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件，**不要输出其他文件**（其余文件在其他批次生成）：

${fileList}

注意：**dark.less** 和 **light.less** 由生成器自动补充，你不需要输出。

## 关键约束

- **组件ID规范**：declare.json 中的 componentId 必须使用：\`${componentName}\`
- **Less变量规范**：theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`，并在末尾全局调用 \`.theme-${defaultTheme}()\` 和 \`.common()\` 作为默认值（与面板 backgroundBrightness=${backgroundBrightness} 一致）。\`.common()\` 必须调用！否则 common.less 在顶层引用时变量未定义，Less 编译失败。
- **Class 命名一致性（⚠️ 最重要）**：所有 \`.vue\` 和 \`.less\` 文件中的 class 名必须以 \`.c-${componentName}-\` 为前缀。参考文件（📎 区块）中已出现的 class 名**必须在 common.less 中一一对应定义**，禁止在模板中使用 class 却在 common.less 中遗漏或使用不同名称。
${contextBlock}
# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式（不要用 JSON，更节省 token 避免截断）：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，**不要转义换行符和引号**（不要用 \\n 和 \\" ）
- 文件之间用空行分隔
- 不要包裹在 JSON 中，不要用 \`\`\` 代码块
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**

**⚠️ 不要生成以下文件**（由系统自动生成标准模板）：
- \`component.js\` - 系统将自动生成
- \`declare.js\` - 系统将自动生成
- \`resources/styles/index.less\` - 系统将自动生成入口导入
- \`resources/styles/themes/dark.less\` 和 \`resources/styles/themes/light.less\` - 系统将自动生成固定主题包装
`
  }

  /**
   * 🆕 从长 template 内容中提取结构化摘要（ref、class、事件绑定），
   * 用于大组件分块生成时给后续批提供上下文，避免 6000 字符硬截断丢失关键信息。
   */
  _extractTemplateSummary(templateContent) {
    if (!templateContent) return '// (空模板)'
    const parts = []
    // 提取所有 ref="xxx" 或 :ref="xxx"
    const refs = [...templateContent.matchAll(/\b(?:ref|:ref)=["']([^"']+)["']/g)].map(m => m[1])
    if (refs.length) parts.push(`ref: ${[...new Set(refs)].join(', ')}`)
    // 提取所有 class="c-xxx" 组件 class
    const classes = [...templateContent.matchAll(/\bclass=["']([^"']*c-[^"'\s]+)[^"']*["']/g)].map(m => m[1])
    if (classes.length) parts.push(`class: ${[...new Set(classes)].join(', ')}`)
    // 提取事件绑定 @click / @change / v-on:
    const events = [...templateContent.matchAll(/@(\w+)=["']([^"']+)["']/g)].map(m => `${m[1]}=${m[2]}`)
    if (events.length) parts.push(`events: ${[...new Set(events)].join(', ')}`)
    // 提取 v-for / v-if / v-model
    const directives = [...templateContent.matchAll(/\b(v-for|v-if|v-show|v-model)=["'][^"']+["']/g)].map(m => m[0])
    if (directives.length) parts.push(`directives: ${[...new Set(directives)].join(', ')}`)
    // 提取子组件标签（大写开头的自定义标签）
    const subComps = [...templateContent.matchAll(/<([A-Z][a-zA-Z]+)[\s>]/g)].map(m => m[1])
    if (subComps.length) parts.push(`sub-components: ${[...new Set(subComps)].join(', ')}`)
    return parts.length > 0
      ? `// [模板结构摘要 - 完整内容超出上下文限制]\n${parts.join('\n')}`
      : `// [模板过长已省略前 12000 字符摘要]\n${templateContent.slice(0, 2000)}`
  }

  /**
   * 🆕 判断分块的文件类型
   * - 'declare': 纯 declare.json
   * - 'style': 纯 .less/.css 样式文件
   * - 'vue': index.vue 或子组件 .vue
   * - 'mixed': 混合类型（如 declare.json + index.vue）
   */
  _getChunkFileType(chunk) {
    const files = chunk.files || []
    // 模板/脚本段视为 vue 类型
    if (chunk.segmentType === 'template' || chunk.segmentType === 'script') return 'vue'
    // 混合文件类型
    const hasJson = files.some(f => f.endsWith('.json'))
    const hasStyle = files.some(f => f.endsWith('.less') || f.endsWith('.css'))
    const hasVue = files.some(f => f.endsWith('.vue'))
    if ((hasJson && hasVue) || (hasJson && hasStyle) || (hasVue && hasStyle)) return 'mixed'
    if (files.every(f => f.endsWith('.json'))) return 'declare'
    if (files.every(f => f.endsWith('.less') || f.endsWith('.css'))) return 'style'
    return 'vue'
  }

  /**
   * 🆕 declare.json 专用 prompt 构建器
   * 只包含 JSON schema 规范，去除 Vue/样式/布局等无关约束，减少 ~80% prompt tokens
   */
  _buildDeclareChunkPrompt(input, chunk) {
    const { componentName, displayName, panelType = 'default-panel', backgroundBrightness = 'dark', layoutStructure, previousCritiques } = input
    const isRevision = previousCritiques && previousCritiques.length > 0

    // 🆕 v3.3: displayName 用于组件中文名称（Figma 节点名），componentName 用于组件 ID
    const compDisplayName = displayName || componentName

    // 修订模式：只筛选与声明文件相关的 critique
    const revisionSection = isRevision ? `
# ⚠️ 代码修订指导

这是第${(input.iterationCount || 0) + 2}轮修订。以下是与组件声明相关的问题，请针对性修复：

${previousCritiques
  .filter(c => c.category === 'DECLARE_SCHEMA' || c.category === 'COMPONENT_CONFIG' || c.category === 'DATA_SOURCE')
  .map((cr, i) => `## 问题 ${i + 1}: ${cr.issue}\n- **严重程度**: ${cr.severity}\n- **修复建议**: ${cr.fix || '请根据问题描述自行判断'}\n`).join('\n')}
${previousCritiques.filter(c => c.category === 'DECLARE_SCHEMA' || c.category === 'COMPONENT_CONFIG' || c.category === 'DATA_SOURCE').length === 0 ? '(无声明文件相关的修订问题 — 按原始规范生成即可)' : ''}

---
` : ''

    // 只提取组件基本信息，不包含完整 layoutStructure / visualElements
    const layoutInfo = layoutStructure ? `
## 组件结构信息
- **尺寸**: ${layoutStructure.width || 460} × ${layoutStructure.height || 138}
- **面板类型**: ${panelType}
` : ''

    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark'
    const fileList = chunk.files.map(f => `- \`${f}\``).join('\n')
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成参考文件\n\n' +
        chunk.contextFiles.map(cf => {
          const snippet = (cf.content || '').slice(0, 8000)
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }

    // declare.json 规范
    const declareSpec = this.constraints['references/specs/declare-json.md'] || ''

    return `你是专业的微码组件声明配置工程师。你只负责生成 \`declare.json\` 配置文件。

${revisionSection}
${layoutInfo}
# 组件信息
- **组件ID**: \`${componentName}\`
- **组件中文名称**: ${compDisplayName}
- **面板类型**: ${panelType || 'default-panel'}
- **默认主题**: ${defaultTheme}

# Declare.json 规范

${declareSpec}

# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件：
${fileList}

## 关键约束
- componentId 必须使用：\`${componentName}\`
- componentName（组件中文名称）必须使用：\`${compDisplayName}\`
- eventId 格式：\`${componentName}-onload\`（组件加载事件）
- businessEvents 中必须有 \`${componentName}-onload\` 事件声明
- businessStatuses / dataSources / formSources / layoutConfig / themeConfig / businessConfig 按规范填写
- JSON 字段名使用 camelCase（componentId, businessEvents, dataSources 等）

${contextBlock}
# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式（不要用 JSON 包裹，直接输出）：

\`\`\`
// === ${chunk.files[0]} ===
<完整的 JSON 内容>
\`\`\`

⚠️ **格式要求**：
- 输出纯 JSON，不要包裹在 \\\`\\\`\\\`json 代码块中
- 不要添加注释（JSON 不支持注释）
- 确保 JSON 语法正确（使用双引号，最后一项不加逗号）
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在说明文字、思考过程等非文件内容中使用此前缀**
- 不要输出其他文件或额外说明
`
  }

  /**
   * 🆕 样式文件专用 prompt 构建器
   * 只包含 Less/CSS 规范，去除 Vue 组件/布局/交互等无关约束
   */
  _buildStyleChunkPrompt(input, chunk) {
    const { componentName, backgroundBrightness = 'dark', figmaNodeData, elementStyleMap, visualElements, previousCritiques } = input
    const isRevision = previousCritiques && previousCritiques.length > 0
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark'
    // 🆕 v3.5: 从 chunk 中获取程序化提取的 class 名列表（硬约束）
    const classNamesList = chunk.classNamesList || []

    // 修订模式：只筛选与样式相关的 critique
    const revisionSection = isRevision ? `
# ⚠️ 代码修订指导

这是第${(input.iterationCount || 0) + 2}轮修订。以下是与样式相关的问题，请针对性修复：

${previousCritiques
  .filter(c => c.category === 'STYLE' || c.category === 'CSS' || c.category === 'VISUAL' || c.category === 'THEME')
  .map((cr, i) => `## 问题 ${i + 1}: ${cr.issue}\n- **严重程度**: ${cr.severity}\n- **修复建议**: ${cr.fix || '请根据问题描述自行判断'}\n`).join('\n')}
${previousCritiques.filter(c => c.category === 'STYLE' || c.category === 'CSS' || c.category === 'VISUAL' || c.category === 'THEME').length === 0 ? '(无样式相关的修订问题 — 按原始规范生成即可)' : ''}

---
` : ''

    const fileList = chunk.files.map(f => `- \`${f}\``).join('\n')
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成参考文件（必须保持 class 命名一致）\n\n' +
        chunk.contextFiles.map(cf => {
          const snippet = (cf.content || '').slice(0, 8000)
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }

    // Less 命名规范
    const lessNaming = this.constraints['references/standards/less-naming-convention.md'] || ''

    return `你是专业的微码组件样式工程师。你只负责生成 Less/CSS 样式文件。

${revisionSection}

# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件：
${fileList}

注意：**dark.less** 和 **light.less** 由生成器自动补充，你不需要输出。

## 关键约束

**Class 命名规范**：
- common.less 中的所有 class 必须以 \`.c-${componentName}-\` 为前缀
- 格式：\`.c-${componentName}-{语义名称}\`
- 语义名称使用 kebab-case：tabs-container, stat-item, chart-wrapper
- 禁止使用无前缀的通用 class：.item, .box, .wrapper, .container

**Less变量规范**：
- theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`
- 颜色变量定义在 mixin 内部
- **必须**在末尾全局调用 \`.theme-light()\` 和 \`.common()\` 作为默认值（禁止使用 .theme-dark()，与面板无关）
  - \`.common()\` 必须调用！否则 common.less 在顶层引用时变量未定义，Less 编译失败

**🚫 禁止 CSS 变量**：
- theme-vars.less 中**禁止**使用 CSS 变量（\`var(--xxx)\`），只允许 Less 变量（\`@xxx\`）
- 原因：CSS 变量会导致 Less 颜色函数（如 darken()/lighten()/fade()）编译报错
- 错误示例：\`@color: var(--em-bg-color);\` ← 编译报错
- 正确示例：\`@bg-color: #1a2332;\`

**🚫 禁止面板外壳样式泄漏**：
- common.less 中**禁止**在 \`.c-${componentName}-content\` 上设置 \`background\`、\`box-shadow\`、\`border-radius\`
- 原因：base-panel 已提供面板标题、边框、阴影等外壳样式，重复生成会导致双层边框/阴影
- 需要处理的是内容区样式（间距、字体、颜色），不是面板外壳

**Less 变量命名规范**：
${lessNaming}

${figmaNodeData ? `
## Figma 关键节点样式数据（用于精确样式还原）

${this._formatFigmaStyleData(figmaNodeData)}
` : ''}

${visualElements ? this._formatVisualStyle(visualElements) : ''}

${elementStyleMap && Object.keys(elementStyleMap).length > 0 ? `
## Per-Element 样式映射（必须遵守）

以下是从设计稿分析得出的每个元素的完整 CSS 属性。**这些值必须直接写入 CSS，禁止用主题变量覆盖。**

\`\`\`json
${JSON.stringify(elementStyleMap, null, 2)}
\`\`\`

⚠️ **样式直接值优先规则**：
1. elementStyleMap 中有明确颜色值时，CSS 必须直接写（如 \`color: rgba(255,255,255,0.8)\`），禁止替换为主题变量
2. elementStyleMap 中有明确尺寸值时，CSS 必须直接写（如 \`font-size: 20px\`）
3. 主题变量只用于 elementStyleMap 中没有明确值的属性
4. 深色面板（backgroundBrightness=dark）所有文字颜色禁止使用黑色系
` : ''}

## 颜色/圆角/阴影/边框规则
- 颜色从 Figma fills.color 精确转换（r*255, g*255, b*255）
- 圆角从 cornerRadius 提取
- 阴影从 effects 提取（DROP_SHADOW → box-shadow）
- 边框从 strokes 提取
- 纯色背景用 CSS，禁止用 background-image

${classNamesList.length > 0 ? `
## ⚠️ 强制约束：class 选择器必须精确匹配模板（v3.5 硬约束）

以下是从所有已生成的 Vue 模板中**程序化提取**的 class 名完整列表。
你必须在 common.less 中为**每一个** class 生成对应的 CSS 规则。

\`\`\`
${classNamesList.map(c => `.${c}`).join('\n')}
\`\`\`

**铁律（违反将导致样式丢失）**：
1. ✅ 列表中的**每一个** class 必须出现在你的 CSS 输出中
2. ❌ **禁止**创建列表中没有的新业务 class（框架 class 如 ant-/el- 除外）
3. ❌ **禁止**重命名 class（如把 vehicle-card 改成 stat-card）
4. ❌ **禁止**合并多个 class（如把 vehicle-card 和 vehicle-title 合并为一个）
5. ✅ 样式值从 elementStyleMap 获取精确值，禁止用主题变量覆盖
6. ✅ 如果你不确定某个 class 的含义，参考上方已生成参考文件中的使用上下文
` : ''}

${contextBlock}

# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，不要转义
- 文件之间用空行分隔
- 不要包裹在 JSON 或 Markdown 代码块中
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**

⚠️ 不要生成以下文件（系统自动生成）：
- dark.less / light.less - 系统自动生成固定主题包装
- index.less - 系统自动生成入口导入
`
  }

  /**
   * 复杂组件：构建 index.vue <template> 段的分块 prompt 中段
   * 只要求 LLM 输出 <template>...</template>，不输出 <script>/<style>
   */
  _buildTemplateChunkMiddle(chunk, input) {
    const { componentName, panelType = 'default-panel' } = input
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成参考文件（必须保持命名 / 接口 / class 命名一致）\n\n' +
        chunk.contextFiles.map(cf => {
          const snippet = (cf.content || '').slice(0, 8000)
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次**只生成 package/index.vue 的 \`<template>\` 部分**，**不要输出 \`<script>\` 和 \`<style>\` 块**（它们会在后续批次生成）。

## 关键约束

- 必须使用 \`<base-panel panelKey="${panelType}">\` 包裹，通过具名插槽填充内容
- 所有 class 必须使用 \`.c-${componentName}-\` 前缀
- 使用已下载的资源变量（bg1/icon1 等），通过 :src 或 :style 引用，**禁止写 import**
- 模板中用到的 ref 名称、事件名将在后续 \`<script>\` 批次中实现，请使用语义化命名
${contextBlock}
# 输出格式

请**只输出 <template> 部分**，使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<template>
  ...完整的模板内容...
</template>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<template>\` 到 \`</template>\` 的完整内容
- **不要输出 \`<script setup>\` 块**
- **不要输出 \`<style>\` 块**
- 不要包裹在 JSON 或代码围栏中
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**
`
  }

  /**
   * 复杂组件：构建 index.vue <script> 段的分块 prompt 中段（回填 template 上下文）
   * 只要求 LLM 输出 <script setup>...</script>，不输出 <template>/<style>
   */
  _buildScriptChunkMiddle(chunk, input) {
    const { componentName } = input
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成的 <template>（必须保持 ref / class / 事件命名完全一致）\n\n' +
        chunk.contextFiles.map(cf => {
          const snippet = (cf.content || '').slice(0, 8000)
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次**只生成 package/index.vue 的 \`<script setup>\` 部分**，**不要输出 \`<template>\` 和 \`<style>\` 块**。

## 关键约束

- **必须与上方 <template> 中用到的 ref 名称、class 名称、事件名称完全一致**
- 必须包含 \`$mcComponentBuilder\` 调用（用 try-catch 包裹）并解构 \`runtimeBuilder\`
- 必须在 \`onMounted\` 中调用 \`runtimeBuilder.publishEvent('${componentName}-onload', {...})\`
- 使用 Vue 3 Composition API（ref / watch / onMounted / onUnmounted 等）
- 如有图表，使用 echarts.init() + ResizeObserver + watch(chartRef) 模式
- **禁止编写 import 样式文件的语句**（样式只在 <style> 块中 @import，由系统处理）
${contextBlock}
# 输出格式

请**只输出 <script setup> 部分**，使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
...完整的脚本内容...
</script>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<script setup>\` 到 \`</script>\` 的完整内容
- **不要输出 \`<template>\` 块**
- **不要输出 \`<style>\` 块**
- 不要包裹在 JSON 或代码围栏中
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**
`
  }

  /**
   * 复杂组件：将分别生成的 <template> 和 <script> 拼装为完整 index.vue
   * 附加固定 <style> 块，并做容错清理（去分隔符前缀、补缺失闭合标签）
   */
  _assembleIndexVue(templateContent, scriptContent, input) {
    let tpl = (templateContent || '').trim()
    let scr = (scriptContent || '').trim()

    // 容错：去除 LLM 可能残留的文件分隔符前缀
    tpl = tpl.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '')
    scr = scr.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '')

    // 容错：若 LLM 漏了闭合标签则补上（拼装后 _detectFileTruncation 才不会误报）
    if (tpl.includes('<template>') && !tpl.includes('</template>')) {
      tpl += '\n</template>'
    }
    if (scr.includes('<script') && !scr.includes('</script>')) {
      scr += '\n</script>'
    }

    const parts = []
    if (tpl) parts.push(tpl)
    if (scr) parts.push(scr)
    // <style> 块为固定模板（样式由后续样式批次生成，此处仅引入入口）
    parts.push(`<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`)

    return parts.join('\n\n') + '\n'
  }

  /**
   * 🆕 #9a: 统一 index.vue 分块生成（complex / medium / simple-risky 共用）。
   * - 默认：template(1) + script(1) 两段
   * - 超大组件（splitDecision.scriptSplit）：template(1) + script状态(1) + script行为(1) 三段（脚本拆两段）
   * 返回拼装后的完整 index.vue 字符串（含固定 <style> 块）。
   */
  async _generateIndexVue(runChunk, input, { splitDecision, allFiles }) {
    const scriptSplit = !!splitDecision.scriptSplit
    const declContent = allFiles['declare.json'] || ''

    // 批: index.vue <template>
    const chunkT = {
      title: 'index.vue 模板', files: ['package/index.vue'],
      segmentType: 'template', index: 2, total: scriptSplit ? 6 : 5,
      contextFiles: [{ path: 'declare.json', content: declContent }]
    }
    const resT = await runChunk(chunkT, this._buildTemplateChunkMiddle)
    const templateContent = (resT.files['package/index.vue'] || '').trim()

    let scriptContent = ''
    if (scriptSplit) {
      logger.info('🧩 超大组件：script 拆为 状态/行为 两段（#9a）', {
        componentName: input.componentName,
        estTokens: splitDecision.estTokens,
        sizeTier: splitDecision.sizeTier
      })
      const chunkS1 = {
        title: 'index.vue 脚本(状态)', files: ['package/index.vue'],
        segmentType: 'script', scriptPart: 'state', index: 3, total: 6,
        contextFiles: [
          { path: 'declare.json', content: declContent },
          { path: 'package/index.vue (template)', content: templateContent }
        ]
      }
      const resS1 = await runChunk(chunkS1, this._buildScriptChunkMiddlePart)
      const scriptState = (resS1.files['package/index.vue'] || '').trim()

      const chunkS2 = {
        title: 'index.vue 脚本(行为)', files: ['package/index.vue'],
        segmentType: 'script', scriptPart: 'behavior', index: 4, total: 6,
        contextFiles: [{ path: 'package/index.vue (template)', content: templateContent }]
      }
      const resS2 = await runChunk(chunkS2, this._buildScriptChunkMiddlePart)
      const scriptBehavior = (resS2.files['package/index.vue'] || '').trim()

      scriptContent = this._mergeScriptParts(scriptState, scriptBehavior)
    } else {
      const chunkS = {
        title: 'index.vue 脚本', files: ['package/index.vue'],
        segmentType: 'script', index: 3, total: 5,
        contextFiles: [{ path: 'package/index.vue (template)', content: templateContent }]
      }
      const resS = await runChunk(chunkS, this._buildScriptChunkMiddle)
      scriptContent = (resS.files['package/index.vue'] || '').trim()
    }

    // 🆕 P1: 部分修订且 index.vue 非目标文件时 runChunk 已跳过并从磁盘保留，templateContent/scriptContent 为空 → 不覆盖
    if (templateContent || scriptContent) {
      const assembled = this._assembleIndexVue(templateContent, scriptContent, input)
      logger.info('✅ index.vue 拼装完成', { length: assembled.length, scriptSplit })
      return assembled
    }
    return ''
  }

  /**
   * 🆕 #9a: 将两个独立的 <script setup> 块（状态段 + 行为段）合并为一个完整脚本块。
   * 去除重复的外层标签后拼接内部内容，再统一包裹。
   */
  _mergeScriptParts(s1, s2) {
    const clean = (s) => {
      if (!s) return ''
      let x = s.trim()
      x = x.replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '')
      x = x.replace(/^\s*<script\s+setup>/i, '').replace(/<\/script>\s*$/i, '')
      return x.trim()
    }
    const a = clean(s1)
    const b = clean(s2)
    if (!a && !b) return ''
    if (!a) return (s2 || '').trim()
    if (!b) return (s1 || '').trim()
    return `<script setup>\n${a}\n\n${b}\n</script>`
  }

  /**
   * 🆕 #9a: 超大组件脚本拆分段（状态 / 行为）的"任务要求+输出格式"中段。
   * 仅用于 segmentType==='script' 且 chunk.scriptPart 为 'state' | 'behavior'。
   * 与 _buildScriptChunkMiddle 不同：明确限制本批只写脚本的一部分，避免单段超长截断。
   */
  _buildScriptChunkMiddlePart(chunk, input) {
    const { componentName } = input
    const part = chunk.scriptPart || 'state'
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成上下文（必须保持 ref / class / 事件命名完全一致）\n\n' +
        chunk.contextFiles.map(cf => {
          const snippet = (cf.content || '').slice(0, 8000)
          return `// === ${cf.path} ===\n${snippet}\n`
        }).join('\n')
    }

    const partGuide = part === 'state'
      ? `本次**只生成 <script setup> 的第 1/2 部分（状态定义）**：
- 所有 \`import\` 语句（vue、echarts 等）
- 所有 \`ref\` / \`reactive\` / \`computed\` 状态
- \`defineProps\` / props（如适用）
- 所有 \`watch\` 定义
- 所有工具 / 纯函数的**定义**（函数体，但不在本部分调用）
- 类型与常量

⚠️ 不要写 \`<template>\` / \`<style>\` 块；不要写 \`onMounted\` / \`onUnmounted\`（它们在第 2 部分生成）；不要调用任何函数或触发副作用。变量名 / 函数名必须与 <template> 中使用的命名完全一致。`
      : `本次**只生成 <script setup> 的第 2/2 部分（行为逻辑）**：
- \`onMounted\` / \`onUnmounted\` 生命周期钩子
- 所有事件处理函数（@click / @change 等对应的 handler）
- 图表初始化（echarts.init / ResizeObserver / watch(chartRef)）
- 数据加载函数（loadData 等）的**调用**、轮询定时器
- 其他运行时执行逻辑

⚠️ 不要写 \`<template>\` / \`<style>\` 块；**不要重复** import 与 \`ref\` / \`reactive\` / \`computed\` 定义（已在第 1 部分声明）；必须引用第 1 部分已定义的变量名 / 函数名，保持完全一致。务必包含 \`$mcComponentBuilder\` 调用（try-catch 包裹）与 \`runtimeBuilder.publishEvent('${componentName}-onload', {...})\`。`

    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

${partGuide}
${contextBlock}
# 输出格式

请**只输出 <script setup> 部分**（第 ${part === 'state' ? '1' : '2'}/2 段），使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<script setup>
...本部分内容...
</script>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<script setup>\` 到 \`</script>\` 的完整内容
- **不要输出 <template> 块**
- **不要输出 <style> 块**
- 不要包裹在 JSON 或代码围栏中
- **⚠️ \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**
`
  }

  /**
   * 🛡️ P0 修复：安全生成 declare.json（带降级兜底）
   * 当 LLM 生成 declare.json 失败时，使用 component-template 的最小可用模板作为兜底
   */
  async _safeGenerateDeclareJson(runChunk, input, chunkD) {
    try {
      const resD = await runChunk(chunkD, this._buildChunkMiddle)
      return resD
    } catch (error) {
      logger.error('declare.json LLM 生成失败，启用模板兜底', { error: error.message, componentName: input.componentName })

      // 生成最小可用的 declare.json
      const fallbackDeclare = _templateDeclareJson({
        componentId: (input.componentName || 'unknown-component').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        componentName: input.componentName || '未知组件',
        nodeData: {},
        backgroundBrightness: input.backgroundBrightness || 'dark'
      })

      logger.info('✅ declare.json 模板兜底已生成', { componentName: input.componentName })
      return {
        files: { 'declare.json': JSON.stringify(fallbackDeclare, null, 2) },
        debug: { attempt: 0, files: ['declare.json'], fallback: true, error: error.message }
      }
    }
  }

  /**
   * 单个分块 LLM 调用（含截断重试）。返回 { files, debug }
   */
  async _generateSingleChunk(prompt, chunk, input) {
    // 🆕 P0: 收紧分块生成的超时与重试预算，避免单块极端长尾（原 900s × 3 = 2700s）
    const CHUNK_TIMEOUT_MS = Math.max(60000, parseInt(process.env.ENGINEER_CHUNK_TIMEOUT_MS || '600000'))
    const maxAttempts = Math.max(1, parseInt(process.env.ENGINEER_MAX_ATTEMPTS || '3'))
    const CHUNK_BUDGET_MS = Math.max(CHUNK_TIMEOUT_MS, parseInt(process.env.ENGINEER_CHUNK_BUDGET_MS || '1200000'))
    let lastErr = null
    let lastErrType = null  // 'max_tokens' | 'truncation'
    const chunkBudgetStart = Date.now()
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let p = prompt
      if (attempt > 1) {
        if (lastErrType === 'max_tokens') {
          // max_tokens 截断：减少单批文件数量（减半）
          const origFiles = chunk.files || []
          const halfCount = Math.max(1, Math.floor(origFiles.length / 2))
          const reducedFiles = origFiles.slice(0, halfCount)
          if (reducedFiles.length < origFiles.length) {
            chunk = { ...chunk, files: reducedFiles }
            logger.warn('⚠️ max_tokens 截断：将本批文件数减半重试', {
              original: origFiles.length, reduced: reducedFiles.length, attempt
            })
          }
          p += `\n\n⚠️ 上一次因 max_tokens（输出长度超限）被截断。请精简输出（减少冗余注释和空白），并确保只输出必要的文件内容。`
        } else if (lastErrType === 'truncation') {
          // 标签未闭合截断：追加具体标签名提示
          p += `\n\n⚠️ 上一次输出被截断（${lastErr}）。请确保每一个标签/文件都完整闭合，不要提前结束输出。`
        } else {
          p += `\n\n⚠️ 上一次输出被截断或不完整（涉及文件：${chunk.files.join('、')}）。请务必完整输出每一个文件的全部内容，不要省略、不要提前结束。`
        }
      }
      const response = await invokeWithTimeout(this.llm, p, CHUNK_TIMEOUT_MS, 'microcode-engineer', input.onProgress, {
        signal: input.signal,
        onProgress: input.onProgress,
        requestConcurrency: input.requestConcurrency,
        requestQueueTimeoutMs: input.requestQueueTimeoutMs,
        requestTimeoutMs: Math.min(input.requestTimeoutMs || CHUNK_TIMEOUT_MS, CHUNK_TIMEOUT_MS),
        requestMaxRetries: input.requestMaxRetries,
        model: this.model,
        provider: 'text-role',
      })
      let content = response.content || response
      if (Array.isArray(content)) {
        const parts = []
        for (const it of content) {
          if (it && typeof it === 'object' && 'text' in it) parts.push(it.text || '')
          else if (typeof it === 'string') parts.push(it)
        }
        // ⚠️ 用 '' 拼接而非 '\n'：streaming 模式下 content 是多个 text fragment，
      //    用 \n 会在每个片段间插入换行，打碎分隔符(// === file ===)和 JSON 字符串值，
      //    导致 _parseDelimitedFormat 正则失配 + JSON.parse "Bad control character"。
      content = parts.length ? parts.join('') : String(content)
      } else {
        content = String(content)
      }
      const parsed = this.parseCodeOutput(content)
      const files = parsed.files || {}
      const stopReason = response?.stop_reason || response?.additional_kwargs?.stop_reason || response?.llmOutput?.stop_reason || response?.response_metadata?.stop_reason
      const finishReason = response?.finish_reason || response?.additional_kwargs?.finish_reason || response?.response_metadata?.finish_reason
      const isMaxTokens = stopReason === 'max_tokens' || finishReason === 'length'
      // 分段截断检测：template / script 段有专门的闭合标签检查（比通用 _detectFileTruncation 更精准）
      let truncationIssues
      if (chunk.segmentType === 'template') {
        truncationIssues = (content.includes('<template') && !content.includes('</template>'))
          ? ['index.vue 模板段: </template> 未闭合（输出被截断）']
          : []
      } else if (chunk.segmentType === 'script') {
        truncationIssues = (content.includes('<script') && !content.includes('</script>'))
          ? ['index.vue 脚本段: </script> 未闭合（输出被截断）']
          : []
      } else {
        truncationIssues = this._detectFileTruncation(files)
      }
      const debug = {
        attempt,
        files: Object.keys(files),
        stopReason,
        finishReason,
        isMaxTokens,
        truncationIssues,
        contentTail: content.slice(-1500)
      }
      if (isMaxTokens || truncationIssues.length > 0) {
        lastErrType = isMaxTokens ? 'max_tokens' : 'truncation'
        lastErr = isMaxTokens ? `stop_reason=${stopReason || finishReason}` : truncationIssues.join('；')
        logger.warn('⚠️ 分块生成被截断，准备重试', { chunk: chunk.files.join(','), attempt, stopReason, finishReason, truncationIssues, errType: lastErrType })
        if (attempt < maxAttempts && Date.now() - chunkBudgetStart < CHUNK_BUDGET_MS) continue
        // 第三次失败：template 段用模板兜底，其他文件抛出错误供上层降级
        if (chunk.segmentType === 'template') {
          logger.warn('⚠️ template 段 3 次生成均截断，使用最小模板兜底')
          const fallbackTemplate = `<template>\n  <div class="c-${input.componentName || 'component'}-root">\n    <span>组件内容</span>\n  </div>\n</template>\n`
          return { files: { 'package/index.vue': fallbackTemplate }, debug: { ...debug, fallback: true, _degraded: true } }
        }
        continue
      }
      return { files, debug }
    }
    throw new Error(`分块生成失败（${chunk.files.join('、')}）：输出被截断（${lastErr}）。该文件可能超过单次输出上限，建议简化组件或拆分元素。`)
  }

  /**
   * 从主组件源码中检测被引用的子组件路径（package/components/*.vue）
   */
  _detectSubComponents(indexVueContent) {
    if (!indexVueContent) return []
    const set = new Set()

    // 静态 import: import X from '...components/xxx'
    const staticRe = /from\s*['"]([^'"]*?components\/([^'"\/]+?))['"]/g
    let m
    while ((m = staticRe.exec(indexVueContent)) !== null) {
      const name = m[2].replace(/\.vue$/i, '')
      if (name) set.add(`package/components/${name}.vue`)
    }

    // 动态 import(): import('...components/xxx')
    const dynamicRe = /import\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g
    while ((m = dynamicRe.exec(indexVueContent)) !== null) {
      const name = m[2].replace(/\.vue$/i, '')
      if (name) set.add(`package/components/${name}.vue`)
    }

    // require(): require('...components/xxx')
    const requireRe = /require\s*\(\s*['"]([^'"]*?components\/([^'"\/]+?))['"]\s*\)/g
    while ((m = requireRe.exec(indexVueContent)) !== null) {
      const name = m[2].replace(/\.vue$/i, '')
      if (name) set.add(`package/components/${name}.vue`)
    }

    return [...set]
  }

  /**
   * 解析代码输出
   * 支持两种格式：
   * 1. 新格式（分隔符）：// === filePath ===\n<file content>\n// === filePath ===\n...
   * 2. 旧格式（JSON）：{ "files": { "path": "content", ... } }
   */
  parseCodeOutput(rawOutput) {
    try {
      // 1. 先用 coerceLLMText 规整（兼容 Anthropic 数组式 content: [{type:'text', text:'...'}]）
      const text = coerceLLMText(rawOutput)

      // 2. 如果规整后已经是合法的代码生成结果（含 files 字段），直接返回
      if (text && typeof text === 'object' && !Array.isArray(text) && text.files) {
        return text
      }

      // 3. 规整为字符串
      const textStr = typeof text === 'string' ? text : JSON.stringify(text)

      // 4. 优先尝试新格式（分隔符格式）：// === filePath ===
      const delimitedResult = this._parseDelimitedFormat(textStr)
      if (delimitedResult) {
        logger.info('✅ 分隔符格式解析成功', {
          fileCount: Object.keys(delimitedResult.files).length,
          files: Object.keys(delimitedResult.files)
        })

        // 🔍 截断检测
        const truncationIssues = this._detectFileTruncation(delimitedResult.files)
        if (truncationIssues.length > 0) {
          logger.warn('⚠️ 检测到文件可能被截断', { issues: truncationIssues })
        }

        return delimitedResult
      }

      // 5. 回退到旧格式（JSON）
      logger.info('分隔符格式未匹配，回退到 JSON 解析')

      // 提取JSON（从 markdown 代码块中）
      // 🔧 修复：尝试匹配所有 ```json 代码块，优先找含 files 的
      const jsonMatches = [...textStr.matchAll(/```json\s*\n?([\s\S]*?)\n?\s*```/g)]
      let jsonString = textStr
      let parsed = null

      if (jsonMatches.length > 0) {
        // 逐个尝试解析每个 ```json 代码块，优先找含 files 的
        for (const match of jsonMatches) {
          try {
            const candidate = JSON.parse(match[1])
            if (candidate && typeof candidate === 'object' && candidate.files) {
              parsed = candidate
              logger.info('✅ 从 ```json 代码块中解析到含 files 的 JSON', {
                codeBlockIndex: jsonMatches.indexOf(match),
                hasFiles: true
              })
              break
            }
          } catch { /* 忽略单个代码块解析失败 */ }
        }

        // 如果没找到含 files 的，使用最后一个代码块作为回退
        if (!parsed) {
          jsonString = jsonMatches[jsonMatches.length - 1][1]
          logger.info('未找到含 files 的 ```json 代码块，使用最后一个回退', {
            totalBlocks: jsonMatches.length
          })
        }
      }

      // 如果上面的循环已找到含 files 的 JSON，直接做截断检测并返回
      if (parsed && parsed.files) {
        const truncationIssues = this._detectFileTruncation(parsed.files)
        if (truncationIssues.length > 0) {
          logger.warn('⚠️ 检测到文件可能被截断', { issues: truncationIssues })
        }
        return parsed
      }

      // 4. 先尝试解析完整的 JSON（不截断）
      try {
        parsed = JSON.parse(jsonString)
        logger.info('✅ 完整JSON解析成功', {
          size: jsonString.length,
          hasFiles: !!parsed.files
        })

        // 🔍 截断检测：检查关键文件是否完整
        if (parsed.files) {
          const truncationIssues = this._detectFileTruncation(parsed.files)
          if (truncationIssues.length > 0) {
            logger.warn('⚠️ 检测到文件可能被截断', { issues: truncationIssues })
          }
        }
      } catch (directError) {
        // 5. 完整JSON解析失败，尝试截断后再解析
        logger.warn('完整JSON解析失败，尝试截断', {
          reason: directError.message.substring(0, 100),
          originalSize: jsonString.length
        })
        const trimmedJSON = this._extractValidJSON(jsonString)

        try {
          parsed = JSON.parse(trimmedJSON)
          logger.info('✅ 截断后JSON解析成功', {
            originalSize: jsonString.length,
            trimmedSize: trimmedJSON.length,
            hasFiles: !!parsed.files
          })
        } catch (trimError) {
          // 6. 截断后仍失败，用 robustJSONParse 统一修复+解析
          logger.warn('截断后仍解析失败，用 robustJSONParse 统一修复')
          parsed = robustJSONParse(trimmedJSON, {
            enablePartialExtract: true,  // 启用部分提取作为救命稻草
            fallback: { files: {} },  // 提供兜底值而非抛异常
            criticalFields: ['files'],  // 重点提取 files 字段
            _context: 'microcode-engineer'
          })
          logger.info('✅ robustJSONParse 修复后解析成功')
        }
      }

      // 7. 最终验证：确保解析结果包含 files 字段
      if (!parsed || !parsed.files) {
        // 🆕 兜底恢复：原始文本里可能把代码放在 // === 分隔符或 ```vue/```less 围栏中
        const recovered = this._recoverFilesFromRawText(textStr)
        if (recovered && Object.keys(recovered).length > 0) {
          const result = (parsed && typeof parsed === 'object')
            ? { ...parsed, files: recovered }
            : { files: recovered }
          logger.warn('⚠️ 未直接解析到 files，已从原始文本恢复代码文件', {
            recoveredFiles: Object.keys(recovered)
          })
          return result
        }
        logger.error('解析后的 JSON 缺少 files 字段', { keys: parsed ? Object.keys(parsed) : 'null' })
        // 🆕 落盘原始输出，便于排查真实 LLM 输出格式
        this._dumpRawOutput(rawOutput)
        throw new Error('LLM 返回的 JSON 缺少 files 字段')
      }

      return parsed

    } catch (error) {
      logger.error('解析代码输出失败', { 
        error: error.message, 
        rawOutputLength: String(rawOutput).length,
        rawOutputSample: String(rawOutput).substring(0, 500),
        errorStack: error.stack
      })
      throw new Error(`Failed to parse code output: ${error.message}`)
    }
  }

  /**
   * 🔍 检测文件是否被截断
   * 检查 .vue 文件是否有 </script> 闭合标签，.less/.json 文件是否完整
   */
  _detectFileTruncation(files) {
    const issues = []

    for (const [filePath, content] of Object.entries(files)) {
      if (!content || typeof content !== 'string') continue

      // .vue 文件：检查 </script> 和 </style> 闭合标签
      if (filePath.endsWith('.vue')) {
        if (content.includes('<script') && !content.includes('</script>')) {
          issues.push(`${filePath}: <script> 标签未闭合（输出被截断）`)
        }
        if (content.includes('<style') && !content.includes('</style>')) {
          issues.push(`${filePath}: <style> 标签未闭合（输出被截断）`)
        }
        if (content.includes('<template>') && !content.includes('</template>')) {
          issues.push(`${filePath}: <template> 标签未闭合（输出被截断）`)
        }
      }

      // .json 文件：检查是否为合法 JSON
      if (filePath.endsWith('.json')) {
        try {
          JSON.parse(content)
        } catch (e) {
          issues.push(`${filePath}: JSON 解析失败（可能被截断）- ${e.message.substring(0, 80)}`)
        }
      }

      // .less 文件：检查是否在规则中间截断（简单的括号匹配）
      if (filePath.endsWith('.less')) {
        const openBraces = (content.match(/{/g) || []).length
        const closeBraces = (content.match(/}/g) || []).length
        if (openBraces !== closeBraces) {
          issues.push(`${filePath}: 大括号不匹配（{=${openBraces} }=${closeBraces}），可能被截断`)
        }
      }
    }

    return issues
  }

  /**
   * 🆕 v3.4: 收集所有已生成的 Vue 文件，作为样式生成的上下文
   * 确保 style-mapper 能看到子组件中使用的所有 class 名
   * @param {Object} allFiles - { path: content }
   * @returns {Array<{path: string, content: string}>}
   */
  _collectVueContextFiles(allFiles) {
    const ctx = []
    // index.vue 始终排第一（最重要）
    if (allFiles['package/index.vue']) {
      ctx.push({ path: 'package/index.vue', content: allFiles['package/index.vue'] })
    }
    // 其他所有 Vue 文件（子组件等）
    for (const [path, content] of Object.entries(allFiles)) {
      if (path.endsWith('.vue') && path !== 'package/index.vue' && typeof content === 'string') {
        ctx.push({ path, content })
      }
    }
    return ctx
  }

  /**
   * 🆕 v3.5: 程序化提取所有 Vue 模板中的 class 名（非 LLM，确定性操作）
   *
   * 在模板和子组件全部生成完成后、CSS batch 开始前调用，
   * 用正则扫描所有 .vue 文件，提取模板中用到的 class 名，
   * 作为 CSS batch 的硬约束输入。
   *
   * @param {Object} allFiles - { path: content }
   * @param {string} componentName - 组件 ID（如 mc-1785154107233-dd52baa9）
   * @returns {{ fullList: string[], prefix: string }}
   */
  _extractTemplateClassNames(allFiles, componentName) {
    const fullClassNames = new Set()
    const classPrefix = `c-${componentName}-`

    // 匹配模式：
    // 1. class="xxx yyy" 中的单独 class 名
    // 2. :class="'xxx'" 中的字符串字面量
    // 3. :class="['xxx', condition && 'yyy']" 中的字符串字面量
    // 4. :class="{ 'xxx': condition }" 中的对象键
    const staticClassRx = /class\s*=\s*["'`]([^"'`]*)["'`]/g
    const stringLiteralRx = /'([^']+)'/g

    // 框架 class 白名单（不需要在 common.less 中定义）
    const frameworkPrefixes = ['ant-', 'el-', 'base-', 'c-base-', 'fa-', 'fas-', 'far-', 'icon-']

    const vueFiles = Object.entries(allFiles).filter(([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string')

    for (const [, vueContent] of vueFiles) {
      // 提取所有 class="..." 属性值
      let match
      while ((match = staticClassRx.exec(vueContent)) !== null) {
        const classValue = match[1]
        // 跳过 Vue 绑定表达式（如 class="{ active: isActive }"）
        if (classValue.startsWith('{') && classValue.endsWith('}')) {
          // 提取对象键中的字符串字面量
          let strMatch
          while ((strMatch = stringLiteralRx.exec(classValue)) !== null) {
            const cn = strMatch[1].trim()
            if (cn && !frameworkPrefixes.some(p => cn.startsWith(p))) {
              fullClassNames.add(cn)
            }
          }
        } else {
          // 普通 class 值，空格分隔
          const tokens = classValue.split(/\s+/)
          for (const cn of tokens) {
            // 🛡️ v3.7-fix: 过滤非有效 class 名（避免 [ ] ( ? = 等表达式碎片污染）
            if (!cn || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cn)) continue
            if (cn && !frameworkPrefixes.some(p => cn.startsWith(p))) {
              fullClassNames.add(cn)
            }
          }
        }
      }

      // 提取 :class="[...]" 数组中的字符串字面量
      const dynamicArrayRx = /:class\s*=\s*["'`]\[([^\]]*)\]["'`]/g
      while ((match = dynamicArrayRx.exec(vueContent)) !== null) {
        let strMatch
        while ((strMatch = stringLiteralRx.exec(match[1])) !== null) {
          const cn = strMatch[1].trim()
          if (cn && !frameworkPrefixes.some(p => cn.startsWith(p))) {
            fullClassNames.add(cn)
          }
        }
      }

      // 提取 :class="'xxx'" 单引号字符串
      const singleQuoteRx = /:class\s*=\s*["'`]'([^']+)'["'`]/g
      while ((match = singleQuoteRx.exec(vueContent)) !== null) {
        const cn = match[1].trim()
        if (cn && !frameworkPrefixes.some(p => cn.startsWith(p))) {
          fullClassNames.add(cn)
        }
      }
    }

    const fullList = [...fullClassNames].sort()

    logger.info('🔍 程序化提取模板 class 名完成', {
      totalCount: fullList.length,
      prefix: classPrefix,
      sample: fullList.slice(0, 10)
    })

    return { fullList, prefix: classPrefix }
  }

  /**
   * 🆕 v3.7: 从所有 Vue 模板中程序化提取绑定变量（ref/事件/数据源）
   * 用于跨批次一致性校验 — 确保 template/script/style 使用一致的变量名
   * @returns {{ refs: string[], events: string[], dataSources: string[], interpolations: string[] }}
   */
  _extractTemplateBindings(allFiles) {
    const refs = new Set()
    const events = new Set()
    const dataSources = new Set()
    const interpolations = new Set()

    const vueFiles = Object.entries(allFiles).filter(([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string')

    for (const [, vueContent] of vueFiles) {
      // 1. 提取 ref="xxx" 或 :ref="xxx"
      const refRx = /(?::?ref)\s*=\s*["'`]([^"'`{}]+)["'`]/g
      let match
      while ((match = refRx.exec(vueContent)) !== null) {
        const refVal = match[1].trim()
        if (refVal && !refVal.includes(' ') && refVal.length > 1) refs.add(refVal)
      }

      // 2. 提取 @event="handler" 或 v-on:event="handler"
      const eventRx = /(?:@|v-on:)\w+\s*=\s*["'`]([^"'`()]+)/g
      while ((match = eventRx.exec(vueContent)) !== null) {
        const handler = match[1].trim().split('(')[0].trim()
        // 🛡️ v3.7-fix: 只保留纯函数名（标识符），过滤内联表达式（含 = . 运算符等）
        if (handler && !handler.startsWith('$') && handler.length > 1 && /^[a-zA-Z_$][\w$]*$/.test(handler)) events.add(handler)
      }

      // 3. 提取 v-for="item in dataSource"
      const vForRx = /v-for\s*=\s*["'`][^"'`]*\s+in\s+(\w+)/g
      while ((match = vForRx.exec(vueContent)) !== null) {
        dataSources.add(match[1])
      }

      // 4. 提取 {{ variableName }} 插值
      const interpRx = /\{\{\s*([\w.]+)/g
      while ((match = interpRx.exec(vueContent)) !== null) {
        const varName = match[1].split('.')[0]
        if (varName && varName.length > 1 && !varName.startsWith('$')) interpolations.add(varName)
      }
    }

    const result = {
      refs: [...refs].sort(),
      events: [...events].sort(),
      dataSources: [...dataSources].sort(),
      interpolations: [...interpolations].sort()
    }

    logger.info('🔍 程序化提取模板绑定变量完成', {
      refs: result.refs.length,
      events: result.events.length,
      dataSources: result.dataSources.length,
      interpolations: result.interpolations.length
    })

    return result
  }

  /**
   * 🆕 v3.7: 跨文件一致性校验（template ↔ script）
   * 检查 template 中引用的 ref/event/dataSource 是否在 script 中有定义
   */
  _validateCrossFileConsistency(allFiles, bindings) {
    const mismatches = []
    const warnings = []

    const scriptContents = Object.entries(allFiles)
      .filter(([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string')
      .map(([p, c]) => {
        const scriptMatch = c.match(/<script[^>]*>([\s\S]*?)<\/script>/)
        return { path: p, content: scriptMatch ? scriptMatch[1] : '' }
      })

    const allScriptContent = scriptContents.map(s => s.content).join('\n')

    // 提取 script 中声明的函数/变量名
    const funcRx = /(?:function|const|let|var)\s+(\w+)/g
    const declaredNames = new Set()
    let m
    while ((m = funcRx.exec(allScriptContent)) !== null) declaredNames.add(m[1])

    // 1. ref 一致性
    for (const refName of bindings.refs) {
      if (!allScriptContent.includes(`ref(${refName}`) &&
          !declaredNames.has(refName)) {
        mismatches.push({
          type: 'ref_missing',
          variable: refName,
          message: `模板 ref="${refName}" 在 script 中未找到 ref()/const/let 声明`
        })
      }
    }

    // 2. 事件处理器一致性
    for (const eventName of bindings.events) {
      if (!declaredNames.has(eventName)) {
        mismatches.push({
          type: 'event_handler_missing',
          variable: eventName,
          message: `模板 @event="${eventName}" 在 script 中未找到函数声明`
        })
      }
    }

    // 3. 数据源一致性
    for (const ds of bindings.dataSources) {
      if (!allScriptContent.includes(ds) && !declaredNames.has(ds)) {
        mismatches.push({
          type: 'data_source_missing',
          variable: ds,
          message: `模板 v-for="... in ${ds}" 的数据源在 script 中未找到声明`
        })
      }
    }

    // 4. 插值变量（warn 级别）
    for (const iv of bindings.interpolations) {
      if (!declaredNames.has(iv) && !allScriptContent.includes(`.${iv}`) && !allScriptContent.includes(` ${iv}:`)) {
        warnings.push({
          type: 'interpolation_unverified',
          variable: iv,
          message: `模板 {{ ${iv} }} 在 script 中未明确找到声明`
        })
      }
    }

    if (mismatches.length > 0 || warnings.length > 0) {
      logger.warn('🔍 跨文件一致性校验发现问题', {
        mismatches: mismatches.length,
        warnings: warnings.length
      })
    } else {
      logger.info('✅ 跨文件一致性校验通过')
    }

    return { mismatches, warnings }
  }

  /**
   * 🆕 v3.5: 从 class 名反向查找 elementStyleMap 中的元素 ID
   * 用于自动生成 fallback CSS 规则时的样式值回填
   */
  _reverseMapClassToElement(className, elementStyleMap) {
    if (!elementStyleMap || Object.keys(elementStyleMap).length === 0) return null
    // 从 class 名中提取可能的语义部分（最后一个连字符段或最后几段）
    // 例如 c-mc-xxx-vehicle-card → 尝试匹配 elementId 包含 vehicle-card 的元素
    const parts = className.split('-')
    // 取最后 2-3 段作为搜索关键词
    for (let segCount = 3; segCount >= 1; segCount--) {
      const suffix = parts.slice(-segCount).join('-')
      for (const [elemId, styles] of Object.entries(elementStyleMap)) {
        if (elemId.endsWith(suffix) || elemId.includes(suffix)) {
          return { elemId, styles }
        }
      }
    }
    // 如果没有语义匹配，返回第一个元素作为兜底
    const firstKey = Object.keys(elementStyleMap)[0]
    return firstKey ? { elemId: firstKey, styles: elementStyleMap[firstKey] } : null
  }

  /**
   * 🆕 v3.5: 从 elementStyleMap 样式对象生成单条 CSS 规则
   */
  _generateFallbackCssRule(className, styles) {
    if (!styles || Object.keys(styles).length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`
    }
    const props = []
    const styleToCss = {
      fontSize: v => `font-size: ${v}`,
      fontWeight: v => `font-weight: ${v}`,
      fontFamily: v => `font-family: ${v}`,
      color: v => `color: ${v}`,
      backgroundColor: v => `background-color: ${v}`,
      background: v => `background: ${v}`,
      borderRadius: v => `border-radius: ${v}`,
      border: v => `border: ${v}`,
      borderWidth: v => `border-width: ${v}`,
      borderColor: v => `border-color: ${v}`,
      borderStyle: v => `border-style: ${v}`,
      padding: v => `padding: ${v}`,
      margin: v => `margin: ${v}`,
      width: v => `width: ${v}`,
      height: v => `height: ${v}`,
      lineHeight: v => `line-height: ${v}`,
      textAlign: v => `text-align: ${v}`,
      letterSpacing: v => `letter-spacing: ${v}`,
      opacity: v => `opacity: ${v}`,
      display: v => `display: ${v}`,
      flexDirection: v => `flex-direction: ${v}`,
      alignItems: v => `align-items: ${v}`,
      justifyContent: v => `justify-content: ${v}`,
      gap: v => `gap: ${v}`,
      boxShadow: v => `box-shadow: ${v}`,
      textShadow: v => `text-shadow: ${v}`,
      overflow: v => `overflow: ${v}`,
      position: v => `position: ${v}`,
      zIndex: v => `z-index: ${v}`,
    }
    for (const [key, value] of Object.entries(styles)) {
      const mapper = styleToCss[key]
      if (mapper) {
        props.push(`  ${mapper(value)}`)
      }
    }
    if (props.length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`
    }
    return `.${className} {\n${props.join(';\n')};\n}`
  }

  /**
   * 🆕 v3.5: 后生成校验 — 扫描所有 Vue 模板中使用的 class 名，核对 common.less 中是否有定义
   * v3.5 增强：支持自动修复 — 缺失的 class 从 elementStyleMap 生成 fallback CSS 规则
   * @param {Object} allFiles - { path: content }
   * @param {string} componentName - 组件 ID
   * @param {string[]} classNamesList - 程序化提取的 class 名列表（v3.5 新增）
   * @param {Object} elementStyleMap - per-element 样式映射（v3.5 新增，用于 fallback 生成）
   * @returns {{ mismatches: Array, fixed: boolean, fallbackCss: string|null }}
   */
  _validateClassNames(allFiles, componentName, classNamesList = null, elementStyleMap = null) {
    const mismatches = []
    const lessContent = allFiles['resources/styles/common.less'] || ''

    if (!lessContent) {
      mismatches.push({ file: 'resources/styles/common.less', className: '-', message: 'common.less 为空，所有模板 class 将无样式' })
      return { mismatches, fixed: false, fallbackCss: null }
    }

    // 🆕 v3.5: 如果传入了 classNamesList，用它来检查（更快更准）
    // 否则回退到原有正则扫描逻辑
    const classesToCheck = classNamesList && classNamesList.length > 0
      ? classNamesList
      : (() => {
          // 回退：扫描所有 Vue 文件提取 class 名
          const result = new Set()
          const vueFiles = Object.entries(allFiles).filter(([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string')
          for (const [, vueContent] of vueFiles) {
            const classRx = /(?:class|:?class)\s*=\s*["'`]([^"']*c-mc-\d+-[a-f0-9]+-[a-z0-9-]+[^"']*)["'`]/g
            let match
            while ((match = classRx.exec(vueContent)) !== null) {
              const classNames = match[1].match(/c-mc-\d+-[a-f0-9]+-[a-z0-9-]+/g)
              if (classNames) classNames.forEach(c => result.add(c))
            }
            const plainClassRx = /class\s*=\s*["'`](c-mc-\d+-[a-f0-9]+-[a-z0-9-]+)["'`]/g
            while ((match = plainClassRx.exec(vueContent)) !== null) result.add(match[1])
          }
          return [...result]
        })()

    // 检查每个 class 是否在 common.less 中有定义
    const missingClasses = []
    for (const cn of classesToCheck) {
      if (!lessContent.includes('.' + cn + ' ') && !lessContent.includes('.' + cn + '{') &&
          !lessContent.includes('.' + cn + ',') && !lessContent.includes('.' + cn + ':') &&
          !lessContent.includes('.' + cn + '\n') && !lessContent.includes('.' + cn + '\r')) {
        missingClasses.push(cn)
      }
    }

    if (missingClasses.length > 0) {
      for (const cn of missingClasses) {
        mismatches.push({
          file: 'resources/styles/common.less',
          className: cn,
          message: `模板中使用了 .${cn}，但 common.less 中未定义`
        })
      }
    }

    // 🆕 v3.5: 自动修复 — 为缺失的 class 生成 fallback CSS 规则
    let fallbackCss = null
    if (missingClasses.length > 0 && elementStyleMap && Object.keys(elementStyleMap).length > 0) {
      const fallbackRules = []
      for (const cn of missingClasses) {
        const mapping = this._reverseMapClassToElement(cn, elementStyleMap)
        if (mapping) {
          fallbackRules.push(`/* [自动修复] 模板 class .${cn} → 匹配元素 ${mapping.elemId} */`)
          fallbackRules.push(this._generateFallbackCssRule(cn, mapping.styles))
        } else {
          fallbackRules.push(`/* [自动修复] 模板 class .${cn} → 未匹配到元素，请手动补充样式 */`)
          fallbackRules.push(`.${cn} {\n  /* TODO: 请根据设计稿补充样式 */\n}`)
        }
      }
      fallbackCss = fallbackRules.join('\n\n')

      logger.info('🔧 自动生成 fallback CSS 规则', {
        missingCount: missingClasses.length,
        generatedCount: fallbackRules.filter(r => !r.includes('TODO')).length / 2,
        cssLength: fallbackCss.length
      })
    }

    return { mismatches, fixed: fallbackCss !== null, fallbackCss }
  }

  /**
   * 解析分隔符格式输出
   * 格式：// === filePath ===\n<file content>\n// === filePath ===\n...
   * @returns {Object|null} { files: { path: content } } 或 null（如果不是分隔符格式）
   */
  _parseDelimitedFormat(text) {
    // 🛡️ P0-3: 检测是否包含分隔符标记
    // 锚定行首（^|\n），路径中排除 = 号避免与闭合 === 产生歧义
    const hasDelimiters = /(?:^|\n)\s*\/\/\s*={2,3}\s+[^\n=]+?\s*={2,3}/.test(text)
    if (!hasDelimiters) return null

    const files = {}
    // 匹配分隔符头部（锚定行首），捕获文件名（排除 = 号），内容直到下一个分隔符或文本结束
    const pattern = /(?:^|\n)\s*\/\/\s*={2,3}\s+([^\n=]+?)\s*={2,3}\s*\n([\s\S]*?)(?=\n\s*\/\/\s*={2,3}\s+|$)/g
    let match
    let matchCount = 0

    while ((match = pattern.exec(text)) !== null) {
      const rawPath = match[1].trim()
      const fileContent = match[2].trim()

      // 文件名合法性校验（与 style-refiner 一致）
      if (!this._isValidFilePath(rawPath)) {
        logger.warn(`分隔符格式：跳过非法文件名`, { rawPath })
        continue
      }

      if (rawPath && fileContent) {
        files[rawPath] = fileContent
        matchCount++
      }
    }

    if (matchCount === 0) return null

    return { files }
  }

  /**
   * 🆕 兜底恢复：从原始文本中按分隔符 / 代码围栏重建 files
   * 应对 LLM 未把代码包进 files 字段、而是直接输出 ```vue / ```less 等围栏的情况
   */
  _recoverFilesFromRawText(text) {
    const files = {}

    // 1. 分隔符格式（// === filePath ===）
    try {
      const delimited = this._parseDelimitedFormat(text)
      if (delimited && delimited.files && Object.keys(delimited.files).length > 0) {
        Object.assign(files, delimited.files)
      }
    } catch { /* 忽略 */ }

    // 2. 代码围栏：根据语言推断目标文件名
    const langToFile = {
      vue: 'package/index.vue',
      html: 'package/index.vue',
      less: 'package/index.less',
      css: 'package/index.css',
      json: 'declare.json'
    }
    const fencePattern = /```(\w+)?\s*\n([\s\S]*?)\n```/g
    let m
    while ((m = fencePattern.exec(text)) !== null) {
      const lang = (m[1] || '').toLowerCase()
      const content = m[2].trim()
      if (!content) continue
      const target = langToFile[lang]
      if (target) {
        // json 围栏若已是完整 config（含 componentId）才接受，避免把无关 json 当 declare.json
        if (lang === 'json' && !/componentId/.test(content)) continue
        files[target] = content
      }
    }

    return Object.keys(files).length > 0 ? files : null
  }

  /**
   * 🆕 将解析失败的原始 LLM 输出落盘，便于定位真实格式
   */
  _dumpRawOutput(rawOutput) {
    try {
      const dir = join(process.cwd(), 'data')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const fp = join(dir, `microcode-parse-fail-${ts}.txt`)
      writeFileSync(fp, String(rawOutput))
      logger.error('已落盘失败原始输出', { path: fp })
    } catch (e) {
      logger.warn('落盘失败原始输出失败', { error: e.message })
    }
  }

  /**
   * 从文本中提取有效的 JSON 对象（去除闭合括号后的额外文本）
   */
  _extractValidJSON(text) {
    // 去除开头的非 JSON 字符
    const startIdx = text.indexOf('{')
    if (startIdx === -1) return text
    let jsonPart = text.substring(startIdx)

    // 跟踪括号深度，找到匹配的闭合括号
    let depth = 0
    let inString = false
    let escapeNext = false
    let endIdx = -1

    for (let i = 0; i < jsonPart.length; i++) {
      const ch = jsonPart[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (ch === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (ch === '"' && !escapeNext) {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) {
          endIdx = i + 1
          break
        }
      }
    }

    if (endIdx > 0 && endIdx < jsonPart.length) {
      logger.info('检测到 JSON 后有额外内容，已截断', { original: jsonPart.length, trimmed: endIdx })
      return jsonPart.substring(0, endIdx)
    }

    return jsonPart
  }

  /**
   * 从Figma节点数据中提取关键样式信息，用于精确还原
   * 提取 fills、effects、strokes、cornerRadius 等样式数据
   */
  // ⚠️ maxDepth 从 4 提升到 8：设备卡片/列表项等元素常位于第 5~7 层，
  //    深度 4 会把它们的 layoutMode / 尺寸 / 字体信息整体截断，导致 LLM
  //    看不到 HORIZONTAL 标记而凭经验猜成纵向堆叠（icon 在上、文字在下）。
  _formatFigmaStyleData(figmaNodeData, depth = 0, maxDepth = 8) {
    if (!figmaNodeData || depth > maxDepth) return ''

    const lines = []
    const indent = '  '.repeat(depth)

    // 基本信息
    if (figmaNodeData.name) {
      lines.push(`${indent}- **节点**: \`${figmaNodeData.name}\` (type: ${figmaNodeData.type || 'UNKNOWN'})`)
    }

    // 尺寸
    if (figmaNodeData.absoluteBoundingBox) {
      const b = figmaNodeData.absoluteBoundingBox
      lines.push(`${indent}  - 尺寸: ${b.width} x ${b.height}`)
    }

    // 布局模式
    if (figmaNodeData.layoutMode) {
      lines.push(`${indent}  - 布局: ${figmaNodeData.layoutMode}`)
      if (figmaNodeData.primaryAxisAlignItems) lines.push(`${indent}  - 主轴对齐: ${figmaNodeData.primaryAxisAlignItems}`)
      if (figmaNodeData.counterAxisAlignItems) lines.push(`${indent}  - 交叉轴对齐: ${figmaNodeData.counterAxisAlignItems}`)
      if (figmaNodeData.itemSpacing) lines.push(`${indent}  - 间距(gap): ${figmaNodeData.itemSpacing}px`)
    }

    // 🆕 深层精简模式：depth >= COMPACT_DEPTH 时只保留"名称/尺寸/布局/字体"，
    // 跳过体积大而对 flex 方向判断无益的 fills/effects/strokes/cornerRadius，
    // 以便在 maxDepth 提升到 8 后仍能控制 prompt token 规模。
    const COMPACT_DEPTH = 5
    const compact = depth >= COMPACT_DEPTH

    // Fills → 背景色/文字色
    if (!compact && figmaNodeData.fills && Array.isArray(figmaNodeData.fills) && figmaNodeData.fills.length > 0) {
      const visibleFills = figmaNodeData.fills.filter(f => f.visible !== false)
      if (visibleFills.length > 0) {
        lines.push(`${indent}  - **fills（背景/颜色）**:`)
        for (const fill of visibleFills) {
          if (fill.type === 'SOLID' && fill.color) {
            const r = Math.round(fill.color.r * 255)
            const g = Math.round(fill.color.g * 255)
            const b = Math.round(fill.color.b * 255)
            const a = fill.color.a !== undefined ? fill.color.a : (fill.opacity || 1)
            lines.push(`${indent}    - SOLID: #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a < 1 ? ` (alpha: ${a})` : ''}`)
          } else if (fill.type && fill.type.startsWith('GRADIENT')) {
            lines.push(`${indent}    - ${fill.type}: ${fill.gradientStops ? fill.gradientStops.map(s => `#${Math.round(s.color.r*255).toString(16).padStart(2,'0')}${Math.round(s.color.g*255).toString(16).padStart(2,'0')}${Math.round(s.color.b*255).toString(16).padStart(2,'0')} ${Math.round(s.position*100)}%`).join(' → ') : '无渐变数据'}`)
          } else if (fill.type === 'IMAGE') {
            lines.push(`${indent}    - IMAGE: ${fill.imageRef || '无引用'}`)
          }
        }
      }
    }

    // Effects → box-shadow / filter
    if (!compact && figmaNodeData.effects && Array.isArray(figmaNodeData.effects) && figmaNodeData.effects.length > 0) {
      const visibleEffects = figmaNodeData.effects.filter(e => e.visible !== false)
      if (visibleEffects.length > 0) {
        lines.push(`${indent}  - **effects（阴影/滤镜）**:`)
        for (const effect of visibleEffects) {
          if (effect.type === 'DROP_SHADOW' && effect.color) {
            const r = Math.round(effect.color.r * 255)
            const g = Math.round(effect.color.g * 255)
            const b = Math.round(effect.color.b * 255)
            const a = effect.color.a !== undefined ? effect.color.a : 1
            const ox = effect.offset?.x || 0
            const oy = effect.offset?.y || 0
            const radius = effect.radius || 0
            const spread = effect.spread || 0
            lines.push(`${indent}    - DROP_SHADOW: offset(${ox}, ${oy}) radius=${radius} spread=${spread} rgba(${r},${g},${b},${a})`)
          } else if (effect.type === 'INNER_SHADOW' && effect.color) {
            const r = Math.round(effect.color.r * 255)
            const g = Math.round(effect.color.g * 255)
            const b = Math.round(effect.color.b * 255)
            lines.push(`${indent}    - INNER_SHADOW: rgba(${r},${g},${b},${effect.color.a || 1})`)
          } else if (effect.type === 'BACKGROUND_BLUR') {
            lines.push(`${indent}    - BACKGROUND_BLUR: radius=${effect.radius}`)
          }
        }
      }
    }

    // Strokes → border
    if (!compact && figmaNodeData.strokes && Array.isArray(figmaNodeData.strokes) && figmaNodeData.strokes.length > 0) {
      const visibleStrokes = figmaNodeData.strokes.filter(s => s.visible !== false)
      if (visibleStrokes.length > 0) {
        lines.push(`${indent}  - **strokes（边框）**:`)
        for (const stroke of visibleStrokes) {
          if (stroke.color) {
            const r = Math.round(stroke.color.r * 255)
            const g = Math.round(stroke.color.g * 255)
            const b = Math.round(stroke.color.b * 255)
            const w = figmaNodeData.strokeWeight || 1
            lines.push(`${indent}    - ${stroke.type}: ${w}px solid rgba(${r},${g},${b},${stroke.color.a || 1})`)
          }
        }
      }
    }

    // Corner Radius → border-radius
    if (!compact && figmaNodeData.cornerRadius !== undefined && figmaNodeData.cornerRadius > 0) {
      lines.push(`${indent}  - **cornerRadius**: ${figmaNodeData.cornerRadius}px`)
    }
    if (!compact && figmaNodeData.rectangleCornerRadii) {
      const radii = figmaNodeData.rectangleCornerRadii
      lines.push(`${indent}  - **rectangleCornerRadii**: [${radii[0]}, ${radii[1]}, ${radii[2]}, ${radii[3]}]`)
    }

    // 字体样式
    if (figmaNodeData.style) {
      const s = figmaNodeData.style
      const typo = []
      if (s.fontFamily) typo.push(`font-family: ${s.fontFamily}`)
      if (s.fontSize) typo.push(`font-size: ${s.fontSize}px`)
      if (s.fontWeight) typo.push(`font-weight: ${s.fontWeight}`)
      if (s.lineHeightPx) typo.push(`line-height: ${s.lineHeightPx}px`)
      if (s.letterSpacing) typo.push(`letter-spacing: ${s.letterSpacing}px`)
      if (s.textAlignHorizontal) typo.push(`text-align: ${s.textAlignHorizontal.toLowerCase()}`)
      if (typo.length > 0) lines.push(`${indent}  - **字体**: ${typo.join(', ')}`)
    }

    // 递归处理子节点
    if (figmaNodeData.children && Array.isArray(figmaNodeData.children)) {
      for (const child of figmaNodeData.children) {
        const childData = this._formatFigmaStyleData(child, depth + 1, maxDepth)
        if (childData) lines.push(childData)
      }
    }

    return lines.join('\n')
  }

  /**
   * 验证文件路径是否有效
   * 过滤掉中文描述、纯文本等无效路径
   */
  _isValidFilePath(path) {
    if (!path || typeof path !== 'string') return false

    // 必须包含文件扩展名（.vue, .js, .less, .json等）
    if (!/\.[a-zA-Z0-9]+$/.test(path)) {
      return false
    }

    // 不能包含中文字符
    if (/[一-龥]/.test(path)) {
      return false
    }

    // 不能包含空格（正常文件路径不应该有空格）
    if (/\s/.test(path)) {
      return false
    }

    // 必须是相对路径格式（package/index.vue, resources/styles/index.less等）
    // 不能以/开头，不能包含..
    if (path.startsWith('/') || path.includes('..')) {
      return false
    }

    return true
  }

  /**
   * 清理文件内容中的markdown标记
   * @param {string} content - 原始内容
   * @param {string} filePath - 文件路径（用于 .vue 文件特殊处理）
   */
  _sanitizeFileContent(content, filePath = '') {
    if (!content || typeof content !== 'string') return content

    // 1. 去除开头的 markdown 代码围栏（``` 或 ```less 等）
    let sanitized = content.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')

    // 1.5. 🆕 去除 <thinking>...</thinking> 块（LLM 推理文本泄漏到 Vue 文件中）
    sanitized = sanitized.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')

    // 2. 去除结尾的 markdown 代码围栏（单独成行的 ```）
    sanitized = sanitized.replace(/\n?\s*```\s*$/g, '')

    // 3. 去除中间可能出现的独立 markdown 围栏行（整行只有 ``` 或 ```lang）
    sanitized = sanitized.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')

    // 4. 对 .vue 文件：去除 </style> / </script> / </template> 之后的说明性文本/markdown残留
    if (filePath.endsWith('.vue')) {
      // 标准 Vue SFC 中 </style> 应是最后一个块，它之后的任何内容（多余的 </script>、markdown 等）全部丢弃
      const styleCloseIdx = sanitized.lastIndexOf('</style>')
      if (styleCloseIdx !== -1) {
        sanitized = sanitized.substring(0, styleCloseIdx + '</style>'.length)
      } else {
        // 回退：若没有 style 块，取所有闭合标签中位置最靠后的，并去除其后说明性文本
        const closingTags = ['</script>', '</template>']
        let lastCloseIdx = -1
        let lastCloseTagLen = 0
        for (const tag of closingTags) {
          const idx = sanitized.lastIndexOf(tag)
          if (idx > lastCloseIdx) {
            lastCloseIdx = idx
            lastCloseTagLen = tag.length
          }
        }
        if (lastCloseIdx !== -1) {
          const afterClose = sanitized.substring(lastCloseIdx + lastCloseTagLen)
          if (/```|精修说明|#\s|说明|Explanation|NOTE:|\*\*/.test(afterClose)) {
            sanitized = sanitized.substring(0, lastCloseIdx + lastCloseTagLen)
          }
        }
      }

      // 5. 🆕 修复 LLM 输出中的虚假换行（每 ~15-20 字符硬换行导致标识符被拆碎）
      sanitized = this._fixSpuriousLineBreaks(sanitized)
    }

    // 6. 去除首尾多余空白（保留内容中的空白）
    return sanitized.trim()
  }

  /**
   * 🆕 修复 LLM 输出中的虚假换行
   * LLM 在分块生成模式下可能每 ~15-20 字符硬换行，导致标识符/属性/字符串被拆碎
   * 策略：template 区域 direct join + 后处理属性间距；script 区域 direct join + 关键词间距
   */
  _fixSpuriousLineBreaks(content) {
    // 检测：双重条件——平均行长 < 25 且最大行长 < 80 才触发修复，避免误判紧凑 CSS/LESS/JSON
    const lines = content.split('\n')
    const nonEmptyLines = lines.filter(l => l.trim())
    if (nonEmptyLines.length === 0) return content
    const avgLen = nonEmptyLines.reduce((s, l) => s + l.trim().length, 0) / nonEmptyLines.length
    const maxLen = Math.max(...nonEmptyLines.map(l => l.trim().length))
    if (avgLen > 25 || maxLen > 80) return content

    logger?.warn?.('检测到 Vue 文件可能存在虚假换行（平均行长 ' + avgLen.toFixed(0) + '，最大 ' + maxLen + '），开��修复')

    const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/)

    let fixed = content

    // --- Template 区域 ---
    if (templateMatch) {
      let template = templateMatch[1]
      // 策略：只合并明显被虚假换行打断的 HTML 标签行，避免破坏字符串内容
      // - 当前行不以 > 结尾且下一行不以 < 开头 → 合并（属性被断开）
      // - 当前行不以 < 开头且上一行不以 > 结尾 → 合并到上一行（属性值的延续）
      const tLines = template.split('\n')
      const tMerged = []
      for (let i = 0; i < tLines.length; i++) {
        const line = tLines[i]
        const trimmed = line.trim()
        if (!trimmed) { tMerged.push(line); continue }
        // 当前行不以 < 开头（是上一行的延续），且上一行不以 > 结尾 → 合并到上一行
        if (tMerged.length > 0 && !trimmed.startsWith('<')) {
          const prev = tMerged[tMerged.length - 1].trimEnd()
          if (!prev.endsWith('>') && !prev.endsWith('/>')) {
            tMerged[tMerged.length - 1] = prev + ' ' + trimmed
            continue
          }
        }
        // 当前行不以 > 结尾，且下一行不以 < 开头 → 合并下一行（属性值延续）
        if (!trimmed.endsWith('>') && !trimmed.endsWith('/>') && i + 1 < tLines.length) {
          const nextTrimmed = tLines[i + 1].trim()
          if (nextTrimmed && !nextTrimmed.startsWith('<')) {
            tMerged.push(trimmed + ' ' + nextTrimmed)
            i++ // skip next
            continue
          }
        }
        tMerged.push(line)
      }
      template = tMerged.join('\n')
      // 轻量后处理：修复属性粘连
      template = template.replace(/"([a-zA-Z:@v-][\w-]*=)/g, '" $1')
      template = template.replace(
        /<(div|span|img|base-panel|base|a|p|ul|li|button|input|label|form|h[1-6])(class|style|src|alt|id|ref|:|@|v-|panelKey|key)/g,
        '<$1 $2',
      )
      fixed = fixed.replace(templateMatch[1], template)
    }

    // --- Script 区域 ---
    if (scriptMatch) {
      let script = scriptMatch[1]
      // 策略：只合并被虚假换行打断的 import/const/let 声明语句，不使用全局 ; 替换避免破坏模板字符串和正则
      const sLines = script.split('\n')
      const sMerged = []
      for (let i = 0; i < sLines.length; i++) {
        const line = sLines[i]
        const trimmed = line.trim()
        if (!trimmed) { sMerged.push(line); continue }
        // 前一行是未完成的 import/const/let 语句 → 合并
        if (sMerged.length > 0) {
          const prevTrimmed = sMerged[sMerged.length - 1].trim()
          const isIncompleteImport = prevTrimmed.startsWith('import ') && !prevTrimmed.includes('from') && !prevTrimmed.endsWith(';')
          const isIncompleteDecl = (prevTrimmed.startsWith('const ') || prevTrimmed.startsWith('let ')) &&
            !prevTrimmed.endsWith(';') && !prevTrimmed.endsWith('}') && !prevTrimmed.endsWith(']')
          if (isIncompleteImport || isIncompleteDecl) {
            if (trimmed && !trimmed.startsWith('import') && !trimmed.startsWith('const') && !trimmed.startsWith('let') && !trimmed.startsWith('export')) {
              sMerged[sMerged.length - 1] = prevTrimmed + ' ' + trimmed
              continue
            }
          }
        }
        sMerged.push(line)
      }
      script = sMerged.join('\n')
      // 轻量后处理：确保 import 语句独占一行
      script = script.replace(/([;}])\s*(import\s)/g, '$1\n$2')
      // 关键词后加空格（保守，只处理明确粘连的常见关键词）
      const kwAfter = ['import', 'export', 'const', 'let', 'var', 'from', 'return', 'function', 'async', 'if', 'for']
      for (const kw of kwAfter) {
        script = script.replace(new RegExp('\\b' + kw + '(?=[a-zA-Z$_])', 'g'), kw + ' ')
      }
      fixed = fixed.replace(scriptMatch[1], '\n' + script.trim() + '\n')
    }

    return fixed
  }

  /**
   * 写入文件
   */
  writeFiles(files, outputPath) {
    if (!files || typeof files !== 'object') {
      logger.error('writeFiles 收到无效的 files 参数', { files })
      throw new Error('files 参数无效：期望一个对象')
    }

    logger.info('开始写入文件', { outputPath, fileCount: Object.keys(files).length })

    const writtenFiles = []
    const skippedFiles = []

    try {
      for (const [relativePath, content] of Object.entries(files)) {
        // ✅ 验证文件路径
        if (!this._isValidFilePath(relativePath)) {
          logger.warn('❌ 跳过无效文件路径', {
            path: relativePath,
            reason: '路径包含中文、空格或缺少扩展名',
            contentPreview: content ? content.substring(0, 100) : ''
          })
          skippedFiles.push(relativePath)
          continue
        }

        // ✅ 清理文件内容（去除markdown标记）
        const sanitizedContent = this._sanitizeFileContent(content, relativePath)

        const fullPath = join(outputPath, relativePath)
        const dir = dirname(fullPath)

        // 确保目录存在
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }

        // 写入文件
        writeFileSync(fullPath, sanitizedContent, 'utf-8')
        writtenFiles.push(relativePath)

        logger.debug('✅ 文件已写入', {
          path: relativePath,
          size: sanitizedContent.length,
          sanitized: sanitizedContent.length !== content.length
        })
      }

      logger.info('✅ 文件写入完成', {
        written: writtenFiles.length,
        skipped: skippedFiles.length,
        skippedPaths: skippedFiles.length > 0 ? skippedFiles.slice(0, 5) : []
      })
      return writtenFiles

    } catch (error) {
      logger.error('文件写入失败', { error: error.message })
      throw error
    }
  }

  /**
   * 验证和修复生成的文件（防止反复出现相同错误）
   * @param {Object} files - 生成的文件对象 {path: content}
   * @param {string} componentName - 组件名称
   * @param {string} outputPath - 输出路径
   * @returns {Object} { fixedFiles: {...}, fixes: [...] }
   */
  /**
   * 🆕 #2: declare.json 顶层 schema 默认值归一化
   * 当 LLM 漏写顶层字段时，补齐带默认值的完整结构，避免运行时/Playground 读空报错。
   * 保留 LLM 已生成的有效内容，只补缺失项，不覆盖已有值。
   * @param {Object} declare - 解析后的 declare.json 对象
   * @param {Object} opts
   * @param {string} [opts.componentId] - 归一化后的组件 ID（kebab）
   * @param {string} [opts.componentName] - 组件 ID 原始名（fallback）
   * @param {string} [opts.displayName] - 中文显示名（用于 componentName 兜底）
   * @returns {{ declare: Object, changed: boolean }}
   */
  normalizeDeclareJson(declare, opts = {}) {
    const { componentId, componentName, displayName, nodeData } = opts
    const d = (declare && typeof declare === 'object') ? declare : {}
    let changed = false

    // size — 从 Figma 节点原始尺寸兜底，确保预览页能按实际宽高渲染
    if (!d.size || !d.size.width || !d.size.height) {
      if (nodeData?.absoluteBoundingBox?.width && nodeData?.absoluteBoundingBox?.height) {
        d.size = {
          width: Math.round(nodeData.absoluteBoundingBox.width),
          height: Math.round(nodeData.absoluteBoundingBox.height)
        }
        changed = true
      }
    }

    const stripPrefix = (n) => String(n || '').replace(/^(mc|cp|mv|page)-(\d{13}-)?/i, '').trim()
    const hasIdPrefix = (n) => /^(mc-|cp-|mv-|page-)/i.test(n) || /^mc-\d{13}-[a-f0-9]+$/i.test(n)

    // componentId 归一为 kebab
    const normId = (componentId || componentName || 'unknown-component')
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (!d.componentId) { d.componentId = normId; changed = true }

    // componentName 兜底中文显示名（仅当缺失时填，避免覆盖 LLM 已给的有效中文名）
    if (!d.componentName) {
      const hint = displayName ? stripPrefix(displayName) : ''
      d.componentName = hint || d.componentId || componentName || '未知组件'
      changed = true
    }

    // version
    if (!d.version) { d.version = 'v1.0.0'; changed = true }

    // attribute
    if (!d.attribute || typeof d.attribute !== 'object') {
      d.attribute = { imgUrl: null, aspectRatio: [16, 9], title: d.componentName, description: d.componentName }
      changed = true
    } else {
      if (!d.attribute.aspectRatio) { d.attribute.aspectRatio = [16, 9]; changed = true }
      if (!d.attribute.title) { d.attribute.title = d.componentName; changed = true }
      if (!d.attribute.description) { d.attribute.description = d.componentName; changed = true }
    }

    // businessEvents：确保含 -onload + 每个 event 的 eventDataSchema 完整
    const onloadId = `${d.componentId}-onload`
    if (!d.businessEvents || typeof d.businessEvents !== 'object') {
      d.businessEvents = {}
      changed = true
    }
    if (Array.isArray(d.businessEvents)) {
      if (!d.businessEvents.some((e) => (e.eventId || '').endsWith('-onload'))) {
        d.businessEvents.push({ eventId: onloadId, eventName: '组件加载完成', eventDataSchema: this._defaultEventSchema(d.componentId) })
        changed = true
      }
    } else if (!d.businessEvents[onloadId]) {
      d.businessEvents[onloadId] = { eventId: onloadId, eventName: '组件加载完成', eventDataSchema: this._defaultEventSchema(d.componentId) }
      changed = true
    }
    const events = Array.isArray(d.businessEvents) ? d.businessEvents : Object.values(d.businessEvents)
    for (const evt of events) {
      if (!evt || typeof evt !== 'object') continue
      if (!evt.eventDataSchema || (typeof evt.eventDataSchema === 'object' && Object.keys(evt.eventDataSchema).length === 0)) {
        evt.eventDataSchema = this._defaultEventSchema(d.componentId)
        changed = true
      }
    }

    // 其余顶层字段默认值（与 component-template 兜底结构对齐）
    if (!d.businessStatuses || typeof d.businessStatuses !== 'object') { d.businessStatuses = {}; changed = true }
    if (d.dataSources === undefined) { d.dataSources = null; changed = true }
    if (d.formSources === undefined) { d.formSources = null; changed = true }

    if (!d.layoutConfig || typeof d.layoutConfig !== 'object') {
      d.layoutConfig = { default: 'one', list: [{ name: '默认布局', key: 'one', previewName: 'mc-preview.png' }] }
      changed = true
    }
    if (!d.themeConfig || typeof d.themeConfig !== 'object') {
      d.themeConfig = { default: 'dark', list: [{ name: '浅色主题', key: 'light' }, { name: '深色主题', key: 'dark' }] }
      changed = true
    }
    if (!Array.isArray(d.cssVariableConfig)) { d.cssVariableConfig = []; changed = true }

    return { declare: d, changed }
  }

  /** 默认 eventDataSchema（带 key/name/type/required 元数据，与 component-template 结构一致） */
  _defaultEventSchema(componentId) {
    return {
      componentId: { key: 'componentId', name: '组件ID', type: 'string', required: true },
      timestamp: { key: 'timestamp', name: '时间戳', type: 'number', required: true }
    }
  }

  /**
   * 🔥 从 Figma 节点树中提取 panel-header 的中文标题
   * 用于 declare.json componentName 缺失中文时的兜底修复
   *
   * @param {Object} nodeData - Figma 节点树（cp-xxx 根节点的 figmaNodeData）
   * @returns {string|null} 提取到的中文标题，或 null
   */
  _extractHeaderTitle(nodeData) {
    if (!nodeData) return null

    const findNode = (node, pattern) => {
      if (!node) return null
      if (node.name && pattern.test(node.name)) return node
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findNode(child, pattern)
          if (found) return found
        }
      }
      return null
    }

    const findText = (node) => {
      if (!node) return null
      if (node.type === 'TEXT' && node.characters && node.characters.trim()) return node
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findText(child)
          if (found) return found
        }
      }
      return null
    }

    const extractChinese = (text) => {
      if (!text || typeof text !== 'string') return null
      const trimmed = text.trim()
      if (!trimmed || /^Frame\s*\d+$/i.test(trimmed)) return null
      const match = trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf][\u4e00-\u9fff\u3400-\u4dbf\s\d]*/)
      return match ? match[0].trim() : null
    }

    // 在 cp-xxx 节点树中查找 panel-header → 提取标题
    const headerNode = findNode(nodeData, /^panel[-_]?header$/i)
    if (headerNode) {
      const textNode = findText(headerNode)
      if (textNode) {
        const title = extractChinese(textNode.characters)
        if (title) return title
      }
    }

    // 兜底：在整个节点树中查找第一个中文 TEXT 节点
    const anyTextNode = findText(nodeData)
    if (anyTextNode) {
      const title = extractChinese(anyTextNode.characters)
      if (title) return title
    }

    return null
  }

  validateAndFixGeneratedFiles(files, componentName, outputPath, backgroundBrightness = 'dark', displayName = null, nodeData = null) {
    const fixedFiles = {}
    const fixes = []

    // ==================== v3.6: declare.json 后校验 ====================
    const declarePath = 'declare.json'
    const isMcId = (name) => /^mc-\d{13}-[a-f0-9]+$/i.test(name)

    if (files[declarePath]) {
      try {
        let declareModified = false
        const parsed = JSON.parse(files[declarePath])

        // 🆕 #2: 顶层 schema 默认值归一化（补齐 LLM 漏写的字段，保留已有内容）
        const { declare, changed: normalized } = this.normalizeDeclareJson(parsed, {
          componentId: parsed.componentId,
          componentName,
          displayName,
          nodeData
        })
        if (normalized) {
          declareModified = true
          fixes.push('declare.json 顶层字段缺失，已按默认值归一化补齐')
          logger.info('🔧 declare.json 顶层 schema 已归一化补齐', { componentName })
        }

        // 1. 检查 componentName 是否是组件ID而非中文显示名
        const hasIdPrefix = (name) => /^(mc-|cp-|mv-|page-)/i.test(name)  // 🆕 v3.8: 扩展前缀检测
        if (hasIdPrefix(declare.componentName) || isMcId(declare.componentName)) {
          // 优先使用传入的 displayName，其次从 visualElements 提取，最后从 Figma header 提取
          let fixName = displayName
          if (!fixName || hasIdPrefix(fixName) || isMcId(fixName)) {
            // 🔥 尝试从 Figma 节点树中提取 panel-header 标题
            fixName = nodeData ? this._extractHeaderTitle(nodeData) : null
          }
          if (!fixName || hasIdPrefix(fixName) || isMcId(fixName)) {
            fixName = declare.componentId || componentName
          }
          // 如果 fixName 仍是组件ID前缀格式，回退用短标识
          if (hasIdPrefix(fixName) || isMcId(fixName)) {
            fixName = componentName.replace(/^(mc|cp|mv)-\d{13}-/, '').substring(0, 8)
            fixes.push(`⚠️ declare.json componentName 缺少中文显示名，使用后缀 "${fixName}" 作为临时名称`)
          }

          declare.componentName = fixName
          declareModified = true
          fixes.push(`declare.json componentName 含前缀 "${declarePath.match(/^(mc|cp|mv)-/)?.[0] || 'unknown'}-"，已自动替换为显示名称: "${fixName}"`)
          logger.info('🔧 declare.json componentName 已自动修复', {
            original: componentName,
            to: fixName
          })
        }

        // 🆕 v3.8: 修复空的 eventDataSchema（注入默认 componentId + timestamp）
        if (declare.businessEvents && Array.isArray(declare.businessEvents)) {
          for (const evt of declare.businessEvents) {
            if (evt.eventDataSchema && typeof evt.eventDataSchema === 'object' && Object.keys(evt.eventDataSchema).length === 0) {
              evt.eventDataSchema = {
                componentId: declare.componentId || componentName,
                timestamp: '${new Date().toISOString()}'
              }
              declareModified = true
              fixes.push(`declare.json businessEvents[${evt.eventId || '?'}].eventDataSchema 为空，已自动注入 componentId + timestamp`)
              logger.info('🔧 declare.json eventDataSchema 已自动修复', { eventId: evt.eventId })
            }
          }
        }

        if (declareModified) {
          fixedFiles[declarePath] = JSON.stringify(declare, null, 2)
        }
      } catch (e) {
        logger.warn('无法解析 declare.json 进行后校验', { error: e.message })
      }
    }
    // ==================== End v3.6 ====================
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark'

    // 1. 检查并修复主题文件
    const themeFiles = {
      'resources/styles/themes/dark.less': `&.dark {
  .theme-dark();
  @import (multiple) '../common.less';
}
`,
      'resources/styles/themes/light.less': `&.light {
  .theme-light();
  @import (multiple) '../common.less';
}
`,
      'resources/styles/themes/theme-vars.less': `// 主题变量和 mixins（自动生成兜底）
.common() {
  // 跨主题共享变量
}
.theme-dark() {
  // 深色主题变量
}
.theme-light() {
  // 浅色主题变量
}
.theme-${defaultTheme}(); // 全局默认与面板 backgroundBrightness=${backgroundBrightness} 一致
.common(); // 跨主题共享变量，必须调用！否则 common.less 顶层引用时变量未定义
`
    }

    for (const [path, defaultContent] of Object.entries(themeFiles)) {
      if (!files[path]) {
        fixedFiles[path] = defaultContent
        fixes.push(`缺少文件: ${path}，已自动创建`)
      }
    }

    // 2. 检查并修复 package/index.vue
    const indexVuePath = 'package/index.vue'
    if (files[indexVuePath]) {
      let content = files[indexVuePath]
      let modified = false

      // 2.0 检查script标签是否完整闭合（最高优先级）
      const hasScriptOpen = content.includes('<script')
      const hasScriptClose = content.includes('</script>')

      if (hasScriptOpen && !hasScriptClose) {
        fixes.push('🚨 CRITICAL: package/index.vue 的 <script> 标签未闭合，文件生成被截断')
        // 尝试基本修复：添加闭合标签和最小必需内容
        if (!content.includes('$mcComponentBuilder')) {
          content += `\n\n// 组件配置\nconst componentProps = {}\n\nconst { runtimeBuilder } = window.$mcComponentBuilder({\n  componentId: '\${componentName}',\n  componentProps,\n  componentName: '\${componentName}'\n})\n\nonMounted(() => {\n  runtimeBuilder.publishEvent('\${componentName}-onload', {\n    componentId: '\${componentName}',\n    timestamp: Date.now()\n  })\n})\n</script>`
          modified = true
          fixes.push('已自动补全 script 内容和闭合标签')
        } else {
          content += '\n</script>'
          modified = true
          fixes.push('已自动添加 </script> 闭合标签')
        }
      }

      // 2.1 检查是否缺少 <style lang="less" scoped> 块
      if (!content.includes('<style')) {
        const styleBlock = `\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>`
        content = content + styleBlock
        modified = true
        fixes.push('package/index.vue 缺少 <style lang="less" scoped> 块，已自动添加')
      } else if (content.includes('<style') && !content.includes('lang="less"')) {
        // 如果有style块但没有lang="less"，修复它
        content = content.replace(/<style([^>]*)>/g, '<style lang="less"$1>')
        modified = true
        fixes.push('package/index.vue 的 <style> 缺少 lang="less"，已自动修复')
      }

      if (content.includes('<style') && !/<style[^>]*scoped/.test(content)) {
        content = content.replace(/<style([^>]*)>/g, (match, attrs = '') => {
          return /\bscoped\b/.test(attrs) ? match : `<style${attrs} scoped>`
        })
        modified = true
        fixes.push('package/index.vue 的 <style> 缺少 scoped，已自动修复')
      }

      if (!content.includes("@import '../resources/styles/index.less';") && !content.includes('@import "../resources/styles/index.less";')) {
        const nextContent = this._ensureIndexVueStyleImport(content)
        if (nextContent !== content) {
          content = nextContent
          modified = true
          fixes.push("package/index.vue 缺少 @import '../resources/styles/index.less';，已自动补齐")
        }
      }

      // 2.2 验证 $mcComponentBuilder 调用方式
      if (content.includes('$mcComponentBuilder')) {
        // 检查是否正确解构
        if (!content.includes('const { runtimeBuilder }') && !content.includes('const {runtimeBuilder}')) {
          fixes.push('⚠️ $mcComponentBuilder 调用方式不规范：未正确解构 { runtimeBuilder }')
        }
        // 检查是否在 onMounted 中触发 onload 事件
        if (!content.includes('runtimeBuilder.publishEvent') || !content.includes('onload')) {
          fixes.push('⚠️ 未在 onMounted 中正确触发 onload 事件（应使用 runtimeBuilder.publishEvent）')
        }
      } else {
        fixes.push('⚠️ package/index.vue 缺少 $mcComponentBuilder 调用')
      }

      // 2.3 验证 RESOURCE_UTILIZATION（检查是否使用了资源变量）
      // 检查是否有 CSS gradient 但没有使用背景资源
      if (content.includes('linear-gradient') || content.includes('radial-gradient')) {
        if (!content.includes('import bg') && !content.includes(':src="bg')) {
          fixes.push('⚠️ RESOURCE_UTILIZATION 违规：使用了 CSS gradient 但可能应该使用已下载的背景资源（bg1, bg2等）')
        }
      }

      const buttonFixResult = this._rewriteClickableIconDivsToButtons(content)
      if (buttonFixResult.changed) {
        content = buttonFixResult.content
        modified = true
        fixes.push(`package/index.vue 已将 ${buttonFixResult.count} 个明显可点击图标容器 div 自动改为 button`)
      }

      const basePanelFixResult = this._stripBasePanelShellLeak(content)
      if (basePanelFixResult.changed) {
        content = basePanelFixResult.content
        modified = true
        fixes.push(`package/index.vue 已移除 ${basePanelFixResult.removedCount} 处 base-panel 外壳泄漏结构`)
      }

      if (modified) {
        fixedFiles[indexVuePath] = content
      }
    }

    // 3. 检查 resources/styles/common.less（如果为空或过小，添加基础内容）
    const commonLessPath = 'resources/styles/common.less'
    if (!files[commonLessPath] || files[commonLessPath].trim().length < 10) {
      fixedFiles[commonLessPath] = `// 通用样式
.c-\${componentName}-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
`
      fixes.push('resources/styles/common.less 为空或过小，已添加基础内容')
    }

    // 4. 检查并修复 LLM 截断 componentId 的 class name（常见：长数字 ID 被少抄）
    const _fixId = (content, path) => {
      if (!content || typeof content !== 'string') return content
      // 匹配 .c-mc-NNNNNNNNNNNN-XXXXXXXX 格式的 class name
      const idRx = /\.c-(mc-\d+-\w+)(?=-)/g
      let result = content
      let match
      let replaced = false
      while ((match = idRx.exec(content)) !== null) {
        const found = match[1]
        if (found !== componentName) {
          // LLM 截断了 componentId，全局替换
          const esc = found.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          result = result.replace(new RegExp(esc, 'g'), componentName)
          replaced = true
          fixes.push(`class name 中 componentId 被 LLM 截断: "${found}" → "${componentName}"（${path}），已自动修复`)
        }
      }
      return replaced ? result : null
    }

    const ALL_STYLE_EXTS = new Set(['vue', 'less', 'css'])
    const mergedFiles = { ...files, ...fixedFiles } // fixedFiles 优先
    for (const [path, content] of Object.entries(mergedFiles)) {
      const ext = path.split('.').pop()
      if (!ALL_STYLE_EXTS.has(ext)) continue
      const fixed = _fixId(content, path)
      if (fixed !== null) {
        fixedFiles[path] = fixed
      }
    }

    return { fixedFiles, fixes }
  }

  _ensureIndexVueStyleImport(content) {
    if (!content || typeof content !== 'string') return content
    if (content.includes("@import '../resources/styles/index.less';") || content.includes('@import "../resources/styles/index.less";')) {
      return content
    }

    if (/<style[^>]*>[\s\S]*?<\/style>/i.test(content)) {
      return content.replace(/<style([^>]*)>([\s\S]*?)<\/style>/i, (match, attrs = '', body = '') => {
        const normalizedBody = body.trim()
        const importLine = "@import '../resources/styles/index.less';"
        const nextBody = normalizedBody ? `${importLine}\n${normalizedBody}` : importLine
        return `<style${attrs}>\n${nextBody}\n</style>`
      })
    }

    return content + `\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>`
  }

  _rewriteClickableIconDivsToButtons(content) {
    if (!content || typeof content !== 'string') {
      return { content, changed: false, count: 0 }
    }

    const clickableIconDivPattern = /<div([^>]*\bclass=(['"])[^'"]*(?:icon|btn|button|action|control|close|refresh|setting|operate)[^'"]*\2[^>]*\s(?:@click|v-on:click|role=(['"])button\3|aria-label=|tabindex=)[^>]*)>([\s\S]*?)<\/div>/gi

    let count = 0
    const nextContent = content.replace(clickableIconDivPattern, (match, attrs = '', _quote, _roleQuote, inner = '') => {
      if (/<(?:div|section|article|header|footer|main|ul|ol|li|table|form)\b/i.test(inner)) {
        return match
      }

      let nextAttrs = attrs
        .replace(/\srole=(['"])button\1/gi, '')
        .replace(/\stabindex=(['"])-?\d+\1/gi, '')
        .trim()

      if (!/\btype=/.test(nextAttrs)) {
        nextAttrs += ' type="button"'
      }

      count += 1
      return `<button${nextAttrs}>${inner}</button>`
    })

    return {
      content: nextContent,
      changed: count > 0,
      count,
    }
  }

  _stripBasePanelShellLeak(content) {
    if (!content || typeof content !== 'string' || !/<base-panel\b/i.test(content)) {
      return { content, changed: false, removedCount: 0 }
    }

    let removedCount = 0
    let nextContent = content

    // 仅清理非常明确的重复壳层节点，避免误删预览中应保留的 header 内容。
    const bgLayerPattern = /\n?\s*<div[^>]*class=(['"])[^'"]*\bbg-layer\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi
    nextContent = nextContent.replace(bgLayerPattern, () => {
      removedCount += 1
      return '\n'
    })

    const hasHeaderSlots = /<template\s+#(title-left|title-right|header-right)/i.test(nextContent)
    if (hasHeaderSlots) {
      const panelHeaderPattern = /\n?\s*<div[^>]*class=(['"])[^'"]*\bpanel-header\b[^'"]*\1[^>]*>[\s\S]*?<\/div>\s*/gi
      nextContent = nextContent.replace(panelHeaderPattern, () => {
        removedCount += 1
        return '\n'
      })
    }

    return {
      content: nextContent,
      changed: removedCount > 0,
      removedCount,
    }
  }

  /**
   * 执行完整的代码生成流程
   */
  async execute(params) {
    const {
      layoutStructure,
      visualElements,
      componentName,
      outputPath,
      stage = 'preview',
      reviewResult,
      previousCritiques,  // ✅ 新增：接收对抗性检查的critique
      charts,
      interactions,
      analysisType,
      analysisTarget,
      analysisDescription,
      analysisEvidence,
      figmaNodeData,
      styleMappings,
      assets,
      resourceDomMapping,    // 🆕 资源-DOM映射表（用于自动注入import）
      _l0CodeRetryGuidance,  // 🆕 L0-B 重试修复指导
      techStackHints,        // 🆕 技术栈提示
      _selfOptimization,     // 🧠 自优化：历史模式驱动的 Prompt 增强
      panelType = 'default-panel',  // 🆕 面板类型
      headerSlots = null,            // 🆕 面板头部插槽信息
      elementStyleMap = null,         // 🆕 v3.1: per-element 样式映射（来自 Style Mapper）
      backgroundBrightness = 'dark',  // 🆕 面板明暗主题
      displayName = null,               // 🆕 v3.6: 组件中文显示名称（用于 declare.json 后校验）
      docAnalysis = null,               // 🆕 S8: 需求文档分析产物（doc-analysis.json 六维）
      onProgress = null,                // 🆕 v3.8: SSE 进度回调（LLM 心跳推送）
      _runtimeRevisionGuidance = null,  // 🆕 运行时增量修订指导（来自 classifyRuntimeGate）
      targetFiles = null,               // 🆕 P1: 仅重做这些文件（按问题类别只修目标文件）
      reviseTarget = null                // 🆕 P1: 修订目标类别（full/layout/structural/...）
    } = params

    // 如果未提供 displayName，从 figmaNodeData 中自动提取
    const compDisplayName = displayName || figmaNodeData?.name || ''

    // 判断是首次生成还是修订
    const isRevision = previousCritiques && previousCritiques.length > 0
    const action = isRevision ? '修订' : '生成'

    logger.info(`开始执行代码${action}`, {
      componentName,
      stage,
      isRevision,
      critiqueCount: previousCritiques?.length || 0
    })

    // 如果是修订，记录需要修复的问题
    if (isRevision) {
      const highSeverity = previousCritiques.filter(c => c.severity === 'high').length
      const mediumSeverity = previousCritiques.filter(c => c.severity === 'medium').length
      logger.info('📋 修订目标', {
        total: previousCritiques.length,
        high: highSeverity,
        medium: mediumSeverity,
        categories: [...new Set(previousCritiques.map(c => c.category))]
      })

      // 详细记录每个需要修复的问题
      previousCritiques.forEach((critique, index) => {
        logger.info(`  修复项 #${index + 1}: ${critique.issue}`, {
          severity: critique.severity,
          category: critique.category,
          location: critique.location || 'N/A'
        })
      })
    }

    try {
      // 1. 生成代码
      const codeResult = await this.generateCode({
        onProgress,  // 🆕 v3.8: 传递 SSE 进度回调
        layoutStructure,
        visualElements,
        componentName,
        stage,
        reviewResult,
        previousCritiques,  // ✅ 传递给generateCode
        charts,
        interactions,
        analysisType,
        analysisTarget,
        analysisDescription,
        analysisEvidence,
        figmaNodeData,
        styleMappings,
        assets,
        resourceDomMapping,
        headerSlots,  // 🆕 传递插槽信息
        panelType,  // 🆕 传递面板类型
        elementStyleMap,  // 🆕 v3.1: 传递 per-element 样式映射
        backgroundBrightness,  // 🆕 传递面板明暗主题
        displayName: compDisplayName,  // 🆕 v3.6: 组件中文显示名称
        docAnalysis,  // 🆕 S8: 传递需求文档分析产物
        isRevision,   // 🆕 P1: 标记修订模式（部分修订判断依据）
        outputPath,   // 🆕 P1: 部分修订时从磁盘保留未变更文件
        targetFiles,   // 🆕 P1: 仅重做目标文件
        reviseTarget   // 🆕 P1: 修订目标类别
      })

      // 1.5. 后处理：自动注入资源import语句（防止AI臆造文件名）
      if (resourceDomMapping && codeResult.files['package/index.vue']) {
        codeResult.files['package/index.vue'] = this.injectResourceImports(
          codeResult.files['package/index.vue'],
          resourceDomMapping
        )
        logger.info('✅ 已自动注入资源import语句')
      }

      // 2. 写入文件
      const writtenFiles = this.writeFiles(codeResult.files, outputPath)

      // 3. 补充标准文件：component.js、declare.js、index.less、主题包装文件（固定模板，不需要AI生成）
      const standardFiles = {
        'component.js': `import component from './package/index.vue'
import './resources/styles/index.css'
export default component
`,
        'resources/styles/index.less': `@import './themes/theme-vars.less';
@import (multiple) './common.less';
@import './themes/dark.less';
@import './themes/light.less';
`,
        'resources/styles/themes/dark.less': `&.dark {
  .theme-dark();
  @import (multiple) '../common.less';
}
`,
        'resources/styles/themes/light.less': `&.light {
  .theme-light();
  @import (multiple) '../common.less';
}
`,
        'declare.js': `import declareConfig from './declare.json'
// 设置微码组件信息
let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig
})
// 导出组件配置信息
export default declareInfo
`
      }

      const standardWrittenFiles = this.writeFiles(standardFiles, outputPath)
      const allWrittenFiles = [...writtenFiles, ...standardWrittenFiles]

      logger.info('✅ 已补充标准文件', {
        standardFiles: Object.keys(standardFiles),
        totalFiles: allWrittenFiles.length
      })

      const allFiles = { ...codeResult.files, ...standardFiles }

      // 🔍 4. 验证和修复生成的文件（防止反复出现相同错误）
      const { fixedFiles, fixes } = this.validateAndFixGeneratedFiles(allFiles, componentName, outputPath, backgroundBrightness, compDisplayName, figmaNodeData)

      if (fixes.length > 0) {
        logger.info('🔧 自动修复了以下问题', { fixes, count: fixes.length })
        // 写入修复后的文件
        this.writeFiles(fixedFiles, outputPath)
      }

      // 5. 编译 index.less → index.css（Vite 会拦截 custom-components 下的 .less 文件，必须用 .css）
      try {
        const indexLessPath = join(outputPath, 'resources/styles/index.less')
        if (existsSync(indexLessPath)) {
          const less = await import('less')
          const result = await less.default.render(readFileSync(indexLessPath, 'utf-8'), {
            paths: [join(outputPath, 'resources/styles')],
            javascriptEnabled: true,
          })
          const indexPath = join(outputPath, 'resources/styles/index.css')
          writeFileSync(indexPath, result.css, 'utf-8')
          logger.info('✅ 已编译 index.less → index.css', { size: result.css.length })
        }
      } catch (e) {
        logger.warn('⚠️ index.less → index.css 编译失败，降级使用 .less 原始文件', { error: e.message })
        // 如果编译失败，回退 component.js 的 import 为 .less
        const componentJsPath = join(outputPath, 'component.js')
        writeFileSync(componentJsPath, `import component from './package/index.vue'
import './resources/styles/index.less'
export default component
`)
      }

      return {
        files: { ...allFiles, ...fixedFiles },
        generatedFiles: { ...allFiles, ...fixedFiles }, // ✅ Phase 1 验证器需要的字段
        writtenFiles: allWrittenFiles,
        componentDir: outputPath,  // 🆕 组件生成路径（用于前端显示）
        componentName,  // 🆕 组件名称（用于前端显示）
        componentStructure: {
          mainComponent: 'package/index.vue',
          subComponents: allWrittenFiles.filter(f => f.startsWith('package/components/')),
          styles: allWrittenFiles.filter(f => f.startsWith('resources/styles/'))
        },
        autoFixes: fixes  // 🆕 返回自动修复的问题列表
      }

    } catch (error) {
      logger.error('代码生成执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析输出（BaseAgent要求实现）
   */
  parseOutput(rawOutput) {
    return this.parseCodeOutput(rawOutput)
  }

  /**
   * 格式化资源映射信息
   */
  /**
   * 格式化视觉样式要求
   * Visual Parser 将 styles 映射为 visualElements，样式字段（colors/background/
   * decorations/emphasis）直接挂在 visualElements 上。此处兼容三种来源：
   * visualElements 本身 / visualElements.visualStyle / visualElements.styles。
   */
  _formatVisualStyle(visualElements) {
    if (!visualElements) return ''

    // 优先取显式嵌套字段，否则回退到 visualElements 顶层
    const style = visualElements.visualStyle || visualElements.styles || visualElements

    const colors = style.colors
    const background = style.background
    const decorations = style.decorations
    const emphasis = style.emphasis

    // 颜色可能是对象 {primary:'#..'} 或数组 ['#..']
    const hasColors = colors && (Array.isArray(colors) ? colors.length > 0 : Object.keys(colors).length > 0)
    const hasDecorations = Array.isArray(decorations) && decorations.length > 0
    const hasEmphasis = Array.isArray(emphasis) && emphasis.length > 0

    // 全部为空则不输出该段，避免污染 prompt
    if (!hasColors && !background && !hasDecorations && !hasEmphasis) {
      return ''
    }

    const colorLines = hasColors
      ? (Array.isArray(colors)
          ? colors.map((c, i) => `- 颜色${i + 1}: ${c}`).join('\n')
          : Object.entries(colors).map(([k, v]) => `- ${k}: ${v}`).join('\n'))
      : '(无)'

    return `
## 🎨 视觉样式要求（必须实现）

**主题色：**
${colorLines}

**背景效果：**
${background || '(无)'}

**装饰元素：**
${hasDecorations ? decorations.map(d => `- ${d}`).join('\n') : '(无)'}

**强调手法：**
${hasEmphasis ? emphasis.map(e => `- ${e}`).join('\n') : '(无)'}

⚠️ **你必须在CSS中实现以上所有视觉效果**：
- 使用提供的颜色值
- 用CSS渐变实现背景效果描述
- 用box-shadow、text-shadow、filter等实现光晕/发光效果
- 用伪元素(::before/::after)实现装饰元素
`
  }

  /**
   * 🆕 从 figmaPath 提取语义位置描述，让 LLM 知道每张图属于哪个 UI 区域
   * 例: "slot/Group 2136639043/1/icon" → "卡片1内的图标"
   *     "slot/sub-header/icon" → "副标题区域的图标"
   *     ".../jimeng-xxx-危化品车图标..." → "危化品车图标(AI生成原图)"
   */
  _extractSemanticLocation(figmaPath) {
    if (!figmaPath) return ''
    const path = String(figmaPath)

    // 提取 AI 生成图片的语义名称（jimeng-日期-描述）
    const jimengMatch = path.match(/jimeng-\d{4}-\d{2}-\d{2}-\d{4}-(.+?)(?:\s*\d*)$/)
    if (jimengMatch) {
      // 截取主要描述（去掉尾部细节如 "单元素，蓝色为主..."）
      let desc = jimengMatch[1]
      const truncateIdx = desc.indexOf('，')
      if (truncateIdx > 0 && truncateIdx < 20) desc = desc.slice(0, truncateIdx)
      return desc
    }

    // 从路径推断位置
    const parts = path.split('/')
    const semanticParts = []

    for (const part of parts) {
      if (part === 'slot') continue
      if (part.match(/^Group \d+$/)) {
        // Group 后面的数字可能对应卡片序号（通过相邻节点推断）
        continue
      }
      if (part.match(/^\d+$/)) {
        // 纯数字 = 卡片序号
        semanticParts.push(`卡片${part}`)
      }
      if (part === 'header' || part === 'header-right') semanticParts.push('标题栏')
      if (part === 'sub-header' || part === '小标题') semanticParts.push('副标题')
      if (part === 'bg') semanticParts.push('背景')
      if (part === 'icon' || part === 'image') semanticParts.push('图标')
      if (part === 'title-left' || part === 'title-right') semanticParts.push(part)
    }

    return semanticParts.length > 0 ? semanticParts.join(' - ') : ''
  }

  _formatResourceMapping(mappings) {
    if (!mappings || mappings.length === 0) {
      return ''
    }

    // 🆕 区分可用和不可用资源
    const available = mappings.filter(m => m.downloadStatus === 'success')
    const failed = mappings.filter(m => m.downloadStatus !== 'success')

    const lines = ['## 🎨 资源使用映射（必须遵守）', '']

    const bgMappings = available.filter(m => m.previewAnalysisRole === 'bg')
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    const imgMappings = available.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

    if (bgMappings.length > 0) {
      lines.push('### 背景图资源（必须使用）')
      lines.push('')

      bgMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `bg${index + 1}`
        // 🆕 从 figmaPath 提取语义位置
        const semanticLoc = this._extractSemanticLocation(mapping.figmaPath)
        const locationHint = semanticLoc ? `（位置：${semanticLoc}）` : ''

        lines.push(`**${index + 1}. ${mapping.targetDomSelector}**${locationHint}`)
        lines.push(`- 资源：\`${mapping.resourceFile}\``)
        lines.push(`- 使用：\`${mapping.usage.replace('bgX', varName)}\``)
        // 🆕 增强说明
        const enhancedHint = semanticLoc
          ? `${semanticLoc}的背景图`
          : (mapping.hint || '')
        lines.push(`- 说明：${enhancedHint}`)
        // 🆕 视觉元数据
        if (mapping.visualMeta) {
          if (mapping.visualMeta.fillsSummary) lines.push(`- 样式：${mapping.visualMeta.fillsSummary}`)
          if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
          if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
        }
        lines.push(`- ⚠️ CSS禁止：background/border/border-radius`)
        lines.push('')
      })

      lines.push('**Import示例（系统会自动生成，你不要写）：**')
      lines.push('```javascript')
      bgMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `bg${index + 1}`
        lines.push(`import ${varName} from './${mapping.resourceFile}'`)
      })
      lines.push('```')
      lines.push('')

      lines.push('**⚠️ 强制要求：必须在template中使用这些变量**')
      lines.push('```vue')
      bgMappings.slice(0, 2).forEach((mapping, index) => {
        // v3.3: 如果有精确的 backgroundSize/position/repeat，在示例中展示
        const bgSizing = mapping.backgroundSize || mapping.backgroundPosition || mapping.backgroundRepeat
          ? `, backgroundSize: '${mapping.backgroundSize || 'cover'}', backgroundPosition: '${mapping.backgroundPosition || 'center'}', backgroundRepeat: '${mapping.backgroundRepeat || 'no-repeat'}'`
          : ''
        lines.push(`<div :style="{ backgroundImage: \`url(\${bg${index + 1}})\`${bgSizing} }">...</div>`)
      })
      lines.push('```')
      lines.push('❌ **禁止**：不使用bg变量，直接写CSS background')
      lines.push('')
    }

    if (iconMappings.length > 0) {
      lines.push('### 图标资源（必须使用）')
      lines.push('')

      iconMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `icon${index + 1}`
        // 🆕 从 figmaPath 提取语义位置，让 LLM 知道这张图属于哪里
        const semanticLoc = this._extractSemanticLocation(mapping.figmaPath)
        const locationHint = semanticLoc ? `（位置：${semanticLoc}）` : ''
        // 🆕 从 figmaPath 提取 AI 生成图片的语义名称
        const aiImageDesc = (mapping.figmaPath && mapping.figmaPath.match(/jimeng-[^/]+/))
          ? `[AI生成图: ${this._extractSemanticLocation(mapping.figmaPath)}]` : ''

        // ⚠️ 编号（icon1/icon2...）与 injectResourceImports 的数组顺序强绑定，
        //    因此装饰性图标**不能**被过滤剔除（会导致后续编号整体错位、指向错图），
        //    只能保留在原位并加醒目标注，由 LLM 自行降权。
        const decoTag = mapping.isTinyDecoration ? ' 🔸[装饰元素·非业务图标]' : ''

        lines.push(`**${index + 1}. ${mapping.targetDomSelector}**${locationHint}${decoTag}`)
        lines.push(`- 资源：\`${mapping.resourceFile}\``)
        if (aiImageDesc) lines.push(`- 类型：${aiImageDesc}`)
        if (mapping.isTinyDecoration) {
          const _w = mapping.visualMeta?.width ?? mapping.figmaBox?.width ?? '?'
          const _h = mapping.visualMeta?.height ?? mapping.figmaBox?.height ?? '?'
          lines.push(`- ⚠️ **装饰性微元素（${_w}×${_h}px）**：这是圆点/短线/分隔符一类的纯装饰图形，**不是**标题图标或业务图标。`)
          lines.push(`  - ✅ 允许：作为标题前的小圆点、列表项前缀符、分隔装饰按原始尺寸渲染。`)
          lines.push(`  - ❌ 禁止：当作面板主图标 / 卡片业务图标使用；禁止放大到 20px 以上（会糊）。`)
          lines.push(`  - 💡 若该位置在设计稿中看起来需要一个"真正的图标"，请从下方尺寸正常的 icon 中选取，而不是用这个装饰点。`)
        }
        lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)
        // 🆕 增强说明：优先用语义位置，回退到原始 hint
        const enhancedHint = semanticLoc
          ? `${semanticLoc}的${mapping.previewAnalysisRole === 'bg' ? '背景' : '图标'}${mapping.hint && mapping.hint !== `${mapping.previewAnalysisRole} → ${mapping.targetDomHint}` ? `（${mapping.hint}）` : ''}`
          : (mapping.hint || '')
        lines.push(`- 说明：${enhancedHint}`)
        // 视觉元数据
        if (mapping.visualMeta) {
          if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
          if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
        }
        lines.push('')
      })

      lines.push('**Import示例（系统会自动生成，你不要写）：**')
      lines.push('```javascript')
      iconMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `icon${index + 1}`
        lines.push(`import ${varName} from './${mapping.resourceFile}'`)
      })
      lines.push('```')
      lines.push('')

      lines.push('**⚠️ 强制要求：必须在data中使用这些变量**')
      lines.push('```javascript')
      lines.push('const data = ref([')
      iconMappings.slice(0, Math.min(4, iconMappings.length)).forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `icon${index + 1}`
        lines.push(`  { label: '项目${index + 1}', value: '...', icon: ${varName} }, // ✅ 使用${varName}变量`)
      })
      lines.push('])')
      lines.push('```')
      lines.push('❌ **禁止设置为null**：`icon: null` 是错误的！')
      lines.push('')
    }

    if (imgMappings.length > 0) {
      lines.push('### 图片资源（必须使用）')
      lines.push('')

      imgMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `img${index + 1}`
        lines.push(`**${index + 1}. ${mapping.targetDomSelector}**`)
        lines.push(`- 资源：\`${mapping.resourceFile}\``)
        lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)
        lines.push(`- 说明：${mapping.hint}`)
        // 🆕 视觉元数据
        if (mapping.visualMeta) {
          if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
        }
        lines.push('')
      })

      lines.push('**Import示例（系统会自动生成，你不要写）：**')
      lines.push('```javascript')
      imgMappings.forEach((mapping, index) => {
        const varName = mapping.semanticVarName || `img${index + 1}`
        lines.push(`import ${varName} from './${mapping.resourceFile}'`)
      })
      lines.push('```')
      lines.push('')

      lines.push('**⚠️ 强制要求：必须使用img变量**')
      lines.push('```vue')
      imgMappings.slice(0, 2).forEach((mapping, index) => {
        lines.push(`<img :src="img${index + 1}" alt="图片${index + 1}" />`)
      })
      lines.push('```')
      lines.push('')
    }

    // 🆕 不可用资源警告（下载失败的资源）
    const failedBg = failed.filter(m => m.previewAnalysisRole === 'bg')
    const failedIcon = failed.filter(m => m.previewAnalysisRole === 'icon')
    const failedImg = failed.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

    if (failed.length > 0) {
      lines.push('## ⚠️ 不可用资源（原图缺失，禁止使用变量引用）')
      lines.push('')
      lines.push('以下资源的**原图下载失败**（可能是 AI 生成图或 Figma 嵌入资源无法导出）：')
      lines.push('')
      lines.push('**关键规则：缺失的资源没有对应变量！不要猜测、不要用其他图片替代该位置！**')
      lines.push('- 缺失图标的位置：直接用 CSS/伪元素/Unicode 绘制简单装饰，或留空（不要从其他位置挪用图标）')
      lines.push('- 如果某个卡片的图标缺失，该卡片可以只显示文字+背景，不强制必须有图标')
      lines.push('')

      failedBg.forEach((m, i) => {
        const semanticLoc = this._extractSemanticLocation(m.figmaPath)
        const locTag = semanticLoc ? ` [${semanticLoc}]` : ''
        lines.push(`- **背景${locTag}**: ${m.fallbackHint}`)
        lines.push(`  CSS替代：background: ${m.cssValue || 'linear-gradient(180deg, #edf4fb, #d6e8f5)'};`)
        lines.push('')
      })

      failedIcon.forEach((m, i) => {
        const semanticLoc = this._extractSemanticLocation(m.figmaPath)
        const locTag = semanticLoc ? ` [${semanticLoc}]` : ''
        // 检查是否是 AI 生成图
        const isAiImage = (m.figmaPath || '').includes('jimeng-')
        const aiTag = isAiImage ? ' (AI生成原图未导出)' : ''
        lines.push(`- **图标${locTag}${aiTag}**: ${m.fallbackHint}`)
        if (m.visualMeta?.fillsSummary && m.visualMeta.fillsSummary !== '#00000000') {
          lines.push(`  颜色参考：${m.visualMeta.fillsSummary}（可用同色系 CSS 图形替代）`)
        }
        lines.push(`  替代方案：用 CSS 伪元素绘制简单形状 / 使用 Unicode 字符 / 直接省略该图标`)
        lines.push('')
      })

      failedImg.forEach((m, i) => {
        const semanticLoc = this._extractSemanticLocation(m.figmaPath)
        const locTag = semanticLoc ? ` [${semanticLoc}]` : ''
        lines.push(`- **图片${locTag}**: ${m.fallbackHint}`)
        lines.push(`  替代方案：用CSS绘制占位区域 + 装饰样式`)
        lines.push('')
      })

      lines.push('**绝对不要引用这些缺失资源的变量（它们不存在），也不要把其他位置的图标挪到缺失位置！**')
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 注入资源import语句（后处理器）
   * 解析代码中使用的资源变量，从resourceDomMapping匹配文件路径，自动生成import
   */
  injectResourceImports(code, resourceDomMapping, resourceRelBase = null) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) {
      return code
    }

    // 🆕 区分可用和不可用资源
    const available = resourceDomMapping.filter(m => m.downloadStatus === 'success')
    if (available.length === 0) {
      return code // 没有可用资源
    }

    // ── 构建变量名 → mapping 的查找表 ──
    // 支持两种变量名模式：
    //   1. 编号模式: bg1, icon2, img3（按类型+序号）
    //   2. 语义模式: bgDecoration, iconArrow（semanticVarName）
    const varToMapping = new Map()

    // 按类型分组
    const bgMappings = available.filter(m => m.previewAnalysisRole === 'bg')
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    const imgMappings = available.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

    // 编号模式注册（bg1 → 第1个bg mapping，icon2 → 第2个icon mapping）
    bgMappings.forEach((m, i) => varToMapping.set(`bg${i + 1}`, m))
    iconMappings.forEach((m, i) => varToMapping.set(`icon${i + 1}`, m))
    imgMappings.forEach((m, i) => varToMapping.set(`img${i + 1}`, m))

    // 语义模式注册（semanticVarName → mapping）
    available.forEach(m => {
      if (m.semanticVarName) {
        varToMapping.set(m.semanticVarName, m)
      }
    })

    // ── 扫描代码中出现的所有已注册变量名 ──
    const usedVars = new Set()
    // 1) 编号模式扫描
    const numberedPattern = /\b(bg|icon|img)(\d+)\b/g
    let numMatch
    while ((numMatch = numberedPattern.exec(code)) !== null) {
      if (varToMapping.has(numMatch[0])) {
        usedVars.add(numMatch[0])
      }
    }

    // 2) 语义模式扫描：逐个检查 varToMapping 的 key 是否出现在代码中
    for (const varName of varToMapping.keys()) {
      // 编号模式已处理，跳过
      if (/^(bg|icon|img)\d+$/.test(varName)) continue
      // 用 word boundary 检查语义名是否在代码中出现
      const semPattern = new RegExp(`\\b${varName}\\b`)
      if (semPattern.test(code)) {
        usedVars.add(varName)
      }
    }

    if (usedVars.size === 0) {
      return code // 没有使用资源变量，直接返回
    }

    // ── 生成 import 语句 ──
    const imports = []
    usedVars.forEach(varName => {
      const mapping = varToMapping.get(varName)
      if (mapping && mapping.resourceFile) {
        // resourceRelBase 非空时按目标结构重组相对路径（Vue3 flatten 后用 './resources/'，微码默认保持 mapping.resourceFile）
        const importPath = resourceRelBase
          ? `${resourceRelBase}${mapping.resourceFile.split('/').pop()}`
          : mapping.resourceFile
        imports.push(`import ${varName} from '${importPath}'`)
      }
    })

    if (imports.length === 0) {
      return code
    }

    // ── 去重预处理：剔除 LLM 可能手写的同名资源 import，避免重复声明 ──
    // 无论 LLM 是否 / 写了几次 import，最终只保留下面这份由 mapping 生成的规范 import 块
    const usedVarNames = [...usedVars]
    let cleanedCode = code
    for (const v of usedVarNames) {
      // 默认导入: import bg1 from '...'
      const defaultRe = new RegExp(`^\\s*import\\s+${v}\\s+from\\s*['"][^'"]*['"]\\s*;?\\s*.*$`, 'gm')
      cleanedCode = cleanedCode.replace(defaultRe, '')
      // 命名导入: import { a, bg1, b } from '...' → 仅剔除 bg1；若整组都是资源变量则整行删除
      const namedRe = new RegExp(`^\\s*import\\s*\\{\\s*([^}]*)\\s*\\}\\s*from\\s*['"][^'"]*['"]\\s*;?\\s*.*$`, 'gm')
      cleanedCode = cleanedCode.replace(namedRe, (full, inner) => {
        const kept = inner.split(',').map((s) => s.trim()).filter((s) => s && s !== v)
        return kept.length === 0 ? '' : full.replace(inner, kept.join(', '))
      })
    }
    // 清理删除 import 行后可能产生的连续空行
    cleanedCode = cleanedCode.replace(/\n{3,}/g, '\n\n')

    // ── 注入到 <script setup> 之后 ──
    const scriptSetupPattern = /<script\s+setup[^>]*>/
    const scriptMatch = cleanedCode.match(scriptSetupPattern)

    if (scriptMatch) {
      const insertPos = scriptMatch.index + scriptMatch[0].length
      const importBlock = '\n' + imports.join('\n') + '\n'
      return cleanedCode.slice(0, insertPos) + importBlock + cleanedCode.slice(insertPos)
    }

    return cleanedCode
  }
}

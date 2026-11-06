/**
 * Adversarial Checker - 对抗性检查师
 * 职责：从批判性视角检查生成的代码，发现潜在问题
 * 输入：生成的代码文件 + 原始设计稿
 * 输出：checkResult, critiques, qualityScore, issueCategories, recommendations
 *
 *  优化 JSON 解析脆弱问题
 *   - 统一 prompt 输出格式（消除双格式冲突）
 *   - 删除 parseCheckResult/_repairJSON，改用 robustJSONParse
 *   - 用 Zod schema 替换 validateCheckResult
 *   - 增加重试 + 兜底机制
 */

import { BaseAgent } from '../agents/base-agent.js'
import { readFileSync } from 'fs'
import { createLogger } from '../logger/index.js'
import { robustJSONParse } from '../utils/json-parser.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'
import { filterAvailableResources } from '../utils/resource-import-guard.js'
import { z } from 'zod'

const logger = createLogger({ name: 'adversarial-checker' })

// ──────────────────────────────────────────
// Zod Schema 定义
// ──────────────────────────────────────────

const CritiqueSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(['accessibility', 'performance', 'security', 'quality', 'standards', 'compliance']),
  issue: z.string(),
  location: z.string().optional().default(''),
  fix: z.string().optional().default('')
})

const IssueCategoriesSchema = z.object({
  compliance: z.array(z.string()).default([]),
  structural: z.array(z.string()).default([]),
  stylistic: z.array(z.string()).default([]),
  layout: z.array(z.string()).default([])
})

const AdversarialCheckResultSchema = z.object({
  checkResult: z.enum(['pass', 'needs_revision']),
  qualityScore: z.number().min(0).max(100),
  critiques: z.array(CritiqueSchema).default([]),
  issueCategories: IssueCategoriesSchema.default({
    compliance: [], structural: [], stylistic: [], layout: []
  }),
  recommendations: z.array(z.string()).default([]),
  summary: z.string().default('')
})

// 安全兜底结果：当所有解析策略失败时使用
const SAFE_FALLBACK_RESULT = {
  checkResult: 'needs_revision',
  qualityScore: 0,
  critiques: [{
    severity: 'high',
    category: 'standards',
    issue: '对抗性检查解析失败，需人工复核',
    location: '',
    fix: '检查 LLM 输出格式配置'
  }],
  issueCategories: {
    compliance: [],
    structural: [],
    stylistic: [],
    layout: []
  },
  recommendations: ['建议人工复核生成的代码'],
  summary: '自动检查失败，需人工介入'
}

export class AdversarialChecker extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'adversarial-checker',
      description: '对抗性代码检查器',
      model: config.model || '',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 8192,
      ...config
    })

    //  参考文档按需加载（不再在构造函数中加载全部）
    // 定义文档路径映射，根据组件复杂度动态选择
    this._referencePaths = {
      constraints: 'references/constraints/ai-generation-constraints.md',
      patterns: 'references/patterns/code-patterns.md',
      declare: 'references/specs/declare-json.md',
      style: 'references/specs/style-guide.md',
      event: 'references/specs/event-interaction-standard.md',
      stageCommon: 'references/rules/stage-common.md',
      stageFigma: 'references/rules/stage-figma-rules.md',
      l4: 'references/rules/adversarial-l4-style-compliance.md'
    }
    
    // 缓存已加载的文档，避免重复读取
    this._standardsCache = new Map()
    this.standards = null  // 延迟加载标记

    logger.info('Adversarial Checker 已初始化 (v3.2 + P0-4 按需加载)')
  }

  /**
   *  根据组件复杂度加载对应的参考文档子集
   * - simple: 只加载核心约束和 L4 样式合规（2个文档，节省 ~70% prompt）
   * - medium: 加载核心约束 + 代码模式 + L4 样式（3个文档，节省 ~40% prompt）
   * - complex: 加载全部 7 个文档（完整检查）
   * 
   * @param {string} complexity - 'simple' | 'medium' | 'complex'
   * @returns {Object} 加载的文档映射 { path: content }
   */
  _loadStandardsByComplexity(complexity) {
    // 如果已经加载过相同复杂度的文档，直接返回缓存
    if (this.standards && this._currentComplexity === complexity) {
      return this.standards
    }

    let pathsToLoad = []
    
    switch (complexity) {
      case 'simple':
        // 简单组件：只检查核心约束和 L4 样式合规
        pathsToLoad = [this._referencePaths.constraints, this._referencePaths.l4]
        logger.info('📦 P0-4: 简单组件加载核心文档 (2/7)')
        break
        
      case 'medium':
        // 中等组件：核心约束 + 代码模式 + L4 样式
        pathsToLoad = [
          this._referencePaths.constraints,
          this._referencePaths.patterns,
          this._referencePaths.l4
        ]
        logger.info('📦 P0-4: 中等组件加载标准文档 (3/7)')
        break
        
      case 'complex':
      default:
        // 复杂组件：加载全部文档
        pathsToLoad = Object.values(this._referencePaths)
        logger.info('📦 P0-4: 复杂组件加载全部文档 (7/7)')
        break
    }

    // 从缓存或文件加载文档
    const standards = {}
    for (const path of pathsToLoad) {
      if (this._standardsCache.has(path)) {
        standards[path] = this._standardsCache.get(path)
      } else {
        const loaded = this.loadReferenceFiles([path])
        standards[path] = loaded[path]
        this._standardsCache.set(path, loaded[path])  // 缓存供下次使用
      }
    }

    this.standards = standards
    this._currentComplexity = complexity
    return standards
  }

  /**
   * 构建检查提示词
   *  统一输出格式定义，消除双格式冲突
   *  根据复杂度动态加载参考文档
   */
  buildCheckPrompt(files, layoutStructure, complexity = 'medium', componentType = 'microcode', sfcFacts = null) {
    //  根据复杂度加载对应的文档子集
    const standards = this._loadStandardsByComplexity(complexity)

    //  Vue3 组件使用专属 prompt
    if (componentType === 'vue3') {
      return this._buildVue3CheckPrompt(files, layoutStructure, standards, sfcFacts)
    }
    
    // 限制每个文件的显示长度，避免提示词过长
    const filesPreview = Object.entries(files).map(([path, content]) => {
      const preview = content.length > 1000
        ? content.substring(0, 1000) + '\n... (truncated)'
        : content
      return `### ${path}\n\`\`\`\n${preview}\n\`\`\``
    }).join('\n\n')

    const prompt = `
你是一个严格的代码审查专家，负责从批判性视角检查生成的微码组件代码。

# 检查任务

请严格审查以下生成的代码，找出所有潜在问题。

${this._buildSfcFactsBlock(sfcFacts, componentType)}
## 生成的代码文件

${filesPreview}

## 原始布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

# 检查维度

## 1. 可访问性 (Accessibility)
- 是否缺少 aria-label
- 图片是否有 alt 文本
- 按钮是否有语义化标签
- 键盘导航是否支持

## 2. 性能 (Performance)
- 是否有大列表未优化
- 是否有不必要的计算
- **图表初始化检查（echarts.init() 强制要求）**：
  - \`$mcComponentBuilder()\` 是否用 try-catch 包裹（否则框架未就绪时模块加载失败，组件完全不可见）
  - 是否使用了 \`watch(chartRef)\` 处理 base-panel DOM 替换（否则 ResizeObserver 绑定到临时/已销毁DOM，图表永不显示）
  - 是否使用了 ResizeObserver 等待容器就绪
  - 是否在 onUnmounted 中调用 dispose() 清理
  - 容器 CSS 是否有明确的 width 和 height
  - 是否导入了不存在的第三方模块导出（如 \`import { set } from '@vueuse/core'\`，会导致构建失败）
- 是否有内存泄漏风险

## 3. 安全性 (Security)
- 是否有 XSS 风险
- 用户输入是否经过验证
- API 调用是否安全

## 4. 代码质量 (Code Quality)
- 是否符合 Vue 3 最佳实践
- 是否有冗余代码
- 命名是否清晰
- 注释是否充分

## 5. 微码规范符合度
- declare.json 是否完整
- 事件交互是否正确
- 样式是否符合规范
- 是否有禁止项违规

## 6. L4 样式合规检查 (v3.0)
- 每个 .vue 文件是否包含 \`<style lang="less" scoped>\`
- .vue 的 style 块是否引入 \`index.less\`
- ⚠️ **排除规则**：\`component.js\` 是系统自动生成的入口文件（非 LLM 产物），其 \`import './resources/styles/index.less'\` 是正确的样式导入方式（index.less → dark.less/light.less → theme-vars.less + common.less）。禁止将 component.js 的样式导入标记为违规。
- common.less 中的 class 是否带组件前缀 (\`.c-{componentId}-\`)
- 是否有禁止的静态内联 \`style\` 属性
- 子组件 .vue 文件是否有 scoped less

# 微码规范

${standards[this._referencePaths.constraints] || ''}

# L4 样式合规标准

${standards[this._referencePaths.l4] || ''}

# 输出格式（唯一，必须严格遵守）

请严格按照以下JSON格式输出检查结果，不要添加任何额外字段，不要添加任何解释文字：

{
  "checkResult": "pass" 或 "needs_revision",
  "qualityScore": 85,
  "critiques": [
    {
      "severity": "high" 或 "medium" 或 "low",
      "category": "accessibility" 或 "performance" 或 "security" 或 "quality" 或 "standards" 或 "compliance",
      "issue": "具体问题描述",
      "location": "package/index.vue:45",
      "fix": "修复建议"
    }
  ],
  "issueCategories": {
    "compliance": ["L4-001"],
    "structural": ["缺少必要的数据属性"],
    "stylistic": ["颜色偏差", "阴影缺失"],
    "layout": ["间距错误", "对齐偏移"]
  },
  "recommendations": [
    "建议1",
    "建议2"
  ],
  "summary": "总体评价"
}

## issueCategories 分类规则
- **compliance**: L1-L5 规则违反、scoped 缺失、less 缺失 → 必须 engineer 重做
- **structural**: 数据结构错误、组件层级错误、prop/emit 缺失 → engineer
- **stylistic**: 颜色值偏差、字体大小偏差、阴影/圆角/边框缺失或错误、渐变不匹配 → style-refiner
- **layout**: flex/grid 布局错误、间距/对齐/padding 错误、overflow 问题 → layout-refiner

如果某个类别没有问题，填空数组。如果检查通过，critiques 和 issueCategories 都填空数组。

## ⚠️ 格式强制要求
- 必须输出合法 JSON，不要在 JSON 外添加任何文字解释
- 不要使用 markdown 代码块包裹（直接输出 JSON 对象，不要写 \`\`\`json）
- 不要在字符串值中使用未转义的换行符（用 \\n 替代）
- 不要在数组/对象末尾添加多余逗号
- 所有数值不加引号，所有字符串必须加双引号
- 不要添加 JSON schema 中未定义的额外字段

# 评分标准

- 90-100: 优秀，代码质量高，无明显问题
- 80-89: 良好，有小问题但不影响使用
- 70-79: 一般，存在需要改进的问题
- 60-69: 较差，存在明显问题，建议修订
- <60: 不合格，必须修订

# 严格模式

请以批判性思维检查，不要放过任何潜在问题。

开始检查：
`

    return prompt
  }

  /**
   *  Vue3 SFC 组件专属检查 prompt
   * 与微码组件完全不同的检查维度：
   * - 禁止微码专有标签/API（<base-panel>、$mcComponentBuilder、panelKey 等）
   * - 要求标准 Vue3 SFC 结构（<template> + <script setup> + <style scoped>）
   * - 面板头部应渲染为真实 DOM 元素，而非放入插槽
   * - 图表检查针对标准 Vue3 生命周期（onMounted/onUnmounted）
   */
  _buildVue3CheckPrompt(files, layoutStructure, standards, sfcFacts = null) {
    const filesPreview = Object.entries(files).map(([path, content]) => {
      const preview = content.length > 1000
        ? content.substring(0, 1000) + '\n... (truncated)'
        : content
      return `### ${path}\n\`\`\`\n${preview}\n\`\`\``
    }).join('\n\n')

    const l4Standard = standards[this._referencePaths.l4] || ''

    const prompt = `
你是一个严格的代码审查专家，负责从批判性视角检查生成的 Vue3 SFC 组件代码。

⚠️ 重要：这是一个标准 Vue3 单文件组件（SFC），不是微码组件。严禁使用任何微码专有标签和 API。

# 检查任务

请严格审查以下生成的 Vue3 组件代码，找出所有潜在问题。

${this._buildSfcFactsBlock(sfcFacts, 'vue3')}
## 生成的代码文件

${filesPreview}

## 原始布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

# 检查维度

## 1. Vue3 SFC 结构合规性（最高优先级）
- 必须包含标准 \`<template>\` 根元素
- 必须包含 \`<script setup>\` 或 \`<script>\` 块
- 必须包含 \`<style scoped>\` 或 \`<style lang="less" scoped>\` 块
- 组件必须是独立可用的单文件组件

## 2. 微码污染检查（严重违规，发现即 needs_revision）
- ❌ 禁止使用 \`<base-panel>\` 标签（微码专有）
- ❌ 禁止使用 \`$mcComponentBuilder()\` API（微码专有）
- ❌ 禁止使用 \`panelKey\`、\`declare.json\`、\`component.js\` 等微码概念
- ❌ 禁止使用 \`#header-right\`、\`#header-left\` 等微码插槽名称
- 如果发现以上任何内容，必须在 critiques 中标记为 severity: "high"，category: "compliance"

## 3. 面板头部区域处理
- 面板头部（header）应该在 \`<template>\` 中渲染为真实 DOM 元素
- 头部右侧控件（按钮、标签、图标等）应直接写在模板中，而非放入插槽
- 头部应使用标准 HTML 元素 + CSS 实现样式

## 4. 可访问性 (Accessibility)
- 是否缺少 aria-label
- 图片是否有 alt 文本
- 按钮是否有语义化标签
- 键盘导航是否支持

## 5. 性能 (Performance)
- 是否有大列表未优化
- 是否有不必要的计算
- **图表初始化检查**：
  - 是否使用 \`ref()\` 获取 DOM 引用
  - 是否在 \`onMounted\` 中初始化图表（echarts.init）
  - 是否在 \`onUnmounted\` 中调用 dispose() 清理
  - 是否使用了 ResizeObserver 等待容器就绪
  - 容器 CSS 是否有明确的 width 和 height
- 是否有内存泄漏风险

## 6. 代码质量 (Code Quality)
- 是否符合 Vue 3 Composition API 最佳实践
- 是否有冗余代码
- 命名是否清晰
- 注释是否充分
- 响应式数据是否正确使用 ref/reactive/computed

## 7. 样式合规
- 每个 .vue 文件是否包含 \`<style scoped>\`
- 是否有禁止的静态内联 \`style\` 属性
- CSS 类名是否使用语义化命名
- 是否正确使用 Flexbox/Grid 布局

${l4Standard ? `# L4 样式合规标准\n\n${l4Standard}` : ''}

# 输出格式（唯一，必须严格遵守）

请严格按照以下JSON格式输出检查结果，不要添加任何额外字段，不要添加任何解释文字：

{
  "checkResult": "pass" 或 "needs_revision",
  "qualityScore": 85,
  "critiques": [
    {
      "severity": "high" 或 "medium" 或 "low",
      "category": "accessibility" 或 "performance" 或 "security" 或 "quality" 或 "standards" 或 "compliance",
      "issue": "具体问题描述",
      "location": "Component.vue:45",
      "fix": "修复建议"
    }
  ],
  "issueCategories": {
    "compliance": [],
    "structural": [],
    "stylistic": [],
    "layout": []
  },
  "recommendations": [],
  "summary": "总体评价"
}

## issueCategories 分类规则
- **compliance**: 微码污染、SFC 结构缺失、scoped 缺失 → 必须 engineer 重做
- **structural**: 数据结构错误、组件层级错误、prop/emit 缺失 → engineer
- **stylistic**: 颜色值偏差、字体大小偏差、阴影/圆角/边框缺失或错误 → style-refiner
- **layout**: flex/grid 布局错误、间距/对齐/padding 错误、overflow 问题 → layout-refiner

如果某个类别没有问题，填空数组。如果检查通过，critiques 和 issueCategories 都填空数组。

## ⚠️ 格式强制要求
- 必须输出合法 JSON，不要在 JSON 外添加任何文字解释
- 不要使用 markdown 代码块包裹（直接输出 JSON 对象，不要写 \`\`\`json）
- 不要在字符串值中使用未转义的换行符（用 \\n 替代）
- 不要在数组/对象末尾添加多余逗号
- 所有数值不加引号，所有字符串必须加双引号
- 不要添加 JSON schema 中未定义的额外字段

# 评分标准

- 90-100: 优秀，代码质量高，无明显问题
- 80-89: 良好，有小问题但不影响使用
- 70-79: 一般，存在需要改进的问题
- 60-69: 较差，存在明显问题，建议修订
- <60: 不合格，必须修订

# 严格模式

请以批判性思维检查，不要放过任何潜在问题。

开始检查：
`

    return prompt
  }

  /**
   *  构建简化版提示词（重试用）
   * 去掉参考文档和详细说明，只保留核心检查要求
   *  支持 componentType 分支
   */
  buildSimplifiedCheckPrompt(files, layoutStructure, componentType = 'microcode', sfcFacts = null) {
    const filesPreview = Object.entries(files).map(([path, content]) => {
      const preview = content.length > 500
        ? content.substring(0, 500) + '\n... (truncated)'
        : content
      return `### ${path}\n\`\`\`\n${preview}\n\`\`\``
    }).join('\n\n')

    //  Vue3 简化版 prompt
    const componentLabel = componentType === 'vue3' ? 'Vue3 SFC 组件' : '微码组件'
    const extraRule = componentType === 'vue3'
      ? '⚠️ 这是标准 Vue3 组件，禁止使用任何微码专有标签/API（<base-panel>、$mcComponentBuilder、panelKey、declare.json 等）。'
      : ''

    const prompt = `
请检查以下${componentLabel}代码的质量问题，输出严格的JSON格式（不要包裹在markdown代码块中）。
${extraRule ? `\n${extraRule}\n` : ''}
${this._buildSfcFactsBlock(sfcFacts, componentType)}
## 代码文件

${filesPreview}

## 输出格式

直接输出以下JSON对象（不要添加任何额外文字）：

{
  "checkResult": "pass" 或 "needs_revision",
  "qualityScore": 0-100的整数,
  "critiques": [ { "severity": "high/medium/low", "category": "standards", "issue": "问题描述", "location": "文件路径", "fix": "修复建议" } ],
  "issueCategories": { "compliance": [], "structural": [], "stylistic": [], "layout": [] },
  "recommendations": [],
  "summary": "评价"
}

开始检查：
`

    return prompt
  }

  /**
   *  构建紧凑版提示词（简单组件用，省 ~60% tokens）
   * 仅保留微码规范+L4样式合规核心维度 + 输出格式，跳过通用维度
   *  使用按需加载的文档子集
   *  支持 componentType 分支
   */
  buildCompactCheckPrompt(files, layoutStructure, componentType = 'microcode', sfcFacts = null) {
    // 4: 确保简单组件的文档已加载（应该在 check() 中已加载）
    const standards = this.standards || this._loadStandardsByComplexity('simple')
    
    const filesPreview = Object.entries(files).map(([path, content]) => {
      const preview = content.length > 800
        ? content.substring(0, 800) + '\n... (truncated)'
        : content
      return `### ${path}\n\`\`\`\n${preview}\n\`\`\``
    }).join('\n\n')

    const l4Standard = standards[this._referencePaths.l4] || ''

    //  Vue3 紧凑版 prompt
    if (componentType === 'vue3') {
      const prompt = `
你是代码审查专家，检查以下 Vue3 SFC 组件的规范符合度和样式合规。

⚠️ 这是标准 Vue3 组件，禁止使用任何微码专有标签/API（<base-panel>、$mcComponentBuilder、panelKey、declare.json 等）。

${this._buildSfcFactsBlock(sfcFacts, componentType)}
## 代码文件
${filesPreview}

## 布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

## 检查维度（精简）

### 1. Vue3 SFC 结构合规
- 是否包含 <template> + <script setup> + <style scoped>
- 是否混入微码专有内容（<base-panel> / $mcComponentBuilder / panelKey 等）

### 2. L4 样式合规检查
- .vue 文件是否有 \`<style scoped>\`（lang="less" 可选）
- 是否有禁止的静态内联 style
- CSS 类名是否语义化
${l4Standard ? l4Standard.substring(0, 400) : ''}

## 输出格式（仅 JSON，无 markdown 包裹）
{
  "checkResult": "pass"|"needs_revision",
  "qualityScore": 0-100,
  "critiques": [{ "severity": "high/medium/low", "category": "standards", "issue": "描述", "location": "文件:行", "fix": "建议" }],
  "issueCategories": { "compliance": [], "structural": [], "stylistic": [], "layout": [] },
  "recommendations": [],
  "summary": "评价"
}
评分: 90-100优秀, 80-89良好, 70-79一般, <70不合格。
开始检查：
`

      return prompt
    }

    // ─── 微码组件紧凑版 prompt（原有逻辑） ───
    const prompt = `
你是代码审查专家，检查以下微码组件的规范符合度和样式合规。

${this._buildSfcFactsBlock(sfcFacts, componentType)}
## 代码文件
${filesPreview}

## 布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

## 检查维度（精简）

### 1. 微码规范符合度
- declare.json 是否完整、事件交互是否正确、是否有禁止项违规

### 2. L4 样式合规检查
- 主组件 package/index.vue 必须有 \`<style lang="less" scoped>\` 并引入 index.less
- 子组件 package/components/*.vue 的 style 可选：允许不写（样式由主组件统一引入）；若写必须 \`<style lang="less" scoped>\` 并 \`@import '../../resources/styles/index.less'\`，禁止裸 \`<style>\`（无 scoped）
- common.less class 是否带组件前缀、是否有禁止的静态内联 style
- ⚠️ component.js 是系统生成文件，其 import './resources/styles/index.less' 是正确的，禁止标记为违规
${l4Standard ? l4Standard.substring(0, 400) : ''}

## 输出格式（仅 JSON，无 markdown 包裹）
{
  "checkResult": "pass"|"needs_revision",
  "qualityScore": 0-100,
  "critiques": [{ "severity": "high/medium/low", "category": "standards", "issue": "描述", "location": "文件:行", "fix": "建议" }],
  "issueCategories": { "compliance": [], "structural": [], "stylistic": [], "layout": [] },
  "recommendations": [],
  "summary": "评价"
}
评分: 90-100优秀, 80-89良好, 70-79一般, <70不合格。
开始检查：
`

    return prompt
  }

  /**
   *  评估组件复杂度
   * 返回 'simple' | 'medium' | 'complex'
   */
  _assessComplexity(files, layoutStructure) {
    const fileCount = Object.keys(files).length
    const totalSize = Object.values(files).reduce((sum, c) => sum + (c?.length || 0), 0)
    const hasCharts = Object.values(files).some(content =>
      content?.includes('echarts') || content?.includes('ECharts') || content?.includes('chartRef')
    )
    const sectionCount = layoutStructure?.sections?.length || layoutStructure?.layoutStructure?.sections?.length || 0

    // simple: ≤2文件, <2500字符, 无图表, ≤2布局段
    if (fileCount <= 2 && totalSize < 2500 && !hasCharts && sectionCount <= 2) {
      return 'simple'
    }
    // complex: 满足≥2项复杂特征
    let comp = 0
    if (fileCount >= 4) comp++
    if (totalSize >= 5000) comp++
    if (hasCharts) comp++
    if (sectionCount >= 4) comp++
    if (comp >= 2) return 'complex'

    return 'medium'
  }

  /**
   *#354b: 对抗性检查文件采样 — 非首次生成时截断未变更文件
   * 
   * 策略：
   * - 变更文件：保留完整内容（用于 LLM 详细检查）
   * - 未变更文件：截断到首部 200 字符 + 标记（保留跨文件引用能力）
   * - 预计节省 tokens：30-50%（取决于变更比例）
   * 
   * @param {Object} files - 当前所有文件 { path: content }
   * @param {Set<string>} changedFileNames - 变更的文件名集合
   * @returns {Object} 采样后的文件对象
   */
  _sampleFilesForRevision(files, changedFileNames) {
    const sampled = {}
    const SAMPLE_LIMIT = 200 // 未变更文件保留前 200 字符

    for (const [filePath, content] of Object.entries(files)) {
      const fileName = filePath.split('/').pop()
      if (changedFileNames.has(fileName)) {
        // 变更文件：完整内容
        sampled[filePath] = content
      } else {
        // 未变更文件：截断 + 标记
        const truncated = content.length > SAMPLE_LIMIT
          ? content.substring(0, SAMPLE_LIMIT) + '\n... [truncated: unchanged from previous iteration, ' +
            (content.length - SAMPLE_LIMIT) + ' chars skipped]'
          : content
        sampled[filePath] = truncated
      }
    }

    const totalSize = Object.values(files).reduce((s, c) => s + c.length, 0)
    const sampledSize = Object.values(sampled).reduce((s, c) => s + c.length, 0)
    logger.info(`📊 文件采样完成: ${totalSize} → ${sampledSize} chars (${Math.round((1 - sampledSize / totalSize) * 100)}% 节省)`)

    return sampled
  }

  /**
   *  确定性 SFC 事实分析（不依赖 LLM）
   * 解析每个 .vue 文件的客观结构事实，供事实护栏与结构检查使用，
   * 避免 LLM 对 script setup / scoped style / echarts / 生命周期清理等
   * 可机器验证的客观事实产生误判或漏判。
   * @param {Object} files - { path: content }
   * @returns {Array<Object>} 每个 vue 文件的结构事实
   */
  _analyzeSfcFacts(files) {
    const facts = []
    for (const [filePath, content] of Object.entries(files || {})) {
      if (!filePath.endsWith('.vue') || typeof content !== 'string') continue
      const hasScriptSetup = /<script\b[^>]*\bsetup\b[^>]*>/.test(content) || /<script\b[^>]*\blang=/.test(content)
      const hasScopedStyle = /<style\b[^>]*\bscoped\b[^>]*>/.test(content)
      const hasEcharts = /\becharts\b/i.test(content)
      const hasOnMounted = /\bonMounted\b/.test(content)
      const hasOnUnmounted = /\bonUnmounted\b/.test(content) || /\bonBeforeUnmount\b/.test(content)
      const hasTabLinkage = /(active|current)Tab/i.test(content) || /tabChange/i.test(content) || /handleTab/i.test(content) || /v-model[^>]*\b[tT]ab\b/i.test(content)
      facts.push({ file: filePath, hasScriptSetup, hasScopedStyle, hasEcharts, hasOnMounted, hasOnUnmounted, hasTabLinkage })
    }
    return facts
  }

  /**
   *  对文件内容做确定性 FNV-1a 哈希，用于 SFC 事实缓存失效判断。
   * 仅当所有文件内容均未变化时，缓存的 sfcFacts 才可复用（内容变化即失效）。
   */
  _hashFiles(files) {
    let h = 2166136261 >>> 0 // FNV-1a 偏移基
    const paths = Object.keys(files || {}).sort()
    for (const p of paths) {
      const c = files[p]
      if (typeof c !== 'string') continue
      for (let i = 0; i < p.length; i++) h = ((h ^ p.charCodeAt(i)) * 16777619) >>> 0
      const lenStr = String(c.length)
      for (let i = 0; i < lenStr.length; i++) h = ((h ^ lenStr.charCodeAt(i)) * 16777619) >>> 0
      // 内容采样（步长自适应，约 256 次采样，保持廉价）
      const step = Math.max(1, Math.floor(c.length / 256))
      for (let i = 0; i < c.length; i += step) h = ((h ^ c.charCodeAt(i)) * 16777619) >>> 0
    }
    return h >>> 0
  }

  /**
   *  将已通过静态分析确认存在的客观结构事实格式化为提示词片段，
   * 从源头告知 LLM「这些结构确实存在，请勿误报为缺失/未实现」，减少主观误判。
   * 仅列出 confirmed=true（确实存在）的事实；缺失类问题仍交给 LLM 正常报告。
   */
  _buildSfcFactsBlock(sfcFacts, componentType = 'microcode') {
    if (!Array.isArray(sfcFacts) || sfcFacts.length === 0) return ''
    const present = sfcFacts.filter((f) => f && Object.keys(f).some((k) => k.startsWith('has') && f[k] === true))
    if (present.length === 0) return ''

    const lines = present.map((f) => {
      const facts = []
      if (f.hasScriptSetup) facts.push('<script setup>')
      if (f.hasScopedStyle) facts.push('<style scoped>')
      if (f.hasEcharts) facts.push('ECharts 图表初始化 (echarts.init)')
      if (f.hasOnMounted) facts.push('onMounted 生命周期（图表初始化）')
      if (f.hasOnUnmounted) facts.push('onUnmounted 生命周期（dispose 清理）')
      if (f.hasTabLinkage) facts.push('Tab 数据联动')
      const where = f.file ? `${f.file} 中` : ''
      return `- ✅ 已确认${where}包含：${facts.join('、') || '上述结构事实'}`
    })

    return `
# 🔬 已验证的客观代码结构事实（静态分析确认，请勿误报为缺失）

以下事实已通过代码静态分析**确认确实存在**，请不要在 critiques 中将其作为「缺失 / 未实现 / 未初始化」进行报告：

${lines.join('\n')}

> 若某文件确实没有上述结构（与上方确认事实不一致），仍可按实际情况正常报告。
`
  }

  /**
   *  基于事实的结构检查（仅“确实缺失”才报，不靠 LLM 主观判断）
   * 补充 LLM 可能漏报的真实结构缺失：index.vue 必须有 <script setup> 与 <style scoped>。
   * @param {Array<Object>} sfcFacts - _analyzeSfcFacts 输出
   * @param {string} componentType - 'microcode' | 'vue3'
   * @returns {Array<Object>} critique 列表
   */
  _checkSfcStructureFacts(sfcFacts, componentType) {
    const critiques = []
    const targets = sfcFacts.filter((f) => f.file.endsWith('index.vue') || sfcFacts.length === 1)
    for (const f of targets) {
      if (!f.hasScriptSetup) {
        critiques.push({
          severity: 'high',
          category: 'structural',
          issue: `[结构事实] ${f.file} 缺少 <script setup> 块`,
          location: f.file,
          fix: '补充 <script setup lang="ts"> 块'
        })
      }
      if (!f.hasScopedStyle) {
        critiques.push({
          severity: 'high',
          category: 'structural',
          issue: `[结构事实] ${f.file} 缺少 <style scoped> 块`,
          location: f.file,
          fix: '补充 <style lang="less" scoped> 块'
        })
      }
    }
    return critiques
  }

  /**
   *  SFC 事实护栏
   * 1) 对 LLM 返回的 critiques 做客观事实校验：若断言“缺失某客观结构”而静态分析
   *    确认其存在，则标记 autoResolved 并降级为非阻断级别。
   * 2) 清理 issueCategories 中与客观事实冲突的“缺失类”误报字符串，
   *    避免误判触发无意义全量修订。
   * @param {Object} checkResult - 校验后的结果（原地修改）
   * @param {Array<Object>} sfcFacts - _analyzeSfcFacts 输出
   */
  _applySfcFactGuardrail(checkResult, sfcFacts) {
    if (!checkResult || !Array.isArray(sfcFacts) || sfcFacts.length === 0) return
    const anyHas = (key) => sfcFacts.some((f) => f[key] === true)
    // 归一化：小写 + 去空格/下划线/连字符，兼容 LLM 输出的 script_setup / script-setup / script setup 等变体
    const norm = (s) => String(s).toLowerCase().replace(/[\s_\-]/g, '')

    const conflictPatterns = [
      { keys: ['hasScriptSetup'], words: ['script setup', '<script', '脚本块', 'script块'] },
      { keys: ['hasScopedStyle'], words: ['scoped', '<style', '样式块', 'style块'] },
      { keys: ['hasEcharts'], words: ['echart'] },
      { keys: ['hasOnMounted'], words: ['onmounted', '初始化图表', '未初始化'] },
      { keys: ['hasOnUnmounted'], words: ['onunmounted', 'dispose', '清理', '卸载', '销毁', '释放'] },
      { keys: ['hasTabLinkage'], words: ['tab 联动', 'tab联动', '数据联动', 'tab切换', 'tab 切换'] }
    ]

    let downgraded = 0
    for (const critique of checkResult.critiques || []) {
      const issue = norm(critique.issue || '')
      for (const pattern of conflictPatterns) {
        if (!pattern.keys.some((k) => anyHas(k))) continue
        if (pattern.words.some((w) => issue.includes(norm(w)))) {
          critique.autoResolved = true
          critique.autoResolvedReason = 'static-sfc-fact-conflict'
          if (critique.severity === 'high') {
            critique.severity = 'low'
            downgraded++
          }
          break
        }
      }
    }

    // 清理 issueCategories 中与客观事实冲突的“缺失类”误报
    const missingWords = ['缺失', '缺少', '未', '没有', 'missing', 'lack', 'notfound', 'absent', '不存在']
    const factKeywords = {
      hasScriptSetup: ['script setup', '<script', '脚本'],
      hasScopedStyle: ['scoped', '<style', '样式块'],
      hasEcharts: ['echart'],
      hasOnMounted: ['onmounted', '初始化'],
      hasOnUnmounted: ['onunmounted', 'dispose', '清理', '卸载', '销毁'],
      hasTabLinkage: ['tab 联动', 'tab联动', '数据联动', 'tab切换', 'tab 切换']
    }
    if (checkResult.issueCategories) {
      for (const cat of Object.keys(checkResult.issueCategories)) {
        const arr = checkResult.issueCategories[cat]
        if (!Array.isArray(arr)) continue
        checkResult.issueCategories[cat] = arr.filter((entry) => {
          const e = norm(entry)
          if (!missingWords.some((w) => e.includes(norm(w)))) return true
          for (const [key, kws] of Object.entries(factKeywords)) {
            if (anyHas(key) && kws.some((k) => e.includes(norm(k)))) return false
          }
          return true
        })
      }
    }

    const catWasCleaned = checkResult.issueCategories &&
      Object.values(checkResult.issueCategories).some((a) => Array.isArray(a) && a.length === 0)
    if (downgraded > 0 || catWasCleaned) {
      const remainingHigh = (checkResult.critiques || []).filter((c) => c.severity === 'high' && !c.autoResolved)
      const catHasReal = checkResult.issueCategories && Object.values(checkResult.issueCategories).some((a) => Array.isArray(a) && a.length > 0)
      if (checkResult.checkResult === 'needs_revision' && remainingHigh.length === 0 && !catHasReal) {
        checkResult.checkResult = 'pass'
        logger.info('🛡️ SFC 事实护栏: 误判移除后无真实阻断项，检查结果置为 pass', { downgraded })
      } else {
        logger.info('🛡️ SFC 事实护栏: 已降级/清理与客观事实冲突的误判', { downgraded })
      }
    }
  }

  /**
   *  检查生成的代码（增加重试机制）
   *  增加 componentType 参数，传递给各 prompt builder
   */
  async check(files, layoutStructure, retryCount = 0, componentType = 'microcode', sfcFacts = null, options = {}) {
    logger.info('开始对抗性检查', { fileCount: Object.keys(files).length, retryCount, componentType })

    try {
      //  按真实文件特征评估复杂度
      // 修订/重试轮不再一刀切抬到 medium，避免简单组件在第二轮被放大检查成本。
      const complexity = this._assessComplexity(files, layoutStructure)
      
      //  根据复杂度预加载对应的参考文档子集
      if (retryCount === 0) {
        this._loadStandardsByComplexity(complexity)
      }
      
      let prompt
      if (retryCount > 0) {
        prompt = this.buildSimplifiedCheckPrompt(files, layoutStructure, componentType, sfcFacts)
      } else if (complexity === 'simple') {
        prompt = this.buildCompactCheckPrompt(files, layoutStructure, componentType, sfcFacts)
        logger.info('📦 简单组件使用 compact prompt', { fileCount: Object.keys(files).length, componentType })
      } else {
        prompt = this.buildCheckPrompt(files, layoutStructure, complexity, componentType, sfcFacts)
      }

      // 2. 调用 LLM
      const response = await invokeWithTimeout(this.llm, prompt, 300000, 'adversarial-checker', options.onProgress || this.onProgress || null, {
        signal: options.signal,
        onProgress: options.onProgress || this.onProgress || null,
        requestConcurrency: options.requestConcurrency,
        requestQueueTimeoutMs: options.requestQueueTimeoutMs,
        requestTimeoutMs: options.requestTimeoutMs,
        requestMaxRetries: options.requestMaxRetries,
        model: this.model,
        provider: 'text-role',
      })

      // 3. 鲁棒解析
      const parsed = robustJSONParse(response.content, {
        fallback: SAFE_FALLBACK_RESULT,  //解析失败时使用安全兜底结果
        enablePartialExtract: true,
        criticalFields: ['checkResult', 'qualityScore'],
        _context: `adversarial-checker${retryCount > 0 ? '-retry' : ''}`
      })

      // 4. Zod 验证 + 默认值填充
      const validated = this.validateCheckResult(parsed)

      // 附加复杂度评估结果，供 revision-decision 路由使用
      validated.complexity = complexity

      logger.info('✅ 对抗性检查完成', {
        result: validated.checkResult,
        score: validated.qualityScore,
        complexity,
        critiqueCount: validated.critiques?.length || 0,
        retryUsed: retryCount > 0
      })

      // 详细记录每个 critique
      if (validated.critiques && validated.critiques.length > 0) {
        logger.info('📋 检测到的问题详情', {
          total: validated.critiques.length,
          bySeverity: {
            high: validated.critiques.filter(c => c.severity === 'high').length,
            medium: validated.critiques.filter(c => c.severity === 'medium').length,
            low: validated.critiques.filter(c => c.severity === 'low').length
          }
        })

        validated.critiques.forEach((critique, index) => {
          logger.info(`  问题 #${index + 1}: ${critique.issue}`, {
            severity: critique.severity,
            category: critique.category,
            location: critique.location || 'N/A',
            fix: critique.fix ? critique.fix.substring(0, 100) : 'N/A'
          })
        })
      }

      return validated

    } catch (error) {
      //  重试机制 — 解析失败时用简化 prompt 重试一次
      if (retryCount < 1) {
        logger.warn('首次检查解析失败，简化 prompt 重试', { error: error.message, componentType })
        return await this.check(files, layoutStructure, retryCount + 1, componentType, sfcFacts, options)
      }

      // 重试也失败了，返回安全兜底结果
      logger.error('对抗性检查重试仍失败，返回安全兜底结果', { error: error.message })
      return SAFE_FALLBACK_RESULT
    }
  }

  /**
   *  Zod 验证检查结果
   * 严格模式验证 → 失败则宽松模式（缺失字段用默认值填充）
   */
  validateCheckResult(result) {
    // 严格模式：完整 Zod 验证
    const strictResult = AdversarialCheckResultSchema.safeParse(result)
    if (strictResult.success) {
      logger.debug('Zod 严格验证通过')
      return strictResult.data
    }

    // 严格验证失败，记录原因，尝试宽松模式
    logger.warn('Zod 严格验证失败，尝试宽松模式', {
      errors: strictResult.error.flatten().fieldErrors
    })

    // 宽松模式：手动构造最小可用结果，缺失字段用默认值填充
    const looseResult = {
      checkResult: result.checkResult === 'pass' || result.checkResult === 'needs_revision'
        ? result.checkResult
        : 'needs_revision',  // 无效值默认 needs_revision
      qualityScore: typeof result.qualityScore === 'number' && result.qualityScore >= 0 && result.qualityScore <= 100
        ? result.qualityScore
        : 0,  // 无效值默认 0
      critiques: Array.isArray(result.critiques)
        ? result.critiques.map(c => ({
            severity: ['high', 'medium', 'low'].includes(c.severity) ? c.severity : 'medium',
            category: ['accessibility', 'performance', 'security', 'quality', 'standards', 'compliance'].includes(c.category) ? c.category : 'standards',
            issue: c.issue || '未描述的问题',
            location: c.location || '',
            fix: c.fix || ''
          }))
        : [],
      issueCategories: {
        compliance: Array.isArray(result.issueCategories?.compliance) ? result.issueCategories.compliance : [],
        structural: Array.isArray(result.issueCategories?.structural) ? result.issueCategories.structural : [],
        stylistic: Array.isArray(result.issueCategories?.stylistic) ? result.issueCategories.stylistic : [],
        layout: Array.isArray(result.issueCategories?.layout) ? result.issueCategories.layout : []
      },
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      summary: typeof result.summary === 'string' ? result.summary : ''
    }

    // 第二次验证宽松结果
    const looseParsed = AdversarialCheckResultSchema.safeParse(looseResult)
    if (looseParsed.success) {
      logger.info('✅ Zod 宽松验证通过')
      return looseParsed.data
    }

    // 宽松模式也失败了（理论上不应该），返回兜底
    logger.error('Zod 宽松验证也失败，返回兜底结果', {
      errors: looseParsed.error.flatten().fieldErrors
    })
    return SAFE_FALLBACK_RESULT
  }

  /**
   * 读取生成的文件
   */
  readGeneratedFiles(filePaths, outputPath) {
    const files = {}

    for (const filePath of filePaths) {
      try {
        const fullPath = `${outputPath}/${filePath}`
        const content = readFileSync(fullPath, 'utf-8')
        files[filePath] = content
      } catch (error) {
        logger.warn('无法读取文件', { path: filePath, error: error.message })
      }
    }

    return files
  }

  /**
   * 执行完整的检查流程
   *  支持 _reviseTarget 越权检测
   *  根据 componentType 分支执行不同的程序化检查
   */
  async execute(params) {
    const {
      generatedFiles,
      outputPath,
      layoutStructure,
      _reviseTarget = 'full',
      originalFiles = null,
      resourceDomMapping = null,
      headerSlots = null,
      elementStyleMap = null,
      changedFileNames = null,
      componentType = 'microcode',
      cachedSfcFacts = null,
      cachedSfcFactsHash = null,
      onProgress = null,
      signal = null,
      requestConcurrency,
      requestTimeoutMs,
      requestMaxRetries,
      l0bPassed = false,
    } = params

    logger.info('开始执行对抗性检查', { _reviseTarget, hasChangedFileNames: !!changedFileNames, componentType })

    try {
      // 1. 读取生成的文件
      let files = this.readGeneratedFiles(generatedFiles, outputPath)

      //  基于完整文件做 SFC 客观事实分析（采样会截断未变更文件，必须在采样前）
      //  revision 轮文件未变更时复用缓存，避免每轮重算（内容哈希保证变更即失效）
      const sfcFileHash = this._hashFiles(files)
      let sfcFacts
      if (cachedSfcFacts && cachedSfcFactsHash === sfcFileHash) {
        sfcFacts = cachedSfcFacts
        logger.info('🗃️ P2 #8: SFC 事实命中缓存，跳过重算')
      } else {
        sfcFacts = this._analyzeSfcFacts(files)
      }

      // 对抗性检查采样 — 非首次生成时只将变更文件完整发给 LLM
      if (changedFileNames && changedFileNames.size > 0) {
        files = this._sampleFilesForRevision(files, changedFileNames)
        logger.info('📊 #354b 文件采样', {
          total: Object.keys(files).length,
          changed: changedFileNames.size,
          unchanged: Object.keys(files).length - changedFileNames.size
        })
      }

      // 2. 执行检查（注入已验证的 SFC 客观事实，从源头减少 LLM 对结构项的误判）
      // ③ L0-B PASS 时跳过 LLM 语义检查，只跑下方确定性本地检查（省 90-110s/轮）
      let checkResult
      if (l0bPassed) {
        logger.info('⚡ L0-B PASS：跳过 adversarial LLM 语义检查，仅跑确定性本地检查')
        checkResult = { checkResult: 'pass', critiques: [], issueCategories: {} }
      } else {
        checkResult = await this.check(files, layoutStructure, 0, componentType, sfcFacts, {
          onProgress,
          signal,
          requestConcurrency,
          requestTimeoutMs,
          requestMaxRetries,
        })
      }

      //  基于事实补充“确实缺失”的结构 critique（LLM 漏报兜底）
      const sfcCritiques = this._checkSfcStructureFacts(sfcFacts, componentType)
      if (sfcCritiques.length > 0) {
        checkResult.critiques = [...(checkResult.critiques || []), ...sfcCritiques]
        if (sfcCritiques.some((c) => c.severity === 'high')) {
          checkResult.checkResult = 'needs_revision'
          checkResult.issueCategories = checkResult.issueCategories || {}
          checkResult.issueCategories.structural = checkResult.issueCategories.structural || []
          checkResult.issueCategories.structural.push('SFC_STRUCTURE_FACT')
        }
      }

      //  SFC 事实护栏（降级与客观事实冲突的 LLM 误判，并清理 issueCategories 误报）
      this._applySfcFactGuardrail(checkResult, sfcFacts)

      //  越权修改检测
      let authorizationViolation = null
      if (_reviseTarget && _reviseTarget !== 'full' && originalFiles) {
        authorizationViolation = this.detectUnauthorizedChanges(files, originalFiles, _reviseTarget)
        if (authorizationViolation.violation) {
          logger.warn(`🚨 越权修改检测: ${authorizationViolation.message}`, {
            _reviseTarget,
            violationDetails: authorizationViolation.details
          })
          // 将越权问题加入 critiques
          checkResult.critiques = checkResult.critiques || []
          checkResult.critiques.push({
            severity: 'high',
            category: 'compliance',
            issue: `[越权修改] ${authorizationViolation.message}`,
            location: authorizationViolation.details?.join(', ') || 'unknown',
            fix: `当前模式为 ${_reviseTarget}，请勿修改超出范围的代码`
          })
          // 强制标记为 needs_revision
          checkResult.checkResult = 'needs_revision'
          // 记录到 issueCategories 用于路由
          checkResult.issueCategories = checkResult.issueCategories || {}
          checkResult.issueCategories.compliance = checkResult.issueCategories.compliance || []
          checkResult.issueCategories.compliance.push('VIOLATION-' + _reviseTarget)
        }
      }

      //资源利用率检查（程序化，不靠 LLM）
      if (resourceDomMapping && resourceDomMapping.length > 0) {
        const resourceCritiques = this._checkResourceUtilization(files, resourceDomMapping)
        if (resourceCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...resourceCritiques]
          //  仅 high severity 资源缺陷（bg 未使用）强制 needs_revision
          // medium 级别的 icon 建议不阻断流程（避免 LLM 强行塞入破坏布局）
          const highResourceCritiques = resourceCritiques.filter(c => c.severity === 'high')
          if (highResourceCritiques.length > 0) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.compliance = checkResult.issueCategories.compliance || []
            checkResult.issueCategories.compliance.push('RESOURCE_UTILIZATION')
            logger.warn('🚨 资源利用率检查: 有可用 bg 资源未被引用，强制 needs_revision', {
              unusedCount: highResourceCritiques.length
            })
          } else {
            logger.info('💡 资源利用率检查: icon 建议未使用（非阻断）', {
              suggestionCount: resourceCritiques.length
            })
          }
        }
      }

      //base-panel 插槽使用检查（仅微码组件）
      if (componentType === 'microcode' && headerSlots && headerSlots.length > 0) {
        const slotCritiques = this._checkSlotUsage(files, headerSlots)
        if (slotCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...slotCritiques]
          // 有插槽使用违规 → needs_revision
          if (slotCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.compliance = checkResult.issueCategories.compliance || []
            checkResult.issueCategories.compliance.push('SLOT_USAGE')
            logger.warn('🚨 插槽使用检查: base-panel 插槽未正确使用，强制 needs_revision', {
              violationCount: slotCritiques.filter(c => c.severity === 'high').length
            })
          }
        }
      }

      //  混合布局检查（stat-item 不应该是纯 vertical 平铺）
      if (elementStyleMap && Object.keys(elementStyleMap).length > 0) {
        const layoutCritiques = this._checkMixedLayout(files, elementStyleMap, layoutStructure)
        if (layoutCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...layoutCritiques]
          if (layoutCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.layout = checkResult.issueCategories.layout || []
            checkResult.issueCategories.layout.push('MIXED_LAYOUT')
            logger.warn('🚨 混合布局检查: stat-item 使用了纯 vertical 平铺，强制 needs_revision')
          }
        }
      }

      //  内容区背景图覆盖检查
      if (resourceDomMapping && resourceDomMapping.length > 0) {
        const bgCritiques = this._checkContentBackgroundCoverage(files, resourceDomMapping, layoutStructure)
        if (bgCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...bgCritiques]
          if (bgCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.stylistic = checkResult.issueCategories.stylistic || []
            checkResult.issueCategories.stylistic.push('CONTENT_BG_MISSING')
            logger.warn('🚨 内容区背景图检查: content bg 资源未覆盖，强制 needs_revision')
          }
        }
      }

      //  样式覆盖率检查（per-element style vs CSS）
      if (elementStyleMap && Object.keys(elementStyleMap).length > 0) {
        const styleCritiques = this._checkStyleCoverage(files, elementStyleMap)
        if (styleCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...styleCritiques]
          if (styleCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.stylistic = checkResult.issueCategories.stylistic || []
            checkResult.issueCategories.stylistic.push('STYLE_COVERAGE')
            logger.warn('🚨 样式覆盖率检查: per-element 样式属性未在 CSS 中体现，强制 needs_revision', {
              missingCount: styleCritiques.filter(c => c.severity === 'high').length
            })
          }
        }
      }

      //  Vue3 专属检查 - 微码污染检查（仅 Vue3 组件）
      if (componentType === 'vue3') {
        const pollutionCritiques = this._checkMicrocodePollution(files)
        if (pollutionCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...pollutionCritiques]
          if (pollutionCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.compliance = checkResult.issueCategories.compliance || []
            checkResult.issueCategories.compliance.push('MICROCODE_POLLUTION')
            logger.warn('🚨 微码污染检查: Vue3 组件中发现微码专有内容，强制 needs_revision', {
              violationCount: pollutionCritiques.filter(c => c.severity === 'high').length
            })
          }
        }
      }

      //  base-panel 面板外壳泄漏检查（仅微码组件）
      if (componentType === 'microcode') {
        const chromeCritiques = this._checkBasePanelChromeLeakage(files)
        if (chromeCritiques.length > 0) {
          checkResult.critiques = [...(checkResult.critiques || []), ...chromeCritiques]
          if (chromeCritiques.some(c => c.severity === 'high')) {
            checkResult.checkResult = 'needs_revision'
            checkResult.issueCategories = checkResult.issueCategories || {}
            checkResult.issueCategories.layout = checkResult.issueCategories.layout || []
            checkResult.issueCategories.layout.push('BASE_PANEL_CHROME_LEAKAGE')
            logger.warn('🚨 base-panel 外壳泄漏检查: 组件不应包含自己的 header/bg-layer，强制 needs_revision', {
              leakageCount: chromeCritiques.filter(c => c.severity === 'high').length
            })
          }
        }
      }

      //  Critique 合并去重 — 同 category + 相似 issue 合并为一条，减少下游 revision 噪声
      const beforeMergeCount = (checkResult.critiques || []).length
      checkResult.critiques = this._mergeSimilarCritiques(checkResult.critiques || [])
      const afterMergeCount = checkResult.critiques.length
      if (beforeMergeCount !== afterMergeCount) {
        logger.info('🔀 critiques 合并去重', {
          before: beforeMergeCount,
          after: afterMergeCount,
          merged: beforeMergeCount - afterMergeCount
        })
      }

      return {
        ...checkResult,
        authorizationViolation,
        //  写回 SFC 事实缓存，供 revision 轮复用（graph 合并进 state）
        _sfcFactsCache: sfcFacts,
        _sfcFactsHash: sfcFileHash
      }

    } catch (error) {
      logger.error('对抗性检查执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析输出（BaseAgent要求实现）
   *  改用 robustJSONParse
   */
  parseOutput(rawOutput) {
    return robustJSONParse(rawOutput, {
      fallback: SAFE_FALLBACK_RESULT,
      enablePartialExtract: true,
      criticalFields: ['checkResult', 'qualityScore'],
      _context: 'adversarial-checker-parseOutput'
    })
  }

  // ============================================
  //  Critique 合并去重
  // ============================================

  /**
   * 合并相似 critique，降低下游 revision 噪声
   *
   * 策略（确定性、不调用 LLM）：
   *   1. 同 category
   *   2. 归一化后的 issue 模板签名相同：
   *      - 去引号/括号/数字/路径
   *      - 中英文标点统一为空格
   *      - 冒号前的"模板前缀"作为主键（支持"未使用的变量: foo" 与 "未使用的变量: bar" 合并）
   *      - 否则取前 40 字符作为签名
   *   3. 合并后保留最高 severity，聚合 locations/fixes，附加"(共 N 处)"提示
   *
   * @param {Array} critiques
   * @returns {Array}
   */
  _mergeSimilarCritiques(critiques) {
    if (!critiques || critiques.length <= 1) return critiques || []

    const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 }

    const deepNormalize = (s) =>
      (s || '')
        .toLowerCase()
        .replace(/['"`''""„‚]/g, ' ')
        .replace(/[：:；;,，。.!?！？、]/g, ' ')
        .replace(/[()（）\[\]【】{}]/g, ' ')
        .replace(/\d+/g, '')
        .replace(/[a-z]:\\[^ ]+|\/[\w/.%-]+/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

    // 提取核心关键词（中文 2+ 字或英文 4+ 字母的词）
    const extractKeywords = (s) => {
      const normalized = deepNormalize(s)
      const words = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z]{4,}/g) || []
      return new Set(words)
    }

    const extractSignature = (critique) => {
      const raw = (critique.issue || '').toLowerCase().trim()

      // 优先使用冒号前的"模板前缀"作为签名（保留原始冒号，未被归一化）
      // 支持 "未使用的变量: foo" 与 "未使用的变量: bar" 合并
      const colonMatch = /^(.{4,30})[：:]\s*.+$/.exec(raw)
      if (colonMatch) {
        return `${critique.category || ''}::TPL::${deepNormalize(colonMatch[1])}`
      }

      // 否则：完全归一化后取前 40 字符
      const core = deepNormalize(raw).substring(0, 40)
      return `${critique.category || ''}::${core}`
    }

    // 按 signature 聚合，保留插入顺序
    const groups = new Map()
    const insertionOrder = []
    for (const c of critiques) {
      const sig = extractSignature(c)
      if (!groups.has(sig)) {
        groups.set(sig, [])
        insertionOrder.push(sig)
      }
      groups.get(sig).push(c)
    }

    //第三层：同义词归一化签名匹配
    // 解决 "样式规则未声明分号" 与 "样式规则缺少分号" 这类同义表达合并问题
    // 核心：将"未声明/缺少/缺失/没有"等变体替换成统一标准词后比较签名
    const SYNONYM_GROUPS = [
      ['未声明', '缺少', '缺失', '没有', '不存在', '未发现', '遗漏'],
      ['未使用', '没有使用', '未被使用', '闲置'],
      ['未引入', '未导入', '没有引入', '没有导入'],
      ['错误', '不正确', '有误', '不匹配'],
    ]
    const SYNONYM_MAP = new Map()
    for (const group of SYNONYM_GROUPS) {
      const canonical = group[0]  // 第一个为标准词
      for (const syn of group) {
        SYNONYM_MAP.set(syn, canonical)
      }
    }

    const normalizeSynonyms = (s) => {
      let result = s
      // 按长度降序替换，避免短词先匹配截断长词
      const sortedSyns = [...SYNONYM_MAP.keys()].sort((a, b) => b.length - a.length)
      for (const syn of sortedSyns) {
        if (result.includes(syn)) {
          result = result.replace(new RegExp(syn, 'g'), SYNONYM_MAP.get(syn))
        }
      }
      return result
    }

    const normalizedGroups = new Map()
    const normalizedOrder = []
    for (const [sig, items] of groups.entries()) {
      // 用同义词归一化后的 signature 做二次聚合
      const normSig = `${items[0]?.category || ''}::NORM::${normalizeSynonyms(deepNormalize(items[0]?.issue || '')).substring(0, 40)}`
      if (!normalizedGroups.has(normSig)) {
        normalizedGroups.set(normSig, [])
        normalizedOrder.push(normSig)
      }
      normalizedGroups.get(normSig).push(...items)
    }

    const merged = []
    for (const normSig of normalizedOrder) {
      const items = normalizedGroups.get(normSig)
      if (items.length === 1) {
        merged.push(items[0])
        continue
      }

      // 选最高 severity 作为代表；相同 severity 取第一条
      let representative = items[0]
      let maxSev = SEVERITY_ORDER[representative.severity] || 0
      for (let i = 1; i < items.length; i++) {
        const s = SEVERITY_ORDER[items[i].severity] || 0
        if (s > maxSev) {
          maxSev = s
          representative = items[i]
        }
      }

      const locations = [...new Set(items.map(i => i.location).filter(Boolean))]
      const fixes = [...new Set(items.map(i => i.fix).filter(Boolean))]

      merged.push({
        ...representative,
        issue: `${representative.issue.replace(/\s*\(共\s*\d+\s*处\)$/, '')} (共 ${items.length} 处)`,
        location: locations.join('; ') || representative.location || '',
        fix: fixes.join('; ') || representative.fix || ''
      })
    }

    return merged
  }

  // ============================================
  //  _reviseTarget 越权修改检测
  // ============================================

  /**
   * 检测精修节点是否越权修改
   * @param {Object} currentFiles - 当前文件内容 { fileName: content }
   * @param {Object} originalFiles - 精修前的原始文件内容
   * @param {string} reviseTarget - 当前的修订目标 (stylistic/layout/structural/full)
   * @returns {{ violation: boolean, message?: string, details?: string[] }}
   */
  detectUnauthorizedChanges(currentFiles, originalFiles, reviseTarget) {
    const result = { violation: false }
    const details = []

    // 遍历所有文件，检测差异
    for (const [fileName, currentContent] of Object.entries(currentFiles)) {
      const originalContent = originalFiles[fileName]
      if (!originalContent) continue

      // 简单的逐行 diff（生产环境可用更精细的 diff 库）
      const currentLines = currentContent.split('\n')
      const originalLines = originalContent.split('\n')

      switch (reviseTarget) {
        case 'stylistic':
          // stylistic 模式: 仅允许修改 .less 文件和颜色/字体/阴影属性
          if (fileName.endsWith('.vue')) {
            // 检测 template 修改
            const templateChanged = this._hasTemplateChange(currentLines, originalLines)
            if (templateChanged) {
              result.violation = true
              details.push(`${fileName}: stylistic模式禁止修改template`)
            }
          }
          // 检测布局属性修改（padding/margin/flex/grid）
          const layoutPropsChanged = this._hasLayoutPropertyChanges(currentLines, originalLines)
          if (layoutPropsChanged.length > 0) {
            result.violation = true
            details.push(`${fileName}: stylistic模式修改了布局属性 [${layoutPropsChanged.join(', ')}]`)
          }
          break

        case 'layout':
          // layout 模式: 仅允许修改 padding/margin/flex/grid，禁止修改颜色/字体
          const colorFontChanged = this._hasColorFontChanges(currentLines, originalLines)
          if (colorFontChanged.length > 0) {
            result.violation = true
            details.push(`${fileName}: layout模式修改了颜色/字体 [${colorFontChanged.join(', ')}]`)
          }
          break

        case 'structural':
          // structural 模式: 仅允许 template/script，禁止修改样式文件
          if (fileName.endsWith('.less') || fileName.includes('style')) {
            const styleChanged = currentContent !== originalContent
            if (styleChanged) {
              result.violation = true
              details.push(`${fileName}: structural模式禁止修改样式文件`)
            }
          }
          break

        case 'full':
        default:
          // full 模式无限制
          break
      }
    }

    if (result.violation) {
      result.message = `${reviseTarget}模式下检测到越权修改`
      result.details = details
    }

    return result
  }

  /**
   * 检测 template 区域是否有变更
   */
  _hasTemplateChange(currentLines, originalLines) {
    let inTemplate = false
    for (let i = 0; i < Math.max(currentLines.length, originalLines.length); i++) {
      const currLine = currentLines[i] || ''
      const origLine = originalLines[i] || ''

      if (currLine.trim().startsWith('<template') || origLine.trim().startsWith('<template')) {
        inTemplate = true
      }
      if (currLine.trim() === '</template>' || origLine.trim() === '</template>') {
        inTemplate = false
        continue
      }

      if (inTemplate && currLine !== origLine && currLine.trim() && origLine.trim()) {
        return true
      }
    }
    return false
  }

  /**
   * 检测布局属性修改 (padding/margin/flex/grid)
   */
  _hasLayoutPropertyChanges(currentLines, originalLines) {
    const layoutPattern = /^\s*(padding|margin|flex|gap|grid|align-items|justify-content|display)\s*:/i
    const changedProps = []

    // 找到当前文件中新增或修改的行
    for (let i = 0; i < currentLines.length; i++) {
      if (layoutPattern.test(currentLines[i])) {
        const origLine = originalLines[i] || ''
        if (currentLines[i].trim() !== origLine.trim()) {
          // 提取属性名
          const match = currentLines[i].match(layoutPattern)
          if (match) changedProps.push(match[1])
        }
      }
    }

    return changedProps
  }

  /**
   * 检测颜色/字体属性修改
   */
  _hasColorFontChanges(currentLines, originalLines) {
    const colorFontPattern = /^\s*(color|font-size|font-weight|font-family|background-color?|box-shadow|border-color|border-radius|opacity)\s*:/i
    const changedProps = []

    for (let i = 0; i < currentLines.length; i++) {
      if (colorFontPattern.test(currentLines[i])) {
        const origLine = originalLines[i] || ''
        if (currentLines[i].trim() !== origLine.trim()) {
          const match = currentLines[i].match(colorFontPattern)
          if (match) changedProps.push(match[1])
        }
      }
    }

    return changedProps
  }

  /**
   *资源利用率检查（程序化，确定性 100%）
   * 检查所有 downloadStatus === 'success' 的资源是否被代码引用
   * 同时检测 SVG/CSS 替代了可用资源的情况
   */
  _checkResourceUtilization(files, resourceDomMapping) {
    const critiques = []
    // R0-6（2026-09-01）：统一走 filterAvailableResources 单一过滤帮手
    const available = filterAvailableResources(resourceDomMapping)

    if (available.length === 0) return critiques

    // 拼接所有代码文件内容
    const allCode = Object.entries(files)
      .map(([path, content]) => ({ path, content }))
      .filter(f => f.path.endsWith('.vue') || f.path.endsWith('.js') || f.path.endsWith('.ts'))

    const codeContent = allCode.map(f => f.content).join('\n')

    for (const mapping of available) {
      const varName = mapping.semanticVarName || ''
      const resourceFile = mapping.resourceFile || ''
      const figmaNodeId = mapping.figmaNodeId || ''
      const role = mapping.previewAnalysisRole || ''
      const hint = mapping.hint || ''
      const recommendedUsage = mapping.recommendedUsage || ''

      // 搜索代码中是否引用了该资源
      const searchTerms = [varName, resourceFile, figmaNodeId].filter(t => t && t.length > 2)
      let referenced = false

      for (const term of searchTerms) {
        if (codeContent.includes(term)) {
          referenced = true
          break
        }
      }

      if (!referenced) {
        // 生成 critique：可用资源未被引用
        //  icon 类资源为"建议使用"（medium），bg 类资源为"必须��用"（high）
        // icon 在布局中可能无自然位置，强制插入会破坏布局（如 icon 跑到 subheader/卡片右上角）
        const severity = role === 'icon' ? 'medium' : 'high'
        const category = role === 'icon' ? 'suggestion' : 'standards'

        const fixHint = role === 'icon'
          ? `如果布局中有自然位置，在模板中使用: <img :src="${varName}" alt="${hint}">；如果无法找到自然位置，可以忽略`
          : role === 'bg'
          ? `在模板中使用: :style="{ backgroundImage: \`url(\${${varName}})\` }"`
          : `在模板中使用: <img :src="${varName}">`

        critiques.push({
          severity,
          category,
          issue: `可用资源未被使用: ${hint} (${role}) — 应使用 ${resourceFile}${role === 'icon' ? '（建议使用，如果布局中没有自然位置可以忽略）' : ''}`,
          location: 'package/index.vue',
          fix: fixHint
        })
      } else {
        // 已引用，但检查是否有 SVG/CSS 替代（双重检查）
        // 对于 icon：检查是否有内联 SVG 替代了同一个节点
        if (role === 'icon') {
          const svgPattern = /<svg[^>]*>/g
          const svgMatches = codeContent.match(svgPattern)
          if (svgMatches && hint) {
            // 简化检查：如果代码里同时有 SVG 和资源引用，可能是不同位置
            // 只在完全没有引用时标记（已在上面处理）
          }
        }

      }
    }

    // 额外检查：SVG 替代了可用 icon 资源（即使有引用也检查是否有些位置用了 SVG）
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    for (const iconMapping of iconMappings) {
      // 检查是否有内联 SVG 包含该 icon 的 hint 名称
      const svgBlockPattern = /<svg[^>]*>[\s\S]*?<\/svg>/g
      const svgBlocks = codeContent.match(svgBlockPattern) || []

      for (const svgBlock of svgBlocks) {
        // SVG 里如果有该 icon 的 hint 名称，说明用 SVG 替代了该 icon
        const hintParts = (iconMapping.hint || '').split('/')
        const iconName = hintParts[hintParts.length - 1] || ''
        if (iconName && svgBlock.includes(iconName)) {
          critiques.push({
            severity: 'high',
            category: 'standards',
            issue: `使用了内联SVG替代可用icon资源: ${iconMapping.hint} — 应使用 <img :src="${iconMapping.semanticVarName || 'icon1'}"> 而非内联SVG`,
            location: 'package/index.vue',
            fix: `删除该SVG，改用 <img :src="${iconMapping.semanticVarName || 'icon1'}" alt="${iconName}">`
          })
        }
      }
    }

    return critiques
  }

  /**
   *base-panel 插槽使用检查（程序化）
   * 检查生成的代码是否正确使用了 base-panel 的具名插槽
   * 而非在默认插槽内自行生成 header 结构
   */
  _checkSlotUsage(files, headerSlots) {
    const critiques = []
    const allCode = Object.entries(files)
      .map(([path, content]) => ({ path, content }))
      .filter(f => f.path.endsWith('.vue') || f.path.endsWith('.js') || f.path.endsWith('.ts'))

    const codeContent = allCode.map(f => f.content).join('\n')

    // 1. 检查禁止结构：<div class="header">、<div class="panel-title">、<h2>标题</h2> 在 base-panel 内
    const forbiddenPatterns = [
      { pattern: /<div[^>]*class=["'][^"']*header[^"']*["'][^>]*>/gi, desc: '在 base-panel 内生成 <div class="header">' },
      { pattern: /<div[^>]*class=["'][^"']*panel-title[^"']*["'][^>]*>/gi, desc: '在 base-panel 内生成 <div class="panel-title">' },
      { pattern: /<h[2-6][^>]*>[\s\S]*?<\/h[2-6]>/gi, desc: '在 base-panel 内自行用 <h2>/<h3> 包裹标题' },
    ]

    for (const { pattern, desc } of forbiddenPatterns) {
      const matches = codeContent.match(pattern)
      if (matches && matches.length > 0) {
        // 排除：如果在 <template #xxx> 内部出现的（那是合法的插槽内容）
        // 简化检查：只要代码里没有 <template #xxx> 就说明没有正确使用插槽
        const hasSlotTemplate = /<template\s+#(title-left|title-right|header-right)/.test(codeContent)
        if (!hasSlotTemplate) {
          critiques.push({
            severity: 'high',
            category: 'compliance',
            issue: `base-panel 插槽未正确使用: ${desc} — 标题栏应由 base-panel 提供，头部内容必须通过 <template #xxx> 分发`,
            location: 'package/index.vue',
            fix: '删除自行生成的 header 结构，改用 <template #title-left>/<template #title-right>/<template #header-right> 分发内容'
          })
        }
      }
    }

    // 2. 检查是否使用了具名插槽（如果有 headerSlots 信息）
    if (headerSlots && headerSlots.length > 0) {
      const expectedSlots = headerSlots.map(s => s.slotType)
      const slotTypes = ['title-left', 'title-right', 'header-right']
      
      for (const slotType of slotTypes) {
        if (expectedSlots.includes(slotType)) {
          const hasSlot = codeContent.includes(`<template #${slotType}>`)
          if (!hasSlot) {
            const slotContent = headerSlots.filter(s => s.slotType === slotType)
              .map(s => s.content || s.elementType).join('、')
            critiques.push({
              severity: 'medium',
              category: 'standards',
              issue: `headerSlots 中有 ${slotType} 插槽内容 (${slotContent}) 但代码未使用 <template #${slotType}>`,
              location: 'package/index.vue',
              fix: `添加 <template #${slotType}> 并放入对应内容`
            })
          }
        }
      }
    }

    // 3. 即使没有 headerSlots，也检查是否有 <base-panel> 但没用任何插槽
    const hasBasePanel = /<base-panel/.test(codeContent)
    if (hasBasePanel) {
      const hasAnySlot = /<template\s+#/.test(codeContent)
      if (!hasAnySlot && headerSlots && headerSlots.length > 0) {
        critiques.push({
          severity: 'high',
          category: 'compliance',
          issue: '使用了 <base-panel> 但完全没有使用具名插槽 — 所有头部内容被放在默认插槽中',
          location: 'package/index.vue',
          fix: '将标题栏右侧控件通过 <template #header-right> 等插槽分发，不要在默认插槽中自行生成 header 结构'
        })
      }
    }

    return critiques
  }

  /**
   *  微码污染检查（仅 Vue3 组件）
   * 检测 Vue3 组件中是否混入微码专有内容：
   * - <base-panel> 标签
   * - $mcComponentBuilder() API
   * - panelKey / declare.json / component.js 等微码概念
   * - #header-right / #header-left 等微码插槽名称
   *
   * @param {Object} files - 生成的文件内容映射 {path: content}
   * @returns {Array} critiques
   */
  _checkMicrocodePollution(files) {
    const critiques = []
    const allCode = Object.entries(files)
      .map(([path, content]) => ({ path, content }))
      .filter(f => f.path.endsWith('.vue') || f.path.endsWith('.js') || f.path.endsWith('.ts'))

    const codeContent = allCode.map(f => f.content).join('\n')

    // 微码专有内容检测模式
    const pollutionPatterns = [
      {
        pattern: /<base-panel[\s>]/i,
        desc: '发现 <base-panel> 标签（微码专有的面板容器组件）',
        severity: 'high'
      },
      {
        pattern: /\$mcComponentBuilder\s*\(/i,
        desc: '发现 $mcComponentBuilder() API（微码框架的组件构建器）',
        severity: 'high'
      },
      {
        pattern: /\bpanelKey\b/i,
        desc: '发现 panelKey 属性（微码组件的标识符）',
        severity: 'high'
      },
      {
        pattern: /declare\.json/i,
        desc: '引用 declare.json（微码组件的配置文件）',
        severity: 'high'
      },
      {
        pattern: /component\.js/i,
        desc: '引用 component.js（微码组件的入口文件）',
        severity: 'high'
      },
      {
        pattern: /<template\s+#(header-right|header-left|title-right|title-left)/i,
        desc: '使用微码插槽名称（#header-right / #header-left 等）',
        severity: 'high'
      },
      {
        pattern: /@mvgo\/microcode/i,
        desc: '引用 @mvgo/microcode（微码框架包）',
        severity: 'high'
      }
    ]

    for (const { pattern, desc, severity } of pollutionPatterns) {
      const matches = codeContent.match(pattern)
      if (matches && matches.length > 0) {
        critiques.push({
          severity,
          category: 'compliance',
          issue: `Vue3 组件混入微码内容: ${desc}`,
          location: 'Vue3 component',
          fix: '删除所有微码专有内容，使用标准 Vue3 SFC 结构：<template> + <script setup> + <style scoped>'
        })
      }
    }

    if (critiques.length > 0) {
      logger.warn('🚨 微码污染检查: 发现 Vue3 组件混入微码专有内容', {
        pollutionCount: critiques.length
      })
    }

    return critiques
  }

  /**
   *  样式覆盖率检查（per-element style vs CSS）
   * 对比 elementStyleMap 中每个元素的 CSS 属性与生成代码中的实际 CSS 属性。
   * 缺失关键属性 → HIGH severity critique。
   *
   * @param {Object} files - 生成的文件内容映射 {path: content}
   * @param {Object} elementStyleMap - { elementId → { cssProperty: value } }
   * @returns {Array} critiques
   */
  _checkStyleCoverage(files, elementStyleMap) {
    const critiques = []

    // 收集所有 CSS/Less 文件内容
    const styleFiles = Object.entries(files)
      .filter(([path]) => path.endsWith('.less') || path.endsWith('.css') || path.endsWith('.vue'))
      .map(([path, content]) => ({ path, content }))

    const styleContent = styleFiles.map(f => f.content).join('\n')

    // 关键属性：缺失任何一个都视为样式覆盖不全
    const criticalProperties = ['color', 'font-size', 'width', 'height', 'background']

    // 深色文字色值检测（rgba(0,0,0,...) 或 #xxxxxx 其中 RGB < 100）
    const isDarkColor = (val) => {
      const rgbaMatch = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
      if (rgbaMatch) {
        return parseInt(rgbaMatch[1]) < 100 && parseInt(rgbaMatch[2]) < 100 && parseInt(rgbaMatch[3]) < 100
      }
      const hexMatch = val.match(/^#([0-9a-fA-F]{6})/)
      if (hexMatch) {
        const hex = hexMatch[1]
        return parseInt(hex.slice(0, 2), 16) < 100 && parseInt(hex.slice(2, 4), 16) < 100 && parseInt(hex.slice(4, 6), 16) < 100
      }
      return false
    }

    // 检查每个元素的样式覆盖率
    for (const [elementId, cssProps] of Object.entries(elementStyleMap)) {
      // 只检查关键属性
      for (const prop of criticalProperties) {
        const expectedValue = cssProps[prop]
        if (!expectedValue || typeof expectedValue !== 'string') continue

        // 在 CSS 中搜索该属性值
        const cssPropertyPattern = prop.replace(/-/g, '[\\s-]*')  // font-size → font[\s-]*size（兼容 camelCase）
        const valuePattern = expectedValue.replace(/[()]/g, '\\$&')  // rgba(...) → rgba\(...\)

        // 检查值是否在 CSS 中出现
        const valueInCSS = styleContent.includes(expectedValue) ||
          new RegExp(cssPropertyPattern + '[\\s:]*' + valuePattern, 'i').test(styleContent)

        if (!valueInCSS) {
          // 关键属性值完全缺失
          critiques.push({
            severity: 'high',
            category: 'stylistic',
            issue: `per-element 样式缺失: 元素 "${elementId}" 的 ${prop} 应为 "${expectedValue}" 但在 CSS 中未找到`,
            location: 'resources/styles/',
            fix: `在对应的 CSS 类中添加 ${prop}: ${expectedValue}（直接使用该值，不要用主题变量替代）`
          })
        } else {
          // 值存在，但需要额外检查：深色面板的文字颜色是否被主题变量覆盖成了黑色
          if (prop === 'color' && isDarkColor(expectedValue) === false && expectedValue.includes('255')) {
            // 预期是白色系文字，检查 CSS 中是否有黑色系替代
            const darkOverrides = [
              'rgba(0, 0, 0', 'rgba(0,0,0',
              '@color-stat-label-light', '@color-stat-value-light',
              '@color-text-light'
            ]
            for (const darkStr of darkOverrides) {
              if (styleContent.includes(darkStr)) {
                critiques.push({
                  severity: 'high',
                  category: 'stylistic',
                  issue: `样式值被覆盖: 元素 "${elementId}" 的 color 应为 "${expectedValue}"（白字），但 CSS 中使用了 "${darkStr}"（黑字），主题变量覆盖了设计稿明确值`,
                  location: 'resources/styles/themes/',
                  fix: `将主题变量默认值改为 "${expectedValue}"，或在深色面板中直接使用 "${expectedValue}" 而不是变量`
                })
                break
              }
            }
          }
        }
      }
    }

    return critiques
  }

  /**
   *  混合布局检查（stat-item 不应该是纯 vertical 平铺）
   * 如果 elementStyleMap 中有 row 类型元素（layout: horizontal），
   * 但生成的 CSS 中 stat-item 是纯 flex-direction: column 且没有嵌套 row 容器，
   * 则标记为 layout 问题。
   *
   * @param {Object} files - 生成的文件内容映射 {path: content}
   * @param {Object} elementStyleMap - { elementId → { cssProperty: value } }
   * @param {Object} layoutStructure - VP 输出的布局结构（用于确认是否有 row 嵌套）
   * @returns {Array} critiques
   */
  _checkMixedLayout(files, elementStyleMap, layoutStructure) {
    const critiques = []

    // 1. 检查 elementStyleMap 中是否有 row 类型元素
    const rowElements = Object.entries(elementStyleMap).filter(([id, props]) =>
      id.includes('row') && props['flex-direction'] === 'row'
    )

    if (rowElements.length === 0) return critiques // 没有 row 嵌套，无需检查

    // 2. 收集所有 CSS/Less/Vue 文件内容
    const styleContent = Object.entries(files)
      .filter(([path]) => path.endsWith('.less') || path.endsWith('.css') || path.endsWith('.vue'))
      .map(([path, content]) => content)
      .join('\n')

    // 3. 检查 stat-item 类是否有嵌套 row 容器
    // 如果 elementStyleMap 有 row 元素，但 CSS 中没有对应的 stat-row/stat-icon-row 容器
    const hasRowContainer = /stat-row|stat-icon-row|stat-header|icon-row|label-row/.test(styleContent)
    const hasFlexRowInStat = /\.c-[a-z]+-stat-item\s*\{[^}]*flex-direction:\s*row/.test(styleContent)

    // 4. 检查是否存在纯 vertical 平铺的 stat-item（应该有嵌套结构）
    // 如果 elementStyleMap 有 row 元素（说明 VP 认为应该有嵌套），但 CSS 没有对应的 row 容器
    if (!hasRowContainer && !hasFlexRowInStat) {
      critiques.push({
        severity: 'high',
        category: 'layout',
        issue: `stat-item 使用了纯 vertical 平铺布局，但设计稿中 icon 和 label 应在同一水平行 — 缺少嵌套 flex-direction: row 容器`,
        location: 'resources/styles/common.less',
        fix: '在 stat-item 内添加一个 flex-direction: row 的容器（如 .stat-row），包裹 icon 和 label，value 放在容器下方'
      })
    }

    // 5. 检查 layoutStructure 中是否有 row 嵌套（交叉验证）
    if (layoutStructure) {
      const hasRowInStructure = this._findRowInLayoutStructure(layoutStructure)
      if (hasRowInStructure && !hasRowContainer) {
        critiques.push({
          severity: 'high',
          category: 'layout',
          issue: `layoutStructure 中有 type='row' 嵌套结构，但生成的代码没有对应的 flex-direction: row 容器`,
          location: 'package/index.vue',
          fix: '为 stat-item 内的 icon+label 添加 <div class="stat-row"> 包裹容器，CSS 设置 display: flex; flex-direction: row'
        })
      }
    }

    return critiques
  }

  /**
   * 递归检查 layoutStructure 中是否存在 type='row' 的嵌套元素
   */
  _findRowInLayoutStructure(node) {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) {
      return node.some(item => this._findRowInLayoutStructure(item))
    }
    if ((node.type === 'row' || node.layout === 'horizontal') &&
        node.children && Array.isArray(node.children)) {
      return true
    }
    const subNodes = [node.children, node.items, node.elements, node.sections, node.controls]
    for (const sub of subNodes) {
      if (Array.isArray(sub) && sub.some(item => this._findRowInLayoutStructure(item))) {
        return true
      }
    }
    const objNodes = [node.body, node.header, node.content, node.layout]
    for (const obj of objNodes) {
      if (obj && typeof obj === 'object' && this._findRowInLayoutStructure(obj)) {
        return true
      }
    }
    return false
  }

  /**
   *  内容区背景图覆盖检查
   * 如果 resourceDomMapping 中有属于 slot-con/content 的 bg 资源，
   * 但生成的代码中内容区没有使用该背景图，标记为 stylistic 问题。
   *
   * @param {Object} files - 生成的文件内容映射 {path: content}
   * @param {Array} resourceDomMapping - 资源-DOM 映射表
   * @param {Object} layoutStructure - VP 输出的布局结构
   * @returns {Array} critiques
   */
  _checkContentBackgroundCoverage(files, resourceDomMapping, layoutStructure) {
    const critiques = []

    // 1. 找到属于内容区的 bg 资源
    // R0-6（2026-09-01）：统一走 filterAvailableResources 单一过滤帮手
    const contentBgMappings = filterAvailableResources(resourceDomMapping).filter(m =>
      m.previewAnalysisRole === 'bg' &&
      /slot-con|content|body/.test(m.figmaPath || m.targetDomSelector || '') &&
      !/header/.test(m.figmaPath || m.targetDomSelector || '')
    )

    if (contentBgMappings.length === 0) return critiques

    // 2. 检查 layoutStructure 中 content/body 是否有 backgroundImage
    let hasBgInStructure = false
    const walkForBg = (node) => {
      if (!node || typeof node !== 'object') return
      if (node.backgroundImage && node.backgroundImage.src) {
        hasBgInStructure = true
        return
      }
      const subNodes = [node.children, node.items, node.elements, node.sections, node.controls]
      for (const sub of subNodes) {
        if (Array.isArray(sub)) sub.forEach(walkForBg)
      }
      const objNodes = [node.body, node.header, node.content, node.layout]
      for (const obj of objNodes) {
        if (obj && typeof obj === 'object') walkForBg(obj)
      }
    }
    if (layoutStructure) walkForBg(layoutStructure)

    // 3. 收集所有代码文件内容
    const codeContent = Object.entries(files)
      .filter(([path]) => path.endsWith('.vue') || path.endsWith('.js') || path.endsWith('.less'))
      .map(([path, content]) => content)
      .join('\n')

    // 4. 检查内容区是否使用了该 bg 资源变量
    for (const bgMapping of contentBgMappings) {
      const varName = bgMapping.semanticVarName || ''
      const resourceFile = bgMapping.resourceFile || ''
      const hint = bgMapping.hint || ''

      // 搜索代码中是否引用了该 bg 变量（在内容区容器中）
      const referenced = varName && codeContent.includes(varName)

      if (!referenced) {
        critiques.push({
          severity: 'high',
          category: 'stylistic',
          issue: `内容区背景图未被使用: ${hint} — 应在内容区容器上使用 backgroundImage: url(${varName || resourceFile})`,
          location: 'package/index.vue',
          fix: `在内容区容器上添加 :style="{ backgroundImage: \`url(\${${varName || 'bg1'}})\` }"，而非使用纯色背景或 CSS 渐变`
        })
      } else {
        // 已引用但检查是否在内容区容器而非根容器
        // 简化：如果代码中有 bg 变量引用，但用在根容器而非内容区
        // 这种情况较难程序化判断，暂不深入检查
      }
    }

    return critiques
  }

  /**
   *  base-panel 面板外壳泄漏检查
   * 当组件使用 <base-panel> 时，生成的代码不应再包含自己的 header 或 bg-layer。
   * 这些属于 base-panel 的框架职责。
   */
  _checkBasePanelChromeLeakage(files) {
    const critiques = []
    const vueContent = Object.entries(files)
      .filter(([path]) => path.endsWith('.vue'))
      .map(([path, content]) => content)
      .join('\n')

    // 没有使用 base-panel 的面板不检查
    if (!/<base-panel[\s>]/.test(vueContent)) return critiques

    // 检查是否有独立的 bg-layer div（空背景层 div）
    const bgLayerMatch = vueContent.match(/<div[^>]*class="[^"]*bg-layer[^"]*"[^>]*>[\s\S]*?<\/div>/i)
    if (bgLayerMatch) {
      critiques.push({
        severity: 'high',
        category: 'layout',
        issue: '组件使用 base-panel，但仍然生成了独立的 bg-layer 背景层 div — base-panel 已提供面板背景',
        location: 'package/index.vue',
        fix: '删除 bg-layer div，把需要的背景图应用到内容区容器（:style="{ backgroundImage: ... }"），或完全交给 base-panel 处理'
      })
    }

    // 检查是否有独立的 header / panel-header div
    const headerMatch = vueContent.match(/<div[^>]*class="[^"]*(?:panel-header|[^-]header|-header)[^"]*"[^>]*>[\s\S]*?<\/div>/i)
    if (headerMatch) {
      // 进一步排除 base-panel 自身的 header 插槽内容（那些是在 <template #xxx> 中，合法）
      // 如果 header div 出现在 <template> 之外或默认插槽内，视为泄漏
      // 使用正则的 index 属性（而非 indexOf），避免模板中字符串字面量干扰
      const headerPos = headerMatch.index
      const templateBefore = vueContent.lastIndexOf('<template', headerPos)
      const templateEndBefore = vueContent.lastIndexOf('</template>', headerPos)
      const insideNamedSlot = templateBefore > templateEndBefore &&
        /#title-left|#title-right|#header-right/.test(vueContent.slice(templateBefore, headerPos))

      if (!insideNamedSlot) {
        critiques.push({
          severity: 'high',
          category: 'layout',
          issue: '组件使用 base-panel，但仍然生成了独立的 header / panel-header div — 标题栏应由 base-panel 渲染',
          location: 'package/index.vue',
          fix: '删除 header div，标题文字由 base-panel 通过 componentName 渲染；标题栏装饰图标应放入 <template #title-left> 等具名插槽'
        })
      }
    }

    return critiques
  }
}

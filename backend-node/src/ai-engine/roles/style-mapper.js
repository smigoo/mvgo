/**
 * Style Mapper - 样式映射师
 * 职责：将视觉元素映射为CSS/Less代码
 * 输入：visualElements from Visual Parser + elements[] (per-element) + Figma样式数据（可选）
 * 输出：themeVars, lessVariables, cssClasses, tokenCoverage, elementStyleMap
 *
 *  增加 per-element 样式提取能力（程序化，无需 LLM）
 *   - 从 elements[] 提取每个元素的 style 字段，转为 CSS 属性映射
 *   - 输出 elementStyleMap: { elementId → { cssProperty: value } }
 *   - 深色面板的默认主题变量强制使用深色值
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'
import { robustJSONParse } from '../utils/json-parser.js'

const logger = createLogger({ name: 'style-mapper' })

export class StyleMapper extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'style-mapper',
      description: '样式映射器',
      model: config.model || '',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 6144,
      ...config
    })

    // 加载样式规范文档
    this.styleGuides = this.loadReferenceFiles([
      'references/specs/style-guide.md',
      'references/patterns/css-variable-pattern.md'
    ])

    logger.info('Style Mapper 已初始化')
  }

  /**
   * 构建样式映射提示词
   */
  buildMappingPrompt(visualElements, figmaStyles = null) {
    const prompt = `
你是一个专业的前端样式工程师，负责将设计稿的视觉元素映射为CSS/Less代码。

# 映射任务

请将以下视觉元素映射为可复用的样式代码。

## 视觉元素
\`\`\`json
${JSON.stringify(visualElements, null, 2)}
\`\`\`

${figmaStyles ? `## Figma样式数据\n\`\`\`json\n${JSON.stringify(figmaStyles, null, 2)}\n\`\`\`` : ''}

# 样式规范

${this.styleGuides['references/specs/style-guide.md'] || ''}

${this.styleGuides['references/patterns/css-variable-pattern.md'] || ''}

# 输出要求

请严格按照以下JSON格式输出样式映射结果：

\`\`\`json
{
  "themeVars": {
    "comment": "CSS变量（camelCase命名）",
    "--colorPrimary": "#1a1a2e",
    "--colorBg": "#0f0f0f",
    "--colorTextBase": "#ffffff",
    "--fontSize": "14px",
    "--borderRadius": "8px"
  },
  "lessVariables": {
    "comment": "Less变量映射",
    "@color-primary": "#1a1a2e",
    "@color-bg": "#0f0f0f",
    "@color-text-base": "#ffffff",
    "@font-size-base": "14px",
    "@border-radius-base": "8px"
  },
  "cssClasses": {
    "comment": "可复用的CSS类",
    ".container": {
      "display": "flex",
      "flex-direction": "column",
      "padding": "20px",
      "background": "#0f0f0f"
    },
    ".header": {
      "display": "flex",
      "justify-content": "space-between",
      "align-items": "center",
      "color": "var(--colorTextBase)"
    }
  },
  "tokenCoverage": 0.92,
    "mappingNotes": [
      "主题色映射为--colorPrimary",
      "容器背景应优先直接落地为 Figma 字面量值，避免关键可见背景只依赖 CSS 变量"
    ]
}
\`\`\`

# 核心要求

1. **CSS变量命名必须使用camelCase**（如--colorPrimary，不是--color-primary）
2. **提取可复用的主题变量**，避免硬编码颜色值
3. **生成通用的CSS类**，便于组件复用
4. **计算Token覆盖率**：映射的样式变量占总视觉元素的比例
5. **确保Less变量与CSS变量对应**

开始映射：
`

    return prompt
  }

  /**
   * 执行样式映射
   */
  async map(visualElements, figmaStyles = null, options = {}) {
    logger.info('开始样式映射')

    const progress = options.onProgress || this.onProgress || this.progressCallback || null

    try {
      // 1. 构建提示词
      const prompt = this.buildMappingPrompt(visualElements, figmaStyles)
      progress?.({ stage: '样式映射', message: '🎨 AI 正在映射样式...', status: 'running' })

      // 2. 调用LLM映射
      const response = await invokeWithTimeout(this.llm, prompt, 180000, 'style-mapper', progress, {
        signal: options.signal,
        onProgress: progress,
        requestConcurrency: options.requestConcurrency,
        requestQueueTimeoutMs: options.requestQueueTimeoutMs,
        requestTimeoutMs: options.requestTimeoutMs,
        requestMaxRetries: options.requestMaxRetries,
        treatEmptyAsFailure: true,
        model: this.model,
        provider: 'text-role',
      })
      progress?.({ stage: '样式映射', message: '✅ 样式映射完成', status: 'running' })

      // 3. 解析结果（extractModelText 兜底 reasoning_content，防推理模型正文被截断为空串）
      const parsed = this.parseMappingResult(this.extractModelText(response))

      // 4. 验证结果
      this.validateMappingResult(parsed)

      logger.info('✅ 样式映射完成', {
        themeVarsCount: Object.keys(parsed.themeVars || {}).length,
        tokenCoverage: parsed.tokenCoverage
      })

      return parsed

    } catch (error) {
      logger.error('样式映射失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析映射结果
   */
  parseMappingResult(rawOutput) {
    const criticalFields = ['themeVars', 'lessVariables', 'cssClasses', 'tokenCoverage']
    
    try {
      // 使用 robustJSONParse，启用部分提取
      const parsed = robustJSONParse(rawOutput, { 
        _context: 'style-mapper', 
        fallback: null,
        enablePartialExtract: true,
        criticalFields
      })

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('robustJSONParse 返回非对象结果')
      }

      return parsed
    } catch (err) {
      // robustJSONParse 失败 → 尝试正则提取关键字段
      logger.warn('robustJSONParse 失败，尝试正则提取关键字段', {
        error: err.message,
        rawLength: typeof rawOutput === 'string' ? rawOutput.length : 'N/A'
      })

      const extracted = this._extractFieldsFromRawOutput(rawOutput)
      
      // 如果提取到至少一个有效字段，返回提取结果
      if (Object.values(extracted).some(v => v && typeof v === 'object' && Object.keys(v).length > 0)) {
        logger.info('✅ 正则提取成功，使用部分提取结果', {
          extractedFields: Object.entries(extracted)
            .filter(([, v]) => v && typeof v === 'object' && Object.keys(v).length > 0)
            .map(([k, v]) => `${k}(${Object.keys(v).length}项)`)
        })
        return extracted
      }

      // 最终兜底：返回空但有效的样式映射结果
      logger.warn('所有解析策略失败，使用空值兜底')
      return {
        themeVars: {},
        lessVariables: {},
        cssClasses: {},
        tokenCoverage: 0,
        elementStyleMap: {}
      }
    }
  }

  /**
   * 从原始 LLM 输出中正则提取关键字段
   * 用于 JSON 解析完全失败时的最后兜底
   */
  _extractFieldsFromRawOutput(rawOutput) {
    if (typeof rawOutput !== 'string') {
      return { themeVars: {}, lessVariables: {}, cssClasses: {}, tokenCoverage: 0 }
    }

    const result = { themeVars: {}, lessVariables: {}, cssClasses: {}, tokenCoverage: 0 }

    // 1. 提取 CSS 变量（themeVars）: "--xxx": "#xxx" 或 "--xxx": "xxx"
    const cssVarPattern = /"--([\w-]+)"\s*:\s*"([^"]+)"/g
    let match
    while ((match = cssVarPattern.exec(rawOutput)) !== null) {
      const [, key, value] = match
      // 过滤掉明显不是 CSS 变量的键（如 comment、type 等）
      if (!['comment', 'type', 'name', 'description'].includes(key)) {
        result.themeVars[`--${key}`] = value
      }
    }

    // 2. 提取 Less 变量: "@xxx": "#xxx" 或 "@xxx": "xxx"
    const lessVarPattern = /"@([\w-]+)"\s*:\s*"([^"]+)"/g
    while ((match = lessVarPattern.exec(rawOutput)) !== null) {
      const [, key, value] = match
      if (!['comment', 'type', 'name', 'description'].includes(key)) {
        result.lessVariables[`@${key}`] = value
      }
    }

    // 3. 提取 CSS 类: ".xxx": { ... }
    // 简化版：只提取类名和关键属性（display、flex-direction、background、color、padding 等）
    const cssClassPattern = /"\.([\w-]+)"\s*:\s*\{([^}]+)\}/g
    while ((match = cssClassPattern.exec(rawOutput)) !== null) {
      const [, className, content] = match
      const classObj = {}
      // 提取关键 CSS 属性
      const propPattern = /"([\w-]+)"\s*:\s*"([^"]+)"/g
      let propMatch
      while ((propMatch = propPattern.exec(content)) !== null) {
        const [, prop, value] = propMatch
        classObj[prop] = value
      }
      if (Object.keys(classObj).length > 0) {
        result.cssClasses[`.${className}`] = classObj
      }
    }

    // 4. 提取 tokenCoverage（数字）
    const coverageMatch = rawOutput.match(/"tokenCoverage"\s*:\s*(\d+(?:\.\d+)?)/)
    if (coverageMatch) {
      result.tokenCoverage = parseFloat(coverageMatch[1])
    }

    return result
  }

  /**
   * 验证映射结果
   */
  validateMappingResult(result) {
    // 兜底：如果 LLM 漏了 themeVars，从 lessVariables 自动转换（less @xxx → css --xxxXxx）
    if (!result.themeVars && result.lessVariables && typeof result.lessVariables === 'object') {
      result.themeVars = this.lessToCssVars(result.lessVariables)
      logger.warn('themeVars 缺失，已从 lessVariables 自动生成', {
        count: Object.keys(result.themeVars).length
      })
    }

    // 必填字段检查（兜底降级：缺失字段自动补空值，不中断整个 Phase 2）
    const fallbackFields = {
      themeVars: {},
      lessVariables: {},
      cssClasses: {}
    }

    for (const [field, fallback] of Object.entries(fallbackFields)) {
      if (!result[field] || (typeof result[field] === 'object' && Object.keys(result[field]).length === 0)) {
        const hadField = !!result[field]
        result[field] = fallback
        logger.warn(`style-mapper 缺少字段 "${field}"，已使用兜底空值`, {
          hadField,
          reason: hadField ? '字段存在但为空对象' : '字段完全缺失 — LLM 输出不完整'
        })
      }
    }

    // tokenCoverage必须在0-1之间
    if (result.tokenCoverage !== undefined) {
      if (result.tokenCoverage < 0 || result.tokenCoverage > 1) {
        throw new Error(`Invalid tokenCoverage: ${result.tokenCoverage}`)
      }
    }

    return true
  }

  /**
   * Less 变量转 CSS 变量
   * @color-primary → --color-primary（保留 kebab-case，CSS 自定义属性标准）
   */
  lessToCssVars(lessVars) {
    const cssVars = {}
    for (const [key, value] of Object.entries(lessVars)) {
      if (key === 'comment') continue
      const cssKey = key.startsWith('@') ? '--' + key.slice(1) : '--' + key
      cssVars[cssKey] = value
    }
    return cssVars
  }

  /**
   *  从 layoutStructure 对象中递归收集所有元素到扁平数组
   * 兼容多种格式：flat 格式（content.children）、schema 格式（layout.sections[].body.children/items）
   * 以及 VP 后处理新增的 row/group 嵌套结构。
   *
   * @param {Object} structure - layoutStructure 对象
   * @returns {Array} 扁平化的元素数组
   */
  _collectElementsFromStructure(structure) {
    const elements = []

    const walk = (node) => {
      if (!node || typeof node !== 'object') return

      // 如果是数组，逐个处理
      if (Array.isArray(node)) {
        for (const item of node) walk(item)
        return
      }

      // 如果节点本身有 type/role/style 等元素特征，加入收集列表
      // 但排除纯容器节点（sections、body、header 等）——它们的子元素才需要收集
      // 特例：容器节点如果携带 backgroundImage.src 或 background.resourceFile 也需要收集（内容区背景图）
      const isElementLike = node.type || node.role || node.style || node.text || node.resourceFile || node.icon
      const hasBgImage = node.backgroundImage && node.backgroundImage.src
      const hasBgObject = node.background && (node.background.resourceFile || node.background.src)
      const isContainer = /^(section|body|header|content|layout|slot-con|slot-header)$/i.test(node.type || node.role || '')

      if ((isElementLike && !isContainer) || hasBgImage || hasBgObject) {
        elements.push(node)
      }

      // 递归子节点
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) walk(child)
      }
      if (node.items && Array.isArray(node.items)) {
        for (const item of node.items) walk(item)
      }
      if (node.elements && Array.isArray(node.elements)) {
        for (const el of node.elements) walk(el)
      }
      if (node.controls && Array.isArray(node.controls)) {
        for (const ctrl of node.controls) walk(ctrl)
      }

      // 处理嵌套对象
      if (node.body && typeof node.body === 'object' && !Array.isArray(node.body)) {
        walk(node.body)
      }
      if (node.header && typeof node.header === 'object' && !Array.isArray(node.header)) {
        walk(node.header)
      }
      if (node.content && typeof node.content === 'object' && !Array.isArray(node.content)) {
        walk(node.content)
      }

      // sections 数组
      if (node.sections && Array.isArray(node.sections)) {
        for (const section of node.sections) walk(section)
      }
      // layout 对象
      if (node.layout && typeof node.layout === 'object' && !Array.isArray(node.layout)) {
        walk(node.layout)
      }
    }

    walk(structure)

    logger.info('✅ layoutStructure 元素收集完成', { collectedCount: elements.length })

    return elements
  }

  /**
   *  从 elements[] 程序化提取 per-element 样式 → CSS 属性映射
   * 无需 LLM 调用，纯程序化转换。
   *
   * @param {Array|Object} elements - preview-analysis.json 的 elements 数组，或 layoutStructure 对象
   * @param {string} backgroundBrightness - "dark" 或 "light"
   * @param {string} pathPrefix - 路径前缀，用于生成稳定的 element key
   * @returns {Object} elementStyleMap: { elementId → { cssProperty: value } }
   */
  _extractElementStyles(elements, backgroundBrightness = 'dark', pathPrefix = 'el') {
    // 支持直接传入完整 layoutStructure 对象，自动收集所有子元素
    if (elements && typeof elements === 'object' && !Array.isArray(elements)) {
      const collected = this._collectElementsFromStructure(elements)
      return this._extractElementStyles(collected, backgroundBrightness, pathPrefix)
    }
    if (!elements || !Array.isArray(elements)) return {}

    const elementStyleMap = {}

    // JSON style 字段名 → CSS 属性名 映射
    const jsonToCss = {
      fontSize: 'font-size',
      fontWeight: 'font-weight',
      color: 'color',
      lineHeight: 'line-height',
      letterSpacing: 'letter-spacing',
      textAlign: 'text-align',
      width: 'width',
      height: 'height',
      padding: 'padding',
      gap: 'gap',
      margin: 'margin',
      background: 'background',
      backgroundColor: 'background-color',
      borderRadius: 'border-radius',
      boxShadow: 'box-shadow',
      opacity: 'opacity',
      objectFit: 'object-fit',
      overflow: 'overflow',
      border: 'border',
      position: 'position',
      backgroundSize: 'background-size',
      backgroundPosition: 'background-position',
      backgroundRepeat: 'background-repeat',
    }

    // layout 字段 → CSS flex 属性映射
    const layoutToCss = {
      horizontal: { display: 'flex', 'flex-direction': 'row' },
      vertical: { display: 'flex', 'flex-direction': 'column' },
      row: { display: 'flex', 'flex-direction': 'row' },
      column: { display: 'flex', 'flex-direction': 'column' },
    }

    // alignItems / justifyContent 直接映射
    const alignToCss = {
      center: 'center',
      'flex-start': 'flex-start',
      'flex-end': 'flex-end',
      'space-between': 'space-between',
      'space-around': 'space-around',
    }

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!el || typeof el !== 'object') continue

      // 生成稳定 key：优先使用 id，否则用 type+text+索引
      const elKey = el.id || `${pathPrefix}-${el.type || 'el'}-${(el.text || el.name || 'x').toString().replace(/\s+/g, '-').slice(0, 16)}-${i}`

      const cssProps = {}

      // 1. 转换 style 字段
      if (el.style && typeof el.style === 'object') {
        for (const [key, value] of Object.entries(el.style)) {
          const cssKey = jsonToCss[key]
          if (cssKey && value) {
            // ✅ 核心：直接使用 JSON 里的明确值，不做任何替换
            cssProps[cssKey] = value
          }
        }
      }

      // 2. 转换 layout 字段 → flex 属性
      if (el.layout && layoutToCss[el.layout]) {
        for (const [k, v] of Object.entries(layoutToCss[el.layout])) {
          cssProps[k] = v
        }
      }

      // 3. 转换 alignItems / justifyContent
      if (el.alignItems && alignToCss[el.alignItems]) {
        cssProps['align-items'] = alignToCss[el.alignItems]
      }
      if (el.justifyContent && alignToCss[el.justifyContent]) {
        cssProps['justify-content'] = alignToCss[el.justifyContent]
      }

      // 4. 资源文件映射（bg/icon/image）
      if (el.resourceFile) {
        const usage = el.recommendedUsage || 'imgSrc'
        if (usage === 'backgroundStyle' || usage === 'backgroundImage') {
          cssProps['background-image'] = `url(${el.resourceFile})`
          if (!cssProps['background-size']) cssProps['background-size'] = 'cover'
          if (!cssProps['background-position']) cssProps['background-position'] = 'center'
          if (!cssProps['background-repeat']) cssProps['background-repeat'] = 'no-repeat'
        }
      }

      // 4.0 background 对象格式（VP 输出的 background.resourceFile + backgroundSize/backgroundPosition/backgroundRepeat）
      if (el.background && (el.background.resourceFile || el.background.src)) {
        const bgSrc = el.background.resourceFile || el.background.src
        cssProps['background-image'] = `url(${bgSrc})`
        // 从 background 对象中读取精确计算值，fallback 到 cover/center/no-repeat
        cssProps['background-size'] = el.background.backgroundSize || 'cover'
        cssProps['background-position'] = el.background.backgroundPosition || 'center'
        cssProps['background-repeat'] = el.background.backgroundRepeat || 'no-repeat'
      }

      // 4.1 内容区背景图（backgroundImage.src 形式）
      if (el.backgroundImage && el.backgroundImage.src) {
        cssProps['background-image'] = `url(${el.backgroundImage.src})`
        // 从元素上读取精确计算值，fallback 到 cover/center/no-repeat
        if (!cssProps['background-size']) cssProps['background-size'] = el.backgroundSize || 'cover'
        if (!cssProps['background-position']) cssProps['background-position'] = el.backgroundPosition || 'center'
        if (!cssProps['background-repeat']) cssProps['background-repeat'] = el.backgroundRepeat || 'no-repeat'
      }

      // 5. 递归处理 children
      if (el.children && Array.isArray(el.children)) {
        const childStyles = this._extractElementStyles(el.children, backgroundBrightness, elKey)
        for (const [childId, childProps] of Object.entries(childStyles)) {
          elementStyleMap[childId] = childProps
        }
      }

      if (Object.keys(cssProps).length > 0) {
        elementStyleMap[elKey] = cssProps
      }
    }

    logger.info('✅ per-element 样式提取完成', {
      elementsProcessed: elements.length,
      styleEntries: Object.keys(elementStyleMap).length
    })

    return elementStyleMap
  }

  /**
   * 当 LLM 宏观样式映射解析失败（截断 / JSON 非法）时，从已成功的 per-element 程序化样式提取结果
   * 反向合成一组最小主题变量，避免向下游返回全空 themeVars/lessVariables，进而避免：
   *   写盘门禁因 theme-vars.less 为空 + 模型在 <style> 引用 undefined 变量而 fail-closed。
   *
   * 合成变量命名刻意对齐 microcode-engineer._safeLessVarValue 的常见名集
   * （@text-color / @bg / @primary / @border / @border-radius-base / @font-size-base / @gap），
   * 保证若代码生成模型引用这些主题变量名，能解析到来自设计稿的真实 Figma 值，而非中性默认值。
   *
   * @param {Object} elementStyleMap - _extractElementStyles 输出的 { elementId → { cssProperty: value } }
   * @param {string} backgroundBrightness - "dark" | "light"
   * @returns {Object} { themeVars, lessVariables }
   */
  _synthesizeThemeVarsFromElementStyles(elementStyleMap, backgroundBrightness = 'dark') {
    if (!elementStyleMap || typeof elementStyleMap !== 'object') {
      return { themeVars: {}, lessVariables: {} }
    }

    const colors = []
    const backgrounds = []
    const radii = []
    const fontSizes = []
    const gaps = []
    const paddings = []

    const pushBackground = (val) => {
      if (!val) return
      const s = String(val)
      if (s.includes('url(')) return // 纯色/渐变背景才参与归纳，url() 跳过
      backgrounds.push(s)
    }

    for (const props of Object.values(elementStyleMap)) {
      if (!props || typeof props !== 'object') continue
      if (props.color) colors.push(String(props.color))
      if (props['background-color']) pushBackground(props['background-color'])
      if (props.background) pushBackground(props.background)
      if (props['border-radius']) radii.push(String(props['border-radius']))
      if (props['font-size']) fontSizes.push(String(props['font-size']))
      if (props.gap) gaps.push(String(props.gap))
      if (props.padding) paddings.push(String(props.padding))
    }

    const pickMostFrequent = (arr) => {
      if (!arr.length) return null
      const freq = new Map()
      let best = arr[0], bestN = 0
      for (const v of arr) {
        const n = (freq.get(v) || 0) + 1
        freq.set(v, n)
        if (n > bestN) { bestN = n; best = v }
      }
      return best
    }

    const isDark = backgroundBrightness === 'dark'

    // 文字色：深色面板强制白色系；浅色面板用收集到的颜色众数，否则中性深灰
    const textColor = isDark
      ? 'rgba(255, 255, 255, 0.9)'
      : (pickMostFrequent(colors) || '#333333')
    // 背景色：收集到的背景众数，否则按明暗给默认
    const bgColor = pickMostFrequent(backgrounds) || (isDark ? '#0f0f0f' : '#ffffff')
    // 主色/强调色：颜色众数（常见于图标/强调文字），否则按明暗给品牌蓝
    const primaryColor = pickMostFrequent(colors) || (isDark ? '#409EFF' : '#1677ff')
    // 边框色：深色面板用半透明白，浅色用半透明黑
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
    const radius = pickMostFrequent(radii) || '8px'
    const fontSize = pickMostFrequent(fontSizes) || '14px'
    const gap = pickMostFrequent(gaps) || pickMostFrequent(paddings) || '12px'

    const lessVariables = {
      '@text-color': textColor,
      '@bg': bgColor,
      '@primary': primaryColor,
      '@border': borderColor,
      '@border-radius-base': radius,
      '@font-size-base': fontSize,
      '@gap': gap,
    }
    const themeVars = {}
    for (const [k, v] of Object.entries(lessVariables)) {
      themeVars['--' + k.slice(1)] = v
    }

    return { themeVars, lessVariables }
  }

  /**
   *  修正深色面板的主题变量默认值
   * 当 backgroundBrightness=dark 时，确保颜色变量默认值是深色面板适用的（白字等）
   *
   * @param {Object} mappingResult - LLM 输出的样式映射结果
   * @param {string} backgroundBrightness - "dark" 或 "light"
   * @returns {Object} 修正后的 mappingResult
   */
  _fixThemeDefaultsForBrightness(mappingResult, backgroundBrightness) {
    if (backgroundBrightness !== 'dark') return mappingResult

    // 深色面板：检测浅色文字变量被错误赋了深色默认值
    const darkFixes = {
      // 浅色变量名 → 深色默认值
      '@color-stat-label': 'rgba(255, 255, 255, 0.8)',
      '@color-stat-value': 'rgba(255, 255, 255, 1)',
      '@color-text-base': 'rgba(255, 255, 255, 1)',
      '@color-text-secondary': 'rgba(255, 255, 255, 0.8)',
      '@color-text': 'rgba(255, 255, 255, 1)',
    }

    if (mappingResult.lessVariables) {
      for (const [varName, darkValue] of Object.entries(darkFixes)) {
        // 如果变量存在但值是深色文字（黑字），修正为浅色文字（白字）
        const currentValue = mappingResult.lessVariables[varName]
        if (currentValue && this._isDarkTextColor(currentValue)) {
          logger.warn(`深色面板主题变量修正: ${varName} ${currentValue} → ${darkValue}`)
          mappingResult.lessVariables[varName] = darkValue
        }
      }
    }

    if (mappingResult.themeVars) {
      for (const [varName, darkValue] of Object.entries(darkFixes)) {
        const cssVarName = '--' + varName.slice(1) // @color-stat-label → --color-stat-label
        const currentValue = mappingResult.themeVars[cssVarName]
        if (currentValue && this._isDarkTextColor(currentValue)) {
          mappingResult.themeVars[cssVarName] = darkValue
        }
      }
    }

    return mappingResult
  }

  /**
   * 判断一个颜色值是否是"深色文字"（黑/深灰）
   * 深色面板中不应该出现深色文字作为默认值
   */
  _isDarkTextColor(colorValue) {
    if (!colorValue) return false
    // rgba(0,0,0,...) 或 rgba(深灰,...) → 深色文字
    const rgbaMatch = colorValue.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1])
      const g = parseInt(rgbaMatch[2])
      const b = parseInt(rgbaMatch[3])
      // RGB 都 < 100 → 深色
      return r < 100 && g < 100 && b < 100
    }
    // #000000, #1a1a2e 等 → 深色
    const hexMatch = colorValue.match(/^#([0-9a-fA-F]{6})/)
    if (hexMatch) {
      const hex = hexMatch[1]
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return r < 100 && g < 100 && b < 100
    }
    return false
  }

  /**
   * 执行完整的样式映射流程
   */
  async execute(params) {
    const {
      visualElements,
      figmaStyles = null,
      elements = null,
      backgroundBrightness = 'dark',
      onProgress = null,
      signal = null,
      requestConcurrency,
      requestTimeoutMs,
      requestMaxRetries,
    } = params

    logger.info('开始执行样式映射', {
      hasElements: !!elements,
      elementType: Array.isArray(elements) ? 'array' : typeof elements === 'object' ? 'layoutStructure' : 'null',
      elementCount: Array.isArray(elements) ? elements.length : Object.keys(elements || {}).length,
      backgroundBrightness
    })

    try {
      // 1. 宏观样式映射（LLM）
      const mappingResult = await this.map(visualElements, figmaStyles, {
        onProgress,
        signal,
        requestConcurrency,
        requestTimeoutMs,
        requestMaxRetries,
      })

      // 2.per-element 样式提取（程序化，无需 LLM）
      const elementStyleMap = elements
        ? this._extractElementStyles(elements, backgroundBrightness)
        : {}

      // 2.1 截断回退：LLM 宏观样式映射失败（解析/截断/JSON 非法）时 map() 会返回全空兜底，
      //     此时若 per-element 程序化提取成功，用其真实 Figma 值反合成最小主题变量，
      //     避免下游 theme-vars.less 为空 + 模型引用 undefined 变量导致写盘门禁 fail-closed。
      const macroThemeEmpty = !mappingResult.themeVars || !Object.keys(mappingResult.themeVars).length
      const macroLessEmpty = !mappingResult.lessVariables || !Object.keys(mappingResult.lessVariables).length
      if (macroThemeEmpty && macroLessEmpty && Object.keys(elementStyleMap).length > 0) {
        const synthesized = this._synthesizeThemeVarsFromElementStyles(elementStyleMap, backgroundBrightness)
        logger.warn('⚠️ style-mapper 宏观映射为空（截断/解析失败），已从 per-element 真值合成最小主题变量兜底', {
          themeVarsCount: Object.keys(synthesized.themeVars).length,
          lessVarsCount: Object.keys(synthesized.lessVariables).length
        })
        mappingResult.themeVars = synthesized.themeVars
        mappingResult.lessVariables = synthesized.lessVariables
        if (typeof mappingResult.tokenCoverage !== 'number' || mappingResult.tokenCoverage === 0) {
          mappingResult.tokenCoverage = 0.6
        }
        mappingResult.synthesizedFallback = true
      }

      // 3.深色面板主题变量修正
      const fixedResult = this._fixThemeDefaultsForBrightness(mappingResult, backgroundBrightness)

      // 4. 合并输出
      fixedResult.elementStyleMap = elementStyleMap

      logger.info('✅ 样式映射完成（含 per-element）', {
        themeVarsCount: Object.keys(fixedResult.themeVars || {}).length,
        elementStyleCount: Object.keys(elementStyleMap).length,
        tokenCoverage: fixedResult.tokenCoverage
      })

      return fixedResult

    } catch (error) {
      logger.error('样式映射执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析输出（BaseAgent要求实现）
   */
  parseOutput(rawOutput) {
    return this.parseMappingResult(rawOutput)
  }
}

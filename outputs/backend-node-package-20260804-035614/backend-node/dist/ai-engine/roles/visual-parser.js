/**
 * Visual Parser - 视觉解析师
 * 职责：分析设计稿，提取结构化布局和视觉信息
 * 使用：Vision AI (通义千问或Claude Vision)
 * 
 * v3.0 升级：prompt 模块化按需加载（从 5KB 内嵌→~20KB 模块化）
 */

import { VisionAgent } from '../agents/vision-agent.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { robustJSONParse } from '../utils/json-parser.js'

const logger = createLogger({ name: 'visual-parser' })

export class VisualParser {
  constructor(config = {}) {
    this.visionAgent = config.visionAgent || new VisionAgent(config)

    // 修复：向上逐级查找含 references/prompts/preview-analysis 的项目根目录。
    // 该模块在开发态从 backend/src/ai-engine/roles/ 运行、生产态从 backend/dist/ai-engine/roles/ 运行，
    // 到项目根 langgraph-server/（references/ 所在处）的层级不固定（src 与 dist 都是上溯 5 级），
    // 旧写法固定上溯 3 级 → 解析到 backend/dist/ → references 全部 ENOENT，prompt 退化。改用向上探测更健壮。
    const projectRoot = VisualParser._resolveProjectRoot(dirname(fileURLToPath(import.meta.url)))
    this.schemaPath = config.schemaPath || join(projectRoot, 'references/schemas/preview-analysis-schema.md')

    // 加载schema规范
    this.schema = this.loadSchema()

    // 🆕 v3.0: Prompt 模块基础路径
    this.promptBaseDir = join(projectRoot, 'references/prompts/preview-analysis')
    this.guidesBaseDir = join(projectRoot, 'references/guides')

    logger.info('Visual Parser 已初始化 (v3.0 模块化模式)')
  }

  /**
   * 向上逐级查找包含 references/prompts/preview-analysis 的目录（项目根）。
   * 兼容从 backend/src 或 backend/dist 运行；找不到时回退到旧的上溯 3 级行为。
   */
  static _resolveProjectRoot(startDir) {
    let dir = startDir
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, 'references', 'prompts', 'preview-analysis'))) {
        return dir
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // 回退：旧行为（上溯 3 级）
    return join(startDir, '../../')
  }

  /**
   * 🆕 v3.0: 加载单个模块文件
   */
  loadModule(relativePath) {
    try {
      const fullPath = join(this.promptBaseDir || '', relativePath)
      return readFileSync(fullPath, 'utf-8')
    } catch (error) {
      logger.warn(`加载模块失败: ${relativePath}`, { error: error.message })
      return null
    }
  }

  /**
   * 🆕 v3.0: 构建分析提示词 — 模块化按需加载 + Figma 数据交叉验证
   * @param {Object|string} context - 组件上下文，或旧调用的 stage 字符串
   * @param {string} context.componentName - 组件名称
   * @param {boolean} context.hasCharts - 是否包含图表
   * @param {boolean} context.hasComplexBg - 背景是否复杂（渐变/图片等）
   * @param {string} context.retryGuidance - 重试指导（L0 重试时传入）
   * @param {Object} context.figmaData - Figma 节点数据（用于交叉验证）
   */
  buildPrompt(context = {}) {
    // 兼容旧调用方式：buildPrompt('preview') 或 buildPrompt('preview', contextObj)
    if (typeof context === 'string') {
      context = arguments[1] || {}
    }

    const { componentName = '', hasCharts = false, hasComplexBg = false, retryGuidance = null, figmaData = null, resourceDomMapping = null } = context

    // ===== 必选模块（每次都加载）=====
    const requiredModules = [
      { name: 'complete-example', path: 'complete-example.md' },  // 🔥 最优先：强制示例
      { name: 'base', path: 'base.md' },
      { name: 'detailed-structure-example', path: 'detailed-structure-example.md' },  // 🆕 v2.0: 详细元素级结构
      { name: 'layout-analysis-workflow', path: 'layout-analysis-workflow.md' },
      { name: 'ui-element-checklist', path: 'ui-element-checklist.md' },
      { name: 'figma-css-style-mapping', path: 'figma-css-style-mapping.md' },  // 🆕 v3.1: 样式映射清单（per-element 必检属性）
      { name: 'mixed-layout-examples', path: 'mixed-layout-examples.md' },      // 🆕 v3.1: 混合布局与内容区背景识别示例
      { name: 'self-checklist', path: 'self-checklist.md' },
      { name: 'do-not-invent', path: 'do-not-invent.md' },
      { name: 'header-relation-rules', path: 'header-relation-rules.md' },
    ]

    // ===== 条件模块（按需加载）=====
    const optionalModules = []

    if (hasComplexBg) {
      optionalModules.push({ name: 'background-brightness', path: 'background-brightness.md' })
    }

    if (hasCharts) {
      optionalModules.push(
        { name: 'legend-detection', path: join(this.guidesBaseDir, 'legend-detection.md'), external: true },
        { name: 'axes-structure', path: join(this.guidesBaseDir, 'axes-structure.md'), external: true }
      )
    }

    // 始终加载通用错误案例（轻量提醒）
    optionalModules.push({ name: 'common-errors', path: join(this.guidesBaseDir, 'common-errors.md'), external: true })

    // ===== 加载所有模块内容 =====
    let modulesContent = ''

    logger.info('📦 开始加载 prompt 模块', {
      requiredCount: requiredModules.length,
      modules: requiredModules.map(m => m.name),
      hasFigmaData: !!figmaData
    })

    for (const mod of requiredModules) {
      const content = !mod.external
        ? this.loadModule(mod.path)
        : this.loadExternalModule(mod.path)
      if (content) {
        modulesContent += `\n\n---\n\n<!-- module: ${mod.name} -->\n${content}`
      }
    }

    for (const mod of optionalModules) {
      const content = !mod.external
        ? this.loadModule(mod.path)
        : this.loadExternalModule(mod.path)
      if (content) {
        modulesContent += `\n\n---\n\n<!-- module(optional): ${mod.name} -->\n${content}`
      }
    }

    // ===== 🆕 Figma 数据交叉验证提示 =====
    let figmaContextSection = ''
    if (figmaData) {
      const figmaHints = this.extractFigmaHints(figmaData, 4, 0, resourceDomMapping)
      if (figmaHints) {
        figmaContextSection = `

---

## 📐 Figma 结构参考（交叉验证用）

以下是从 Figma 设计稿提取的结构化数据。请结合预览图进行交叉验证：
- **section 名称**应与 Figma 节点名称对应
- **文字内容**（label/value）应参考 Figma 中的文本节点
- **布局方向**应与 Figma 子节点的排列方式一致
- **颜色值**应参考 Figma 中的填充色
- **图标和背景**如果标注了 📎 资源文件，必须在对应位置使用该资源（img/:src 或 backgroundImage），不要用内联SVG/CSS渐变替代

${figmaHints}
`
      }
    }

    // 🆕 resourceDomMapping 专属提示（即使没有 figmaData 也需要注入）
    let resourceSection = ''
    if (resourceDomMapping && resourceDomMapping.length > 0) {
    // 🆕 v2.2: CSS 替代资源也视为可用（downloadStatus='css'）
    const available = resourceDomMapping.filter(m => m.downloadStatus === 'success' || m.downloadStatus === 'css')
      if (available.length > 0) {
        resourceSection = `

---

## 🎨 已下载资源清单（必须使用，禁止替代）

以下资源已成功下载，在输出 JSON 中遇到对应位置时，**必须使用 resourceFile 字段引用实际资源路径**，禁止使用 placeholder + CSS/SVG 替代。

${available.map(m => {
  if (m.downloadStatus === 'css' && m.cssValue) {
    return `- **${m.previewAnalysisRole}**: ${m.hint} → ⚡ CSS: \`background: ${m.cssValue}\` (无需图片)`
  }
  return `- **${m.previewAnalysisRole}**: ${m.hint} → 📎 ${m.resourceFile} (变量: ${m.semanticVarName || 'N/A'}, 用法: ${m.recommendedUsage || 'N/A'})`
}).join('\n')}

⚠️ 输出规范：对 icon/bg/image 类元素，优先输出 "resourceFile" 和 "recommendedUsage" 字段，而非 "placeholder"。
⚡ CSS 替代资源（标记为 CSS: background: ...）不要输出 resourceFile，直接在样式中使用 CSS 值。

### 头部插槽识别（面板组件专用）

如果检测到面板标题栏区域有交互控件或附加信息，请输出 "headerSlots" 数组，将它们映射到 base-panel 的具名插槽：

- **#title-left**: 标题栏左侧（装饰图标、状态标识、小icon）
- **#title-right**: 标题右侧紧邻（副标题、更新时间、单位标注）
- **#header-right**: 标题右侧靠右（统计指标、Tab切换按钮、图标操作按钮）
- **#close**: 最右侧关闭按钮（通常由面板默认提供，不需要输出）

每个元素格式：{ "slotType": "title-left/title-right/header-right", "elementType": "icon/tab/statistic/label", "content": "具体内容", "figmaNodeId": "节点ID（如有）" }

⚠️ **注释过滤（CRITICAL）**：以下文本节点属于设计师注释/标注，**不应**识别为UI内容或插槽元素：
- 以 \`*\` 或 \`#\` 开头的文本（如 \`*XXX\`、\`#XXX\` 形式的标注）
- 包含 TODO / FIXME / 注 / 标注 / 备注 的文本
- 字号小于 10px 且内容少于 10 个字符的文本节点
- 纯重复符号（如 *** / --- / ===）
`
      }
    }

    // ===== 构建最终提示词 =====
    const analysisTask = retryGuidance
      ? `\n\n${retryGuidance}\n\n请根据上述校验问题修正后重新输出 JSON 结果。`
      : `

---

## 分析任务

请分析以下微码组件的预览图：

- **组件名称**: ${componentName}

请严格按照上述规范输出 JSON 格式的 preview-analysis 结果。`

    return `${modulesContent}
${figmaContextSection}
${resourceSection}

# 输出规范（Schema 引用）

${this.schema}
${analysisTask}`
  }

  /**
   * 🆕 从 Figma 节点树提取紧凑的结构摘要，用于注入 Vision AI 的 prompt
   * 只提取对视觉分析有用的字段：名称、类型、文本内容、尺寸、颜色、布局方向
   * 控制递归深度避免 prompt 过大
   * @param {Object} node - Figma 节点数据（经 pruneRedundantFields 优化后）
   * @param {number} maxDepth - 最大递归深度
   * @param {number} currentDepth - 当前深度
   * @returns {string} 缩进树形结构的文本摘要
   */
  extractFigmaHints(node, maxDepth = 4, currentDepth = 0, resourceDomMapping = null) {
    if (!node || typeof node !== 'object' || currentDepth >= maxDepth) return ''

    const parts = []
    const indent = '  '.repeat(currentDepth)

    // 节点名称和类型
    const name = node.name || ''
    const type = node.type || ''
    const label = name || type

    // 跳过无意义的节点（空 FRAME、无名称的 VECTOR 等）
    if (!label && !node.characters) return ''

    // 🆕 查找该节点在 resourceDomMapping 中是否有对应资源
    let resourceAnnotation = ''
    if (resourceDomMapping && resourceDomMapping.length > 0) {
      const nodeId = node.id || ''
      // 匹配策略：1. figmaNodeId 精确匹配 → 2. 名称包含
      const matchedMapping = resourceDomMapping.find(m =>
        m.figmaNodeId === nodeId ||
        (name && (m.hint?.includes(name) || m.targetDomSelector?.includes(name)))
      )
      if (matchedMapping && (matchedMapping.downloadStatus === 'success' || matchedMapping.downloadStatus === 'css')) {
        if (matchedMapping.downloadStatus === 'css' && matchedMapping.cssValue) {
          resourceAnnotation = ` → ⚡ CSS: \`background: ${matchedMapping.cssValue}\` (无需图片)`
        } else {
          const varName = matchedMapping.semanticVarName || '?'
          const usage = matchedMapping.recommendedUsage || '?'
          resourceAnnotation = ` → 📎 ${matchedMapping.resourceFile} (变量: ${varName}, 用法: ${usage})`
        }
      } else if (matchedMapping && matchedMapping.downloadStatus !== 'success' && matchedMapping.downloadStatus !== 'css') {
        resourceAnnotation = ` → ⛔ 下载失败(${matchedMapping.fallbackHint || 'CSS替代'})`
      }
    }

    // 尺寸信息
    const bb = node.absoluteBoundingBox
    const sizeStr = bb ? ` ${Math.round(bb.width)}x${Math.round(bb.height)}` : ''

    // 文本内容
    const textStr = node.characters ? ` text="${node.characters.substring(0, 50)}"` : ''

    // 填充颜色
    let colorStr = ''
    if (node.fills && node.fills.length > 0) {
      const colors = node.fills
        .filter(f => f.visible !== false && f.color)
        .map(f => {
          const c = f.color
          return `rgba(${Math.round((c.r || 0) * 255)},${Math.round((c.g || 0) * 255)},${Math.round((c.b || 0) * 255)},${c.a !== undefined ? c.a : 1})`
        })
      if (colors.length > 0) colorStr = ` color=[${colors.join(';')}]`

      // 渐变信息
      const gradients = node.fills.filter(f => f.visible !== false && f.gradientStops)
      if (gradients.length > 0) colorStr += ' [has-gradient]'
    }

    parts.push(`${indent}- ${label}${sizeStr}${textStr}${colorStr}${resourceAnnotation}`)

    // 子节点布局方向推断
    if (node.children && node.children.length > 1) {
      const first = node.children[0]
      const second = node.children[1]
      const fbb = first?.absoluteBoundingBox
      const sbb = second?.absoluteBoundingBox
      if (fbb && sbb) {
        const dy = Math.abs(sbb.y - fbb.y)
        const dx = sbb.x - fbb.x
        if (dy < 5 && dx > 5) {
          parts.push(`${indent}  [layout: horizontal, ${node.children.length} children]`)
        } else if (Math.abs(dx) < 5 && sbb.y > fbb.y) {
          parts.push(`${indent}  [layout: vertical, ${node.children.length} children]`)
        }
      }
    }

    // 递归子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const childHint = this.extractFigmaHints(child, maxDepth, currentDepth + 1, resourceDomMapping)
        if (childHint) parts.push(childHint)
      }
    }

    return parts.join('\n')
  }

  /**
   * 🆕 v3.0: 加载外部模块（guides 目录下的文件）
   */
  loadExternalModule(relativePath) {
    try {
      return readFileSync(relativePath, 'utf-8')
    } catch (error) {
      logger.warn(`加载外部模块失败: ${relativePath}`, { error: error.message })
      return null
    }
  }

  /**
   * 加载schema规范
   */
  loadSchema() {
    try {
      const schemaContent = readFileSync(this.schemaPath, 'utf-8')
      return schemaContent
    } catch (error) {
      logger.warn('未能加载schema规范', { error: error.message })
      return ''
    }
  }

  /**
   * 分析预览图
   * @param {string} imagePath - 预览图路径
   * @param {Object|null} figmaData - Figma 节点数据（用于交叉验证提示词）
   * @param {Array|null} resourceDomMapping - 资源映射
   * @param {string|null} outputPath - 组件输出目录（用于写入调试文件到 .mc-gen/cache/）
   */
  async analyze(imagePath, figmaData = null, resourceDomMapping = null, outputPath = null, requestOptions = {}) {
    try {
      // 1. 构建提示词（传入 figmaData 和 resourceDomMapping 用于交叉验证）
      const prompt = this.buildPrompt({ figmaData, resourceDomMapping })

      // 🔍 诊断：保存 prompt 到 .mc-gen/cache/ 目录（而非 resources/images/）
      const debugDir = outputPath
        ? join(outputPath, '.mc-gen/cache')
        : join(dirname(dirname(dirname(imagePath))), '.mc-gen/cache')
      mkdirSync(debugDir, { recursive: true })
      const promptPath = join(debugDir, 'debug-prompt.txt')
      writeFileSync(promptPath, prompt, 'utf-8')
      logger.info('🔍 [诊断] Prompt 已保存', { path: promptPath, size: prompt.length })

      // 2. 调用Vision AI分析图片
      let rawResult = await this.visionAgent.analyzeImage(imagePath, prompt, requestOptions)

      // 🔧 v3.7: 防御 - 归一化 vision-agent 返回值（防止 API 返回数组或对象）
      // coerceLLMText 已处理 string / Array<ContentBlock> / { content } 等格式
      if (typeof rawResult !== 'string') {
        logger.warn('⚠️ vision-agent 返回非字符串类型，尝试归一化', { type: typeof rawResult, isArray: Array.isArray(rawResult) })
        rawResult = typeof rawResult === 'object' ? JSON.stringify(rawResult, null, 2) : String(rawResult)
      }

      // 🔍 诊断：保存 AI 响应到 .mc-gen/cache/ 目录
      const responsePath = join(debugDir, 'debug-ai-response.txt')
      writeFileSync(responsePath, rawResult, 'utf-8')
      logger.info('🔍 [诊断] AI 响应已保存', { path: responsePath, size: rawResult.length })

      // 3. 解析结果
      const parsed = this.parseAnalysisResult(rawResult)

      // 4. 验证结果
      this.validateResult(parsed)

      // 🆕 v3.8: 质量门 — 检测"解析成功但内容全空"的静默降级
      this._qualityGate(parsed, rawResult)

      // 🆕 v3.1: 确定性后处理（修正 LLM 常见布局错误）
      this._postProcessAnalysis(parsed, figmaData, resourceDomMapping)

      // 🆕 v3.7: 元素覆盖率报告（Figma节点 vs Vision识别，交叉校验）
      if (figmaData) {
        parsed.coverageReport = this._generateCoverageReport(parsed, figmaData)
        // 🆕 v3.7: 从 Figma 节点提取图表数据值（供 engineer 生成真实数据）
        if (parsed.charts && parsed.charts.length > 0) {
          parsed.chartDataHints = this._extractChartDataFromFigma(figmaData, parsed.charts)
        }
      }

      logger.info('✅ 预览图分析完成')

      // 详细记录分析结果摘要
      const summary = {
        backgroundBrightness: parsed.backgroundBrightness || 'unknown',
        sectionsCount: parsed.layoutStructure?.sections?.length || 0,
        visualElementsCount: Object.keys(parsed.visualElements || {}).length,
        chartsCount: parsed.charts?.length || 0,
        interactionsCount: parsed.interactions?.length || 0
      }

      logger.info('📊 分析结果摘要', summary)

      // 详细记录布局结构
      if (parsed.layoutStructure?.sections) {
        logger.info('🏗️ 布局结构详情', {
          sections: parsed.layoutStructure.sections.map((s, i) => ({
            index: i + 1,
            type: s.header?.type || 'unknown',
            title: s.header?.title || 'N/A',
            bodyElements: s.body?.elements?.length || 0
          }))
        })
      }

      // 详细记录图表信息
      if (parsed.charts && parsed.charts.length > 0) {
        logger.info('📈 检测到的图表', {
          total: parsed.charts.length,
          charts: parsed.charts.map((c, i) => ({
            index: i + 1,
            type: c.type,
            hasLegend: !!c.legendPosition
          }))
        })
      }

      return parsed

    } catch (error) {
      logger.error('预览图分析失败，返回降级结果', { error: error.message })

      // 🛡️ P0 修复：硬失败 → 降级返回最小可用结构，避免整个工作流崩溃
      return {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        degraded: true,
        degradeReason: error.message,
        layout: { type: 'vertical', direction: 'top-to-bottom', sections: [] },
        styles: { theme: '未知', colors: [], background: '', decorations: [], emphasis: [], backgroundBrightness: 'dark' },
        interactions: [],
        charts: []
      }
    }
  }

  /**
   * 解析分析结果
   */
  parseAnalysisResult(rawResult) {
    try {
      // 🆕 使用 robustJSONParse 替代手动5步解析
      // robustJSONParse 内部已处理：markdown提取→直接解析→修复链→部分提取→兜底
      let parsed = robustJSONParse(rawResult, {
        _context: 'visual-parser',
        criticalFields: ['layout', 'layoutStructure', 'sections', 'componentType'],
        fallback: null,  // null 表示全部失败时抛异常
        maxRepairAttempts: 2,
        verbose: true
      })

      if (!parsed) {
        throw new Error('robustJSONParse 返回 null，无法继续')
      }

      // 🆕 兜底：如果解析结果为数组（API 返回 [{thinking}, {text}] 格式），提取 text 块重新解析
      if (Array.isArray(parsed)) {
        logger.warn('⚠️ 解析结果为数组格式，尝试提取 text 内容块')
        const textContent = coerceLLMText(parsed)
        if (textContent && textContent.trim()) {
          const reParsed = robustJSONParse(textContent, {
            _context: 'visual-parser-array-extract',
            criticalFields: ['layout', 'layoutStructure', 'sections', 'componentType'],
            fallback: null,
            maxRepairAttempts: 2,
            verbose: true
          })
          if (reParsed && !Array.isArray(reParsed) && (reParsed.layout || reParsed.layoutStructure || reParsed.sections)) {
            logger.info('✅ 从数组格式中成功提取分析结果', {
              extractedKeys: Object.keys(reParsed),
              hasLayout: !!reParsed.layout
            })
            parsed = reParsed
          } else {
            throw new Error('数组格式提取后仍无有效分析数据')
          }
        } else {
          throw new Error('数组格式无法提取 text 内容')
        }
      }

      logger.info('✅ robustJSONParse 解析成功', {
        parsedKeys: Object.keys(parsed),
        hasLayout: !!parsed.layout,
        hasLayoutStructure: !!parsed.layoutStructure,
        hasSections: !!parsed.sections,
        sectionsCount: parsed.layout?.sections?.length || parsed.sections?.length || 0
      })

      // 从 evidence 构建 imageEvidence
      if (parsed.evidence && !parsed.imageEvidence) {
        parsed.imageEvidence = Array.isArray(parsed.evidence)
          ? parsed.evidence
          : [parsed.evidence]
      }

      // 从 dominantBgColor 推断 backgroundBrightness
      if (parsed.dominantBgColor && !parsed.backgroundBrightness) {
        parsed.backgroundBrightness = this.inferBrightness(parsed.dominantBgColor)
      }

      // 添加元数据
      const result = {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        ...parsed
      }

      // 字段名规范化（添加防御性检查）
      logger.debug('解析后的原始字段', { keys: result ? Object.keys(result) : [] })

      logger.info('🔍 [诊断] 解析后的 result.layout 状态', {
        hasLayout: !!result.layout,
        layoutKeys: result.layout ? Object.keys(result.layout) : [],
        hasSections: !!(result.layout && result.layout.sections),
        sectionsLength: result.layout?.sections?.length || 0,
        sectionsPreview: result.layout?.sections ? result.layout.sections.slice(0, 2).map(s => ({
          id: s.id,
          name: s.name,
          childrenCount: s.children?.length || 0
        })) : []
      })

      const normalized = this.normalizeFields(result)
      logger.debug('规范化后的字段', { keys: normalized ? Object.keys(normalized) : [] })

      logger.info('🔍 [诊断] 规范化后的 normalized.layout 状态', {
        hasLayout: !!normalized.layout,
        layoutKeys: normalized.layout ? Object.keys(normalized.layout) : [],
        hasSections: !!(normalized.layout && normalized.layout.sections),
        sectionsLength: normalized.layout?.sections?.length || 0
      })

      return normalized

    } catch (error) {
      logger.error('解析分析结果失败', { error: error.message, rawResultPrefix: String(rawResult).substring(0, 300) })
      throw new Error(`Failed to parse analysis result: ${error.message}`)
    }
  }

  /**
   * 规范化字段名：AI 可能使用不同命名，统一映射到期望的标准字段名
   */
  normalizeFields(parsed) {
    // 🛡️ 防御性检查：确保parsed是有效对象
    if (!parsed || typeof parsed !== 'object') {
      logger.warn('normalizeFields收到无效的parsed参数，使用空对象', { parsed })
      parsed = {}
    }

    let result = { ...parsed }

    // 🔧 处理header/body格式（某些模型返回这种格式而不是sections）
    if (result.header && result.body && !result.layout && !result.sections) {
      logger.info('检测到header/body格式，转换为sections结构')
      result.layout = {
        type: 'vertical',
        direction: 'top-to-bottom',
        sections: [
          {
            type: 'header',
            ...result.header
          },
          {
            type: 'body',
            ...result.body
          }
        ]
      }
    }

    // 🔧 处理visualStyle字段（映射到styles）
    if (result.visualStyle && !result.styles) {
      result.styles = result.visualStyle
    }

    // 布局字段映射：layoutStructure / layout_sections / sections → layout
    if (!result.layout && result.layoutStructure) {
      result.layout = result.layoutStructure
    } else if (!result.layout && result.layout_sections) {
      result.layout = result.layout_sections
    } else if (!result.layout && result.sections) {
      result.layout = result.sections
    }

    // 样式字段映射：visualElements / styleConfig / visual_styles → styles
    if (!result.styles && result.visualElements) {
      result.styles = result.visualElements
    } else if (!result.styles && result.styleConfig) {
      result.styles = result.styleConfig
    } else if (!result.styles && result.visual_styles) {
      result.styles = result.visual_styles
    }

    // 交互字段映射：interactionConfig / interaction → interactions
    if (!result.interactions && result.interactionConfig) {
      result.interactions = result.interactionConfig
    } else if (!result.interactions && result.interaction) {
      result.interactions = Array.isArray(result.interaction) ? result.interaction : [result.interaction]
    }

    // 图表字段映射：chartConfig / chart → charts
    if (!result.charts && result.chartConfig) {
      result.charts = result.chartConfig
    } else if (!result.charts && result.chart) {
      result.charts = Array.isArray(result.chart) ? result.chart : [result.chart]
    }

    // 🔧 从扁平图表数据构建结构化 layout/charts（Qwen 等模型可能返回扁平结构）
    result = this._buildStructureFromFlatChartData(result)

    // 安全默认值：如果 AI 彻底没返回这些字段，设置默认值
    if (!result.layout) {
      logger.warn('AI未返回layout字段，使用空默认值')
      result.layout = { type: 'vertical', direction: 'top-to-bottom', sections: [] }
    }
    if (!result.styles) {
      logger.warn('AI未返回styles字段，使用空默认值')
      result.styles = { theme: '未知', colors: [], background: '', decorations: [], emphasis: [], backgroundBrightness: 'dark' }
    }
    if (!result.interactions) {
      result.interactions = []
    }
    if (!result.charts) {
      result.charts = []
    }

    return result
  }

  /**
   * 从扁平图表数据构建结构化 layout.sections 和 charts 数组
   * Qwen 等模型有时返回 top-level 的 section/type/series 等字段，而不是嵌套在 charts[] 中
   */
  _buildStructureFromFlatChartData(parsed) {
    const result = { ...parsed }

    // 检测是否存在扁平图表数据：顶层有 section、type、series 等字段
    const hasFlatChart = parsed.section && parsed.type && Array.isArray(parsed.series)
    const hasStructuredSections = result.layout?.sections && result.layout.sections.length > 0
    const hasStructuredCharts = Array.isArray(result.charts) && result.charts.length > 0

    if (hasFlatChart && (!hasStructuredSections || !hasStructuredCharts)) {
      logger.info('🔧 检测到扁平图表数据，自动转换为结构化格式', {
        section: parsed.section,
        type: parsed.type,
        seriesCount: parsed.series?.length
      })

      // 1. 构建 charts 数组入口
      const chartEntry = {
        section: parsed.section,
        type: parsed.type,
        series: parsed.series || [],
        legend: parsed.legend || [],
        legendPosition: parsed.legendPosition || '',
        seriesColors: parsed.seriesColors || [],
        legendType: parsed.legendType || 'horizontal',
        axes: parsed.axes || '',
        tooltip: parsed.tooltip || '',
        notes: parsed.notes || []
      }
      if (!hasStructuredCharts) {
        result.charts = [chartEntry]
      }

      // 2. 构建 layout.sections 入口
      const sectionEntry = {
        id: parsed.section || 'chart-section',
        name: (parsed.series && parsed.series[0]) || (parsed.section || '图表区域'),
        role: '常驻',
        layout: 'vertical',
        headerRelation: 'content-below-title',
        slotCandidate: null,
        header: {
          title: (parsed.section || '数据图表').replace(/-/g, ' '),
          controls: []
        },
        body: {
          layout: 'single-chart',
          children: [
            {
              id: `${parsed.section || 'chart'}-area`,
              name: parsed.series?.[0] || '图表',
              role: 'chart',
              chartRef: 0  // 指向 charts[0]
            }
          ]
        }
      }

      if (!hasStructuredSections) {
        if (!result.layout) {
          result.layout = { type: 'vertical', direction: 'top-to-bottom', sections: [] }
        }
        result.layout.sections = [sectionEntry]
      }

      // 3. 清理顶部扁平字段，避免混淆
      const flatChartKeys = ['section', 'series', 'legend', 'legendPosition', 'seriesColors', 'legendType', 'axes', 'tooltip']
      flatChartKeys.forEach(k => { delete result[k] })

      logger.info('✅ 扁平数据 → 结构化转换完成', {
        sectionsCount: result.layout?.sections?.length || 0,
        chartsCount: result.charts?.length || 0
      })
    }

    return result
  }

  /**
   * 从颜色值推断亮度
   */
  inferBrightness(colorStr) {
    try {
      // 支持多种颜色格式：rgba(r,g,b,a), rgb(r,g,b), #hex
      let r, g, b

      if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) {
        const match = colorStr.match(/\d+/g)
        if (match && match.length >= 3) {
          r = parseInt(match[0])
          g = parseInt(match[1])
          b = parseInt(match[2])
        }
      } else if (colorStr.startsWith('#')) {
        const hex = colorStr.substring(1)
        r = parseInt(hex.substring(0, 2), 16)
        g = parseInt(hex.substring(2, 4), 16)
        b = parseInt(hex.substring(4, 6), 16)
      }

      if (r !== undefined && g !== undefined && b !== undefined) {
        // 计算相对亮度（使用感知亮度公式）
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        return luminance > 0.5 ? 'light' : 'dark'
      }

      return 'dark' // 默认返回深色
    } catch (error) {
      logger.warn('推断背景亮度失败', { colorStr, error: error.message })
      return 'dark'
    }
  }

  /**
   * 验证结果
   */
  validateResult(result) {
    // 🛡️ P0 修复：降级结果跳过严格校验
    if (result.degraded) {
      logger.warn('降级结果不经严格校验', { reason: result.degradeReason })
      return true
    }

    // 必填字段检查
    const missingFields = []
    const requiredFields = ['layout', 'styles', 'interactions', 'charts']

    for (const field of requiredFields) {
      if (!result[field]) {
        missingFields.push(field)
        // 🛡️ P0 修复：补上缺失字段的默认值，而不是抛异常
        logger.warn(`Missing required field: ${field}，自动填充默认值`)
      }
    }

    // 自动补全缺失字段
    if (!result.layout) result.layout = { type: 'vertical', direction: 'top-to-bottom', sections: [] }
    if (!result.styles) result.styles = { theme: '未知', colors: [], background: '', decorations: [], emphasis: [], backgroundBrightness: 'dark' }
    if (!result.interactions) result.interactions = []
    if (!result.charts) result.charts = []

    // backgroundBrightness必须是dark或light
    if (result.styles?.backgroundBrightness) {
      const brightness = result.styles.backgroundBrightness
      if (brightness !== 'dark' && brightness !== 'light') {
        logger.warn('backgroundBrightness值不正确，修正为 dark', { value: brightness })
        result.styles.backgroundBrightness = 'dark'
      }
    }

    if (missingFields.length > 0) {
      logger.warn('部分必填字段缺失已自动填充', { missingFields })
    }

    return true
  }

  /**
   * 🆕 v3.8: 质量门 — 检测"解析成功但内容全空"的静默降级
   * 
   * 触发条件：sections=0 且 colors=0 且 interactions=0
   * 如果 rawResult 有显著内容（>1KB），说明是解析失败而非 API 失败
   * 
   * @param {Object} parsed - 解析后的结果
   * @param {string} rawResult - 原始 AI 响应
   */
  _qualityGate(parsed, rawResult) {
    const sectionsCount = parsed.layout?.sections?.length || parsed.sections?.length || 0
    const colorsCount = parsed.styles?.colors?.length || 0
    const interactionsCount = parsed.interactions?.length || 0
    const rawSize = typeof rawResult === 'string' ? rawResult.length : 0

    // 全空检测
    if (sectionsCount === 0 && colorsCount === 0 && interactionsCount === 0) {
      // 如果原始响应有显著内容，说明解析出了问题
      if (rawSize > 1000) {
        logger.error('🚨 [质量门] 检测到静默降级！原始响应有内容但解析结果全空', {
          rawSize,
          sectionsCount,
          colorsCount,
          interactionsCount,
          rawPreview: rawResult.substring(0, 200),
          hint: '请检查 coerceLLMText 是否正确处理了此 API 响应格式'
        })

        // 尝试二次提取：用 coerceLLMText 重新处理
        const reExtracted = coerceLLMText(rawResult)
        if (reExtracted && reExtracted !== rawResult && reExtracted.trim()) {
          logger.warn('🔄 [质量门] 尝试 coerceLLMText 二次提取...', { newSize: reExtracted.length })
          try {
            const reParsed = robustJSONParse(reExtracted, {
              _context: 'visual-parser-quality-gate',
              criticalFields: ['layout', 'layoutStructure', 'sections', 'componentType'],
              fallback: null,
              maxRepairAttempts: 2,
              verbose: true
            })
            if (reParsed && !Array.isArray(reParsed)) {
              const reSections = reParsed.layout?.sections?.length || reParsed.sections?.length || 0
              const reColors = reParsed.styles?.colors?.length || 0
              if (reSections > 0 || reColors > 0) {
                logger.info('✅ [质量门] 二次提取成功，恢复分析数据', { reSections, reColors })
                // 用二次提取的结果替换
                Object.assign(parsed, reParsed)
                parsed._qualityGateRecovered = true
                return
              }
            }
          } catch (e) {
            logger.error('❌ [质量门] 二次提取失败', { error: e.message })
          }
        }

        // 二次提取也失败 → 标记警告
        parsed._parseWarning = '质量门检测到解析结果全空，下游精修可能受限'
        logger.warn('⚠️ [质量门] 二次提取未能恢复数据，标记 _parseWarning 继续执行')
      } else {
        // 原始响应也很小 → 可能是 API 返回了空结果
        logger.warn('⚠️ [质量门] 原始响应较小，可能是 API 返回了空结果', { rawSize })
      }
    } else {
      // 正常情况：记录格式信息，方便排查
      if (rawSize > 0) {
        const formatInfo = this._detectResponseFormat(rawResult)
        if (formatInfo !== 'plain-json') {
          logger.info('📋 [质量门] 响应格式检测', { format: formatInfo, sectionsCount, colorsCount, interactionsCount })
        }
      }
    }
  }

  /**
   * 🆕 v3.8: 检测 AI 响应格式
   */
  _detectResponseFormat(rawResult) {
    if (typeof rawResult !== 'string') return 'non-string'
    const trimmed = rawResult.trim()
    if (trimmed.startsWith('[{') || trimmed.startsWith('[\n  {')) {
      if (trimmed.includes('"type":"thinking"') || trimmed.includes('"type": "thinking"')) {
        return 'stringified-content-blocks'
      }
      return 'json-array'
    }
    if (trimmed.startsWith('{')) return 'plain-json'
    if (trimmed.startsWith('```')) return 'markdown-wrapped'
    return 'unknown'
  }

  /**
   * 仅靠 LLM 容易出现两类顽固错误，这里用程序化规则兜底：
   * 1. 把 icon/label/value 平铺成 vertical 的 stat-item 改为 mixed 嵌套。
   * 2. 为 content 区域补全遗漏的背景图。
   * 3. 当组件使用 base-panel 时，剥离面板外壳（outer bg + header），只保留 slot-con 内容。
   * 4. 基于图/父尺寸比值计算精确的 backgroundSize/backgroundPosition/backgroundRepeat。
   */
  _postProcessAnalysis(parsed, figmaData = null, resourceDomMapping = null) {
    try {
      const layoutFixed = this._normalizeStatItemLayouts(parsed, figmaData, resourceDomMapping)
      const bgFixed = this._enrichContentBackground(parsed, figmaData, resourceDomMapping)
      const chromeStripped = this._stripBasePanelChrome(parsed, figmaData, resourceDomMapping)
      const bgSized = this._calculateAllBackgroundSizing(parsed, resourceDomMapping)
      logger.info('🆕 v3.1 解析后处理完成', { layoutFixed, bgFixed, chromeStripped, bgSized })
    } catch (error) {
      logger.warn('🆕 v3.1 解析后处理失败（非阻塞）', { error: error.message })
    }
  }

  /**
   * 🆕 v3.7: 生成元素覆盖率报告
   * 从 Figma 节点树提取有意义元素 → 与 Vision 分析结果交叉校验
   * 产出: { totalFigma, matched, missing, uncertain, coverageRate }
   */
  _generateCoverageReport(parsed, figmaData) {
    try {
      // 1. 从 Figma 节点树提取有意义的文本/容器元素
      const figmaElements = []
      const FILL_NODE_TYPES = ['TEXT', 'FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'RECTANGLE', 'ELLIPSE', 'VECTOR']
      const SKIP_PATTERNS = [/^\s*$/, /^[*/#].*/, /^[\d.]+(px|%)?$/, /^[.,;:!?，。；：！？\-—]+$/]

      const _traverse = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 6) return
        const name = node.name || ''
        if (name && !SKIP_PATTERNS.some(p => p.test(name)) && FILL_NODE_TYPES.includes(node.type)) {
          figmaElements.push({
            name: name.substring(0, 60),
            type: node.type,
            depth,
            hasText: !!node.characters,
            children: node.children?.length || 0
          })
        }
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            _traverse(child, depth + 1)
          }
        }
      }
      _traverse(figmaData)

      // 2. 从 Vision 分���结果提取已识别元素名（layoutStructure sections + visualElements keys）
      const identifiedNames = new Set()
      const addIdentified = (obj, prefix = '') => {
        if (!obj || typeof obj !== 'object') return
        const names = [obj.name, obj.label, obj.title, obj.type, obj.role].filter(Boolean)
        names.forEach(n => {
          if (typeof n === 'string' && n.length > 1) identifiedNames.add(n.toLowerCase())
        })
        // 递归子节点
        const childFields = ['children', 'sections', 'items', 'elements', 'body', 'header', 'content', 'controls']
        childFields.forEach(f => {
          if (Array.isArray(obj[f])) obj[f].forEach(child => addIdentified(child, prefix))
          else if (obj[f] && typeof obj[f] === 'object') addIdentified(obj[f], prefix)
        })
      }
      if (parsed.layoutStructure) {
        if (Array.isArray(parsed.layoutStructure.sections)) {
          parsed.layoutStructure.sections.forEach(s => addIdentified(s))
        }
        addIdentified(parsed.layoutStructure)
      }
      if (parsed.visualElements) {
        Object.keys(parsed.visualElements).forEach(k => identifiedNames.add(k.toLowerCase()))
      }

      // 3. 交叉比对
      const matched = []
      const missing = []
      const uncertain = []

      for (const elem of figmaElements) {
        const nameLower = elem.name.toLowerCase()
        // 文本节点且长度>2 → 更可能是内容元素
        const isContentElement = elem.type === 'TEXT' && elem.name.length > 2
        const isContainer = ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(elem.type) && elem.children > 0

        // 跳过太浅的根节点和太深的叶子
        if (elem.depth === 0 && elem.children > 10) continue
        if (elem.depth > 5 && !isContentElement) continue

        // 匹配检查
        const isIdentified = Array.from(identifiedNames).some(
          id => id.includes(nameLower) || nameLower.includes(id)
        )

        if (isIdentified) {
          matched.push(elem)
        } else if (isContentElement || isContainer) {
          missing.push(elem)
        } else if (elem.type === 'TEXT') {
          uncertain.push(elem)  // 短文本可能只是装饰/标注
        }
        // 其他类型（纯装饰）忽略
      }

      const totalFigma = figmaElements.length
      const coverageRate = totalFigma > 0
        ? Math.round((matched.length / (matched.length + missing.length)) * 100)
        : 100

      const report = {
        totalFigma,
        matchedCount: matched.length,
        missingCount: missing.length,
        uncertainCount: uncertain.length,
        coverageRate,
        missing: missing.slice(0, 15).map(e => ({ name: e.name, type: e.type, depth: e.depth })),
        uncertain: uncertain.slice(0, 10).map(e => ({ name: e.name, type: e.type })),
        summary: coverageRate >= 90 ? '优秀' : coverageRate >= 75 ? '良好' : coverageRate >= 60 ? '一般' : '需关注'
      }

      logger.info(`📊 元素覆盖率: ${coverageRate}% (${matched.length}/${matched.length + missing.length})`, {
        missing: missing.length,
        uncertain: uncertain.length,
        summary: report.summary
      })

      return report
    } catch (error) {
      logger.warn('生成覆盖率报告失败（非阻塞）', { error: error.message })
      return { totalFigma: 0, matchedCount: 0, missingCount: 0, coverageRate: 100, missing: [], summary: '分析跳过' }
    }
  }

  /**
   * 🆕 v3.7: 从 Figma 节点树提取图表数据值
   * 扫描 chart 区域附近的 TEXT 节点，提取数值/标签供 engineer 生成真实数据
   */
  _extractChartDataFromFigma(figmaData, charts) {
    try {
      const hints = []
      const textNodes = []
      const _collectText = (node, depth = 0) => {
        if (!node || depth > 8) return
        if (node.type === 'TEXT' && node.characters && node.characters.trim()) {
          const bb = node.absoluteBoundingBox || {}
          textNodes.push({ text: node.characters.trim(), name: node.name, x: bb.x || 0, y: bb.y || 0, w: bb.width || 0, depth })
        }
        if (node.children) node.children.forEach(c => _collectText(c, depth + 1))
      }
      _collectText(figmaData)
      if (textNodes.length === 0) return hints

      for (const chart of charts) {
        const labels = [], values = []
        const ck = (chart.title || chart.label || chart.type || '').toLowerCase()
        for (const tn of textNodes) {
          if (!tn.name.toLowerCase().includes(ck) && tn.depth <= 2) continue
          const nm = tn.text.match(/^(\d+\.?\d*)\s*(%|万|亿|人|辆|次|元|个)?$/)
          if (nm) {
            values.push({ label: tn.name, value: parseFloat(nm[1]), unit: nm[2] || '' })
          } else if (tn.text.length < 20 && tn.text.length > 0) {
            labels.push({ label: tn.text, name: tn.name })
          }
        }
        if (labels.length > 0 || values.length > 0) {
          hints.push({ chartTitle: chart.title || chart.label || chart.type, chartType: chart.type, labels: labels.slice(0, 12), values: values.slice(0, 12) })
        }
      }
      if (hints.length > 0) logger.info('📊 Figma图表数据提取', { charts: hints.length, values: hints.reduce((s, h) => s + h.values.length, 0) })
      return hints
    } catch (e) { logger.warn('图表数据提取失败（非阻塞）', { error: e.message }); return [] }
  }

  /**
   * 🆕 v3.2: 剥离 base-panel 面板外壳
   * 当 preview-analysis 把外层面板（bg + header）也识别进 structure 时，
   * 把它们移除：outer bg 由 base-panel 提供，header 转为 top-level headerSlots。
   * 只保留 slot-con / content-list 等真正的业务内容。
   */
  _stripBasePanelChrome(parsed, figmaData = null, resourceDomMapping = null) {
    const structure = parsed?.structure
    if (!structure || typeof structure !== 'object') return 0

    // 启发式：只有 structure 同时存在 root background 和 header child 时才视为面板外壳
    const hasRootBg = structure.background && (structure.background.resourceFile || structure.background.src)
    const children = Array.isArray(structure.children) ? structure.children : []
    const headerIndex = children.findIndex(c => c && /header|panel-header|title-bar/i.test(c.type || c.role || c.className || ''))
    const headerChild = headerIndex >= 0 ? children[headerIndex] : null

    // 也通过 Figma path 交叉验证：存在 slot-con 路径说明是 base-panel 内容区
    const hasSlotConPath = resourceDomMapping?.some(m => /slot-con|slot_con|content-slot/i.test(m.figmaPath || ''))
    const hasHeaderPath = resourceDomMapping?.some(m => /\/header\//i.test(m.figmaPath || ''))
    const figmaSaysPanel = hasSlotConPath && hasHeaderPath

    if (!headerChild || (!hasRootBg && !figmaSaysPanel)) return 0

    // 提取 header 中的装饰性插槽到顶层 headerSlots
    const extractedSlots = this._extractHeaderSlotsFromHeader(headerChild)
    if (extractedSlots.length > 0) {
      parsed.headerSlots = [...(parsed.headerSlots || []), ...extractedSlots]
      logger.info('🆕 从 header child 提取 headerSlots', { count: extractedSlots.length })
    }

    // 移除 root background（base-panel 提供面板背景）
    if (hasRootBg) {
      delete structure.background
      logger.info('🆕 移除 structure 的 root background（base-panel chrome）')
    }

    // 移除 header child（base-panel 提供标题栏）
    structure.children = children.filter((_, idx) => idx !== headerIndex)
    logger.info('🆕 移除 structure 的 header child（base-panel chrome）', {
      remainingChildren: structure.children.length
    })

    // 如果移除后只剩一个 content/slot-con 子节点，可选：把它提升为 root 的直接内容
    // 但这里保守处理，只保留现有层级，让 ME 继续消费
    return 1 + extractedSlots.length
  }

  /**
   * 🆕 v3.2: 从 header child 中提取可映射为 base-panel 插槽的装饰元素
   */
  _extractHeaderSlotsFromHeader(headerChild) {
    if (!headerChild || typeof headerChild !== 'object') return []
    const slots = []

    // 如果 LLM 已经在 header 内部输出 headerSlots，直接拿
    if (Array.isArray(headerChild.headerSlots) && headerChild.headerSlots.length > 0) {
      for (const s of headerChild.headerSlots) {
        if (s && s.slotType) slots.push(s)
      }
    }

    // 从 header children 中识别 title-left 装饰图标（多个连续 icon/img）
    const headerChildren = Array.isArray(headerChild.children) ? headerChild.children : []
    const iconGroup = headerChildren.filter(c => c && /icon|img|image|vector|deco/i.test(c.type || c.role || ''))
    if (iconGroup.length > 0 && !slots.some(s => s.slotType === 'title-left')) {
      slots.push({
        slotType: 'title-left',
        elementType: 'icon-group',
        content: headerChild.content?.title || '装饰图标',
        children: iconGroup.map(c => ({
          resourceFile: c.resourceFile || c.icon?.resourceFile,
          recommendedUsage: c.recommendedUsage || c.icon?.recommendedUsage || 'imgSrc'
        })).filter(c => c.resourceFile)
      })
    }

    return slots
  }

  /**
   * 🆕 v3.3: 基于图/父尺寸比值计算精确的 backgroundSize / backgroundPosition / backgroundRepeat
   * 替代硬编码 cover/center/no-repeat，利用 resourceDomMapping 的 figmaBox 和
   * preview-analysis 的 dimensions 计算精确比值。
   *
   * 规则来自 figma-node-rules.md#backgroundSize精确计算规则：
   *   widthRatio  = bgNode.width  / parentFrame.width
   *   heightRatio = bgNode.height / parentFrame.height
   *
   * | 场景          | 判断条件                        | backgroundSize        |
   * |--------------|--------------------------------|----------------------|
   * | 完全匹配      | 0.9 ≤ 两比值 ≤ 1.1             | 100% 100%            |
   * | 细长横条      | hR < 0.3 且 wR ≥ 0.8           | 100% auto            |
   * | 细长竖条      | wR < 0.3 且 hR ≥ 0.8           | auto 100%            |
   * | 小图标/装饰   | 两比值均 < 0.5                  | contain              |
   * | 大图背景      | 任一比值 > 1.2                  | cover                |
   * | 重复纹理      | 两者均 < 0.5 但装饰             | auto + repeat        |
   */
  _calculateBackgroundSizing(bgFigmaBox, parentDims) {
    const bgW = bgFigmaBox?.width || 0
    const bgH = bgFigmaBox?.height || 0
    const pW = parentDims?.width || 0
    const pH = parentDims?.height || 0

    // 如果缺少尺寸数据，回退到默认值
    if (!bgW || !bgH || !pW || !pH) {
      return { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    const wR = bgW / pW
    const hR = bgH / pH

    // ── 完全匹配：bg 与父容器尺寸几乎一致（含轻微溢出 <20%）
    //    0.8 ≤ wR ≤ 1.2 且 0.8 ≤ hR ≤ 1.2 → 100% 100%（轻微压缩/拉伸可接受）
    if (wR >= 0.8 && wR <= 1.2 && hR >= 0.8 && hR <= 1.2) {
      return { backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    // ── 细长横条：宽度铺满，高度远小于父容器（如 header 背景、底线装饰）
    if (wR >= 0.8 && hR < 0.3) {
      return { backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'repeat-x', needsOverflowHidden: false }
    }

    // ── 细长竖条：高度铺满，宽度远小于父容器
    if (hR >= 0.8 && wR < 0.3) {
      return { backgroundSize: 'auto 100%', backgroundPosition: 'left center', backgroundRepeat: 'repeat-y', needsOverflowHidden: false }
    }

    // ── 小图标/装饰：两者都很小
    if (wR < 0.5 && hR < 0.5) {
      return { backgroundSize: 'contain', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    // ── 一维偏大另一维偏小（宽但矮 / 窄但高）
    //    bg 明显宽于容器但矮于容器 → 宽度铺满容器，高度按比例缩放
    //    例：bg 600×80 vs 容器 460×138 → bg缩至 460×61 → 高度不足但不会裁切
    if (wR > 1.2 && hR < 0.8) {
      return { backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    //    bg 明显高于容器但窄于容器 → 高度铺满容器，宽度按比例缩放
    //    例：bg 80×600 vs 容器 138×460 → bg缩至 138×1025 → 宽度铺满，高度溢出需裁切
    if (hR > 1.2 && wR < 0.8) {
      return { backgroundSize: 'auto 100%', backgroundPosition: 'left center', backgroundRepeat: 'no-repeat', needsOverflowHidden: true }
    }

    // ── 一维偏大另一维接近匹配
    //    bg 宽度溢出但高度接近 → 宽度铺满容器，高度自适应，可能溢出需裁切
    //    例：bg 600×138 vs 容器 460×138 → bg缩至 460×105 → 高度不够？不，auto维持比例 → 460×105
    //    例：bg 600×150 vs 容器 460×138 → bg缩至 460×115 → 高度差23px需裁切
    if (wR > 1.2 && hR >= 0.8 && hR <= 1.2) {
      const scaledH = Math.round(pW * (bgH / bgW))
      const needsClip = scaledH > pH
      return {
        backgroundSize: '100% auto',
        backgroundPosition: needsClip ? 'center top' : 'center center',
        backgroundRepeat: 'no-repeat',
        needsOverflowHidden: needsClip
      }
    }

    //    bg 高度溢出但宽度接近 → 高度铺满容器，宽度自适应，可能溢出需裁切
    //    例：bg 460×600 vs 容器 460×138 → bg缩至 107×138 → 宽度严重不足
    //    例：bg 500×600 vs 容器 460×138 → bg缩至 115×138 → 宽度不足但不会溢出
    if (hR > 1.2 && wR >= 0.8 && wR <= 1.2) {
      const scaledW = Math.round(pH * (bgW / bgH))
      const needsClip = scaledW > pW
      return {
        backgroundSize: 'auto 100%',
        backgroundPosition: needsClip ? 'left top' : 'center center',
        backgroundRepeat: 'no-repeat',
        needsOverflowHidden: needsClip
      }
    }

    // ── 两维都明显偏大（大图背景）
    if (wR > 1.2 && hR > 1.2) {
      return { backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', needsOverflowHidden: true }
    }

    // ── 中间情况：宽度接近但高度不够 → 宽度铺满，高度自适应
    if (wR >= 0.8 && hR < 0.8) {
      return { backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    // ── 中间情况：高度接近但宽度不够 → 高度铺满，宽度自适应
    if (hR >= 0.8 && wR < 0.8) {
      return { backgroundSize: 'auto 100%', backgroundPosition: 'left center', backgroundRepeat: 'no-repeat', needsOverflowHidden: false }
    }

    // ── 通用兜底
    return { backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', needsOverflowHidden: wR > 1.0 || hR > 1.0 }
  }

  /**
   * 🆕 v3.3: 递归遍历 structure 树，为所有含背景图的节点计算精确的 size/position/repeat
   * 同时也修正 _enrichContentBackground 之前硬编码的 cover/center/no-repeat 值。
   *
   * @param {Object} parsed - preview-analysis 结果
   * @param {Array} resourceDomMapping - 资源映射（含 figmaBox）
   * @returns {number} 修正的节点数
   */
  _calculateAllBackgroundSizing(parsed, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return 0

    // 构建 resourceFile → figmaBox 映射（快速查找）
    const resourceFigmaMap = new Map()
    for (const m of resourceDomMapping) {
      if (m.resourceFile && m.figmaBox) {
        resourceFigmaMap.set(m.resourceFile, m.figmaBox)
      }
    }

    let fixedCount = 0
    const structure = parsed?.structure

    // 递归遍历所有节点，查找含 background 或 backgroundImage 的节点
    this._walkElements(parsed, (node) => {
      if (!node || typeof node !== 'object') return

      // 获取节点的背景图 resourceFile
      let bgResourceFile = null
      if (node.background?.resourceFile) {
        bgResourceFile = node.background.resourceFile
      } else if (node.backgroundImage?.src) {
        bgResourceFile = node.backgroundImage.src
      }

      if (!bgResourceFile) return

      // 从映射中获取 bg 的 figmaBox
      const bgFigmaBox = resourceFigmaMap.get(bgResourceFile)
      if (!bgFigmaBox) return

      // 获取父容器尺寸：优先用节点自身的 dimensions，其次用 structure 的 dimensions
      const parentDims = node.dimensions || structure?.dimensions || null
      if (!parentDims) return

      // 计算精确的 background 属性
      const sizing = this._calculateBackgroundSizing(bgFigmaBox, parentDims)

      // 应用到 background 字段格式（structure.background）
      if (node.background && typeof node.background === 'object') {
        node.background.backgroundSize = sizing.backgroundSize
        node.background.backgroundPosition = sizing.backgroundPosition
        node.background.backgroundRepeat = sizing.backgroundRepeat
        if (sizing.needsOverflowHidden) {
          node.background.needsOverflowHidden = true
        }
        fixedCount++
        logger.info('🆕 background 精确尺寸计算', {
          resourceFile: bgResourceFile,
          bgBox: `${bgFigmaBox.width}×${bgFigmaBox.height}`,
          parentBox: `${parentDims.width}×${parentDims.height}`,
          sizing
        })
      }

      // 应用到 backgroundImage 字段格式（content.backgroundImage）
      if (node.backgroundImage && typeof node.backgroundImage === 'object') {
        node.backgroundSize = sizing.backgroundSize
        node.backgroundPosition = sizing.backgroundPosition
        node.backgroundRepeat = sizing.backgroundRepeat
        if (sizing.needsOverflowHidden) {
          node.needsOverflowHidden = true
        }
        fixedCount++
        logger.info('🆕 backgroundImage 精确尺寸计算', {
          src: bgResourceFile,
          bgBox: `${bgFigmaBox.width}×${bgFigmaBox.height}`,
          parentBox: `${parentDims.width}×${parentDims.height}`,
          sizing
        })
      }
    })

    return fixedCount
  }

  /**
   * 🆕 v3.1: 递归遍历元素树
   * 兼容 flat 格式（content.children）和 schema 格式（layout.sections[].body.children/items）。
   */
  _walkElements(node, visitor) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) this._walkElements(child, visitor)
      return
    }
    visitor(node)
    if (node.children && Array.isArray(node.children)) {
      this._walkElements(node.children, visitor)
    }
    if (node.items && Array.isArray(node.items)) {
      this._walkElements(node.items, visitor)
    }
    if (node.elements && Array.isArray(node.elements)) {
      this._walkElements(node.elements, visitor)
    }
    if (node.controls && Array.isArray(node.controls)) {
      this._walkElements(node.controls, visitor)
    }
    if (node.sections && Array.isArray(node.sections)) {
      this._walkElements(node.sections, visitor)
    }
    if (node.body && typeof node.body === 'object') {
      this._walkElements(node.body, visitor)
    }
    if (node.header && typeof node.header === 'object') {
      this._walkElements(node.header, visitor)
    }
    if (node.content && typeof node.content === 'object') {
      this._walkElements(node.content, visitor)
    }
    if (node.layout && typeof node.layout === 'object' && !Array.isArray(node.layout)) {
      this._walkElements(node.layout, visitor)
    }
    // v3.3: 遍历 structure 字段（VP 新格式的主结构树）
    if (node.structure && typeof node.structure === 'object') {
      this._walkElements(node.structure, visitor)
    }
  }

  /**
   * 🆕 v3.1: 修正 stat-item 的混合布局
   * 把 icon+label/value 的平铺 vertical 结构改为 nested 结构。
   */
  _normalizeStatItemLayouts(parsed, figmaData, resourceDomMapping) {
    let fixedCount = 0

    this._walkElements(parsed, (element) => {
      if (!element || typeof element !== 'object') return
      const type = (element.type || element.role || '').toLowerCase()
      if (!/stat-item|statitem|stat_card|stat-card/.test(type)) return
      if (!Array.isArray(element.children) || element.children.length < 2) return

      // 如果已经包含 row/group 嵌套，认为已经正确
      if (element.children.some(c => c && (c.type === 'row' || c.type === 'group'))) return

      const icon = element.children.find(c => c && c.type === 'icon')
      const label = element.children.find(c => c && c.type === 'label')
      const value = element.children.find(c => c && c.type === 'value')
      if (!icon || !label) return

      const shouldMix = this._shouldUseMixedLayout(element, figmaData, resourceDomMapping)
      if (!shouldMix) return

      const others = element.children.filter(c => c !== icon && c !== label && c !== value)
      element.layout = 'vertical'
      element.alignItems = element.alignItems || 'center'
      element.gap = element.gap || '4px'

      const rowChildren = [icon, label]
      const newChildren = [
        {
          type: 'row',
          layout: 'horizontal',
          alignItems: 'center',
          gap: '6px',
          children: rowChildren
        }
      ]
      if (value) newChildren.push(value)
      if (others.length > 0) newChildren.push(...others)

      element.children = newChildren
      fixedCount++
      logger.info(`🆕 stat-item 混合布局修正: ${label.text || 'unknown'}`, {
        hasValue: !!value,
        extras: others.length
      })
    })

    return fixedCount
  }

  /**
   * 🆕 v3.1: 判断某个 stat-item 是否应该使用 mixed 布局
   * 优先使用 Figma bbox；不可用则回退到启发式规则。
   */
  _shouldUseMixedLayout(statItem, figmaData, resourceDomMapping) {
    const icon = statItem.children.find(c => c && c.type === 'icon')
    const label = statItem.children.find(c => c && c.type === 'label')
    const value = statItem.children.find(c => c && c.type === 'value')
    if (!icon || !label) return false

    // ── 优先：Figma 坐标交叉验证 ──
    if (figmaData && resourceDomMapping) {
      try {
        const iconNode = this._findFigmaNodeForElement(icon, figmaData, resourceDomMapping)
        if (iconNode?.absoluteBoundingBox) {
          // 在 icon 所在父节点的兄弟节点中找 label/value 文本节点
          const parent = this._findParentOfFigmaNode(figmaData, iconNode.id)
          const siblings = parent?.children || []
          const labelNode = siblings.find(
            c => c?.characters === label.text && c?.absoluteBoundingBox
          )
          const valueNode = value
            ? siblings.find(c => c?.characters === value.text && c?.absoluteBoundingBox)
            : null

          if (labelNode?.absoluteBoundingBox) {
            const dyIconLabel = Math.abs(labelNode.absoluteBoundingBox.y - iconNode.absoluteBoundingBox.y)
            const dxIconLabel = Math.abs(labelNode.absoluteBoundingBox.x - iconNode.absoluteBoundingBox.x)
            const labelBelowIcon = labelNode.absoluteBoundingBox.y - iconNode.absoluteBoundingBox.y > 10

            // icon 与 label 在同一水平行，且 label 在 icon 右侧
            if (dyIconLabel < 15 && dxIconLabel > 5 && !labelBelowIcon) {
              if (valueNode?.absoluteBoundingBox) {
                const valueBelowLabel = valueNode.absoluteBoundingBox.y - labelNode.absoluteBoundingBox.y > 5
                if (valueBelowLabel) return true
              }
              // 即使没有 value，也确认 icon+label 是同行的
              return true
            }
          }
        }
      } catch (e) {
        logger.warn('Figma 坐标验证失败，使用启发式兜底', { error: e.message })
      }
    }

    // ── 兜底：启发式规则 ──
    // 典型数据指标项：图标尺寸较大，标签字号 <= 数值字号，且整体位于横向排列的内容区中
    const iconSize = Math.max(icon.width || 0, icon.height || 0)
    if (iconSize >= 24 && label.fontSize && value?.fontSize && label.fontSize <= value.fontSize) {
      return true
    }
    return false
  }

  /**
   * 🆕 v3.1: 根据 element.resourceFile 或 resourceDomMapping 找到对应 Figma 节点
   */
  _findFigmaNodeForElement(element, figmaData, resourceDomMapping) {
    if (!element || !figmaData) return null

    // 1. 如果元素本身有 figmaNode/figmaNodeId
    const directId = element.figmaNode || element.figmaNodeId
    if (directId) {
      const found = this._findFigmaNodeById(figmaData, directId)
      if (found) return found
    }

    // 2. 通过 resourceFile 反查 figmaNodeId
    if (resourceDomMapping && element.resourceFile) {
      const mapping = resourceDomMapping.find(
        m => m.resourceFile === element.resourceFile && m.figmaNodeId
      )
      if (mapping?.figmaNodeId) {
        return this._findFigmaNodeById(figmaData, mapping.figmaNodeId)
      }
    }

    // 3. 通过 name 兜底
    if (element.name) {
      return this._findFigmaNodeByName(figmaData, element.name)
    }
    return null
  }

  /**
   * 🆕 v3.1: 按 id 查找 Figma 节点（递归）
   */
  _findFigmaNodeById(node, id) {
    if (!node || typeof node !== 'object') return null
    if (node.id === id) return node
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this._findFigmaNodeById(child, id)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 🆕 v3.1: 按 name 查找 Figma 节点（递归，取第一个）
   */
  _findFigmaNodeByName(node, name) {
    if (!node || typeof node !== 'object' || !name) return null
    if (node.name === name) return node
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this._findFigmaNodeByName(child, name)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 🆕 v3.1: 查找包含指定子节点的父节点
   */
  _findParentOfFigmaNode(node, childId, parent = null) {
    if (!node || typeof node !== 'object' || !childId) return null
    if (node.id === childId) return parent
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this._findParentOfFigmaNode(child, childId, node)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 🆕 v3.1: 为 content / body 区域补全遗漏的背景图
   * 规则：从 resourceDomMapping 中找到属于内容区（slot-con/content）的 bg 资源。
   */
  _enrichContentBackground(parsed, figmaData, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return 0

    // 🆕 v2.2: CSS 替代资源也视为可用（downloadStatus='css'）
    const available = resourceDomMapping.filter(m => (m.downloadStatus === 'success' || m.downloadStatus === 'css') && m.previewAnalysisRole === 'bg')
    if (available.length === 0) return 0

    let fixedCount = 0

    // 定位 content 对象（flat 格式）
    const content = parsed.content
    if (content && typeof content === 'object') {
      const contentBg = this._findContentBackgroundResource(content, available, parsed)
      if (contentBg && !content.backgroundImage) {
        // v3.3: 用精确计算替代硬编码 cover/center/no-repeat
        // 注意：这里先用默认值，后续 _calculateAllBackgroundSizing 会根据 figmaBox 修正
        const contentDims = content.dimensions || parsed.structure?.dimensions || null
        const sizing = contentBg.figmaBox && contentDims
          ? this._calculateBackgroundSizing(contentBg.figmaBox, contentDims)
          : { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }

        content.backgroundImage = {
          src: contentBg.resourceFile,
          recommendedUsage: contentBg.recommendedUsage || 'backgroundStyle'
        }
        content.backgroundSize = sizing.backgroundSize
        content.backgroundPosition = sizing.backgroundPosition
        content.backgroundRepeat = sizing.backgroundRepeat
        fixedCount++
        logger.info('🆕 content 背景图补全', { src: contentBg.resourceFile, sizing })
      }
    }

    // 也处理 schema 格式 sections 的 body
    const sections = parsed.layout?.sections || parsed.sections || []
    for (const section of sections) {
      const body = section.body
      if (body && typeof body === 'object' && !body.backgroundImage) {
        const bodyBg = this._findContentBackgroundResource(body, available, parsed)
        if (bodyBg) {
          const bodyDims = body.dimensions || parsed.structure?.dimensions || null
          const sizing = bodyBg.figmaBox && bodyDims
            ? this._calculateBackgroundSizing(bodyBg.figmaBox, bodyDims)
            : { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }

          body.backgroundImage = {
            src: bodyBg.resourceFile,
            recommendedUsage: bodyBg.recommendedUsage || 'backgroundStyle'
          }
          body.backgroundSize = sizing.backgroundSize
          body.backgroundPosition = sizing.backgroundPosition
          body.backgroundRepeat = sizing.backgroundRepeat
          fixedCount++
          logger.info('🆕 body 背景图补全', { src: bodyBg.resourceFile, sizing })
        }
      }
    }

    return fixedCount
  }

  /**
   * 🆕 v3.1: 从可用 bg 资源中找到属于当前内容区的背景图
   * 优先匹配路径中包含 slot-con/content 的资源，其次是尺寸接近内容区的资源。
   */
  _findContentBackgroundResource(contentNode, availableBgMappings, parsed) {
    const contentPathHint = contentNode.figmaPath || contentNode.path || ''

    // 策略1：路径语义（最可靠）
    const pathMatch = availableBgMappings.find(m => {
      const path = m.figmaPath || ''
      return /slot-con|content|body/.test(path) && !/header/.test(path)
    })
    if (pathMatch) return pathMatch

    // 策略2：如果 content 节点本身有 figmaPath，找同一段路径下的 bg
    if (contentPathHint) {
      const sameSegment = availableBgMappings.find(m => {
        const path = m.figmaPath || ''
        return path.includes(contentPathHint) || contentPathHint.includes(path)
      })
      if (sameSegment) return sameSegment
    }

    // 策略3：尺寸匹配（选面积最大的可用 bg，但排除明显是 header/root 的小背景）
    const candidates = availableBgMappings.filter(m => {
      const w = m.figmaBox?.width || 0
      const h = m.figmaBox?.height || 0
      return w > 80 && h > 40
    })
    if (candidates.length === 0) return null

    // 排除已经被 root/backgroundImage 使用的资源
    const usedFiles = new Set()
    if (parsed.backgroundImage?.src) usedFiles.add(parsed.backgroundImage.src)
    if (parsed.header?.backgroundImage?.src) usedFiles.add(parsed.header.backgroundImage.src)

    const unused = candidates.filter(m => !usedFiles.has(m.resourceFile))
    const targetPool = unused.length > 0 ? unused : candidates

    return targetPool.reduce((best, m) => {
      const bestArea = (best?.figmaBox?.width || 0) * (best?.figmaBox?.height || 0)
      const mArea = (m.figmaBox?.width || 0) * (m.figmaBox?.height || 0)
      return mArea > bestArea ? m : best
    }, null)
  }

  /**
   * 🆕 用 resourceDomMapping 丰富分析结果
   * 将 placeholder → 实际资源文件路径，让下游 LLM 直接看到可用资源
   */
  _enrichWithResourceMapping(parsed, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return

    // 🆕 v2.2: CSS 替代资源也视为可用（downloadStatus='css'）
    const available = resourceDomMapping.filter(m => m.downloadStatus === 'success' || m.downloadStatus === 'css')

    if (available.length === 0) {
      logger.warn('所有资源下载失败，跳过丰富化')
      return
    }

    // 遍历 layout.sections 中的所有元素，匹配资源
    const sections = parsed.layout?.sections || parsed.sections || []
    let enrichedCount = 0

    for (const section of sections) {
      // body.children
      const children = section.body?.children || section.children || []
      for (const child of children) {
        enrichedCount += this._enrichElement(child, available)
      }

      // header.controls
      const controls = section.header?.controls || []
      for (const control of controls) {
        enrichedCount += this._enrichElement(control, available)
      }
    }

    // 也遍历 visualElements / styles 中的元素
    const styles = parsed.styles || parsed.visualElements || {}
    const emphasis = styles.emphasis || []
    const decorations = styles.decorations || []
    for (const item of [...emphasis, ...decorations]) {
      if (typeof item === 'object') {
        enrichedCount += this._enrichElement(item, available)
      }
    }

    logger.info('✅ resourceDomMapping 丰富化完成', { enrichedCount, totalAvailable: available.length })
  }

  /**
   * 单个元素匹配资源
   * @returns {number} 匹配成功数（0 或 1）
   */
  _enrichElement(element, availableMappings) {
    if (!element || typeof element !== 'object') return 0

    // 判断元素是否为 icon/bg/image 类型
    const role = element.type || element.role || element.placeholder?.toLowerCase?.() || ''
    const isIcon = /icon|图标/.test(role) || /icon/.test(element.name || '')
    const isBg = /bg|背景|background/.test(role) || /bg|background/.test(element.name || '')
    const isImage = /image|图片|img/.test(role)

    if (!isIcon && !isBg && !isImage) return 0

    // 匹配策略
    const targetRole = isIcon ? 'icon' : isBg ? 'bg' : 'img'
    const candidates = availableMappings.filter(m => m.previewAnalysisRole === targetRole)

    if (candidates.length === 0) return 0

    const placeholder = element.placeholder || element.name || ''

    // ── 优先级1: figmaNodeId 精确匹配 ──
    let matched = candidates.find(m => m.figmaNodeId === element.figmaNodeId)

    // ── 优先级2: figmaPath 路径语义匹配 ──
    // placeholder 拆词后与 figmaPath 各段做包含检测
    if (!matched) {
      matched = candidates.find(m => {
        if (!m.figmaPath || !placeholder) return false
        const pathParts = m.figmaPath.split('/')
        const keywords = placeholder.split(/[\s\-_]/).filter(k => k.length > 1)
        return keywords.some(k => pathParts.some(p => p.toLowerCase().includes(k.toLowerCase())))
      })
    }

    // ── 优先级3: Y 坐标就近匹配 ──
    // 用 figmaBox.y / position.y 找最接近的同类资源（对 icon 特别有效）
    if (!matched && element.position?.y && candidates.length > 1) {
      const elemY = element.position.y
      matched = candidates.reduce((best, m) => {
        const mY = m.figmaBox?.y || 0
        const bestY = best?.figmaBox?.y || 0
        return Math.abs(mY - elemY) < Math.abs(bestY - elemY) ? m : best
      }, candidates[0])
    }

    // ── 兜底: 按顺序取第一个（只在没有其他线索时才用）──
    if (!matched && candidates.length > 0) {
      matched = candidates[0]
    }

    if (matched) {
      // 删除 placeholder，替换为实际资源信息
      delete element.placeholder
      element.resourceFile = matched.resourceFile
      element.resourceVarName = matched.semanticVarName || (targetRole === 'icon' ? 'icon1' : targetRole === 'bg' ? 'bg1' : 'img1')
      element.recommendedUsage = matched.recommendedUsage || (targetRole === 'icon' ? '<img :src="icon1">' : ':style="{ backgroundImage: `url(${bg1})` }"')
      element.downloadStatus = matched.downloadStatus
      // 🆕 v2.2: 携带 CSS 替代值（downloadStatus='css' 时有值）
      if (matched.cssValue) {
        element.cssValue = matched.cssValue
        element.cssInsteadOfImage = true
        // 对于 CSS 替代资源，覆盖推荐用法
        element.recommendedUsage = `background: ${matched.cssValue};`
      }
      return 1
    }

    return 0
  }

  /**
   * 保存分析结果
   */
  saveResult(result, outputPath) {
    try {
      const jsonPath = join(outputPath, '.mc-gen/config/preview-analysis.json')

      // 确保目录存在
      const dir = dirname(jsonPath)
      mkdirSync(dir, { recursive: true })

      writeFileSync(jsonPath, JSON.stringify(result, null, 2))
      logger.info('✅ 分析结果已保存', { path: jsonPath })
      return jsonPath
    } catch (error) {
      logger.error('保存分析结果失败', { error: error.message })
      throw error
    }
  }

  // ============================================
  // 🆕 v3.7 L1优化: Vision 结果缓存
  // ============================================

  /**
   * 构建缓存键：基于 fileKey+nodeId 或 figmaData 内容哈希
   */
  _buildCacheKey(fileKey, nodeId, figmaData) {
    if (fileKey && nodeId) {
      return `vision_${fileKey}_${nodeId}`
    }
    if (figmaData) {
      const hash = createHash('md5').update(JSON.stringify(figmaData)).digest('hex').substring(0, 12)
      return `vision_data_${hash}`
    }
    return null
  }

  /**
   * 读取缓存（24h TTL）
   */
  _readCache(cacheKey, cacheDir) {
    try {
      const cacheFile = join(cacheDir, `${cacheKey}.json`)
      if (!existsSync(cacheFile)) return null

      const raw = readFileSync(cacheFile, 'utf-8')
      const cached = JSON.parse(raw)

      // 检查 TTL（24小时）
      const ttl = 24 * 60 * 60 * 1000
      if (Date.now() - cached._cachedAt > ttl) {
        logger.info('📦 Vision 缓存已过期，将重新分析', { cacheKey, age: Math.round((Date.now() - cached._cachedAt) / 3600000) + 'h' })
        return null
      }

      logger.info('📦 Vision 缓存命中', { cacheKey, age: Math.round((Date.now() - cached._cachedAt) / 60000) + 'min' })
      // 移除内部字段后返回
      const { _cachedAt, _cacheKey, ...result } = cached
      return result
    } catch (e) {
      logger.warn('读取 Vision 缓存失败', { error: e.message })
      return null
    }
  }

  /**
   * 写入缓存
   */
  _writeCache(cacheKey, cacheDir, result) {
    try {
      mkdirSync(cacheDir, { recursive: true })
      const cacheFile = join(cacheDir, `${cacheKey}.json`)
      const toCache = { ...result, _cachedAt: Date.now(), _cacheKey: cacheKey }
      writeFileSync(cacheFile, JSON.stringify(toCache, null, 2))
      logger.info('📦 Vision 结果已缓存', { cacheKey })
    } catch (e) {
      logger.warn('写入 Vision 缓存失败（非阻塞）', { error: e.message })
    }
  }

  /**
   * 执行完整的分析流程
   */
  async execute(params) {
    const {
      previewImage,
      figmaData = null,
      outputPath,
      resourceDomMapping = null,
      fileKey = null,
      nodeId = null,
      signal = null,
      onProgress = this.onProgress || null,
      requestConcurrency,
      requestQueueTimeoutMs,
      requestTimeoutMs,
      requestMaxRetries,
    } = params

    this.onProgress = onProgress
    logger.info('开始执行视觉分析', { previewImage })

    // 🆕 v3.7 L1优化: Vision AI 结果缓存（fileKey+nodeId → 24h TTL）
    const cacheKey = this._buildCacheKey(fileKey, nodeId, figmaData)
    const cacheDir = outputPath ? join(outputPath, '.mc-gen/cache/vision-cache') : null
    if (cacheKey && cacheDir) {
      const cached = this._readCache(cacheKey, cacheDir)
      if (cached) {
        logger.info('📦 Vision 分析命中缓存，跳过 AI 调用', { cacheKey })
        this.onProgress?.({ stage: '视觉分析', message: '📦 命中缓���，跳过 AI 分析', status: 'completed' })
        return cached
      }
    }

    // 🆕 加载 resourceDomMapping（如果没传参，尝试从文件读取）
    let effectiveMapping = resourceDomMapping
    if (!effectiveMapping && outputPath) {
      try {
        const mappingPath = join(outputPath, '.mc-gen/resource-dom-mapping.json')
        const mappingContent = readFileSync(mappingPath, 'utf-8')
        effectiveMapping = JSON.parse(mappingContent)
        logger.info('📦 从文件加载 resourceDomMapping', { count: effectiveMapping.length })
      } catch (e) {
        logger.warn('未能加载 resourceDomMapping 文件（非阻塞）', { error: e.message })
      }
    }

    try {
      // 1. 分析预览图（传入 mapping 用于 Figma hints 标注，传入 outputPath 用于调试文件写入 .mc-gen/cache/）
      this.onProgress?.({ stage: '视觉分析', message: '🤖 AI 正在分析图片...', status: 'running' })
      const analysisResult = await this.analyze(previewImage, figmaData, effectiveMapping, outputPath, {
        signal,
        onProgress,
        requestConcurrency,
        requestQueueTimeoutMs,
        requestTimeoutMs,
        requestMaxRetries,
      })
      this.onProgress?.({ stage: '视觉分析', message: '✅ AI 分析完成，处理数据...', status: 'running' })

      // 2. 🆕 用 resourceDomMapping 丰富分析结果（placeholder → 实际资源路径）
      if (effectiveMapping && effectiveMapping.length > 0) {
        this._enrichWithResourceMapping(analysisResult, effectiveMapping)
      }

      // 3. 保存结果
      this.onProgress?.({ stage: '视觉分析', message: '💾 保存分析结果...', status: 'running' })
      const savedPath = this.saveResult(analysisResult, outputPath)

      const executeResult = {
        imageVerified: true, // ✅ Phase 1 验证器需要的字段
        layoutStructure: analysisResult,  // ✅ 修复：返回完整的分析结果，包含body、header等
        visualElements: analysisResult.styles,
        interactions: analysisResult.interactions,
        charts: analysisResult.charts,
        // 🆕 v3.7: Figma 图表数据提示（供 engineer 生成真实数据值）
        chartDataHints: analysisResult.chartDataHints || [],
        analysisFile: savedPath,
        // 🆕 headerSlots：面板头部插槽信息（从 Vision AI 输出或从 layoutStructure 推导）
        headerSlots: analysisResult.headerSlots || [],
        // 🔑 传递顶层组件类型信息（tab-switch / chart / form 等），
        // 帮助 microcode-engineer 在 layout.sections 为空时仍能生成正确类型的组件
        analysisType: analysisResult.type || '',
        analysisTarget: analysisResult.target || '',
        analysisDescription: analysisResult.description || '',
        analysisEvidence: analysisResult.imageEvidence || (analysisResult.evidence ? [analysisResult.evidence] : [])
      }

      // 🆕 v3.7 L1优化: 写入 Vision 缓存
      if (cacheKey && cacheDir) {
        this._writeCache(cacheKey, cacheDir, executeResult)
      }

      return executeResult

    } catch (error) {
      logger.error('视觉分析执行失败，返回降级结果', { error: error.message })

      // 🛡️ P0 修复：execute() 失败时返回最小可用结果，避免上游崩溃
      const degradedResult = {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        degraded: true,
        degradeReason: error.message,
        layout: { type: 'vertical', direction: 'top-to-bottom', sections: [] },
        styles: { theme: '未知', colors: [], background: '', decorations: [], emphasis: [], backgroundBrightness: 'dark' },
        interactions: [],
        charts: []
      }

      return {
        imageVerified: false,
        layoutStructure: degradedResult,
        visualElements: degradedResult.styles,
        interactions: [],
        charts: [],
        analysisFile: null,
        headerSlots: [],
        analysisType: '',
        analysisTarget: '',
        analysisDescription: `视觉分析失败: ${error.message}`,
        analysisEvidence: [],
        degraded: true,
        degradeReason: error.message
      }
    }
  }
}

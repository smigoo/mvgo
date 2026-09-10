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
import { getProviderPool } from '../utils/provider-pool.js'
import { matchResourceMapping } from '../utils/resource-mapping-formatter.js'
import { isChromeOnlySection, stripChromeSectionsInPlace } from '../utils/chrome-section-filter.js'
// 🛡️ A4（2026-09-03）：元素级高度比例覆盖的纯函数层（零依赖、可独立单测）
import { collectFigmaNodes, applyFigmaElementHeightRatios } from '../utils/figma-height-ratio.js'
// 🛡️ P0（2026-09-04）：Vision 结果与 Figma TEXT 节点交叉校验，在 vision 阶段就发现 OCR 误读/臆造
import { collectFigmaTextTruth, findClosestTruth } from '../utils/text-truth-guard.js'

const logger = createLogger({ name: 'visual-parser' })

// Vision 真实预览图分析比配置页连通性测试重得多：需要完整 UI 图 + 大 prompt + JSON 结构化输出。
// 单次 attempt 超时取 240s（4 分钟）：正常视觉分析约 97s（实测），240s 留足冷启动余量；
// 同时保证「单次超时 × requestMaxRetries(1)=2 次 attempt + 等待 ≈ 481s」< 节点超时 VISUAL_TIMEOUT_MS(600s)，
// 使第 1 个 provider 挂起超时后，第 2 次 attempt 有完整窗口切换到备用 provider 完成分析，
// 而非被节点 600s 超时提前掐断（mc-max-1787717640370 实锤：300s×2≈601s 超过节点 600s，备用 provider 没机会跑完）。
const VISION_ANALYSIS_TIMEOUT_MS = 240000
const VISION_ANALYSIS_MAX_RETRIES = 1

/**
 * 🆕 S2 动态超时：按 vision 池 provider 的耗时画像计算超时（快模型短、慢模型长）。
 * 取池内所有 vision provider p90 耗时的最大值 × 1.5（保守），夹在 [90s, 480s]；
 * 无画像样本（首次/重启后）回退 fallbackMs。避免固定 240s 对慢模型误杀、对快模型挂起响应慢。
 */
function computeVisionDynamicTimeout(fallbackMs) {
  try {
    const pool = getProviderPool()
    const visionProviders = [...pool._slots.vision.providers.values()]
    let maxP90 = 0
    for (const p of visionProviders) {
      const prof = pool.getLatencyProfile(p.id)
      if (prof && prof.p90Ms > maxP90) maxP90 = prof.p90Ms
    }
    if (maxP90 > 0) {
      return Math.min(480000, Math.max(90000, Math.round(maxP90 * 1.5)))
    }
  } catch { /* 画像不可用时回退固定值 */ }
  return fallbackMs
}

/**
 * 判断视觉分析结果是否退化/空结构。
 * 截断损坏的 JSON 经 robustJSONParse 部分提取后，会产出"有 layout 但 sections 全空"的半截对象且不抛异常。
 * 此函数识别这类损坏结果，防止其被当成成功数据往下传递或缓存复用。
 * @param {Object} parsed - 解析后的结果（或 execute 阶段的最终结果）
 * @returns {boolean} true=退化/空结构，应拒绝或避免缓存
 */
export function isVisualAnalysisDegraded(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return true
  const secCount = parsed.layout?.sections?.length || parsed.sections?.length || 0
  const hasContent = secCount > 0 || (parsed.charts?.length || 0) > 0 || (parsed.interactions?.length || 0) > 0
  return !hasContent
}

// 视觉可信度裁决为纯函数，抽到 utils/visual-trust.js（无 import.meta 依赖，便于单测）。
// 此处 re-export 以保持既有导入（图/节点）不变。
export { evaluateVisualTrustVerdict, VISUAL_VERDICTS } from '../utils/visual-trust.js'

// 🛡️ L2 / P0-2（2026-09-07）：行内复合结构 bbox 几何校验（确定性兜底重建）。
// 纯函数抽到 utils/inline-row-rebuilder.js（无 import.meta，便于 jest 单测）；此处 import 复用并对外导出。
import { rebuildSectionsPreservingInlineRows } from '../utils/inline-row-rebuilder.js'
export { rebuildSectionsPreservingInlineRows }
import { mergeInlineRowsIntoSections } from '../utils/inline-row-merger.js'
export { mergeInlineRowsIntoSections }
// 🛡️ P1（2026-09-09）：inlineCompositeRows → headerSlots 推断（纯函数，无 import.meta，jest 可 require）。
// 单一事实源：visual-parser.js 不再内联实现，import 复用并对外导出。
import {
  inferHeaderSlotsFromInlineRows,
  mergeHeaderSlots,
} from '../utils/inline-header-slot-inferrer.js'
export { inferHeaderSlotsFromInlineRows, mergeHeaderSlots }

export class VisualParser {
  constructor(config = {}) {
    this.visionAgent = config.visionAgent || new VisionAgent(config)

    //  target 透传（'vue3' | 'microcode'）—— 决定分析语境与面板外壳剥离策略。
    // 优先运行时 execute({ target }) 传入；构造器 config.target 作为兜底。
    this.target = config.target || null
    this.componentType = config.componentType || this.target || null

    // 修复：向上逐级查找含 references/prompts/preview-analysis 的项目根目录。
    // 该模块在开发态从 backend/src/ai-engine/roles/ 运行、生产态从 backend/dist/ai-engine/roles/ 运行，
    // 到项目根 langgraph-server/（references/ 所在处）的层级不固定（src 与 dist 都是上溯 5 级），
    // 旧写法固定上溯 3 级 → 解析到 backend/dist/ → references 全部 ENOENT，prompt 退化。改用向上探测更健壮。
    const projectRoot = VisualParser._resolveProjectRoot(dirname(fileURLToPath(import.meta.url)))
    this.schemaPath = config.schemaPath || join(projectRoot, 'references/schemas/preview-analysis-schema.md')

    // 加载schema规范
    this.schema = this.loadSchema()

    //  Prompt 模块基础路径
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
   *  加载单个模块文件
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
   *  构建分析提示词 — 模块化按需加载 + Figma 数据交叉验证
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

    const { componentName = '', hasCharts = false, hasComplexBg = false, retryGuidance = null, figmaData = null, resourceDomMapping = null, target = null } = context

    //  target 透传。'microcode' → base-panel 插槽语境 + 面板外壳剥离；'vue3' → 标准组件语境（自行渲染外壳）。
    const isMicrocode = (target || this.componentType) === 'microcode'

    // ===== 必选模块（每次都加载）=====
    const requiredModules = [
      { name: 'structure-examples', path: 'structure-examples.md' },  // 🔥 最优先：输出结构示例（整体+元素级合并）
      { name: 'base', path: 'base.md' },
      { name: 'layout-analysis-workflow', path: 'layout-analysis-workflow.md' },
      { name: 'ui-element-checklist', path: 'ui-element-checklist.md' },
      { name: 'figma-css-style-mapping', path: 'figma-css-style-mapping.md' },  //  样式映射清单（per-element 必检属性）
      { name: 'mixed-layout-examples', path: 'mixed-layout-examples.md' },      //  混合布局与内容区背景识别示例
      { name: 'self-checklist', path: 'self-checklist.md' },
      { name: 'do-not-invent', path: 'do-not-invent.md' },
      { name: 'header-rules', path: 'header-rules.md' },  // 🔥 合并：headerRelation + 插槽检测 + controls
      { name: 'annotation-filter-rules', path: 'annotation-filter-rules.md' },  // 🔥 注释过滤规则（统一）
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

    // =====Figma 数据交叉验证提示 =====
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

### 🎯 Figma 命名规范（静态资源识别）
- 节点名称以 \`icon\`、\`bg\`、\`img\`、\`image\` 开头的是**静态资源节点**，必须使用实际图片资源
- \`icon-*\`：图标资源，必须用 \`<img :src>\` 或 CSS \`background-image\` 渲染
- \`bg-*\`：背景资源，必须用 CSS \`background-image\` 渲染
- \`img-*\` / \`image-*\`：图片资源，必须用 \`<img :src>\` 渲染
- **禁止**：用 CSS 渐变、SVG 图标、纯色背景替代这些节点的实际图片资源

${figmaHints}
`
      }
    }

    //resourceDomMapping 专属提示（即使没有 figmaData 也需要注入）
    let resourceSection = ''
    if (resourceDomMapping && resourceDomMapping.length > 0) {
    //  CSS 替代资源也视为可用（downloadStatus='css'）
    const available = resourceDomMapping.filter(m => m.downloadStatus === 'success' || m.downloadStatus === 'css')
      if (available.length > 0) {
        // 头部插槽识别仅微码组件需要（映射到 base-panel 具名插槽）；Vue3 自行渲染外壳，不消费插槽
        const headerSlotsBlock = isMicrocode ? `

### 头部插槽识别（面板组件专用）

如果检测到面板标题栏区域有交互控件或附加信息，请输出 "headerSlots" 数组，将它们映射到 base-panel 的具名插槽：

- **#title-left**: 标题栏左侧（装饰图标、状态标识、小icon）
- **#title-right**: 标题右侧紧邻（副标题、更新时间、单位标注）
- **#header-right**: 标题右侧靠右（统计指标、Tab切换按钮、图标操作按钮）
- **#close**: 最右侧关闭按钮（通常由面板默认提供，不需要输出）

#### 🎯 插槽位置判断规则（CRITICAL）

**按水平位置从左到右分类：**

1. **title-left**（标题左侧）
   - 位置：标题文字的左侧
   - 常见内容：装饰性小图标、状态徽章
   - 特征：紧贴标题，通常只有1-2个元素
   - 示例：状态指示灯、分类图标

2. **title-right**（标题右侧紧邻）
   - 位置：紧贴标题文字右侧（间距 <16px）
   - 常见内容：副标题、单位说明、小标签
   - 特征：字号通常小于标题，与标题形成视觉组合
   - 示例："（实时）"、"单位：台"

3. **header-right**（头部右侧远离标题）⭐ **重点识别区域**
   - 位置：远离标题（间距 ≥16px），通常靠近头部右边缘
   - 常见内容：
     * **统计数据组**：多个"标签+数值"组合，水平排列（如："设备类型 28  设备总数 68562  完好率 98%"）
     * **操作按钮**：功能按钮、图标按钮
     * **Tab 切换**：标签页切换控件
     * **时间信息**：更新时间、刷新按钮
   - 特征：
     * 元素之间间距均匀（通常 12-24px）
     * 包含数字、百分号的文本
     * 字号通常为 12-14px
     * 可能有图标+文字组合
   - ⚠️ 关键：这些元素虽然在标题行，但语义上是**业务数据展示**，不是标题的一部分

#### 🔍 识别要点

**如何判断一个元素应该放入 header-right：**
1. ✅ 包含数字的文本（如 "28"、"68562"、"98%"）
2. ✅ "标签+数值"的组合（如 "设备类型 28"、"完好率 98%"）
3. ✅ 多个同类元素水平排列，间距均匀
4. ✅ 与标题有明显的视觉间距（远离标题）
5. ✅ 位于标题栏但独立于标题语义

**常见错误（避免）：**
- ❌ 将统计数据识别为普通文本元素
- ❌ 忽略多个水平排列的数据指标
- ❌ 将 header-right 的内容误判为 body 区域的内容

每个元素格式：{ "slotType": "title-left/title-right/header-right", "elementType": "icon/tab/statistic/label", "content": "具体内容", "figmaNodeId": "节点ID（如有）" }

#### 示例（统计指标组）

**正确识别：**
\`\`\`json
"headerSlots": [
  { "slotType": "header-right", "elementType": "statistic", "content": "设备类型 28" },
  { "slotType": "header-right", "elementType": "statistic", "content": "设备总数 68562" },
  { "slotType": "header-right", "elementType": "statistic", "content": "完好率 98%" }
]
\`\`\`

⚠️ **注释过滤（CRITICAL）**：以下文本节点属于设计师注释/标注，**不应**识别为UI内容或插槽元素：
- 以 \`*\` 或 \`#\` 开头的文本（如 \`*XXX\`、\`#XXX\` 形式的标注）
- 包含 TODO / FIXME / 注 / 标注 / 备注 的文本
- 字号小于 10px 且内容少于 10 个字符的文本节点
- 纯重复符号（如 *** / --- / ===）
` : ''
        resourceSection = `

---

## 🎨 已下载资源清单（必须使用，禁止替代）

以下资源已成功下载，在输出 JSON 中遇到对应位置时，**必须使用 resourceFile 字段引用实际资源路径**，禁止使用 placeholder + CSS/SVG 替代。

${available.map(m => {
  if (m.downloadStatus === 'css' && m.cssValue) {
    return `- **${m.previewAnalysisRole}**: ${m.hint} → ⚡ CSS: \`background: ${m.cssValue}\` (无需图片)`
  }
  return `- **${m.previewAnalysisRole}**: ${m.hint} → 📎 ${m.resourceFile} (变量: ${m.assignedVarName || m.semanticVarName || 'N/A'}, 用法: ${m.recommendedUsage || 'N/A'})`
}).join('\n')}

⚠️ 输出规范：对 icon/bg/image 类元素，优先输出 "resourceFile" 和 "recommendedUsage" 字段，而非 "placeholder"。
⚡ CSS 替代资源（标记为 CSS: background: ...）不要输出 resourceFile，直接在样式中使用 CSS 值。
${headerSlotsBlock}`
      }
    }

    // ===== 构建最终提示词 =====
    const analysisTask = retryGuidance
      ? `\n\n${retryGuidance}\n\n请根据上述校验问题修正后重新输出 JSON 结果。`
      : `

---

## 分析任务

${(isMicrocode
  ? '请分析以下微码组件的预览图（base-panel 外壳由宿主提供，只需还原 slot 内容，无需输出面板背景/标题栏）：'
  : '请分析以下 Vue3 标准组件的预览图（需自行完整还原面板外壳、背景与标题栏，不要假设存在 base-panel 插槽）：')}

- **组件名称**: ${componentName}

## 🔍 逐元素枚举铁律（CRITICAL，违反将导致覆盖率不达标）

**禁止把多个独立元素合并、折叠、概括成一个 section 描述**。设计稿中的每一个独立 UI 元素都必须作为独立子元素输出，逐项列出：

1. **统计指标组**：头部/内容区的「标签+数值」组合（如「设备类型 28」「设备总数 68562」「完好率 98%」）是**多个独立元素**，必须逐个输出为独立元素（各自带 name/label + value），禁止合并成一句「顶部有 3 个统计指标」。
2. **重复卡片/列表项**：结构相似的 N 个卡片，必须用 \`items\` 数组逐个列出（每个都有独立 name/value），禁止用「N 个统计卡片」概括。
3. **每个 TEXT 文本节点**（标签、数值、单位、百分比、刻度）都要单独输出，即使字号 <14px 也不能遗漏或合并。
4. **Tab/导航项**：每个 tab 都要独立输出为 child 元素，禁止合并成「3 个 tab」。
5. **图标**：每个独立图标都要单独输出，禁止合并成「若干图标」。

**判断标准**：设计稿里能数出几个独立的框/文字/图标，JSON 里就应有几个对应的独立元素。覆盖率按「你输出的独立元素数 / 设计稿节点数」计算，合并或遗漏会导致覆盖率不达标而重试。

请严格按照上述规范输出 JSON 格式的 preview-analysis 结果。`

    return `${modulesContent}
${figmaContextSection}
${resourceSection}

# 输出规范（Schema 引用）

${this.schema}
${analysisTask}`
  }

  /**
   *从 Figma 节点树提取紧凑的结构摘要，用于注入 Vision AI 的 prompt
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

    //@echarts 图表区域整体跳过：图表由 echarts 渲染，其下柱状分片/装饰矢量是静态还原物，
    // 注入给视觉分析只会稀释注意力（与 figma-connector.extractResourceNodes 的 @echarts 跳过一致）
    if (name && /@echarts/i.test(name)) return ''

    // 跳过无意义的节点（空 FRAME、无名称的 VECTOR 等）
    if (!label && !node.characters) return ''

    //查找该节点在 resourceDomMapping 中是否有对应资源
    let resourceAnnotation = ''
    if (resourceDomMapping && resourceDomMapping.length > 0) {
      // 🛡️ W5（2026-09-01 事故 5 衍生 · mc-max-1788239096135-c19dfe56）：
      // 旧匹配用 `m.hint?.includes(name) || m.targetDomSelector?.includes(name)` 做子串兜底，
      // 且 find() 取首个命中。事故 mapping 中容器 tabs-icon（missing）排在它的 icon 子节点
      // （success → icon1/icon2）之前，而 "tabs-icon → tabs-icon区域".includes("icon") 为真
      // → 下载成功的子图标被标成「⛔ 下载失败｜禁止引用变量名」→ LLM 不敢用 icon1/icon2
      // → 资源漏用（RESOURCE-001），且会放大 W4 新增的「禁止引用」文案的危害。
      // 改为 matchResourceMapping：figmaNodeId 精确 → 节点名完全相等 → 否则不标注（不猜）。
      const matchedMapping = matchResourceMapping(node, resourceDomMapping)
      if (matchedMapping && (matchedMapping.downloadStatus === 'success' || matchedMapping.downloadStatus === 'css')) {
        if (matchedMapping.downloadStatus === 'css' && matchedMapping.cssValue) {
          resourceAnnotation = ` → ⚡ CSS: \`background: ${matchedMapping.cssValue}\` (无需图片)`
        } else {
          const varName = matchedMapping.assignedVarName || matchedMapping.semanticVarName || '?'
          const usage = matchedMapping.recommendedUsage || '?'
          resourceAnnotation = ` → 📎 ${matchedMapping.resourceFile} (变量: ${varName}, 用法: ${usage})`
        }
      } else if (matchedMapping && matchedMapping.downloadStatus !== 'success' && matchedMapping.downloadStatus !== 'css') {
        // 🛡️ W4（2026-09-01 事故 5 根因 · mc-max-1788239096135-c19dfe56）：
        // 本分支是「下载失败资源」在视觉分析 prompt 中的**唯一**提及位置
        // （buildPrompt 的资源清单只渲染 available，不含「不可用资源」分区）。
        // 旧文案只说「请用 CSS 替代」，**从未说明该位置没有变量** →
        // LLM 看到结构树节点名（tabs-icon）后自行拼出驼峰变量名（icontabsIcon）写进模板，
        // 该名字在 buildVarToMapping（只收 success）里不存在 → 语义门禁 fail-closed。
        // 与 resource-mapping-formatter 的「不可用资源」分区口径保持一致，显式声明无变量名。
        resourceAnnotation = ` → ⛔ 下载失败(${matchedMapping.fallbackHint || 'CSS替代'})｜该位置无对应变量，禁止引用任何变量名`
      }
    }

    // 尺寸信息
    const bb = node.absoluteBoundingBox
    // 🛡️ 技术组件 bbox 修正（2026-09-03 · mc-1788397668642 实锤）：
    // @antd/tab 的 bbox 宽度（46px）只是 tab 标签条宽度，实际内容在子节点 cons（367px）里。
    // 若直接用 bbox 尺寸注入给 LLM，产物会把侧边栏写成 width:46px，文字全部截断。
    // 修正：对 @ 开头的技术组件，取子节点的最大宽度/高度作为有效尺寸。
    let effectiveW = bb ? bb.width : 0
    let effectiveH = bb ? bb.height : 0
    if (bb && name.startsWith('@') && node.children && node.children.length > 0) {
      for (const child of node.children) {
        const cbb = child.absoluteBoundingBox
        if (cbb) {
          if (cbb.width > effectiveW) effectiveW = cbb.width
          if (cbb.height > effectiveH) effectiveH = cbb.height
        }
      }
    }
    const sizeStr = bb ? ` ${Math.round(effectiveW)}x${Math.round(effectiveH)}` : ''

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
        //瘦身：Figma 结构参考总长度上限（防超大组件注入失控，保留最上层结构信息即可）
        if (parts.join('\n').length > 5000) break
      }
    }

    return parts.join('\n')
  }

  /**
   *  加载外部模块（guides 目录下的文件）
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
  async analyze(imagePath, figmaData = null, resourceDomMapping = null, outputPath = null, requestOptions = {}, target = null) {
    try {
      // 1. 构建提示词（传入 figmaData 和 resourceDomMapping 用于交叉验证；target 决定微码/Vue3 语境）
      // 🛡️ retryGuidance 透传（2026-09-03）：low-coverage 定向重分析时，phase2 图通过
      // requestOptions.retryGuidance 注入「补充识别缺失 section」指导，让视觉模型二次补全。
      const prompt = this.buildPrompt({
        figmaData,
        resourceDomMapping,
        target: target || this.target,
        retryGuidance: requestOptions?.retryGuidance || null,
      })

      // 🔍 诊断：保存 prompt 到 .mc-gen/cache/ 目录（而非 resources/images/）
      const debugDir = outputPath
        ? join(outputPath, '.mc-gen/cache')
        : join(dirname(dirname(dirname(imagePath))), '.mc-gen/cache')
      mkdirSync(debugDir, { recursive: true })
      const promptPath = join(debugDir, 'debug-prompt.txt')
      writeFileSync(promptPath, prompt, 'utf-8')
      logger.info('🔍 [诊断] Prompt 已保存', { path: promptPath, size: prompt.length })

      // 2. 调用Vision AI分析图片
      // 🛡️ vision 止损：真实预览图分析比配置页红色小图测试重得多，90s 容易误杀复杂面板。
      // 将单次上限提高到 150s，并允许一次重试；仍保留上限，避免网关长时间挂起。
      const visionRequestOptions = {
        ...requestOptions,
        requestTimeoutMs: computeVisionDynamicTimeout(requestOptions.requestTimeoutMs ?? VISION_ANALYSIS_TIMEOUT_MS),
        requestMaxRetries: Math.max(requestOptions.requestMaxRetries ?? VISION_ANALYSIS_MAX_RETRIES, VISION_ANALYSIS_MAX_RETRIES),
      }
      logger.info('🛡️ Vision 分析请求策略', {
        requestTimeoutMs: visionRequestOptions.requestTimeoutMs,
        requestMaxRetries: visionRequestOptions.requestMaxRetries,
      })
      let rawResult = await this.visionAgent.analyzeImage(imagePath, prompt, visionRequestOptions)

      //  防御 - 归一化 vision-agent 返回值（防止 API 返回数组或对象）
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

      //  质量门 — 检测"解析成功但内容全空"的静默降级
      this._qualityGate(parsed, rawResult)

      //  确定性后处理（修正 LLM 常见布局错误）
      this._postProcessAnalysis(parsed, figmaData, resourceDomMapping)

      //  元素覆盖率报告（Figma节点 vs Vision识别，交叉校验）
      if (figmaData) {
        parsed.coverageReport = this._generateCoverageReport(parsed, figmaData)
        //  从 Figma 节点提取图表数据值（供 engineer 生成真实数据）
        if (parsed.charts && parsed.charts.length > 0) {
          parsed.chartDataHints = this._extractChartDataFromFigma(figmaData, parsed.charts)
        }
        
      // 🛡️ P0（2026-09-04）：Vision 结果与 Figma TEXT 节点交叉校验
      // 在 vision 阶段就发现 OCR 误读/臆造文字，标记可疑文字供下游代码生成时注意
      parsed.textTruthValidation = this._validateVisionTextAgainstFigma(parsed, figmaData)
    }

      this._normalizeAnalysisOutput(parsed, figmaData, resourceDomMapping)

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

      // 🛡️ P0-1: 降级时优先用 Figma 坐标确定性重建布局结构（避免空结构盲写 DOM）
      const figmaRebuild = figmaData ? this._rebuildLayoutFromFigma(figmaData) : null
      if (figmaRebuild) {
        logger.warn('⚠️ 视觉分析降级，已用 Figma 坐标重建布局结构', {
          sectionsCount: figmaRebuild.layout.sections.length,
          reason: error.message
        })
      }

      // 🛡️ P0 修复：硬失败 → 降级返回最小可用结构，避免整个工作流崩溃
      return {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        degraded: true,
        degradeReason: error.message,
        //  有 Figma 兜底时用重建的 sections（layoutSource:'figma'），否则保持空
        layout: figmaRebuild ? figmaRebuild.layout : { type: 'vertical', direction: 'top-to-bottom', sections: [] },
        layoutSource: figmaRebuild ? 'figma' : 'degraded',
        visualDegraded: true,
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
      //使用 robustJSONParse 替代手动5步解析
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

      //兜底：如果解析结果为数组（API 返回 [{thinking}, {text}] 格式），提取 text 块重新解析
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

      // 🛡️ 防半截数据：截断损坏的 JSON 会被 robustJSONParse 部分提取成"有 layout 但 sections 空"的半截对象且不抛异常。
      // 若解析结果无任何有效结构（sections/charts/interactions 全空），视为损坏，拒绝接受，
      // 让 analyze 走 catch 降级/重试，而非把半截数据当成功结果往下传。
      if (isVisualAnalysisDegraded(parsed)) {
        throw new Error('视觉解析结果结构为空（sections/charts/interactions 全空），疑似截断损坏，拒绝接受半截数据')
      }

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

    //处理header/body格式（某些模型返回这种格式而不是sections）
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

    //处理visualStyle字段（映射到styles）
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

    //从扁平图表数据构建结构化 layout/charts（Qwen 等模型可能返回扁平结构）
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
      logger.info('检测到扁平图表数据，自动转换为结构化格式', {
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
        const match = colorStr.match(/[\d.]+/g)
        // rgb(r,g,b) 3 个值；rgba(r,g,b,a) 4 个值——alpha 不参与亮度计算，
        // 必须取前 3 个通道，否则把 alpha 当蓝通道会让浅色半透明背景被误判为深色。
        if (match && match.length >= 3) {
          r = parseFloat(match[0])
          g = parseFloat(match[1])
          b = parseFloat(match[2])
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

    // 🛡️ 一致性校验（2026-09-01）：模型自报的 backgroundBrightness 可能与真实颜色明度矛盾
    // （浅色截图被误报 dark → 整链生成深色组件）。当存在可解析的根背景色时，以颜色明度为准覆盖：
    // - 优先级：styles.background > colors 里 role/type 含 background 的条目 > dominantBgColor
    // - 半透明 rgba 的 alpha 不参与亮度计算（浅色 rgba 不会因此被误判为深色）
    // - 只有一方明显（亮度 > 0.6 或 < 0.4）才覆盖，灰色地带保留模型自报，避免误伤真实深色
    if (result.styles?.backgroundBrightness) {
      const rootBgColor =
        this._findRootBackgroundColor(result.styles) ||
        (typeof result.dominantBgColor === 'string' ? result.dominantBgColor : '')
      if (rootBgColor) {
        const lum = this._colorLuminance(rootBgColor)
        if (lum !== null) {
          const fromColor = lum > 0.5 ? 'light' : 'dark'
          if (fromColor !== result.styles.backgroundBrightness) {
            logger.warn('backgroundBrightness与根背景色明度矛盾，以颜色为准', {
              reported: result.styles.backgroundBrightness,
              fromColor,
              rootBgColor,
              luminance: lum.toFixed(2),
            })
            result.styles.backgroundBrightness = fromColor
          }
        }
      }
    }

    if (missingFields.length > 0) {
      logger.warn('部分必填字段缺失已自动填充', { missingFields })
    }

    return true
  }

  /**
   * 从 styles 中找根背景色（字符串或对象形式），找不到返回 ''
   */
  _findRootBackgroundColor(styles) {
    if (!styles || typeof styles !== 'object') return ''
    const candidates = []
    const bg = styles.background
    if (typeof bg === 'string' && bg.trim()) candidates.push(bg.trim())
    else if (bg && typeof bg === 'object') {
      if (typeof bg.value === 'string') candidates.push(bg.value)
      if (typeof bg.color === 'string') candidates.push(bg.color)
    }
    if (Array.isArray(styles.colors)) {
      for (const c of styles.colors) {
        const name = String(c?.name || c?.role || c?.type || '').toLowerCase()
        if (name.includes('background') || name.includes('bg')) {
          if (typeof c?.value === 'string') candidates.push(c.value)
          else if (typeof c?.color === 'string') candidates.push(c.color)
          else if (typeof c?.hex === 'string') candidates.push(c.hex)
        }
      }
      // 🛡️ 纯字符串色值数组 fallback（2026-09-03，mv-max-1788365247487 实锤）：
      // schema 说 colors 是「颜色名称或简述」，但 vision 常输出精确色值数组
      // （如 ["rgba(237,244,251,1)","rgba(85,158,255,1)",...]，第一项即主背景色）。
      // 旧逻辑只认带 name/role/type 的对象条目，纯字符串色值被跳过 → 找不到背景色 →
      // backgroundBrightness 误报 dark 无法被「以颜色为准」修正 → 整链生成深色组件。
      // 取第一个可解析为色值的条目作为背景色候选（vision 约定主背景色排最前）。
      for (const c of styles.colors) {
        if (typeof c === 'string' && this._colorLuminance(c) !== null) {
          candidates.push(c)
          break
        }
      }
    }
    return candidates.find((v) => this._colorLuminance(v) !== null) || ''
  }

  /**
   * 解析颜色并返回感知亮度（0~1）；解析失败返回 null。
   * 支持 #hex / #aarrggbb / rgb() / rgba()（alpha 不参与亮度）。
   */
  _colorLuminance(colorStr) {
    if (typeof colorStr !== 'string') return null
    const s = colorStr.trim()
    let r, g, b
    try {
      if (s.startsWith('rgba') || s.startsWith('rgb')) {
        const match = s.match(/[\d.]+/g)
        if (!match || match.length < 3) return null
        r = parseFloat(match[0])
        g = parseFloat(match[1])
        b = parseFloat(match[2])
      } else if (s.startsWith('#')) {
        let hex = s.substring(1)
        if (hex.length === 3) hex = hex.split('').map((h) => h + h).join('')
        if (hex.length === 8) hex = hex.substring(2) // #aarrggbb → rrggbb
        if (hex.length !== 6) return null
        r = parseInt(hex.substring(0, 2), 16)
        g = parseInt(hex.substring(2, 4), 16)
        b = parseInt(hex.substring(4, 6), 16)
      } else {
        return null
      }
      if ([r, g, b].some((v) => Number.isNaN(v))) return null
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    } catch {
      return null
    }
  }

  /**
   *  质量门 — 检测"解析成功但内容全空"的静默降级
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
   *  检测 AI 响应格式
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
      const gridBgFixed = this._enrichGridItemBackgrounds(parsed, figmaData, resourceDomMapping)
      const bgFixed = this._enrichContentBackground(parsed, figmaData, resourceDomMapping)
      //  面板外壳剥离仅对微码生效（base-panel 宿主提供外壳）；Vue3 自行渲染外壳，必须保留 header/background
      const chromeStripped = this.componentType === 'microcode'
        ? this._stripBasePanelChrome(parsed, figmaData, resourceDomMapping)
        : 0
      // 🛡️ 0908 P0：chrome/content 分流。title-itself / panel-title / title-note / sub-header
      // 只属于 base-panel chrome 或标题备注，不得作为业务 section 进入 SubcomponentPlanner。
      // 兼容 layout.sections / sections / layoutStructure.sections / layoutStructure.layout.sections 四种形态。
      const chromeSectionsRemoved = this.componentType === 'microcode'
        ? stripChromeSectionsInPlace(parsed)
        : []
      if (chromeSectionsRemoved.length > 0) {
        logger.info('已从业务 sections 剥离 base-panel chrome 区块', {
          removed: chromeSectionsRemoved.map((s) => ({
            path: s.path,
            id: s.id,
            name: s.name,
            headerRelation: s.headerRelation,
          })),
        })
      }
      const bgSized = this._calculateAllBackgroundSizing(parsed, resourceDomMapping, figmaData)

      //  微码模式下，同步清理 Figma 文本和资源映射中的面板外壳资源
      let figmaTextCleaned = 0
      let resourcesFiltered = 0
      if (this.componentType === 'microcode') {
        figmaTextCleaned = this._stripPanelChromeFromFigmaText(parsed, figmaData)
        resourcesFiltered = this._filterPanelChromeResources(parsed, resourceDomMapping)
      }

      // 🛡️ P0-6: Figma 真实尺寸覆盖 vision 估计（2026-09-03 · mc-1788417205608-55428ff9 实锤）
      // 传导链断裂：extractFigmaHints 输出 @antd/tab 367x317（正确），但 vision 模型基于预览图
      // 视觉估计输出 width: 28px（错误），微码工程师使用 vision 结果生成代码，最终产物 width: 46px。
      // 治本：用 Figma bbox 精确尺寸覆盖 vision 估计的 section/element 尺寸（差异 >50% 时覆盖）。
      const figmaDimOverridden = this._overrideVisionDimensionsWithFigma(parsed, figmaData)

      // 🛡️ A4（2026-09-03）：元素级**高度比例**覆盖。
      // generate 模式跳过 layout-refiner（原比例修正环节），必须在主生成链补全，
      // 否则内层容器（device-switch）/兄弟项（tab 逐项）高度全丢 → 产物被内容撑高。
      const figmaElemRatioApplied = this._applyFigmaElementHeightRatios(parsed, figmaData)

      const analysisNormalization = this._normalizeAnalysisOutput(parsed, figmaData, resourceDomMapping)
      if (analysisNormalization?.applied > 0 || analysisNormalization?.hasDiagnostics) {
        logger.info('分析结果归一完成', analysisNormalization)
      }

      logger.info('解析后处理完成', { layoutFixed, bgFixed, gridBgFixed, chromeStripped, chromeSectionsRemoved: chromeSectionsRemoved.length, bgSized, figmaTextCleaned, resourcesFiltered, figmaDimOverridden, figmaElemRatioApplied })
    } catch (error) {
      logger.warn(`解析后处理异常: ${error.message}`)
    }
  }

  /**
   * 🛡️ P0-6: 用 Figma 真实 bbox 覆盖 vision 估计的 section/element 尺寸
   *
   * 传导链断裂修复（2026-09-03 · mc-1788417205608-55428ff9 实锤）：
   * - extractFigmaHints 输出 @antd/tab 367x317（正确）
   * - vision 模型基于预览图视觉估计输出 width: 28px（错误）
   * - 微码工程师使用 vision 结果生成代码，最终产物 width: 46px
   *
   * 治本：用 Figma bbox 精确尺寸覆盖 vision 估计（差异 >50% 时覆盖）。
   * 特别处理 @ 技术组件：使用子节点最大宽高（与 extractFigmaHints 一致的 effectiveW/effectiveH 逻辑）。
   *
   * @param {Object} parsed - vision 分析结果
   * @param {Object} figmaData - Figma 节点树
   * @returns {number} 覆盖的 section/element 数量
   */
  /**
   * 收集 Figma 节点树中所有有意义节点（带名称 + bbox）。
   * 抽为方法（2026-09-03）：供 A4 元素级比例覆盖与既有 section 级覆盖共用，避免两处漂移。
   * @param {object} figmaData Figma 节点树
   * @returns {Array<{name:string, type:string, bbox:object, effectiveW:number, effectiveH:number, isTechComponent:boolean}>}
   */
  _collectFigmaNodes(figmaData) {
    // 逻辑已下沉到纯函数模块（零依赖、可单测），此处保留方法签名供既有调用方使用
    return collectFigmaNodes(figmaData)
  }

  _overrideVisionDimensionsWithFigma(parsed, figmaData) {
    // ⚠️ sections 双形态兜底（2026-09-04 实锤，与 A4 figma-height-ratio 同因同修）：
    // analyze() 内 post-process 阶段 parsed 为扁平 layout（无 layoutStructure 壳），
    // 只认 layoutStructure.layout.sections → v3 管线恒 0 静默空转。
    const layout = parsed?.layoutStructure?.layout || parsed?.layout
    const sections = layout?.sections || parsed?.layoutStructure?.sections || parsed?.sections
    if (!Array.isArray(sections) || !figmaData) return 0

    let overrideCount = 0

    // 收集 Figma 节点树中所有有意义节点（带名称 + bbox）
    const figmaNodes = this._collectFigmaNodes(figmaData)

    // 对每个 section，尝试在 Figma 节点树中找到匹配
    for (const section of sections) {
      const sectionName = (section.name || '').toLowerCase()
      const sectionRole = (section.role || '').toLowerCase()
      const sectionId = (section.id || '').toLowerCase()

      // 策略 1：按语义匹配（role 或名称关键词）
      let matchedFigmaNode = null

      // tabs/nav 类 section → 匹配 Figma 中名称含 tab/nav/导航/菜单 的节点
      if (sectionRole === 'tabs' || sectionRole === 'nav' || /tab|导航|菜单|侧边/.test(sectionName)) {
        matchedFigmaNode = figmaNodes.find(n => {
          const nName = n.name.toLowerCase()
          return /tab|导航|菜单|侧边|nav|menu/.test(nName) && n.effectiveW > 100
        })
      }

      // header 类 section → 匹配 Figma 中名称含 header/title/标题 的节点
      if (!matchedFigmaNode && (sectionRole === 'header' || /header|标题|title/.test(sectionName))) {
        matchedFigmaNode = figmaNodes.find(n => {
          const nName = n.name.toLowerCase()
          return /header|标题|title/.test(nName) && n.effectiveW > 200
        })
      }

      // chart 类 section → 匹配 Figma 中名称含 chart/图表/图 的节点
      if (!matchedFigmaNode && (sectionRole === 'chart' || /chart|图表|图/.test(sectionName))) {
        matchedFigmaNode = figmaNodes.find(n => {
          const nName = n.name.toLowerCase()
          return /chart|图表|图|echarts/.test(nName) && n.effectiveW > 100
        })
      }

      // 如果找到匹配，用 Figma 尺寸覆盖 vision 估计
      if (matchedFigmaNode && section.body) {
        const visionWidth = this._extractPxValue(section.body.styles?.width)
        const visionHeight = this._extractPxValue(section.body.styles?.height)
        const figmaWidth = matchedFigmaNode.effectiveW
        const figmaHeight = matchedFigmaNode.effectiveH

        // 差异 >50% 时覆盖（vision 估计严重偏离 Figma 真值）
        const widthDiff = visionWidth > 0 ? Math.abs(figmaWidth - visionWidth) / visionWidth : 1
        const heightDiff = visionHeight > 0 ? Math.abs(figmaHeight - visionHeight) / visionHeight : 1

        if (widthDiff > 0.5 || heightDiff > 0.5) {
          if (!section.body.styles) section.body.styles = {}
          if (widthDiff > 0.5 && figmaWidth > 0) {
            section.body.styles.width = `${Math.round(figmaWidth)}px`
            overrideCount++
          }
          if (heightDiff > 0.5 && figmaHeight > 0) {
            section.body.styles.height = `${Math.round(figmaHeight)}px`
            overrideCount++
          }
          logger.info('Figma 尺寸覆盖 vision 估计', {
            sectionId: section.id,
            sectionName: section.name,
            matchedFigmaNode: matchedFigmaNode.name,
            visionWidth,
            visionHeight,
            figmaWidth: Math.round(figmaWidth),
            figmaHeight: Math.round(figmaHeight),
            widthDiff: (widthDiff * 100).toFixed(1) + '%',
            heightDiff: (heightDiff * 100).toFixed(1) + '%'
          })
        }
      }

      // 递归覆盖 section 内的 children（tab 项、卡片等）
      if (section.body?.children && Array.isArray(section.body.children)) {
        for (const child of section.body.children) {
          if (child.styles) {
            const childVisionWidth = this._extractPxValue(child.styles.width)
            const childVisionHeight = this._extractPxValue(child.styles.height)

            // 对 tab 项：如果 vision 估计宽度 < 50px，且 Figma 中有匹配的宽节点，覆盖
            if (child.role === 'tab' && childVisionWidth < 50 && matchedFigmaNode) {
              // tab 项宽度应该继承 section 宽度（横向 tab）或使用 Figma 中 tab 节点的真实宽度
              const tabWidth = matchedFigmaNode.effectiveW
              if (tabWidth > childVisionWidth * 1.5) {
                child.styles.width = `${Math.round(tabWidth)}px`
                overrideCount++
                logger.info('Figma 尺寸覆盖 tab 项宽度', {
                  sectionId: section.id,
                  childId: child.id,
                  childName: child.name,
                  visionWidth: childVisionWidth,
                  figmaWidth: Math.round(tabWidth)
                })
              }
            }
          }
        }
      }
    }

    // 🛡️ L2 / P0-2（2026-09-07）：bbox 几何校验，确定性重建行内复合结构，
    // 挂到 vision 结果供下游 planner/engineer 优先采用（避免 vision 误拆竖排）。
    // 🛡️ Loop 2.1.A（2026-09-10）：不止写旁路字段——把同行块**真正合并进 layout.sections**
    // （horizontal block），否则下游 planner/engineer 不读旁路，结构纠正在写盘前丢失。
    if (figmaData) {
      try {
        const inlineRows = rebuildSectionsPreservingInlineRows(figmaData)
        if (inlineRows.length) {
          parsed.inlineCompositeRows = inlineRows
          if (parsed.layoutStructure && !parsed.layoutStructure.inlineCompositeRows) {
            parsed.layoutStructure.inlineCompositeRows = inlineRows
          }
          // 真正改写结构表（顶层 layout）
          if (parsed.layout) {
            parsed.layout = mergeInlineRowsIntoSections(parsed.layout, inlineRows)
          }
          if (parsed.layoutStructure && parsed.layoutStructure.layout) {
            parsed.layoutStructure.layout = mergeInlineRowsIntoSections(
              parsed.layoutStructure.layout,
              inlineRows,
            )
          }
        }
      } catch (e) {
        logger.warn({ err: e?.message }, '[L2] rebuildSectionsPreservingInlineRows 失败，跳过兜底')
      }
    }

    return overrideCount
  }

  /**
   * 🛡️ A4（2026-09-03）：**元素级高度比例** Figma 覆盖。
   *
   * 为什么需要：Figma 真值已正确获取（如 device-switch 396.4×64.8、tab 容器 46×317、
   * tab 逐项 54/44/40/72/56），但既有 `_overrideVisionDimensionsWithFigma` 只覆盖
   * **section / 顶层 element** → 内层容器与兄弟项的高度**完全丢失** → 产物无高度约束被内容撑高。
   *
   * 为什么是「比例」而非固定 px（用户指正 2026-09-03）：
   *  - 组件需在不同宿主高度下自适应，写死 `height: 64.8px` 会破坏自适应（高容器留白、矮容器挤压）；
   *  - `code-structure-validator.js:2381` FLEX-004 禁止 **flex-grow 量纲混用**
   *    （把 Figma 像素高度当 grow 值属错误写法）；
   *  - 故同组统一用「相对组均值」的比例量级（量级 ~1），比例与设计视觉比例一致。
   *
   * 为什么放主生成链：generate 模式（写完即停）**跳过 layout-refiner / style-refiner**，
   * 原「按 Figma bbox 真实比例修正高度」的环节不执行（日志实证：全程无 refiner 节点）。
   *
   * 开关：MC_DISABLE_FIGMA_ELEM_RATIO=1 可关闭。
   * @param {object} parsed vision 分析结果
   * @param {object} figmaData Figma 节点树
   * @returns {number} 覆盖的元素数
   */
  _applyFigmaElementHeightRatios(parsed, figmaData) {
    const count = applyFigmaElementHeightRatios(parsed, figmaData, {
      disabled: process.env.MC_DISABLE_FIGMA_ELEM_RATIO === '1',
    })
    if (count) logger.info('A4 元素级高度比例已应用', { count })
    return count
  }

  /**
   * 从 CSS 值字符串中提取 px 数值（如 "28px" → 28）
   */
  _extractPxValue(value) {
    if (!value) return 0
    const match = String(value).match(/(\d+(?:\.\d+)?)px/)
    return match ? parseFloat(match[1]) : 0
  }

  /**
   * 🛡️ P0-1: 从 Figma 节点树确定性重建布局结构（视觉分析降级/超时兜底）
   *
   * 视觉分析失败（超时/解析失败）时，若 Figma 节点数据可用，则用 absoluteBoundingBox
   * 按 Y 坐标聚类重建 layout.sections —— 保证 engineer 永远有结构约束（从上到下顺序），
   * 避免降级后拿空结构盲写 DOM 导致区块颠倒（如 tab 被放进 footer）。
   *
   * 算法：收集深度 ≤ 3 的有意义节点（跳过 VECTOR 装饰/过小元素）→ 按 y 聚类成行
   * （ROW_TOLERANCE 容差）→ 每行生成一个 section（y 排序）→ role 按名称语义推断。
   *
   * @param {Object} figmaData - pruneRedundantFields 后的 Figma 节点树
   * @returns {Object|null} { layout, layoutSource, visualDegraded }；数据不可用时返回 null
   */
  _rebuildLayoutFromFigma(figmaData) {
    try {
      if (!figmaData || typeof figmaData !== 'object') return null
      if (!Array.isArray(figmaData.children) || figmaData.children.length === 0) return null

      const ROW_TOLERANCE = 24 // Y 聚类容差（px），同一行内的节点视为一个区块
      const collected = []
      const seen = new Set()

      const collect = (node) => {
        if (!node || typeof node !== 'object') return
        const id = node.id || node.name || ''
        if (id && seen.has(id)) return
        if (id) seen.add(id)

        const name = (node.name || '').trim()
        // 🛡️ 资源/技术封装剪枝（bg/icon/@antd 内部是资源渲染结果，不遍历）——与 _generateCoverageReport 同口径
        if (name && this._isResourceWrapperName(name)) return

        // 无语义名跳过（不计入区块），但继续遍历子树——深层有效内容（设备卡片等）不能被深度一刀切丢弃
        if (name && !this._isNonSemanticName(name)) {
          const b = node.absoluteBoundingBox
          // 跳过：无尺寸 / 纯 VECTOR 装饰 / 过小元素（图标、分隔线）
          // 🛡️ 放宽（2026-09-02）：带 characters 的 TEXT 节点是文字真值，即使窄（导航「监控」w=15、
          // 竖排文字 w<20）也必须收集——不能因「过小」而丢用户可见文字。
          const isTextWithChars =
            node.type === 'TEXT' &&
            typeof node.characters === 'string' &&
            node.characters.trim().length > 0
          if (
            b &&
            node.type !== 'VECTOR' &&
            ((b.width >= 20 && b.height >= 8) || isTextWithChars)
          ) {
            collected.push({
              id: node.id || null,
              name,
              type: node.type,
              x: b.x, y: b.y,
              width: b.width, height: b.height,
              children: Array.isArray(node.children) ? node.children.length : 0,
              hasText: !!node.characters
            })
          }
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) collect(child)
        }
      }
      collect(figmaData)

      if (collected.length === 0) return null

      // 按 y 升序聚类成行
      const rows = []
      for (const n of collected) {
        let target = rows.find(r => Math.abs(r.y - n.y) <= ROW_TOLERANCE)
        if (!target) {
          target = { y: n.y, nodes: [] }
          rows.push(target)
        }
        target.nodes.push(n)
      }
      rows.sort((a, b) => a.y - b.y)

      // 语义推断：行内任一节点名命中即归类
      const inferRole = (nodeNames) => {
        const joined = nodeNames.join(' ').toLowerCase()
        if (/header|title|标题|heading/.test(joined)) return 'header'
        // 🛡️ 竖向导航区必须独立归类为 nav（而非 tabs），否则 subcomponent-planner 不会产出导航 section，
        // 模型永不生成左侧竖向导航（实测 mc-max-1787793678799 导航整段缺失）。
        if (/导航|nav|菜单|侧边|sidebar|menu|纵向导航|竖向导航/.test(joined)) return 'nav'
        if (/tab|切换/.test(joined)) return 'tabs'
        if (/chart|echarts|line|graph|曲线|图表|图/.test(joined)) return 'chart'
        if (/footer|底部|底栏/.test(joined)) return 'footer'
        if (/list|列表|item|card|卡片/.test(joined)) return 'list'
        return 'section'
      }

      const sections = rows.map((row, i) => {
        // 行内取面积最大节点为主名
        row.nodes.sort((a, b) => (b.width * b.height) - (a.width * a.height))
        const primary = row.nodes[0]
        const allNames = row.nodes.map(n => n.name)
        const role = inferRole(allNames)
        return {
          id: `figma-${i + 1}`,
          name: primary.name,
          role,
          layout: 'vertical',
          layoutSource: 'figma',
          figmaY: Math.round(row.y),
          header: { title: primary.name },
          body: {
            layout: 'vertical',
            children: row.nodes.slice(1).map((n, j) => ({
              id: `figma-${i + 1}-${j + 1}`,
              name: n.name,
              role: 'item',
              figmaNode: n.id
            }))
          }
        }
      })

      return {
        layout: {
          type: 'vertical',
          direction: 'top-to-bottom',
          sections
        },
        layoutSource: 'figma',
        visualDegraded: true
      }
    } catch (error) {
      logger.warn('Figma 布局兜底重建失败（非阻塞）', { error: error.message })
      return null
    }
  }

  /**
   *  判断 Figma 节点名是否为「无语义名」（不应计入覆盖率统计）。
   * Figma 自动编号（Group 2136638523 / Vector / Rectangle 26 / Frame 1280）、
   * 通用占位名（bg / icon / g / circle / path）、技术组件名（@antd / @echarts / @ant）、
   * 结构占位名（btn / tit / charts / sub-header / header-）等，Vision 模型不识别这些
   * 「名字」是合理的——它们是图层命名而非内容语义，把它们算进 missing 会虚低覆盖率。
   */
  _isNonSemanticName(name) {
    const n = (name || '').trim()
    if (!n) return true
    // Figma 自动编号命名（Group 1 / Vector 2 / Rectangle 26 / Ellipse 3 ...）
    if (/^(group|vector|rectangle|ellipse|frame|line|polygon|star|slice|boolean)\b/i.test(n)) return true
    // 通用占位名
    if (/^(bg|icon|img|g|circle|path|mask|shape|image|text|label|value|content)\b/i.test(n)) return true
    // 技术组件名（@antd/tab / @echarts/bar / @ant/select ...）
    if (n.startsWith('@')) return true
    // 结构占位名
    if (/^(btn|button|tit|charts|sub-header|header-?|footer|slot-|tab)\b/i.test(n)) return true
    return false
  }

  /**
   *  判断节点是否为「资源/技术组件封装」（应剪枝整个子树，内部结构不纳入还原考核）。
   * 与 _isNonSemanticName 的区别：本方法只针对「资源/技术封装」，不包括 header/footer/tab
   * 等「结构容器」——结构容器内部通常有真实内容（如标题文字），剪枝会误伤覆盖率。
   */
  _isResourceWrapperName(name) {
    const n = (name || '').trim()
    if (!n) return false
    // 🛡️ 技术组件剪枝（2026-09-02 修复过度剪枝）：只剪「图表库」（@echarts/@chart 等
    // canvas 运行时渲染，下钻只会导出柱子碎片），UI 控件库（@antd 等）不剪——设计稿常把
    // 业务内容塞在 @antd/tab → cons/ 下（12 个真实设备卡片 + 导航）。与
    // figma-connector._isChartStackLibrary 同口径（mc-max-1788003760938 / 设备监测实锤）。
    const mark = n.toLowerCase().match(/@([a-z]+)/)
    if (
      mark &&
      /^(echarts?|chartjs|charts?|plotly|g2|g2plot|antv|d3|highcharts|bizcharts|vchart)$/.test(mark[1])
    ) {
      return true
    }
    // 矢量组「g」：内部是 circle/path 装饰矢量（实测 g(GROUP)→circle/path），不还原。
    // 精确匹配「g」本身，避免 /^g\b/ 误伤 g-xxx 这类真实命名。
    if (n.toLowerCase() === 'g') return true
    // 资源封装（bg 背景图 / icon 图标 / img|image 图片）：内部是资源渲染结果，不还原
    return /^(bg|icon|img|image)\b/i.test(n)
  }

  /**
   *  生成元素覆盖率报告
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
        // 🛡️ 剪枝：资源/技术组件封装（bg 背景图 / icon 图标 / @echarts 等）内部结构不纳入还原考核，
        // 否则背景图内文字、echarts 组件内坐标轴会被误计为「该还原却未识别」→ 虚低覆盖率。
        if (this._isResourceWrapperName(name)) return
        if (name && !SKIP_PATTERNS.some(p => p.test(name)) && FILL_NODE_TYPES.includes(node.type)) {
          figmaElements.push({
            name: name.substring(0, 60),
            type: node.type,
            depth,
            hasText: !!node.characters,
            // 🛡️ P0（2026-09-04）：TEXT 节点的真实文字（characters）也作为匹配键。
            // 覆盖率虚低根因之一：Figma 里 TEXT 节点 name 常为「Text 23」等无语义名，
            // 而真实内容在 characters（如「设备总数」）。Vision 识别的是 characters 文字，
            // 用 name 匹配必然命中失败 → 虚低覆盖率。
            characters: node.characters || '',
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
        // 🆕 覆盖率修复：加 obj.text 字段——vision 常把 tab 名/指标名（如「一氧化碳」「洞内照明」）
        // 放在 section.header.controls[].children[].text 里（而非 name/label），此前漏提取导致
        // 这些「已识别」的元素被误判为 missing → 覆盖率虚低（mc-max-1787717625475 实锤 27%）。
        // 🛡️ P0（2026-09-04）：再加 obj.value/content 字段——vision 把统计指标识别为
        // { name:'设备类型', value:'28' } 或 { content:'设备总数 68562' }，此前只提取 name 漏了 value/content，
        // 导致「数值」类文字（28/68562/98%）无法与 Figma characters 对上 → 虚低覆盖率。
        // 长度上限 30 防长文本（段落/描述）污染 identifiedNames。
        const names = [obj.name, obj.label, obj.title, obj.type, obj.role, obj.text, obj.value, obj.content].filter(Boolean)
        names.forEach(n => {
          if (typeof n === 'string' && n.length > 1 && n.length <= 30) identifiedNames.add(n.toLowerCase())
        })
        // 递归子节点（layout 必须包含：sections 实际嵌套在 layoutStructure.layout.sections 下，缺它会导致覆盖率恒 0）
        const childFields = ['children', 'sections', 'items', 'elements', 'body', 'header', 'content', 'controls', 'layout']
        childFields.forEach(f => {
          if (Array.isArray(obj[f])) obj[f].forEach(child => addIdentified(child, prefix))
          else if (obj[f] && typeof obj[f] === 'object') addIdentified(obj[f], prefix)
        })
      }
      // 布局 sections 可能位于：顶层 layout.sections（rawResult 直接解析后的结构）
      // 或 layoutStructure.sections / layoutStructure.layout.sections（vision 缓存的包装结构）。
      // 关键：parseAnalysisResult 返回的 parsed 顶层就是 layout（无 layoutStructure 包裹），
      // 之前只读 layoutStructure 导致 identifiedNames 恒空 → 覆盖率恒 0。
      const layoutSections =
        parsed.layout?.sections ||
        parsed.layoutStructure?.sections ||
        parsed.layoutStructure?.layout?.sections
      if (Array.isArray(layoutSections)) {
        layoutSections.forEach((s) => addIdentified(s))
      }
      // 递归整棵布局对象，抓取嵌套的 name/label/title/role
      if (parsed.layout) addIdentified(parsed.layout)
      if (parsed.layoutStructure) addIdentified(parsed.layoutStructure)
      // visualElements 或 styles 的 keys 也作为已识别名
      const ve = parsed.visualElements || parsed.styles
      if (ve && typeof ve === 'object' && !Array.isArray(ve)) {
        Object.keys(ve).forEach((k) => identifiedNames.add(k.toLowerCase()))
      }
      // 🛡️ P0（2026-09-04）：headerSlots 是顶层字段（不在 layout 内），addIdentified 递归不到。
      // 但 header 区的统计指标（「设备类型 28」「设备总数 68562」「完好率 98%」）正是 Vision 识别
      // 进 headerSlots 的，其 content 文字若不提取，对应的 Figma TEXT 节点会被判 missing →
      // 覆盖率虚低（设备监测 27% 实锤：7 个 header 同行节点全部漏配）。
      if (Array.isArray(parsed.headerSlots)) {
        for (const s of parsed.headerSlots) {
          if (!s || typeof s !== 'object') continue
          // content 是合并文本（如「设备类型 28」），加入后子串匹配可覆盖 name 和 value 两部分
          const slotTexts = [s.content, s.label, s.text, s.name].filter(Boolean)
          slotTexts.forEach(t => {
            if (typeof t === 'string' && t.length > 1 && t.length <= 30) identifiedNames.add(t.toLowerCase())
          })
        }
      }

      // 3. 交叉比对
      const matched = []
      const missing = []
      const uncertain = []

      for (const elem of figmaElements) {
        const nameLower = elem.name.toLowerCase()
        const charsLower = (elem.characters || '').toLowerCase()
        // 文本节点且长度>2 → 更可能是内容元素
        const isContentElement = elem.type === 'TEXT' && (elem.name.length > 2 || charsLower.length > 2)
        const isContainer = ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(elem.type) && elem.children > 0

        // 跳过太浅的根节点和太深的叶子
        if (elem.depth === 0 && elem.children > 10) continue
        if (elem.depth > 5 && !isContentElement) continue

        // 🛡️ 跳过无语义命名（Group/Vector/bg/@antd 等）：
        // 这些是图层命名而非内容语义，Vision 不识别它们是合理的，计入 missing 会虚低覆盖率。
        // 🛡️ P0（2026-09-04）：若 name 无语义但 characters 有真实文字，不跳过——
        // 真实文字是可匹配内容（如 name=Text 23、characters=设备总数）。
        if (this._isNonSemanticName(elem.name) && !charsLower.trim()) continue

        // 🛡️ P0（2026-09-04）：匹配键优先用 characters（Vision 识别的是真实文字），
        // 其次 name。任一命中即 matched——避免「name 无语义名 + characters 有真值」时
        // 被 name 判 missing，同时保留 name 匹配通道（FRAME/GROUP 容器无 characters）。
        const matchCandidates = charsLower.trim() ? [charsLower, nameLower] : [nameLower]
        const isIdentified = matchCandidates.some((cand) =>
          cand && Array.from(identifiedNames).some(
            id => id.includes(cand) || cand.includes(id)
          )
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
   *  从 Figma 节点树提取图表数据值
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
   *  剥离 base-panel 面板外壳
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
      logger.info('从 header child 提取 headerSlots', { count: extractedSlots.length })
    }

    // 移除 root background（base-panel 提供面板背景）
    if (hasRootBg) {
      delete structure.background
      logger.info('移除 structure 的 root background（base-panel chrome）')
    }

    // 移除 header child（base-panel 提供标题栏）
    structure.children = children.filter((_, idx) => idx !== headerIndex)
    logger.info('移除 structure 的 header child（base-panel chrome）', {
      remainingChildren: structure.children.length
    })

    // 如果移除后只剩一个 content/slot-con 子节点，可选：把它提升为 root 的直接内容
    // 但这里保守处理，只保留现有层级，让 ME 继续消费
    return 1 + extractedSlots.length
  }

  /**
   *  从 Figma 结构文本中剥离面板外壳节点（bg / header）
   * 仅在微码模式下调用，Vue3 不执行此清理
   */
  _stripPanelChromeFromFigmaText(parsed, figmaData) {
    if (!parsed || !figmaData) return 0

    let cleaned = 0
    const structure = parsed.structure
    if (!structure) return 0

    // 从 Figma 数据中识别根节点的 bg 和 header 子节点
    const rootNode = figmaData.document || figmaData
    const children = Array.isArray(rootNode.children) ? rootNode.children : []

    // 标记需要剥离的节点名称
    const panelChromeNames = new Set()
    for (const child of children) {
      const name = (child.name || '').toLowerCase()
      // 匹配根节点的 bg / header / panel-header / title-bar
      if (/^(bg|background|header|panel-header|title-bar)$/i.test(name)) {
        panelChromeNames.add(child.name || child.id)
        cleaned++
      }
    }

    // 如果 parsed 中有 figmaStructureText 或类似字段，清理其中的面板节点行
    if (parsed.figmaStructureText && typeof parsed.figmaStructureText === 'string') {
      const lines = parsed.figmaStructureText.split('\n')
      const filteredLines = lines.filter(line => {
        // 移除包含面板外壳资源引用的行
        for (const chromeName of panelChromeNames) {
          if (line.includes(chromeName)) return false
        }
        // 移除根节点 bg 资源引用行（如 "bg → bg-xxxx.png"）
        if (/^\s*-?\s*bg\s+\d+x\d+\s*→/.test(line)) return false
        if (/^\s*-?\s*header\s+\d+x\d+/.test(line)) return false
        return true
      })
      parsed.figmaStructureText = filteredLines.join('\n')
      cleaned += (lines.length - filteredLines.length)
    }

    if (cleaned > 0) {
      logger.info(' 从 Figma 文本中剥离面板外壳', { cleaned })
    }
    return cleaned
  }

  /**
   *  从 resourceDomMapping 中过滤面板级资源
   * 仅在微码模式下调用，Vue3 不过滤
   */
  _filterPanelChromeResources(parsed, resourceDomMapping) {
    if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) return 0

    let filtered = 0
    const panelChromePaths = []

    // 识别面板级资源的 figmaPath
    for (const mapping of resourceDomMapping) {
      const figmaPath = mapping.figmaPath || ''
      // 匹配根节点一级子节点的 bg / header 资源
      // 例如 "cp-环境监测/bg" 或 "cp-xxx/header"
      // ⚠️ 只按 figmaPath 的「根一级子节点」精确匹配（两段路径）。
      // 之前还按 name 匹配，但 Figma 里所有背景填充节点统一叫 'bg'（switch/active/bg、tab/bg、cons/bg…），
      // 按 name 匹配会把卡片/导航/网格项的所有背景图误判成面板外壳资源，导致微码组件背景图全丢。
      if (/^[^/]+\/(bg|background|header|panel-header|title-bar)$/i.test(figmaPath)) {
        panelChromePaths.push(figmaPath)
        filtered++
      }
    }

    // 从 resourceDomMapping 中移除面板级资源
    if (panelChromePaths.length > 0) {
      const filteredMappings = resourceDomMapping.filter(m => {
        const path = m.figmaPath || ''
        return !panelChromePaths.includes(path)
      })
      // 原地修改数组
      resourceDomMapping.length = 0
      resourceDomMapping.push(...filteredMappings)

      logger.info(' 从资源映射中过滤面板级资源', {
        filtered: filtered,
        remaining: filteredMappings.length
      })
    }

    return filtered
  }

  /**
   *  从 header child 中提取可映射为 base-panel 插槽的装饰元素
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
   *  基于图/父尺寸比值计算精确的 backgroundSize / backgroundPosition / backgroundRepeat
   * 替代硬编码 cover/center/no-repeat，利用 resourceDomMapping 的 figmaBox 和
   * preview-analysis 的 dimensions 计算精确比值。
   *
   * 规则来源：Figma 节点背景尺寸与容器尺寸的比例计算（原 figma-node-rules.md 已归档）：
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
   *  递归遍历 structure 树，为所有含背景图的节点计算精确的 size/position/repeat
   * 同时也修正 _enrichContentBackground 之前硬编码的 cover/center/no-repeat 值。
   *
   * @param {Object} parsed - preview-analysis 结果
   * @param {Array} resourceDomMapping - 资源映射（含 figmaBox）
   * @returns {number} 修正的节点数
   */
  _calculateAllBackgroundSizing(parsed, resourceDomMapping, figmaData = null) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return 0

    // 构建 resourceFile → figmaBox / figmaNodeId 映射（快速查找）
    const resourceFigmaMap = new Map()
    const resourceNodeIdMap = new Map()
    for (const m of resourceDomMapping) {
      if (m.resourceFile && m.figmaBox) {
        if (!resourceFigmaMap.has(m.resourceFile)) resourceFigmaMap.set(m.resourceFile, m.figmaBox)
      }
      if (m.resourceFile && m.figmaNodeId) {
        if (!resourceNodeIdMap.has(m.resourceFile)) resourceNodeIdMap.set(m.resourceFile, m.figmaNodeId)
      }
    }

    // 构建 figmaNodeId → 父节点尺寸 映射（bg 节点的直接父节点即「背景被应用到的容器」）
    const nodeParentDimsMap = new Map()
    if (figmaData) {
      this._buildNodeParentDimsMap(figmaData, nodeParentDimsMap)
    }

    let fixedCount = 0
    const structure = parsed?.structure

    // 递归遍历所有节点，查找含 background / backgroundImage / resourceFile 的节点
    this._walkElements(parsed, (node) => {
      if (!node || typeof node !== 'object') return

      // 获取节点的背景图 resourceFile（三种格式）
      let bgResourceFile = null
      let targetField = 'background'
      if (node.background?.resourceFile) {
        bgResourceFile = node.background.resourceFile
      } else if (node.backgroundImage?.src) {
        bgResourceFile = node.backgroundImage.src
        targetField = 'backgroundImage'
      } else if (node.resourceFile && /background/i.test(node.recommendedUsage || '')) {
        // 直接 resourceFile 字段（card/tab/网格项背景），仅 recommendedUsage 含 background 才算背景
        bgResourceFile = node.resourceFile
        targetField = 'resourceFile'
      }

      if (!bgResourceFile) return

      // 从映射中获取 bg 的 figmaBox
      const bgFigmaBox = resourceFigmaMap.get(bgResourceFile)
      if (!bgFigmaBox) return

      // 父容器尺寸：优先节点自身 dimensions → Figma 树里 bg 的父节点尺寸 → structure.dimensions
      const nodeId = resourceNodeIdMap.get(bgResourceFile)
      const figmaParentDims = nodeId ? nodeParentDimsMap.get(nodeId) : null
      const parentDims = node.dimensions || figmaParentDims || structure?.dimensions || null
      if (!parentDims) return

      // 计算精确的 background 属性
      const sizing = this._calculateBackgroundSizing(bgFigmaBox, parentDims)

      // 应用到 background 字段格式（structure.background）
      if (targetField === 'background' && node.background && typeof node.background === 'object') {
        node.background.backgroundSize = sizing.backgroundSize
        node.background.backgroundPosition = sizing.backgroundPosition
        node.background.backgroundRepeat = sizing.backgroundRepeat
        if (sizing.needsOverflowHidden) node.background.needsOverflowHidden = true
        fixedCount++
      } else if (targetField === 'backgroundImage' && node.backgroundImage && typeof node.backgroundImage === 'object') {
        // 应用到 backgroundImage 字段格式（content.backgroundImage）
        node.backgroundSize = sizing.backgroundSize
        node.backgroundPosition = sizing.backgroundPosition
        node.backgroundRepeat = sizing.backgroundRepeat
        if (sizing.needsOverflowHidden) node.needsOverflowHidden = true
        fixedCount++
      } else if (targetField === 'resourceFile') {
        // 直接 resourceFile 字段：精确 sizing 落到节点自身，供 style-mapper / 代码生成 prompt 精确还原
        node.backgroundSize = sizing.backgroundSize
        node.backgroundPosition = sizing.backgroundPosition
        node.backgroundRepeat = sizing.backgroundRepeat
        if (sizing.needsOverflowHidden) node.needsOverflowHidden = true
        fixedCount++
      }

      logger.info('background 精确尺寸计算', {
        resourceFile: bgResourceFile,
        targetField,
        bgBox: `${bgFigmaBox.width}×${bgFigmaBox.height}`,
        parentBox: `${parentDims.width}×${parentDims.height}`,
        sizing
      })
    })

    return fixedCount
  }

  /**
   * 遍历 Figma 节点树，构建 figmaNodeId → 父节点尺寸 映射。
   * 用于 backgroundSize 精确计算：bg 节点的直接父节点即「背景被应用到的容器」。
   * @param {Object} node - Figma 节点（经 pruneRedundantFields，含 id/absoluteBoundingBox/children）
   * @param {Map} map - 输出映射 figmaNodeId → { width, height }
   * @param {Object|null} parentBox - 父节点的 absoluteBoundingBox
   */
  _buildNodeParentDimsMap(node, map, parentBox = null) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) this._buildNodeParentDimsMap(child, map, parentBox)
      return
    }
    const nid = node.id
    const box = node.absoluteBoundingBox
    if (nid && box && box.width > 0 && box.height > 0 && parentBox && parentBox.width > 0 && parentBox.height > 0) {
      map.set(nid, { width: parentBox.width, height: parentBox.height })
    }
    const nextParentBox = box || parentBox
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this._buildNodeParentDimsMap(child, map, nextParentBox)
      }
    }
  }

  /**
   * 为 grid 容器（content-grid，含 items）的每个 item 补 bg 资源归属。
   * 根因：视觉分析常只给网格项 icon 的 resourceFile，漏了同节点的 bg，
   * 导致代码生成时模型自行从资源池挑 bg（无 sizing 信息，最终写 cover）。
   * 通过 item.icon.resourceFile → figmaNodeId → 祖先节点 → 同祖先下的 bg 资源 精确匹配，
   * 注入 item.resourceFile + recommendedUsage=backgroundBlock，
   * 使后续 _calculateAllBackgroundSizing 能对网格项背景做精确尺寸计算（100% 100% 等）。
   * @returns {number} 补全的 item 数
   */
  _enrichGridItemBackgrounds(parsed, figmaData, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return 0
    if (!figmaData) return 0

    // figmaNodeId → 父节点 id 映射（向上找祖先用）
    const parentIdMap = new Map()
    this._buildNodeParentIdMap(figmaData, parentIdMap)

    // 「父节点 id → 该父节点下的 bg 资源」映射（去重取第一个）
    const parentIdToBg = new Map()
    for (const m of resourceDomMapping) {
      if (m.previewAnalysisRole === 'bg' && m.resourceFile && m.figmaNodeId) {
        const pid = parentIdMap.get(m.figmaNodeId)
        if (pid && !parentIdToBg.has(pid)) {
          parentIdToBg.set(pid, m)
        }
      }
    }

    let fixedCount = 0
    const sections = parsed.layout?.sections || parsed.sections || []
    for (const section of sections) {
      const children = section.body?.children || section.children || []
      for (const child of children) {
        if (!child || typeof child !== 'object') continue
        if (Array.isArray(child.items) && child.items.length > 0) {
          for (const item of child.items) {
            if (this._attachGridItemBackground(item, resourceDomMapping, parentIdMap, parentIdToBg)) {
              fixedCount++
            }
          }
        }
      }
    }

    if (fixedCount > 0) {
      logger.info('grid 网格项背景补全', { fixedCount })
    }
    return fixedCount
  }

  /**
   * 给单个网格项补 bg：通过 icon → figmaNodeId → 向上找有 bg 的祖先 → 注入 resourceFile。
   * @returns {boolean} 是否补全成功
   */
  _attachGridItemBackground(item, resourceDomMapping, parentIdMap, parentIdToBg) {
    if (!item || typeof item !== 'object') return false
    // 已有背景则跳过（避免覆盖 LLM 已给的 bg）
    if (item.resourceFile || item.background?.resourceFile || item.backgroundImage?.src) return false

    const iconResourceFile = this._findItemIconResource(item)
    if (!iconResourceFile) return false

    const iconEntry = resourceDomMapping.find(m => m.resourceFile === iconResourceFile && m.previewAnalysisRole === 'icon')
    if (!iconEntry?.figmaNodeId) return false

    // 向上找祖先节点，命中「有 bg 资源」的祖先
    let pid = parentIdMap.get(iconEntry.figmaNodeId)
    while (pid) {
      const bg = parentIdToBg.get(pid)
      if (bg) {
        item.resourceFile = bg.resourceFile
        item.recommendedUsage = 'backgroundBlock'
        return true
      }
      pid = parentIdMap.get(pid)
    }
    return false
  }

  /**
   * 递归查找网格项里的 icon resourceFile（优先 item.icon.resourceFile）。
   */
  _findItemIconResource(item) {
    if (!item || typeof item !== 'object') return null
    if (item.icon?.resourceFile) return item.icon.resourceFile
    if (item.content?.icon?.resourceFile) return item.content.icon.resourceFile
    const kids = item.children || item.items || []
    for (const k of kids) {
      const r = this._findItemIconResource(k)
      if (r) return r
    }
    return null
  }

  /**
   * 遍历 Figma 节点树，构建 figmaNodeId → 父节点 id 映射。
   * @param {Object} node - Figma 节点（含 id/children）
   * @param {Map} map - 输出映射 figmaNodeId → 父节点 id
   * @param {string|null} parentId - 父节点 id
   */
  _buildNodeParentIdMap(node, map, parentId = null) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) this._buildNodeParentIdMap(child, map, parentId)
      return
    }
    const nid = node.id
    if (nid && parentId) map.set(nid, parentId)
    for (const child of node.children || []) {
      this._buildNodeParentIdMap(child, map, nid)
    }
  }

  /**
   *  递归遍历元素树
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
    // 遍历 structure 字段（VP 新格式的主结构树）
    if (node.structure && typeof node.structure === 'object') {
      this._walkElements(node.structure, visitor)
    }
  }

  /**
   *  修正 stat-item 的混合布局
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
      logger.info(`stat-item 混合布局修正: ${label.text || 'unknown'}`, {
        hasValue: !!value,
        extras: others.length
      })
    })

    return fixedCount
  }

  /**
   *  判断某个 stat-item 是否应该使用 mixed 布局
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
   *  根据 element.resourceFile 或 resourceDomMapping 找到对应 Figma 节点
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
   *  按 id 查找 Figma 节点（递归）
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
   *  按 name 查找 Figma 节点（递归，取第一个）
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
   *  查找包含指定子节点的父节点
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
   *  为 content / body 区域补全遗漏的背景图
   * 规则：从 resourceDomMapping 中找到属于内容区（slot-con/content）的 bg 资源。
   */
  _enrichContentBackground(parsed, figmaData, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return 0

    //  CSS 替代资源也视为可用（downloadStatus='css'）
    const available = resourceDomMapping.filter(m => (m.downloadStatus === 'success' || m.downloadStatus === 'css') && m.previewAnalysisRole === 'bg')
    if (available.length === 0) return 0

    let fixedCount = 0

    // 定位 content 对象（flat 格式）
    const content = parsed.content
    if (content && typeof content === 'object') {
      // 🛡️ 容器判断：content.children 已带 resourceFile 时，背景由子元素决定，不补统一背景图
      const contentHasChildResources = this._bodyChildrenHaveResources(content)
      const contentBg = contentHasChildResources ? null : this._findContentBackgroundResource(content, available, parsed)
      if (contentBg && !content.backgroundImage) {
        // 用精确计算替代硬编码 cover/center/no-repeat
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
        logger.info('content 背景图补全', { src: contentBg.resourceFile, sizing })
      }
    }

    // 也处理 schema 格式 sections 的 body
    const sections = parsed.layout?.sections || parsed.sections || []
    for (const section of sections) {
      const body = section.body
      if (body && typeof body === 'object' && !body.backgroundImage) {
        // 🛡️ 容器判断：body.children 里已有子节点带 resourceFile（卡片/导航/网格项各自带背景），
        // 说明该 section 是容器，背景应由子元素渲染，不应补统一背景图。
        // 否则 _findContentBackgroundResource 会误把某张具体卡片背景（如 switch/active 的 bg-8788）
        // 放大贴满整个 section（header/列表区都会中招，视觉严重错乱）。
        if (this._bodyChildrenHaveResources(body)) continue
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
          logger.info('body 背景图补全', { src: bodyBg.resourceFile, sizing })
        }
      }
    }

    return fixedCount
  }

  /**
   *  从可用 bg 资源中找到属于当前内容区的背景图
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
      if (w <= 80 || h <= 40) return false
      // 🛡️ 排除装饰横幅/分隔线：宽高比极端（>4:1 或 <0.25:1）的图片不是内容区背景
      // 典型案例：bg-_m-34.png (852×184, ratio=4.6:1) 是 TotalTraffic 内汽车图标横幅
      const ratio = w / Math.max(h, 1)
      if (ratio > 4 || ratio < 0.25) return false
      // 🛡️ 高度较小且宽高比偏大的也排除（如 <120px 且 ratio>2.5 的细条装饰）
      if (h < 120 && ratio > 2.5) return false
      return true
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
   * 判断容器（content/body）是否已由子元素各自带资源（resourceFile/bgResource/backgroundImage）。
   * 若子元素已带背景/图标资源，说明该容器是「布局容器」，背景应由子元素渲染，
   * 不应再补统一背景图（避免把某张具体卡片背景放大贴满整个 section）。
   * @param {Object} body - content 或 section.body
   * @returns {boolean}
   */
  _bodyChildrenHaveResources(body) {
    const children = body?.children || body?.items || []
    if (!Array.isArray(children) || children.length === 0) return false
    return children.some((c) => this._nodeHasResource(c))
  }

  _nodeHasResource(node) {
    if (!node || typeof node !== 'object') return false
    if (node.resourceFile || node.bgResource || node.backgroundImage?.src) return true
    const kids = node.children || node.items || []
    if (Array.isArray(kids) && kids.length > 0) {
      return kids.some((k) => this._nodeHasResource(k))
    }
    return false
  }

  /**
   *用 resourceDomMapping 丰富分析结果
   * 将 placeholder → 实际资源文件路径，让下游 LLM 直接看到可用资源
   */
  _enrichWithResourceMapping(parsed, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) return

    //  CSS 替代资源也视为可用（downloadStatus='css'）
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
      //  携带 CSS 替代值（downloadStatus='css' 时有值）
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
   *从分析结果推断组件类型（AI 未返回顶层 type 时兜底）
   * 遍历 layout.sections 的 header.controls / body.children，识别：
   *   - tab-switch：切换按钮/标签组
   *   - chart：图表容器
   *   - form：表单控件
   *   - stat-grid：指标卡组（stat-item）
   *   - mixed：多类型混合
   * @param {Object} analysisResult
   * @returns {{ type: string, target: string, description: string }}
   */
  _inferComponentType(analysisResult) {
    const fallback = { type: '', target: '', description: '' }
    if (!analysisResult) return fallback

    const sections = analysisResult.layout?.sections
      || analysisResult.layoutStructure?.sections
      || []
    if (!Array.isArray(sections) || sections.length === 0) return fallback

    const types = new Set()
    const targets = []
    const descParts = []

    for (const s of sections) {
      const header = s.header || {}
      const body = s.body || {}
      const controls = Array.isArray(header.controls) ? header.controls : []
      const children = Array.isArray(body.children) ? body.children : []

      for (const c of controls) {
        if (c.type === 'tab-switch') {
          types.add('tab-switch')
          targets.push('切换标签组')
          const opts = Array.isArray(c.options) ? c.options.join('、') : ''
          if (opts) descParts.push(`Tab切换：${opts}`)
        } else if (c.type === 'icon-group' || c.type === 'icon') {
          types.add('icon-group')
        } else if (c.type === 'button') {
          types.add('button')
        }
      }

      for (const ch of children) {
        const t = (ch.type || '').toLowerCase()
        if (t.includes('chart') || t.includes('graph') || t.includes('echarts')) {
          types.add('chart')
          targets.push('图表展示区')
          if (ch.name) descParts.push(`图表：${ch.name}`)
        } else if (t.includes('form') || t.includes('input') || t.includes('select')) {
          types.add('form')
        } else if (t.includes('stat') || t.includes('metric') || t.includes('indicator')) {
          types.add('stat-grid')
        }
      }
    }

    if (types.size === 0) return fallback

    // 优先级：tab-switch > chart > form > stat-grid；多类型组合 → mixed
    let type = 'mixed'
    if (types.size === 1) {
      type = [...types][0]
    } else {
      const rank = { 'tab-switch': 0, chart: 1, form: 2, 'stat-grid': 3 }
      const sorted = [...types].sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9))
      type = sorted[0] + '-' + sorted.join('-')
    }

    return {
      type,
      target: targets.join('、'),
      description: descParts.join('；'),
    }
  }

  /**
   *从分析结果提取视觉元素列表（AI 未提供 visualElements 时兜底）
   * 遍历 sections 收集 body.children + header.controls
   * @param {Object} analysisResult
   * @returns {Array}
   */
  _extractVisualElementsFromSections(analysisResult) {
    const sections = analysisResult?.layout?.sections
      || analysisResult?.layoutStructure?.sections
      || []
    if (!Array.isArray(sections)) return []

    const collected = []
    for (const s of sections) {
      const header = s.header || {}
      const body = s.body || {}
      if (Array.isArray(header.controls)) collected.push(...header.controls)
      if (Array.isArray(body.children)) collected.push(...body.children)
    }
    return collected
  }

  /**
   *从分析结果推断 headerSlots（AI 未提供时兜底）
   * @param {Object} analysisResult
   * @returns {Array}
   */
  _inferHeaderSlots(analysisResult) {
    const sections = analysisResult?.layout?.sections
      || analysisResult?.layoutStructure?.sections
      || []
    if (!Array.isArray(sections)) return []

    const slots = []
    for (const s of sections) {
      const header = s.header || {}
      // 标题文字本身由 base-panel 渲染（通过 analysisTarget/panelKey 传递），不进插槽。
      for (const c of (Array.isArray(header.controls) ? header.controls : [])) {
        const cType = c.type || ''
        // 🛡️ P1（2026-09-08）：携带 figmaNodeId 供下游 C-1 过滤
        const figmaNodeId = c.figmaNodeId || c.id || s.figmaNodeId || s.id || ''
        // 统计指标（text-group / stat-item / statistic）→ header-right 插槽
        if (cType === 'text-group' || cType === 'stat-item' || cType === 'statistic') {
          const label = c.name || c.label || ''
          const value = (c.value !== undefined && c.value !== null && c.value !== '') ? c.value : ''
          slots.push({
            slotType: 'header-right',
            elementType: 'statistic',
            content: label && value ? `${label} ${value}` : (label || String(value)),
            sectionId: s.id || '',
            figmaNodeId,
          })
        } else if (cType === 'tab-switch' || cType === 'icon-group' || cType === 'icon-button') {
          // Tab 切换 / 图标组 / 图标按钮 → header-right 插槽
          slots.push({
            slotType: 'header-right',
            elementType: cType === 'tab-switch' ? 'tab' : 'icon',
            content: c.label || c.name || '',
            sectionId: s.id || '',
            figmaNodeId,
          })
        }
      }
    }
    return slots
  }

  /**
   * 🛡️ P1-1（2026-09-08）：从 inlineCompositeRows 推断 headerSlots。
   * 实现已抽到 utils/inline-header-slot-inferrer.js（纯函数，单一事实源），
   * 此处仅委托调用，保持 VisualParser 既有调用面不变。
   * 💾 冗余说明：不要在本类内重复实现该逻辑，改 util 必须同步改此委托。
   */
  _inferHeaderSlotsFromInlineRows(analysisResult) {
    return inferHeaderSlotsFromInlineRows(analysisResult)
  }

  /**
   *从分析结果推断 chartDataHints（AI 未提供时兜底）
   * @param {Object} analysisResult
   * @returns {Array}
   */
  _inferChartDataHints(analysisResult) {
    const charts = analysisResult?.charts || []
    if (!Array.isArray(charts)) return []

    const hints = []
    for (const c of charts) {
      const series = Array.isArray(c.series) ? c.series : []
      const legend = Array.isArray(c.legend) ? c.legend : series
      const axes = typeof c.axes === 'string' ? c.axes : ''
      hints.push({
        chartType: c.type || '',
        title: c.title || c.section || '',
        labels: legend,
        values: [],
        note: axes || (Array.isArray(c.notes) ? c.notes.join(';') : ''),
      })
    }
    return hints
  }

  /**
   * 归一化视觉分析结果：把可消费诊断集中回写到 parsed 上，供 planner / validator 使用。
   * 这个阶段不改变主结构语义，只补充确定性诊断与元数据。
   */
  _normalizeAnalysisOutput(parsed, figmaData = null, resourceDomMapping = null) {
    if (!parsed || typeof parsed !== 'object') {
      return { applied: 0, hasDiagnostics: false, skipped: true }
    }

    const diagnostics = Array.isArray(parsed.analysisDiagnostics) ? [...parsed.analysisDiagnostics] : []
    const fixes = Array.isArray(parsed.analysisFixes) ? [...parsed.analysisFixes] : []
    const appliedKeys = new Set()

    const pushDiagnostic = (kind, detail, extra = {}) => {
      if (!kind || !detail) return
      diagnostics.push({ kind, detail, ...extra })
    }

    const pushFix = (kind, detail, extra = {}) => {
      if (!kind || !detail) return
      fixes.push({ kind, detail, ...extra })
    }

    const sections = parsed.layout?.sections || parsed.sections || parsed.layoutStructure?.sections || parsed.layoutStructure?.layout?.sections || []
    const chartHints = []
    const chartDiagnostics = []
    if (Array.isArray(parsed.charts) && parsed.charts.length > 0) {
      for (const chart of parsed.charts) {
        if (!chart || typeof chart !== 'object') continue
        const chartType = String(chart.type || '').trim().toLowerCase()
        const title = String(chart.title || chart.section || chart.name || '').trim()
        if (!chartType) {
          chartDiagnostics.push({ kind: 'chart-missing-type', title: title || undefined, detail: '图表缺少 type，后续会影响 prompt 选型与 engineer 渲染' })
        }
        const inferred = this._inferChartDataHints({ charts: [chart] })
        if (Array.isArray(inferred) && inferred.length > 0) {
          chartHints.push(...inferred)
        }
      }
      if (chartHints.length > 0) {
        parsed.chartDataHints = chartHints
        appliedKeys.add('chartDataHints')
        pushFix('chartDataHints', '已回写 chartDataHints 兜底结果', { count: chartHints.length })
      }
      if (chartDiagnostics.length > 0) {
        pushDiagnostic('chart-structure', '发现图表结构缺字段，需要下游谨慎消费', { items: chartDiagnostics })
      }
    }

    const normalizedHeaderSlots = Array.isArray(parsed.headerSlots) ? parsed.headerSlots : []
    if (sections.length > 0 && normalizedHeaderSlots.length === 0) {
      const inferredSlots = this._inferHeaderSlots(parsed)
      if (inferredSlots.length > 0) {
        parsed.headerSlots = inferredSlots
        appliedKeys.add('headerSlots')
        pushFix('headerSlots', '已从 sections 兜底推断 headerSlots', { count: inferredSlots.length })
      }
    }

    // 🛡️ P1-1（2026-09-08）：第二轮兜底——sections 中无 header controls（被 chrome-filter 剥离），
    // 从 inlineCompositeRows 中提取 header- 前缀节点作为 headerSlots。
    // 🛡️ P1（2026-09-09）：改为合并语义——保留现有 slot（section-inferred 或其他来源），
    // 去重追加 inline 推断结果。确保所有 slot 携带 figmaNodeId 供下游 C-1 过滤。
    // 合并去重逻辑抽到 utils/inline-header-slot-inferrer.js（mergeHeaderSlots，单一事实源）。
    if (Array.isArray(parsed.inlineCompositeRows)) {
      const inlineHeaderSlots = this._inferHeaderSlotsFromInlineRows(parsed)
      if (inlineHeaderSlots.length > 0) {
        const existingSlots = Array.isArray(parsed.headerSlots) ? parsed.headerSlots : []
        const oldCount = existingSlots.length
        parsed.headerSlots = mergeHeaderSlots(existingSlots, inlineHeaderSlots)
        const newCount = parsed.headerSlots.length
        if (newCount > oldCount) {
          appliedKeys.add('headerSlots')
          pushFix('headerSlots', `已从 inlineCompositeRows 追加推断 headerSlots（合并 ${oldCount}+${newCount - oldCount} = ${newCount}）`, { count: newCount - oldCount, total: newCount })
        }
      }
    }

    // 🛡️ P1-1（2026-09-08）§5.3.3：如果最终 headerSlots 仍为空但有视觉元素，记录诊断日志
    if ((!Array.isArray(parsed.headerSlots) || parsed.headerSlots.length === 0) && sections.length > 0) {
      const visualElemLabels = []
      if (parsed.visualElements && typeof parsed.visualElements === 'object') {
        const ve = Array.isArray(parsed.visualElements) ? parsed.visualElements : Object.values(parsed.visualElements)
        for (const e of ve) {
          if (e && (e.label || e.name || e.title)) {
            const label = e.label || e.name || e.title
            if (/header|title|tab|导航/i.test(String(label))) visualElemLabels.push(label)
          }
        }
      }
      pushDiagnostic('headerSlots-missing', '视觉元素存在但 headerSlots 为空，标题栏 tab/统计/图标可能丢失', {
        visualHeaderLabels: visualElemLabels.length > 0 ? visualElemLabels : undefined,
        sectionsCount: sections.length,
        inlineRowsCount: Array.isArray(parsed.inlineCompositeRows) ? parsed.inlineCompositeRows.length : 0,
      })
    }

    if (figmaData) {
      const textTruth = parsed.textTruthValidation || this._validateVisionTextAgainstFigma(parsed, figmaData)
      if (textTruth && typeof textTruth === 'object') {
        parsed.textTruthValidation = textTruth
        appliedKeys.add('textTruthValidation')
        if (textTruth.hasSuspicious) {
          pushDiagnostic('text-truth', '发现可疑文本，建议下游优先使用 Figma 真值', {
            truthCount: textTruth.truthCount || 0,
            suspiciousCount: textTruth.suspiciousTexts?.length || 0,
            suspiciousTexts: (textTruth.suspiciousTexts || []).slice(0, 5),
          })
        }
      }

      const coverageReport = parsed.coverageReport || this._generateCoverageReport(parsed, figmaData)
      if (coverageReport && typeof coverageReport === 'object') {
        parsed.coverageReport = coverageReport
        appliedKeys.add('coverageReport')
        pushDiagnostic('coverage', '已写回覆盖率报告，供 planner / quality gate 使用', {
          coverageRate: coverageReport.coverageRate,
          summary: coverageReport.summary,
        })
      }
    }

    if (this.componentType === 'microcode') {
      const chromeSections = sections.filter((section) => isChromeOnlySection(section))
      if (chromeSections.length > 0) {
        parsed.chromeSectionDiagnostics = chromeSections.map((section) => ({
          id: section?.id || '',
          name: section?.name || section?.title || '',
          headerRelation: section?.headerRelation || section?.header?.relation || section?.relation || '',
        }))
        appliedKeys.add('chromeSectionDiagnostics')
        pushFix('chromeSectionDiagnostics', '已记录被剥离的 chrome section 诊断', { count: chromeSections.length })
      }
    }

    if (resourceDomMapping && Array.isArray(resourceDomMapping) && resourceDomMapping.length > 0) {
      const resourceDiagnostics = resourceDomMapping
        .filter((m) => m?.downloadStatus === 'missing' || m?.downloadStatus === 'failed')
        .slice(0, 10)
        .map((m) => ({
          role: m.previewAnalysisRole || '',
          file: m.resourceFile || '',
          status: m.downloadStatus || '',
        }))
      if (resourceDiagnostics.length > 0) {
        parsed.resourceDiagnostics = resourceDiagnostics
        appliedKeys.add('resourceDiagnostics')
        pushDiagnostic('resource', '存在不可用资源映射，后续应避免引用失败资源', { count: resourceDiagnostics.length })
      }
    }

    if (diagnostics.length > 0) parsed.analysisDiagnostics = diagnostics
    if (fixes.length > 0) parsed.analysisFixes = fixes

    const applied = appliedKeys.size
    const hasDiagnostics = diagnostics.length > 0 || fixes.length > 0
    return { applied, hasDiagnostics, diagnosticsCount: diagnostics.length, fixesCount: fixes.length }
  }

  /**
   *构建 analyze() 返回的完整结果
   * 统一兜底：AI 未返回 type/visualElements/headerSlots/chartDataHints 时程序化推断
   */
  _buildCompleteResult(analysisResult) {
    const inferredType = this._inferComponentType(analysisResult)
    const extractedElements = this._extractVisualElementsFromSections(analysisResult)

    return {
      imageVerified: true,
      layoutStructure: analysisResult,
      // visualElements：AI styles 对象优先（含主题/色板），元素列表兜底补充
      visualElements: (analysisResult.styles && typeof analysisResult.styles === 'object')
        ? analysisResult.styles
        : extractedElements,
      _visualElementList: extractedElements,
      interactions: analysisResult.interactions || [],
      charts: analysisResult.charts || [],
      chartDataHints: (analysisResult.chartDataHints && analysisResult.chartDataHints.length > 0)
        ? analysisResult.chartDataHints
        : this._inferChartDataHints(analysisResult),
      headerSlots: (analysisResult.headerSlots && analysisResult.headerSlots.length > 0)
        ? analysisResult.headerSlots
        : this._inferHeaderSlots(analysisResult),
      // 🔑 顶层组件类型：AI 返回优先，缺失则程序化推断
      analysisType: analysisResult.type || inferredType.type || '',
      analysisTarget: analysisResult.target || inferredType.target || '',
      analysisDescription: analysisResult.description || inferredType.description || '',
      analysisEvidence: analysisResult.imageEvidence
        || (analysisResult.evidence ? [analysisResult.evidence] : []),
    }
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
  //  Vision 结果缓存
  // ============================================

  /**
   * 构建缓存键：基于 fileKey+nodeId 或 figmaData 内容哈希
   */
  _buildCacheKey(fileKey, nodeId, figmaData, target) {
    if (fileKey && nodeId) {
      return `vision_${fileKey}_${nodeId}_${target || 'default'}`
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
      target = null,
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
      retryGuidance = null,
      bypassCache = false,
    } = params

    this.onProgress = onProgress
    //  记录 target（'vue3' | 'microcode'），驱动分析语境与面板外壳剥离策略
    this.target = target || this.target || null
    this.componentType = this.target
    logger.info('开始执行视觉分析', { previewImage, target: this.target })

    //  Vision AI 结果缓存（fileKey+nodeId → 24h TTL）
    // 🛡️ bypassCache（2026-09-03）：low-coverage 定向重分析时传 true，强制绕过缓存重新调 Vision，
    // 否则重分析会命中首次低覆盖结果缓存、retryGuidance 白传。
    const cacheKey = this._buildCacheKey(fileKey, nodeId, figmaData, target)
    const cacheDir = outputPath ? join(outputPath, '.mc-gen/cache/vision-cache') : null
    if (cacheKey && cacheDir && !bypassCache) {
      const cached = this._readCache(cacheKey, cacheDir)
      if (cached) {
        logger.info('📦 Vision 分析命中缓存，跳过 AI 调用', { cacheKey })
        this.onProgress?.({ stage: '视觉分析', message: '📦 命中缓���，跳过 AI 分析', status: 'completed' })
        return cached
      }
    }

    //加载 resourceDomMapping（如果没传参，尝试从文件读取）
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
        target: this.target,
        signal,
        onProgress,
        requestConcurrency,
        requestQueueTimeoutMs,
        requestTimeoutMs,
        requestMaxRetries,
        retryGuidance,
      })
      this.onProgress?.({ stage: '视觉分析', message: '✅ AI 分析完成，处理数据...', status: 'running' })

      // 2.用 resourceDomMapping 丰富分析结果（placeholder → 实际资源路径）
      if (effectiveMapping && effectiveMapping.length > 0) {
        this._enrichWithResourceMapping(analysisResult, effectiveMapping)
      }

      // 3. 保存结果
      this.onProgress?.({ stage: '视觉分析', message: '💾 保存分析结果...', status: 'running' })
      const savedPath = this.saveResult(analysisResult, outputPath)

      //  统一兜底构建（AI 未返回 type/visualElements/headerSlots/chartDataHints 时程序化推断）
      const executeResult = {
        ...this._buildCompleteResult(analysisResult),
        analysisFile: savedPath,
        //  P0-3: 将降级标志提升到顶层（analyze 内部降级返回 degraded/layoutSource 时透传）
        degraded: analysisResult.degraded === true || undefined,
        visualDegraded: analysisResult.visualDegraded === true || undefined,
        layoutSource: analysisResult.layoutSource || undefined,
        degradeReason: analysisResult.degradeReason || undefined,
      }

      //  写入 Vision 缓存（仅在结果有效时；退化/空结构结果不缓存，避免重试命中缓存后永久复用坏数据）
      if (cacheKey && cacheDir) {
        if (isVisualAnalysisDegraded(executeResult)) {
          logger.warn('⚠️ 视觉分析结果为退化/空结构，跳过缓存，允许后续重试重新调用 Vision', { cacheKey })
        } else {
          this._writeCache(cacheKey, cacheDir, executeResult)
        }
      }

      return executeResult

    } catch (error) {
      logger.error('视觉分析执行失败，返回降级结果', { error: error.message })

      // 🛡️ P0-1: 外层异常同样尝试用 Figma 坐标重建布局结构
      const figmaRebuild = figmaData ? this._rebuildLayoutFromFigma(figmaData) : null
      if (figmaRebuild) {
        logger.warn('⚠️ 视觉分析执行降级，已用 Figma 坐标重建布局结构', {
          sectionsCount: figmaRebuild.layout.sections.length,
          reason: error.message
        })
      }

      // 🛡️ P0 修复：execute() 失败时返回最小可用结果，避免上游崩溃
      const degradedResult = {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        degraded: true,
        degradeReason: error.message,
        layout: figmaRebuild ? figmaRebuild.layout : { type: 'vertical', direction: 'top-to-bottom', sections: [] },
        layoutSource: figmaRebuild ? 'figma' : 'degraded',
        visualDegraded: true,
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

  /**
   * 🛡️ P0（2026-09-04）：Vision 结果与 Figma TEXT 节点交叉校验
   * 
   * 在 vision 分析完成后，立即用 Figma TEXT 节点的 characters 真值集合对比 vision 提取的文字，
   * 标记不在真值里的为"可疑文字"（OCR 误读/臆造），供下游代码生成时注意。
   * 
   * 目的：从源头发现 OCR 错误，避免错误传递到代码生成阶段导致 TEXT-TRUTH 门禁 BLOCK。
   * 
   * @param {object} parsed Vision 分析结果
   * @param {object} figmaData Figma 节点树
   * @returns {object} 校验结果 { truthCount, suspiciousTexts: [{text, suggest}], hasSuspicious }
   */
  _validateVisionTextAgainstFigma(parsed, figmaData) {
    try {
      // 1. 收集 Figma TEXT 节点真值
      const truth = collectFigmaTextTruth(figmaData);
      if (truth.size === 0) {
        return { truthCount: 0, suspiciousTexts: [], hasSuspicious: false };
      }

      // 2. 从 vision 结果提取所有文字内容
      const visionTexts = this._extractVisionTexts(parsed);
      
      // 3. 对比真值集合，标记可疑文字
      const suspiciousTexts = [];
      const CHINESE_RUN_RE = /[\u4e00-\u9fa5]{2,}/g;
      const seen = new Set();
      
      for (const text of visionTexts) {
        // 只检查连续中文 ≥2 字（与 text-truth-guard.js 保持一致）
        for (const m of text.matchAll(CHINESE_RUN_RE)) {
          const chineseText = m[0];
          if (seen.has(chineseText)) continue;
          seen.add(chineseText);
          
          // 检查是否被真值覆盖（子串双向匹配）
          const norm = chineseText.replace(/\s+/g, '');
          let isCovered = false;
          for (const t of truth) {
            const tn = String(t || '').replace(/\s+/g, '');
            if (!tn) continue;
            if (tn.includes(norm) || norm.includes(tn)) {
              isCovered = true;
              break;
            }
          }
          
          if (!isCovered) {
            // 不在真值里，标记为可疑
            const suggest = findClosestTruth(chineseText, truth);
            suspiciousTexts.push({
              text: chineseText,
              suggest: suggest || null,
            });
          }
        }
      }

      const result = {
        truthCount: truth.size,
        suspiciousTexts,
        hasSuspicious: suspiciousTexts.length > 0,
      };

      if (result.hasSuspicious) {
        logger.warn('🛡️ Vision 文字交叉校验发现可疑文字', {
          truthCount: truth.size,
          suspiciousCount: suspiciousTexts.length,
          suspiciousTexts: suspiciousTexts.slice(0, 10).map(s => s.text),
        });
      } else {
        logger.info('🛡️ Vision 文字交叉校验通过', { truthCount: truth.size });
      }

      return result;
    } catch (err) {
      logger.warn('Vision 文字交叉校验失败（非阻断）', { error: err?.message });
      return { truthCount: 0, suspiciousTexts: [], hasSuspicious: false, error: err?.message };
    }
  }

  /**
   * 从 vision 分析结果提取所有文字内容
   * @param {object} parsed Vision 分析结果
   * @returns {string[]} 文字数组
   */
  _extractVisionTexts(parsed) {
    const texts = [];
    
    // 递归遍历对象，提取所有字符串值
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (typeof item === 'string' && item.trim()) {
            texts.push(item);
          } else if (typeof item === 'object') {
            walk(item);
          }
        }
      } else {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.trim()) {
            // 跳过技术字段（如 theme、backgroundBrightness 等）
            if (!['theme', 'backgroundBrightness', 'type', 'direction', 'layoutSource'].includes(key)) {
              texts.push(value);
            }
          } else if (typeof value === 'object') {
            walk(value);
          }
        }
      }
    };
    
    walk(parsed);
    return texts;
  }
}

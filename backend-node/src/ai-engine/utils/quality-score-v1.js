/**
 * 生成质量评分 v1（确定性，不含 LLM）
 *
 * specScore：L0-B BLOCK/WARN 计数
 * styleScore：Figma 期望字面量 vs 产物 CSS 声明（离线回放）；无期望则 null
 *
 * Vision overallSimilarity / adversarial qualityScore / 直方图 VISUAL-002 不进总分。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { 
  resolveStyleVariables, 
  substituteVariables,
  colorFuzzyMatch,
  numericFuzzyMatch,
  parseNumericValue 
} from './style-var-resolver.js'

export const QUALITY_SCORE_V1_VERSION = 'v1'
export const SPEC_BLOCK_PENALTY = 8
export const SPEC_WARN_PENALTY = 3
export const STYLE_COVERAGE_CAP = 60
export const STYLE_COVERAGE_THRESHOLD = 0.4

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.checkpoint',
  '.mc-gen',
  '_upload',
  'images',
  'fonts',
])

const TEXT_EXTS = new Set(['.vue', '.less', '.css', '.js', '.json', '.ts'])

/**
 * 查找组件目录下的「产物渲染截图」（用于设计图对比的右侧「产物预览」）。
 * 截图存储在 .mc-gen/screenshots/ 目录下，文件名形如 <taskId>-rendered.png。
 *
 * 2026-09-29 校正：本函数返回的是**生成产物**的渲染截图（对应前端「产物预览」框），
 * 不是 Figma 设计图；Figma 真值图请用 findDesignImage()。
 *
 * @param {string} componentDir - 组件目录路径
 * @returns {Array<{path: string, name: string}>} - 截图文件列表（相对路径）
 */
export function findScreenshotFiles(componentDir) {
  const screenshotsDir = join(componentDir, '.mc-gen', 'screenshots')
  if (!existsSync(screenshotsDir)) return []

  try {
    const files = readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort()
    return files.map(f => ({
      path: `.mc-gen/screenshots/${f}`,
      name: f,
    }))
  } catch (err) {
    console.warn('[quality-score-v1] 读取截图目录失败:', err.message)
    return []
  }
}

/**
 * 查找组件目录下的 Figma 真值设计图（用于设计图对比的左侧「设计图（Figma）」）。
 *
 * 2026-09-29 新增：此前「设计图」框误用 .mc-gen/screenshots/（产物渲染截图），
 * 导致用户看到的「设计图」其实是生成效果。Figma 真值图固定为 resources/images/mc-preview.png。
 *
 * @param {string} componentDir - 组件目录路径
 * @returns {Array<{path: string, name: string}>} - 设计图文件列表（相对路径）
 */
export function findDesignImage(componentDir) {
  const candidates = [
    join(componentDir, 'resources', 'images', 'mc-preview.png'),
    join(componentDir, 'package', 'resources', 'images', 'mc-preview.png'),
  ]
  for (const abs of candidates) {
    if (existsSync(abs)) {
      const rel = relative(componentDir, abs).replace(/\\/g, '/')
      return [{ path: rel, name: 'mc-preview.png' }]
    }
  }
  return []
}

export function clampScore(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

/**
 * specScore = clamp(0,100, 100 - 8×BLOCK - 3×WARN)
 * 有 BLOCK 时硬顶 79（不允许带阻断项显示为「良好」）。
 */
export function computeSpecScore(l0b = {}) {
  const issues = Array.isArray(l0b.issues) ? l0b.issues : []
  const blockCount =
    typeof l0b.blockCount === 'number'
      ? l0b.blockCount
      : issues.filter((i) => String(i?.severity || '').toUpperCase() === 'BLOCK').length
  const warnCount =
    typeof l0b.warnCount === 'number'
      ? l0b.warnCount
      : issues.filter((i) => String(i?.severity || '').toUpperCase() === 'WARN').length
  let score = 100 - SPEC_BLOCK_PENALTY * blockCount - SPEC_WARN_PENALTY * warnCount
  if (blockCount > 0) score = Math.min(score, 79)
  return {
    score: clampScore(score),
    blockCount,
    warnCount,
    issues: issues.slice(0, 40).map((i) => ({
      id: i.id || i.code || '',
      severity: i.severity || '',
      message: String(i.message || '').slice(0, 240),
    })),
  }
}

function parseRgbTuple(css) {
  const s = String(css || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  const hex = s.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 8) h = h.slice(0, 6)
    if (h.length !== 6) return null
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  const rgb = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] }
  return null
}

function colorDistance(a, b) {
  const pa = parseRgbTuple(a)
  const pb = parseRgbTuple(b)
  if (!pa || !pb) return Infinity
  return Math.sqrt((pa.r - pb.r) ** 2 + (pa.g - pb.g) ** 2 + (pa.b - pb.b) ** 2)
}

function colorsMatch(expected, actuals, maxDelta = 24) {
  return actuals.some((a) => colorDistance(expected, a) <= maxDelta)
}

function parsePx(value) {
  const m = String(value || '').match(/(-?\d+(?:\.\d+)?)px/i)
  return m ? Number(m[1]) : null
}

function pxMatch(expected, actuals, tol = 2) {
  const e = typeof expected === 'number' ? expected : parsePx(expected)
  if (!Number.isFinite(e)) return false
  return actuals.some((a) => {
    const n = typeof a === 'number' ? a : parsePx(a)
    return Number.isFinite(n) && Math.abs(n - e) <= tol
  })
}

function uniqueStrings(list) {
  return [...new Set((list || []).map((x) => String(x).trim()).filter(Boolean))]
}

/**
 * 从产物文件中提取样式字面量（color / spacing / font / radius）。
 *
 * 2026-09-22 根治样式分非确定性：此前对全部文件（含 .js / .json / .vue 的
 * <script>/<template>）用宽泛正则提取颜色，LLM 每次生成的 JS 代码中颜色字面量
 * 略有不同（注释、字符串、变量值等）→ 提取集合不同 → 覆盖率波动 → 样式分不稳定。
 * 修复：只扫描真正的样式上下文（.less/.css 全文 + .vue 的 <style> 块）。
 */
export function extractDeclaredStyleLiterals(files = []) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  const colorRe = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(\s*[\d.,%\s]+\)/g
  const spaceRe = /(?:gap|row-gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}{]+)/gi
  const fontRe = /font-size\s*:\s*([^;}{]+)/gi
  const radiusRe = /border-radius\s*:\s*([^;}{]+)/gi
  
  // 检测是否使用变量化字体（@fontSize / var(--fontSize) 等）
  let fontUsesVariable = false
  const fontVarRe = /font-size\s*:\s*(?:@fontSize|var\(--fontSize|calc\(@fontSize|calc\(var\(--fontSize)/gi

  for (const f of files) {
    const content = String(f?.content || '')
    const p = String(f?.path || '')
    // 只扫描样式上下文：.less/.css 全文 + .vue 的 <style> 块
    let styleContent = ''
    if (/\.less$/i.test(p) || /\.css$/i.test(p)) {
      styleContent = content
    } else if (/\.vue$/i.test(p)) {
      // 提取所有 <style> 块（含 scoped / lang="less" 等变体）
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        styleContent += m[1] + '\n'
      }
    } else {
      continue // .js / .json / .ts 等非样式文件 → 跳过
    }

    if (!styleContent) continue

    let m
    colorRe.lastIndex = 0
    while ((m = colorRe.exec(styleContent))) colors.push(m[0].replace(/\s+/g, ''))
    spaceRe.lastIndex = 0
    while ((m = spaceRe.exec(styleContent))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok)) spacing.push(tok)
      }
    }
    fontRe.lastIndex = 0
    while ((m = fontRe.exec(styleContent))) {
      const px = parsePx(m[1])
      if (px != null) fonts.push(`${px}px`)
    }
    radiusRe.lastIndex = 0
    while ((m = radiusRe.exec(styleContent))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok) || tok === '0') radii.push(tok)
      }
    }
    
    // 检测变量化字体
    fontVarRe.lastIndex = 0
    if (fontVarRe.test(styleContent)) {
      fontUsesVariable = true
    }
  }
  return {
    color: uniqueStrings(colors),
    spacing: uniqueStrings(spacing),
    font: uniqueStrings(fonts),
    radius: uniqueStrings(radii),
    fontUsesVariable,
  }
}

function figmaColorToCss(fill) {
  const c = fill?.color
  if (!c || typeof c.r !== 'number') return null
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const op = typeof fill.opacity === 'number' ? fill.opacity : typeof c.a === 'number' ? c.a : 1
  if (op < 0.999) return `rgba(${r},${g},${b},${Math.round(op * 100) / 100})`
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function extractExpectedStyleLiterals(figmaNodeData) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  const root = figmaNodeData?.document || figmaNodeData
  if (!root || typeof root !== 'object') {
    return { color: [], spacing: [], font: [], radius: [] }
  }
  const walk = (node, depth, maskCtx = false) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    const kids = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.document?.children)
        ? node.document.children
        : []
    // 掩码子树判定：当前节点是 mask，或其子树含 isMask 节点（图标矢量占位，
    // 产物用 <img> 渲染真实位图，其占位色与最终渲染不可比，跳过避免假阳性）。
    const nodeHasMask = node.isMask === true || kids.some((k) => k && k.isMask === true)
    const childMaskCtx = maskCtx || nodeHasMask
    // 同节点存在可见渐变时，被覆盖的 SOLID 层不代表最终可见色，不作为期望。
    const hasVisibleGradient = (node.fills || []).some(
      (f) => f.visible !== false && f.type === 'GRADIENT_LINEAR'
    )
    if (!childMaskCtx) {
      const fills = Array.isArray(node.fills) ? node.fills : []
      const topFill = fills.find(
        (f) => f.visible !== false && f.type === 'SOLID'
      )
      if (topFill && !hasVisibleGradient) {
        const op =
          typeof topFill.opacity === 'number'
            ? topFill.opacity
            : topFill.color && typeof topFill.color.a === 'number'
              ? topFill.color.a
              : 1
        // 近似全透明层（op < 0.01）对视觉无贡献，跳过。
        if (op >= 0.01) {
          const css = figmaColorToCss(topFill)
          if (css) colors.push(css)
        }
      }
    }
    if (typeof node.itemSpacing === 'number') spacing.push(`${node.itemSpacing}px`)
    for (const key of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
      if (typeof node[key] === 'number' && node[key] > 0) spacing.push(`${node[key]}px`)
    }
    if (typeof node.style?.fontSize === 'number') fonts.push(`${node.style.fontSize}px`)
    // 2026-09-29 修复：过滤掉圆形/椭圆节点的 cornerRadius（不是 CSS border-radius）
    // 圆形节点的 cornerRadius 等于其半径（如 75px），但产物不会用 border-radius: 75px
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      // 跳过 ELLIPSE 类型节点（圆形/椭圆装饰）
      if (node.type !== 'ELLIPSE') {
        // 四舍五入到整数，避免浮点精度问题（如 1.7600001096725464 → 2）
        const rounded = Math.round(node.cornerRadius)
        if (rounded > 0) radii.push(`${rounded}px`)
      }
    }
    if (Array.isArray(kids)) {
      for (const child of kids.slice(0, 80)) walk(child, depth + 1, childMaskCtx)
    }
  }
  walk(root, 0)
  return {
    color: uniqueStrings(colors),
    spacing: uniqueStrings(spacing),
    font: uniqueStrings(fonts),
    radius: uniqueStrings(radii),
  }
}

/**
 * 从 Figma 节点提取结构信息（布局类型、对齐方式、层级深度）
 */
export function extractExpectedStructure(figmaNodeData) {
  const layouts = [] // flex/grid/none
  const alignments = [] // align-items/justify-content
  let maxDepth = 0
  let nodeCount = 0
  const root = figmaNodeData?.document || figmaNodeData
  if (!root || typeof root !== 'object') {
    return { layouts: [], alignments: [], maxDepth: 0, nodeCount: 0 }
  }
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    nodeCount++
    if (depth > maxDepth) maxDepth = depth
    const kids = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.document?.children)
        ? node.document.children
        : []
    // 布局类型
    const layoutMode = node.layoutMode
    if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
      layouts.push('flex')
      // 对齐方式
      const primary = node.primaryAxisAlignItems
      const counter = node.counterAxisAlignItems
      if (primary) {
        const justifyMap = {
          MIN: 'flex-start',
          MAX: 'flex-end',
          CENTER: 'center',
          SPACE_BETWEEN: 'space-between',
        }
        alignments.push(`justify-content:${justifyMap[primary] || primary}`)
      }
      if (counter) {
        const alignMap = {
          MIN: 'flex-start',
          MAX: 'flex-end',
          CENTER: 'center',
          BASELINE: 'baseline',
        }
        alignments.push(`align-items:${alignMap[counter] || counter}`)
      }
    } else if (layoutMode === 'GRID') {
      layouts.push('grid')
    } else if (kids.length > 1) {
      // 多子节点但无 layoutMode，可能是绝对定位或无布局
      layouts.push('none')
    }
    if (Array.isArray(kids)) {
      for (const child of kids.slice(0, 80)) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return {
    layouts: uniqueStrings(layouts),
    alignments: uniqueStrings(alignments),
    maxDepth,
    nodeCount,
  }
}

/**
 * 从产物 CSS 提取结构信息
 */
export function extractActualStructure(files = []) {
  const layouts = []
  const alignments = []
  let maxDepth = 0
  let nodeCount = 0
  const displayRe = /display\s*:\s*(flex|grid|block|inline-flex|inline-grid)/gi
  const justifyRe = /justify-content\s*:\s*(flex-start|flex-end|center|space-between|space-around|space-evenly)/gi
  const alignRe = /align-items\s*:\s*(flex-start|flex-end|center|baseline|stretch)/gi
  const templateRe = /<template>([\s\S]*?)<\/template>/i
  for (const f of files) {
    const content = String(f?.content || '')
    // 提取模板计算层级深度和节点数
    const tplMatch = content.match(templateRe)
    if (tplMatch) {
      const tpl = tplMatch[1]
      // 简单统计标签嵌套深度（非精确，但可用于比较）
      let depth = 0
      let maxD = 0
      const tagRe = /<\/?([a-z][\w-]*)/gi
      let m
      while ((m = tagRe.exec(tpl))) {
        if (m[0].startsWith('</')) {
          depth--
        } else {
          depth++
          if (depth > maxD) maxD = depth
          nodeCount++
        }
      }
      if (maxD > maxDepth) maxDepth = maxD
    }
    // 提取布局类型
    let m
    while ((m = displayRe.exec(content))) {
      layouts.push(m[1])
    }
    while ((m = justifyRe.exec(content))) {
      alignments.push(`justify-content:${m[1]}`)
    }
    while ((m = alignRe.exec(content))) {
      alignments.push(`align-items:${m[1]}`)
    }
  }
  return {
    layouts: uniqueStrings(layouts),
    alignments: uniqueStrings(alignments),
    maxDepth,
    nodeCount,
  }
}

/**
 * 从产物 Vue 文件中提取实际挂载的资源 data-section-id（2026-09-28 · resourceMount 维度）
 *
 * 根因：resource-dom-mapping.json 定义了每个背景图应挂载的 figmaNodeId，
 * 但 LLM 生成代码时可能把背景图挂到错误的元素上（data-section-id 不匹配）。
 * 此前质量评分只检查颜色/间距/字体/圆角/结构，完全无法识别这种挂载错误。
 *
 * @param {Array} files - collectGeneratedFilesFromDir 返回的文件列表
 * @returns {Set<string>} - 所有 data-section-id 值的集合
 */
export function extractActualResourceMounts(files = []) {
  const sectionIds = new Set()
  const sectionIdRe = /data-section-id\s*=\s*["']([^"']+)["']/gi

  for (const f of files) {
    const content = String(f?.content || '')
    const p = String(f?.path || '')
    // 只扫描 .vue 文件的 <template> 块
    if (!/\.vue$/i.test(p)) continue

    let templateContent = ''
    for (const m of content.matchAll(/<template[^>]*>([\s\S]*?)<\/template>/gi)) {
      templateContent += m[1] + '\n'
    }
    if (!templateContent) continue

    sectionIdRe.lastIndex = 0
    let m
    while ((m = sectionIdRe.exec(templateContent))) {
      sectionIds.add(m[1])
    }
  }

  return sectionIds
}

/**
 * 资源挂载维度评分（2026-09-28 · resourceMount 维度）
 *
 * 对比 resource-dom-mapping.json 中期望的 figmaNodeId 与产物中实际的 data-section-id。
 * 只对 bgRole 或 backgroundImage 类型的资源进行检查。
 *
 * @param {Array|null} resourceMapping - resource-dom-mapping.json 内容
 * @param {Set<string>} actualSectionIds - extractActualResourceMounts 返回的集合
 * @returns {{ scored: boolean, score: number|null, expected: number, matched: number, missed: Array }}
 */
export function scoreResourceMount(resourceMapping, actualSectionIds) {
  if (!Array.isArray(resourceMapping) || resourceMapping.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [] }
  }

  // 过滤出需要检查的背景图挂载条目
  const expectedMounts = resourceMapping.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false
    // 跳过 skipMount 为 true 的条目（如大型容器背景，故意不挂载）
    if (entry.skipMount === true) return false
    // 跳过下载失败的条目（missing），这些本来就无法挂载
    if (entry.downloadStatus === 'missing') return false
    // 只检查有 bgRole 或 usage 含 backgroundImage 的条目
    const hasBgRole = typeof entry.bgRole === 'string' && entry.bgRole.length > 0
    const hasBgImageUsage = typeof entry.usage === 'string' && entry.usage.includes('backgroundImage')
    return hasBgRole || hasBgImageUsage
  })

  if (expectedMounts.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [] }
  }

  let matched = 0
  const missed = []

  for (const entry of expectedMounts) {
    const figmaNodeId = entry.figmaNodeId
    if (!figmaNodeId) continue

    // 检查该 figmaNodeId 是否存在于实际的 data-section-id 中
    if (actualSectionIds.has(figmaNodeId)) {
      matched++
    } else {
      // 未匹配：记录详细信息
      missed.push({
        figmaNodeId,
        targetDomSelector: entry.targetDomSelector || '(unknown)',
        name: entry.name || '(unnamed)',
        reason: `背景图 "${entry.name || figmaNodeId}" 应挂载到 data-section-id="${figmaNodeId}"，但产物中未找到该 ID`,
      })
    }
  }

  const ratio = expectedMounts.length > 0 ? matched / expectedMounts.length : 0
  const score = clampScore(ratio * 100)

  return {
    scored: true,
    score,
    expected: expectedMounts.length,
    matched,
    missed: missed.slice(0, 12),
  }
}

/**
 * 结构维度评分：比较布局类型、对齐方式、层级深度、节点数量比例
 */
function scoreStructure(expected, actual) {
  if (!expected || typeof expected !== 'object') {
    return { scored: false, score: null, details: {} }
  }
  const details = {}
  let totalScore = 0
  let scoredDims = 0
  // 布局类型匹配（flex/grid/none）
  const expLayouts = new Set(expected.layouts || [])
  const actLayouts = new Set(actual?.layouts || [])
  if (expLayouts.size > 0) {
    let layoutMatch = 0
    for (const l of expLayouts) {
      if (actLayouts.has(l)) layoutMatch++
    }
    const layoutRatio = layoutMatch / expLayouts.size
    details.layout = { expected: expLayouts.size, matched: layoutMatch, ratio: layoutRatio }
    totalScore += layoutRatio * 100
    scoredDims++
  }
  // 对齐方式匹配
  const expAligns = new Set(expected.alignments || [])
  const actAligns = new Set(actual?.alignments || [])
  if (expAligns.size > 0) {
    let alignMatch = 0
    for (const a of expAligns) {
      if (actAligns.has(a)) alignMatch++
    }
    const alignRatio = alignMatch / expAligns.size
    details.alignment = { expected: expAligns.size, matched: alignMatch, ratio: alignRatio }
    totalScore += alignRatio * 100
    scoredDims++
  }
  // 层级深度比较（允许 ±2 层误差）
  if (expected.maxDepth > 0) {
    const depthDiff = Math.abs((actual?.maxDepth || 0) - expected.maxDepth)
    const depthRatio = Math.max(0, 1 - depthDiff / 5) // 每差 1 层扣 20%
    details.depth = { expected: expected.maxDepth, actual: actual?.maxDepth || 0, ratio: depthRatio }
    totalScore += depthRatio * 100
    scoredDims++
  }
  // 节点数量比例（允许 ±30% 误差）
  if (expected.nodeCount > 0) {
    const nodeRatio = Math.min(1, (actual?.nodeCount || 0) / expected.nodeCount)
    details.nodes = { expected: expected.nodeCount, actual: actual?.nodeCount || 0, ratio: nodeRatio }
    totalScore += nodeRatio * 100
    scoredDims++
  }
  if (scoredDims === 0) {
    return { scored: false, score: null, details }
  }
  const score = clampScore(totalScore / scoredDims)
  return { scored: true, score, details }
}

function scoreDimension(expected, actual, kind) {
  const exp = uniqueStrings(expected)
  const act = uniqueStrings(actual)
  if (exp.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [], fuzzyMatches: [] }
  }
  const missed = []
  const fuzzyMatches = []
  let matched = 0
  for (const e of exp) {
    // 先精确匹配
    const exactOk = kind === 'color' ? colorsMatch(e, act) : pxMatch(e, act)
    if (exactOk) {
      matched += 1
      continue
    }
    
    // P2 集成：精确匹配失败后 fallback 到模糊匹配
    let fuzzyOk = false
    if (kind === 'color') {
      // 颜色模糊匹配：支持透明度误差 + 更大的颜色容差
      fuzzyOk = colorFuzzyMatch(e, act, { maxDelta: 32, alphaTolerance: 0.15 })
      if (fuzzyOk) {
        // 找到最近的实际颜色，记录距离
        let bestDist = Infinity
        let bestActual = null
        for (const a of act) {
          const d = colorDistance(e, a)
          if (d < bestDist) {
            bestDist = d
            bestActual = a
          }
        }
        fuzzyMatches.push({ expected: e, matchedTo: bestActual, distance: Math.round(bestDist * 10) / 10, unit: 'rgb' })
      }
    } else {
      // 数值模糊匹配：支持浮点精度 + 单位转换
      fuzzyOk = numericFuzzyMatch(e, act, { tolerance: 3, relativeTolerance: 0.15 })
      if (fuzzyOk) {
        // 找到最近的实际数值，记录差值
        const expVal = parseNumericValue(e)
        let bestDiff = Infinity
        let bestActual = null
        for (const a of act) {
          const actVal = parseNumericValue(a)
          if (actVal != null && expVal != null) {
            const diff = Math.abs(expVal - actVal)
            if (diff < bestDiff) {
              bestDiff = diff
              bestActual = a
            }
          }
        }
        fuzzyMatches.push({ expected: e, matchedTo: bestActual, distance: Math.round(bestDiff * 10) / 10, unit: 'px' })
      }
    }
    
    if (fuzzyOk) {
      matched += 1
    } else {
      missed.push(e)
    }
  }
  const ratio = matched / exp.length
  let score = clampScore(ratio * 100)
  const coverage = exp.length ? matched / exp.length : 0
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  return { scored: true, score, expected: exp.length, matched, missed: missed.slice(0, 12), fuzzyMatches: fuzzyMatches.slice(0, 20) }
}

/**
 * 六维等权：color / spacing / font / radius / structure / resourceMount。
 * 无任何期望 → null（不是 0，也不是 100）。
 * 某维无期望 → unscored，不进平均。
 *
 * resourceMount 维度（2026-09-28）：检查背景图是否挂载到正确的 data-section-id 元素。
 * 通过 opts.resourceMountResult 传入（由 scoreComponentDir 预先计算）。
 */
export function computeStyleScore(expected, actual, opts = {}) {
  if (!expected || typeof expected !== 'object') {
    return { score: null, reason: 'no-expected', coverage: 0, dimensions: {}, diffs: [] }
  }
  
  // 检测产物是否使用变量化字体
  const fontUsesVariable = actual?.fontUsesVariable === true
  
  const dims = {
    color: scoreDimension(expected.color, actual?.color, 'color'),
    spacing: scoreDimension(expected.spacing, actual?.spacing, 'px'),
    font: fontUsesVariable 
      ? { scored: true, score: 100, expected: expected.font?.length || 0, matched: expected.font?.length || 0, missed: [], fuzzyMatches: [], variableAdapted: true }
      : scoreDimension(expected.font, actual?.font, 'px'),
    radius: scoreDimension(expected.radius, actual?.radius, 'px'),
  }
  // 结构维度单独处理（需要结构提取结果）
  if (expected.structure || actual?.structure) {
    dims.structure = scoreStructure(expected.structure, actual?.structure)
  }
  // 资源挂载维度（2026-09-28）：由 scoreComponentDir 预先计算后传入
  if (opts?.resourceMountResult) {
    dims.resourceMount = opts.resourceMountResult
  }
  const scored = Object.values(dims).filter((d) => d.scored)
  if (scored.length === 0) {
    return { score: null, reason: 'no-expected', coverage: 0, dimensions: dims, diffs: [] }
  }
  const avg = scored.reduce((s, d) => s + d.score, 0) / scored.length
  const expectedTotal = scored.reduce((s, d) => s + (d.expected || 0), 0)
  const matchedTotal = scored.reduce((s, d) => s + (d.matched || 0), 0)
  const coverage = expectedTotal ? matchedTotal / expectedTotal : 0
  let score = clampScore(avg)
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  const diffs = []
  for (const [name, d] of Object.entries(dims)) {
    if (!d.scored) continue
    for (const miss of d.missed || []) {
      if (name === 'resourceMount') {
        // resourceMount 的 missed 是对象，直接展开
        diffs.push({ dimension: name, expected: miss.figmaNodeId, actual: miss.reason || '(unmatched)' })
      } else {
        diffs.push({ dimension: name, expected: miss, actual: '(unmatched)' })
      }
    }
  }
  return { score, reason: 'ok', coverage, dimensions: dims, diffs: diffs.slice(0, 40) }
}

export function collectGeneratedFilesFromDir(componentDir) {
  const files = []
  if (!componentDir || !existsSync(componentDir)) return files
  const walk = (dir) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(abs)
        continue
      }
      if (!TEXT_EXTS.has(extname(ent.name))) continue
      try {
        const st = statSync(abs)
        if (st.size > 1_500_000) continue
        files.push({
          path: relative(componentDir, abs).replace(/\\/g, '/'),
          content: readFileSync(abs, 'utf8'),
        })
      } catch {
        /* skip unreadable */
      }
    }
  }
  walk(componentDir)
  return files
}

function loadJsonIfExists(abs) {
  try {
    if (!existsSync(abs)) return null
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}

export function findFigmaNodeData(componentDir) {
  // 真实落盘名是 figma-node-data.json（见 figma-connector._saveFigmaCache
  // 与 vue3.service 的 .mc-gen/cache 写入），此前候选只写了 figma-node.json，
  // 导致已落盘组件的 styleScore 全部误判为 null。真实名放首位。
  const candidates = [
    join(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'),
    join(componentDir, '.mc-gen', 'figma-node-data.json'),
    join(componentDir, '.cache', 'figma-node-data.json'),
    join(componentDir, 'figma-node-data.json'),
    // 兼容历史/手工落盘的简写名
    join(componentDir, '.mc-gen', 'cache', 'figma-node.json'),
    join(componentDir, '.mc-gen', 'figma-node.json'),
    join(componentDir, '.cache', 'figma-node.json'),
    join(componentDir, 'figma-node.json'),
  ]
  for (const p of candidates) {
    const json = loadJsonIfExists(p)
    if (json && typeof json === 'object') return json
  }
  return null
}

/**
 * ️ 加载 resource-dom-mapping（2026-09-22 · CODE-025-WARN 根治）。
 *
 * 根因：scoreComponentDir() 此前从未加载 resource-dom-mapping.json，
 * 导致 CodeStructureValidator.validate() 用空 mapping 跑 CODE-025 检查 →
 * 所有资源变量引用都被判为 R3（orphan imports）→ 全部误报。
 *
 * @param {string} componentDir
 * @returns {Array|null}
 */
export function findResourceDomMapping(componentDir) {
  const candidates = [
    join(componentDir, '.mc-gen', 'resource-dom-mapping.json'),
    join(componentDir, '.mc-gen', 'cache', 'resource-dom-mapping.json'),
    join(componentDir, 'resource-dom-mapping.json'),
  ]
  for (const p of candidates) {
    const json = loadJsonIfExists(p)
    if (Array.isArray(json)) return json
  }
  return null
}

export function mergeQualityIntoMeta(prevMeta, qualityV1) {
  const prev = prevMeta && typeof prevMeta === 'object' ? prevMeta : {}
  const prevQuality = prev.quality && typeof prev.quality === 'object' ? prev.quality : {}
  return {
    ...prev,
    quality: {
      ...prevQuality,
      ...qualityV1,
    },
  }
}

export function persistQualityScore(componentDir, qualityV1) {
  const metaPath = join(componentDir, 'component-meta.json')
  const prev = loadJsonIfExists(metaPath) || {}
  const next = mergeQualityIntoMeta(prev, qualityV1)
  writeFileSync(metaPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/**
 * Vue3 组件识别（判据：是否含微码专属的 declare.json）。
 *
 * 实测（2026-09-19）：
 *   - 微码产物必有 declare.json（componentId/componentName/themeConfig 等），**必有** common.less；
 *   - Vue3 产物**从不**生成 declare.json，也**可能有** common.less。
 * 故不能以 common.less 判断，唯一可靠判据是 declare.json 的有无。
 * 用途：评分时把 target 切到 vue3，避免微码专有规则（CODE-008 手写图片 import /
 * CODE-003 common.less 前缀 / CODE-009 declare.json 标题）误扣 Vue3 分数。
 */
export function detectComponentType(componentDir, files) {
  const hasMicrocodeDeclare = files.some((f) => (f.path || '').endsWith('declare.json'))
  return hasMicrocodeDeclare ? 'microcode' : 'vue3'
}

/**
 * 查找组件目录中的 theme-vars.less（2026-09-28 P2 集成）
 * 
 * 优先级：resources/styles/themes/theme-vars.less > resources/theme-vars.less
 */
export function findThemeVarsPath(componentDir) {
  const candidates = [
    join(componentDir, 'resources', 'styles', 'themes', 'theme-vars.less'),
    join(componentDir, 'resources', 'theme-vars.less'),
    join(componentDir, 'theme-vars.less'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * 对已落盘组件做 v1 离线评分（不调 LLM、不截图）。
 * styleScore 无 Figma 期望时为 null。
 *
 * 评分用确定性 L0-B：Vue3 组件传 target='vue3' 跳过微码专有规则；
 * 但 CODE-008（手写图片 import 应交给 injectResourceImports）在校验器里未做 Vue3 分流，
 * 对 Vue3 一律误报，故此处对 Vue3 显式剔除 CODE-008 假阳性。
 */
export async function scoreComponentDir(componentDir, opts = {}) {
  const files = collectGeneratedFilesFromDir(componentDir)
  const declareJson = loadJsonIfExists(join(componentDir, 'declare.json')) || {}
  const componentId =
    opts.componentId ||
    (typeof declareJson.componentId === 'string' && declareJson.componentId) ||
    ''

  // 目录级 target：显式 opts.target 优先，否则自动识别
  const target = opts.target || detectComponentType(componentDir, files)
  const isVue3 = target === 'vue3'

  // 🛡️ 加载 resource-dom-mapping（2026-09-22 · CODE-025-WARN 根治）
  const resourceMapping = opts.resourceMapping || findResourceDomMapping(componentDir)

  let l0b = { pass: true, blockCount: 0, issues: [] }
  let l0bError = null
  try {
    const { CodeStructureValidator } = await import('../validators/code-structure-validator.js')
    l0b = CodeStructureValidator.validate(files, componentId, {
      ...(opts.l0bOptions || {}),
      target: isVue3 ? 'vue3' : undefined,
      resourceMapping,
    })
    // Vue3 手写图片 import 是合法写法，剔除 CODE-008 假阳性（校验器未做 Vue3 分流）
    if (isVue3 && Array.isArray(l0b.issues)) {
      l0b = {
        ...l0b,
        issues: l0b.issues.filter((i) => {
          const id = i?.id || ''
          // CODE-008：Vue3 允许手写资源 import
          if (id === 'CODE-008') return false
          // CODE-025-WARN：Vue3 允许手写资源 import，R3 orphan imports 不是问题
          if (id === 'CODE-025-WARN') return false
          return true
        }),
      }
    }
  } catch (err) {
    l0bError = err?.message || String(err)
    l0b = {
      pass: false,
      blockCount: 1,
      issues: [{ id: 'L0B-LOAD', severity: 'BLOCK', message: `L0-B 无法执行：${l0bError}` }],
    }
  }

  const spec = computeSpecScore(l0b)
  const figma = opts.figmaNodeData || findFigmaNodeData(componentDir)
  const expectedStyle = extractExpectedStyleLiterals(figma)
  const expectedStructure = extractExpectedStructure(figma)

  // P2 集成（2026-09-28）：先解析 Less 变量再提取样式字面量
  // 根因：产物用 @color-primary 等变量，Figma 期望 #559eff 字面量，评分只做字面量比较
  // 解法：从 theme-vars.less + common.less 解析变量链，替换后再提取
  let actualStyle
  let varResolutionInfo = null
  try {
    const themeVarsPath = findThemeVarsPath(componentDir)
    const varMap = resolveStyleVariables(files, themeVarsPath)
    if (varMap.size > 0) {
      // 把变量替换到文件内容中
      const resolvedFiles = files.map((f) => ({
        ...f,
        content: substituteVariables(f.content, varMap),
      }))
      actualStyle = extractDeclaredStyleLiterals(resolvedFiles)
      varResolutionInfo = {
        enabled: true,
        varCount: varMap.size,
        themeVarsPath: themeVarsPath || null,
      }
    } else {
      // 没有变量，走原路径
      actualStyle = extractDeclaredStyleLiterals(files)
      varResolutionInfo = { enabled: false, varCount: 0 }
    }
  } catch (err) {
    // 变量解析失败时降级到原路径（fail-open）
    console.warn('[quality-score-v1] 变量解析失败，降级到字面量提取:', err.message)
    actualStyle = extractDeclaredStyleLiterals(files)
    varResolutionInfo = { enabled: false, varCount: 0, error: err.message }
  }

  const actualStructure = extractActualStructure(files)

  // resourceMount 维度（2026-09-28）：检查背景图是否挂载到正确的 data-section-id
  let resourceMountResult = null
  try {
    const actualSectionIds = extractActualResourceMounts(files)
    resourceMountResult = scoreResourceMount(resourceMapping, actualSectionIds)
  } catch (err) {
    console.warn('[quality-score-v1] resourceMount 评分失败:', err.message)
  }

  // 合并样式和结构到 expected/actual 对象
  const expected = { ...expectedStyle, structure: expectedStructure }
  const actual = { ...actualStyle, structure: actualStructure }
  const style = computeStyleScore(expected, actual, { resourceMountResult })

  // 查找截图文件（用于设计图对比）
  //  - screenshots：产物渲染截图（前端「产物预览」框）
  //  - designImages：Figma 真值图 mc-preview.png（前端「设计图（Figma）」框）
  const screenshots = findScreenshotFiles(componentDir)
  const designImages = findDesignImage(componentDir)

  const quality = {
    version: QUALITY_SCORE_V1_VERSION,
    specScore: spec.score,
    styleScore: style.score,
    spec,
    style,
    scoredAt: new Date().toISOString(),
    fileCount: files.length,
    excluded: {
      qualityScore: 'adversarial LLM，不进 v1 总分',
      visualSimilarity: 'Vision LLM，不进 v1 总分',
      visual002: '直方图，不进 v1 总分',
    },
    ...(l0bError ? { l0bError } : {}),
    ...(varResolutionInfo ? { varResolutionInfo } : {}),
    ...(screenshots.length > 0 ? { screenshots } : {}),
    ...(designImages.length > 0 ? { designImages } : {}),
  }

  if (opts.persist !== false) persistQualityScore(componentDir, quality)
  return { componentDir, componentId, quality }
}

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
  return stringifyDeclaredLiterals(extractDeclaredStyleLiteralsWithLocation(files))
}

/**
 * 带定位的产物样式字面量。
 * 与 extractDeclaredStyleLiterals 不同：返回值是 `{ value, source: { file, line, className, field } }[]` 数组。
 *
 * 让前端 QualityScore 面板展示「未匹配的 20px 圆角：Figma 来自 slot-流量预测（id=83:30, FRAME），
 * 产物期望写在 `package/components/HeaderSub.vue:42`（`.c-xx-slot` 类）」，用户可直接定位到产物文件具体行。
 *
 * 行号算法：先在原文件中定位 <style> 块起始行，再在 styleContent 内匹配正则时按累积偏移加回，得到原文件行号。
 * className：取该 CSS 声明所在规则块的选择器（如 `.c-x-root`）；LESS 文件取 `@media` 等容器上一层。
 */
export function extractDeclaredStyleLiteralsWithLocation(files = []) {
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
    // 同时把每段样式块映射回原文件行号（<style block起始行 + styleContent 内偏移）
    const styleBlocks = [] // [{ styleText, startLine }]
    if (/\.less$/i.test(p) || /\.css$/i.test(p)) {
      styleBlocks.push({ styleText: content, startLine: 1 })
    } else if (/\.vue$/i.test(p)) {
      // 提取所有 <style> 块（含 scoped / lang="less" 等变体），记录起始行号
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        const matchIndex = m.index ?? 0
        const styleText = m[1]
        // 计算原文件起始行：m.index 之前的换行符数 + 1
        const before = content.slice(0, matchIndex)
        const startLine = (before.match(/\n/g) || []).length + 1
        styleBlocks.push({ styleText: styleText + '\n', startLine })
      }
    } else {
      continue // .js / .json / .ts 等非样式文件 → 跳过
    }

    if (styleBlocks.length === 0) continue

    for (const { styleText, startLine } of styleBlocks) {
      let m
      colorRe.lastIndex = 0
      while ((m = colorRe.exec(styleText))) {
        colors.push(makeDeclaredEntry(m[0].replace(/\s+/g, ''), p, startLine, offsetToLine(styleText, m.index), null, 'fills'))
      }
      spaceRe.lastIndex = 0
      while ((m = spaceRe.exec(styleText))) {
        const matchedStr = m[0] || ''
        const field = (matchedStr.match(/^[a-z-]+/i) || ['spacing'])[0]
        const line = startLine + offsetToLine(styleText, m.index)
        const className = findEnclosingClass(styleText, m.index)
        for (const tok of m[1].split(/\s+/)) {
          if (/px$/i.test(tok)) {
            spacing.push(makeDeclaredEntry(tok, p, line, className, field))
          }
        }
      }
      fontRe.lastIndex = 0
      while ((m = fontRe.exec(styleText))) {
        const px = parsePx(m[1])
        if (px != null) {
          const line = startLine + offsetToLine(styleText, m.index)
          const className = findEnclosingClass(styleText, m.index)
          fonts.push(makeDeclaredEntry(`${px}px`, p, line, className, 'font-size'))
        }
      }
      radiusRe.lastIndex = 0
      while ((m = radiusRe.exec(styleText))) {
        const matchedStr = m[0] || ''
        const field = (matchedStr.match(/^[a-z-]+/i) || ['border-radius'])[0]
        const line = startLine + offsetToLine(styleText, m.index)
        const className = findEnclosingClass(styleText, m.index)
        for (const tok of m[1].split(/\s+/)) {
          if (/px$/i.test(tok) || tok === '0') {
            radii.push(makeDeclaredEntry(tok, p, line, className, field))
          }
        }
      }

      // 检测变量化字体
      fontVarRe.lastIndex = 0
      if (fontVarRe.test(styleText)) {
        fontUsesVariable = true
      }
    }
  }
  return {
    color: dedupeDeclaredEntries(colors),
    spacing: dedupeDeclaredEntries(spacing),
    font: dedupeDeclaredEntries(fonts),
    radius: dedupeDeclaredEntries(radii),
    fontUsesVariable,
  }
}

// 把「当前样式块内的字符偏移」转换为「块内行号」（从 1 开始）
function offsetToLine(text, offset) {
  if (offset <= 0) return 0
  const before = text.slice(0, offset)
  return (before.match(/\n/g) || []).length
}

// 找当前声明所在 CSS 规则块的最内层选择器（人类可读定位）
// 算法：在 index 之前最近的 `{` 之前的「最后一个以 . 或 @ 开头的选择器段」
// 简化版：直接抓 index 之前最近的「`}` ... `{`」之间最后一行以 `}` 或 `@` 或 `.` 开头的字符
function findEnclosingClass(text, index) {
  // 在 index 之前找最近的 `{`（当前规则块起点），再看这一对 `{` 之前最近的 `}`（上一个块终点），
  // 这之间中找以 `.x` 或 `&` 开头的「最末行」作为最近外层选择器
  const head = text.slice(0, index)
  const lastBraceIdx = head.lastIndexOf('{')
  if (lastBraceIdx < 0) return null
  // 在 lastBraceIdx 之前找最近的 `}`
  const prevCloseIdx = head.lastIndexOf('}', lastBraceIdx)
  const startIdx = prevCloseIdx >= 0 ? prevCloseIdx + 1 : 0
  const block = text.slice(startIdx, lastBraceIdx)
  // 找 block 里最后一个 `.x` 或 `@media x` 或嵌套选择器段
  // 简化为：最后一个形如 `\.[\w-]+` 或 `&` 或 `^[.@&][^\s,{]+` 的子串
  const candidates = []
  const selectorRe = /(?:^|[\s,])([.@&][^\s,{]+)/g
  let sm
  while ((sm = selectorRe.exec(block))) candidates.push(sm[1])
  if (candidates.length === 0) return null
  // 取最后一个选择器（最贴近当前声明的外层）
  return candidates[candidates.length - 1]
}

function makeDeclaredEntry(value, file, line, className, field) {
  return {
    value,
    source: {
      file: String(file || ''),
      line: typeof line === 'number' ? line : 0,
      className: className || null,
      field: field || null,
    },
  }
}

// 按 value 去重，但保留首个命中的 source（最权威：第一个出现的位置即「主样式」位置）
function dedupeDeclaredEntries(list) {
  const seen = new Map()
  for (const entry of list) {
    if (!seen.has(entry.value)) seen.set(entry.value, entry)
  }
  return Array.from(seen.values())
}

// 把带定位的 actual 条目降级回纯字符串数组（向后兼容 style-auto-fix.js 等）
function stringifyDeclaredLiterals(structured) {
  return {
    color: structured.color.map((e) => e.value),
    spacing: structured.spacing.map((e) => e.value),
    font: structured.font.map((e) => e.value),
    radius: structured.radius.map((e) => e.value),
    fontUsesVariable: structured.fontUsesVariable,
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
  return stringifyExpectedLiterals(extractExpectedStyleLiteralsWithLocation(figmaNodeData))
}

/**
 * 带定位的 Figma 期望样式字面量（每个值携带 Figma 节点 id / 路径 / 类型 / 名称）。
 * 与 extractExpectedStyleLiterals 不同：返回值是 `{ value, source: { figmaNodeId, figmaPath, nodeType, nodeName, field } }[]` 数组。
 *
 * 调用方（scoreComponentDir）拿到结构化数据后可让前端展示「未匹配的圆角来自哪个 Figma 节点」，
 * 用户能直接定位设计稿源头，比只看 `未匹配：20px` 信息密度高得多。
 *
 * 注意：保留字符串版本是为了向后兼容（style-auto-fix.js 等仍在用）。
 */
export function extractExpectedStyleLiteralsWithLocation(figmaNodeData) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  const root = figmaNodeData?.document || figmaNodeData
  if (!root || typeof root !== 'object') {
    return { color: [], spacing: [], font: [], radius: [] }
  }
  const walk = (node, depth, maskCtx = false, figmaPath = '') => {
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
          if (css) colors.push(makeExpectedEntry(css, node, figmaPath, 'fills[0]'))
        }
      }
    }
    if (typeof node.itemSpacing === 'number') {
      // 🛡️ 2026-09-30 复审修正：**只去浮点噪声，不改变「纳入集合」**。
      //   Figma itemSpacing 常带精度噪声（17.600000381469727），round 成 18 便于与产物整数刻度
      //   对齐（与 L323 cornerRadius 同源做法；numericFuzzyMatch 内建 |round(e)-round(a)|<=1 豁免）。
      //   🔴 禁止用 `> 0` 过滤：itemSpacing = 0 与**负值**都是真实布局事实（负 gap 即叠加排布），
      //      过滤会让期望分母变小 ⇒ 分数虚高，与「门禁只降不升」冲突（09-30 复审实锤）。
      spacing.push(makeExpectedEntry(`${Math.round(node.itemSpacing)}px`, node, figmaPath, 'itemSpacing'))
    }
    for (const key of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
      // 纳入条件与既有口径一致（仅 raw > 0）；本次只对**字面量**去噪，不增删条目。
      if (typeof node[key] === 'number' && node[key] > 0) {
        spacing.push(makeExpectedEntry(`${Math.round(node[key])}px`, node, figmaPath, key))
      }
    }
    if (typeof node.style?.fontSize === 'number') {
      fonts.push(makeExpectedEntry(`${node.style.fontSize}px`, node, figmaPath, 'style.fontSize'))
    }
    // 2026-09-29 修复：过滤掉圆形/椭圆节点的 cornerRadius（不是 CSS border-radius）
    // 圆形节点的 cornerRadius 等于其半径（如 75px），但产物不会用 border-radius: 75px
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      // 跳过 ELLIPSE 类型节点（圆形/椭圆装饰）
      if (node.type !== 'ELLIPSE') {
        // 四舍五入到整数，避免浮点精度问题（如 1.7600001096725464 → 2）
        const rounded = Math.round(node.cornerRadius)
        if (rounded > 0) radii.push(makeExpectedEntry(`${rounded}px`, node, figmaPath, 'cornerRadius'))
      }
    }
    if (Array.isArray(kids)) {
      // 拼出从根到当前节点的 Figma 节点路径（用 name 而非 id：id 无语义不便人类定位）
      const childPath = figmaPath
        ? `${figmaPath} / ${node.name || node.id || '<unnamed>'}`
        : (node.name || node.id || '<unnamed>')
      for (const child of kids.slice(0, 80)) walk(child, depth + 1, childMaskCtx, childPath)
    }
  }
  walk(root, 0)
  return {
    color: dedupeExpectedEntries(colors),
    spacing: dedupeExpectedEntries(spacing),
    font: dedupeExpectedEntries(fonts),
    radius: dedupeExpectedEntries(radii),
  }
}

// 构造带 Figma 定位的期望条目
function makeExpectedEntry(value, node, parentPath, field) {
  const name = node.name || ''
  const id = node.id || ''
  // 完整路径：root-name / ... / 当前节点名（人类可读，不带 id 噪音）
  const figmaPath = parentPath
      ? `${parentPath} / ${name || id || '<unnamed>'}`
      : (name || id || '<unnamed>')
  return {
    value,
    source: {
      figmaNodeId: id,
      figmaNodeName: name,
      figmaNodeType: typeof node.type === 'string' ? node.type : null,
      figmaPath,
      field, // 字段名（itemSpacing / paddingLeft / cornerRadius / fills[0] / style.fontSize）
    },
  }
}

// 按 value 字符串去重，但保留定位（首个命中即权威；后续同名值的不同节点不重复计数）
function dedupeExpectedEntries(list) {
  const seen = new Map()
  for (const entry of list) {
    if (!seen.has(entry.value)) seen.set(entry.value, entry)
  }
  return Array.from(seen.values())
}

// 把带定位的期望条目降级回纯字符串数组（向后兼容）
function stringifyExpectedLiterals(structured) {
  return {
    color: structured.color.map((e) => e.value),
    spacing: structured.spacing.map((e) => e.value),
    font: structured.font.map((e) => e.value),
    radius: structured.radius.map((e) => e.value),
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
  // 🛡️ 2026-09-30 第一层可观测性：expected/actual 可能是带定位的条目（{ value, source }），
  // 兼容两形态（字符串数组 或 对象数组），未带定位的当作裸值。
  const expList = (expected || []).map((e) =>
    typeof e === 'string' ? { value: e, source: null } : e
  )
  const actList = (actual || []).map((a) =>
    typeof a === 'string' ? { value: a, source: null } : a
  )
  const expValues = uniqueStrings(expList.map((e) => e.value))
  const actValues = uniqueStrings(actList.map((a) => a.value))
  if (expValues.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [], fuzzyMatches: [] }
  }
  const missed = []
  const fuzzyMatches = []
  let matched = 0
  for (const expVal of expValues) {
    const expEntry = expList.find((e) => e.value === expVal) || { value: expVal, source: null }
    // 先精确匹配
    const exactOk = kind === 'color' ? colorsMatch(expVal, actValues) : pxMatch(expVal, actValues)
    if (exactOk) {
      matched += 1
      continue
    }

    // P2 集成：精确匹配失败后 fallback 到模糊匹配
    let fuzzyOk = false
    let bestActualVal = null
    if (kind === 'color') {
      // 颜色模糊匹配：支持透明度误差 + 更大的颜色容差
      fuzzyOk = colorFuzzyMatch(expVal, actValues, { maxDelta: 32, alphaTolerance: 0.15 })
      if (fuzzyOk) {
        // 找到最近的实际颜色，记录距离
        let bestDist = Infinity
        for (const a of actValues) {
          const d = colorDistance(expVal, a)
          if (d < bestDist) {
            bestDist = d
            bestActualVal = a
          }
        }
        fuzzyMatches.push({ expected: expVal, matchedTo: bestActualVal, distance: Math.round(bestDist * 10) / 10, unit: 'rgb' })
      }
    } else {
      // 🛡️ 2026-09-30 容差沿用 c6b287b 实测过的 (3, 0.15)（放过 +0/-0 取整 + ±3px 噪声，不破坏
      // 「不匹配即判 50」设计契约）。第一层做的是「未匹配项带定位」而非放宽。
      fuzzyOk = numericFuzzyMatch(expVal, actValues, { tolerance: 3, relativeTolerance: 0.15 })
      if (fuzzyOk) {
        // 找到最近的实际数值，记录差值
        const expPxVal = parseNumericValue(expVal)
        let bestDiff = Infinity
        for (const a of actValues) {
          const actPxVal = parseNumericValue(a)
          if (actPxVal != null && expPxVal != null) {
            const diff = Math.abs(expPxVal - actPxVal)
            if (diff < bestDiff) {
              bestDiff = diff
              bestActualVal = a
            }
          }
        }
        fuzzyMatches.push({ expected: expVal, matchedTo: bestActualVal, distance: Math.round(bestDiff * 10) / 10, unit: 'px' })
      }
    }

    if (fuzzyOk) {
      matched += 1
    } else {
      // 🛡️ 2026-09-30 第一层可观测性：missed 项带上 Figma 源 + 候选 actual 源字段
      // 让前端可以展示「未匹配 20px：Figma 来自 slot-流量预测 / 产物最贴近 4px（在 HeaderSub.vue:42）」
      // 同时记录实际值数组里最接近的一个，让用户知道「差多远」（diff）
      const bestActualEntry = bestActualVal
        ? actList.find((a) => a.value === bestActualVal) || { value: bestActualVal, source: null }
        : null
      const diff = (() => {
        if (!bestActualVal) return null
        if (kind === 'color') return Math.round(colorDistance(expVal, bestActualVal) * 10) / 10
        const eV = parseNumericValue(expVal)
        const aV = parseNumericValue(bestActualVal)
        if (eV == null || aV == null) return null
        return Math.round(Math.abs(eV - aV) * 10) / 10
      })()
      missed.push({
        value: expVal,
        expectedSource: expEntry.source || null,
        closestActualValue: bestActualVal,
        closestActualSource: bestActualEntry?.source || null,
        diff,
        unit: kind === 'color' ? 'rgb' : 'px',
      })
    }
  }
  const ratio = matched / expValues.length
  let score = clampScore(ratio * 100)
  const coverage = expValues.length ? matched / expValues.length : 0
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  return { scored: true, score, expected: expValues.length, matched, missed: missed.slice(0, 12), fuzzyMatches: fuzzyMatches.slice(0, 20) }
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

  // 🛡️ 2026-09-30 第一层可观测性：
  //   - 优先用 opts.expectedWithLocation（带 Figma 节点定位的期望值对象数组），
  //     让 scoreDimension 的 missed 能带上 expectedSource（图 1 链路：Figma 节点 / path / type）。
  //   - 字符串版 expected 兼容旧调用方（向后兼容）。
  //   - actual 一律从 opts.actualWithLocation 拿（带产物文件行号定位），没有时退回到裸字符串数组。
  const expectedColored = opts.expectedWithLocation || expected
  const actualColored = opts.actualWithLocation || actual

  const dims = {
    color: scoreDimension(expectedColored.color, actualColored?.color, 'color'),
    spacing: scoreDimension(expectedColored.spacing, actualColored?.spacing, 'px'),
    font: fontUsesVariable
      ? { scored: true, score: 100, expected: expectedColored.font?.length || 0, matched: expectedColored.font?.length || 0, missed: [], fuzzyMatches: [], variableAdapted: true }
      : scoreDimension(expectedColored.font, actualColored?.font, 'px'),
    radius: scoreDimension(expectedColored.radius, actualColored?.radius, 'px'),
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
        // 🛡️ 2026-09-30 第一层可观测性：diffs 直接透传 missed 对象（含 expectedSource / closestActualSource）
        // 让前端 QualityScoreAdminButton.vue 等位置拿到 Figma 节点 ID / 产物 file:line。
        diffs.push({ dimension: name, ...miss, actual: '(unmatched)' })
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
  // 🛡️ 2026-09-30 第一层可观测性：带定位版本，让 missed 项能展示「Figma 节点 / 产物文件 + 行号」
  const expectedStyleWithLoc = extractExpectedStyleLiteralsWithLocation(figma)
  const expectedStyle = stringifyExpectedLiterals(expectedStyleWithLoc) // 向后兼容的字符串版
  const expectedStructure = extractExpectedStructure(figma)

  // P2 集成（2026-09-28）：先解析 Less 变量再提取样式字面量
  // 根因：产物用 @color-primary 等变量，Figma 期望 #559eff 字面量，评分只做字面量比较
  // 解法：从 theme-vars.less + common.less 解析变量链，替换后再提取
  let actualStyle
  let actualStyleWithLoc // 🛡️ 带定位版本：actual 字面量来自哪个文件/行/类
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
      // 🛡️ 2026-09-30：两个版本都产，外部 API 默认看字符串版（向后兼容），
      // 但 qualityV1 输出同时携带 WithLocation 完整信息，让前端能渲染 Figma/产物双向定位。
      actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(resolvedFiles)
      actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
      varResolutionInfo = {
        enabled: true,
        varCount: varMap.size,
        themeVarsPath: themeVarsPath || null,
      }
    } else {
      // 没有变量，走原路径
      actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(files)
      actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
      varResolutionInfo = { enabled: false, varCount: 0 }
    }
  } catch (err) {
    // 变量解析失败时降级到原路径（fail-open）
    console.warn('[quality-score-v1] 变量解析失败，降级到字面量提取:', err.message)
    actualStyleWithLoc = extractDeclaredStyleLiteralsWithLocation(files)
    actualStyle = stringifyDeclaredLiterals(actualStyleWithLoc)
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
  // 🛡️ 2026-09-30 第一层可观测性：把带定位的 expected / actual 一起传给 computeStyleScore，
  // 让 scoreDimension 的 missed 项能带上 Figma 节点 ID / 产物 file:line（前后端可定位）。
  // 同时把两份原始数据塞到 quality.styleV1 上，让前端 QualityScoreAdminButton 直接渲染 Figma/产物双向定位。
  const style = computeStyleScore(expected, actual, {
    resourceMountResult,
    expectedWithLocation: {
      color: expectedStyleWithLoc.color,
      spacing: expectedStyleWithLoc.spacing,
      font: expectedStyleWithLoc.font,
      radius: expectedStyleWithLoc.radius,
    },
    actualWithLocation: {
      color: actualStyleWithLoc.color,
      spacing: actualStyleWithLoc.spacing,
      font: actualStyleWithLoc.font,
      radius: actualStyleWithLoc.radius,
      fontUsesVariable: actualStyleWithLoc.fontUsesVariable,
    },
  })

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
    // 🛡️ 2026-09-30 第一层可观测性：把带定位的期望/实际一并下发到前端，
    //   让 QualityScoreAdminButton 能渲染「未匹配 20px：Figma 来自 slot-流量预测 (id=83:30, FRAME) /
    //   产物最贴近 4px（package/components/HeaderSub.vue:42, .c-x-slot 类）」。
    //   这是 QualityScore 面板定位的根本：原 missed 只是字符串，无法告诉用户「具体是哪个节点/哪行」，
    //   现在通过 expectedSource / actualSource 把前后端两侧的图谱连起来。
    expectedWithLocation: expectedStyleWithLoc,
    actualWithLocation: {
      color: actualStyleWithLoc.color,
      spacing: actualStyleWithLoc.spacing,
      font: actualStyleWithLoc.font,
      radius: actualStyleWithLoc.radius,
      fontUsesVariable: actualStyleWithLoc.fontUsesVariable,
    },
    ...(l0bError ? { l0bError } : {}),
    ...(varResolutionInfo ? { varResolutionInfo } : {}),
    ...(screenshots.length > 0 ? { screenshots } : {}),
    ...(designImages.length > 0 ? { designImages } : {}),
  }

  if (opts.persist !== false) persistQualityScore(componentDir, quality)
  return { componentDir, componentId, quality }
}

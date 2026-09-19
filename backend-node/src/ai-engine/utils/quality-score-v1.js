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

export const QUALITY_SCORE_V1_VERSION = 'v1'
export const SPEC_BLOCK_PENALTY = 20
export const SPEC_WARN_PENALTY = 5
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

export function clampScore(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

/**
 * specScore = clamp(0,100, 100 - 20×BLOCK - 5×WARN)
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

export function extractDeclaredStyleLiterals(files = []) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  const colorRe = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(\s*[\d.,%\s]+\)/g
  const spaceRe = /(?:gap|row-gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}{]+)/gi
  const fontRe = /font-size\s*:\s*([^;}{]+)/gi
  const radiusRe = /border-radius\s*:\s*([^;}{]+)/gi
  for (const f of files) {
    const content = String(f?.content || '')
    let m
    while ((m = colorRe.exec(content))) colors.push(m[0].replace(/\s+/g, ''))
    while ((m = spaceRe.exec(content))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok)) spacing.push(tok)
      }
    }
    while ((m = fontRe.exec(content))) {
      const px = parsePx(m[1])
      if (px != null) fonts.push(`${px}px`)
    }
    while ((m = radiusRe.exec(content))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok) || tok === '0') radii.push(tok)
      }
    }
  }
  return {
    color: uniqueStrings(colors),
    spacing: uniqueStrings(spacing),
    font: uniqueStrings(fonts),
    radius: uniqueStrings(radii),
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
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      radii.push(`${node.cornerRadius}px`)
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

function scoreDimension(expected, actual, kind) {
  const exp = uniqueStrings(expected)
  const act = uniqueStrings(actual)
  if (exp.length === 0) {
    return { scored: false, score: null, expected: 0, matched: 0, missed: [] }
  }
  const missed = []
  let matched = 0
  for (const e of exp) {
    const ok = kind === 'color' ? colorsMatch(e, act) : pxMatch(e, act)
    if (ok) matched += 1
    else missed.push(e)
  }
  const ratio = matched / exp.length
  let score = clampScore(ratio * 100)
  const coverage = exp.length ? matched / exp.length : 0
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  return { scored: true, score, expected: exp.length, matched, missed: missed.slice(0, 12) }
}

/**
 * 四维等权：color / spacing / font / radius。
 * 无任何期望 → null（不是 0，也不是 100）。
 * 某维无期望 → unscored，不进平均。
 */
export function computeStyleScore(expected, actual) {
  if (!expected || typeof expected !== 'object') {
    return { score: null, reason: 'no-expected', coverage: 0, dimensions: {}, diffs: [] }
  }
  const dims = {
    color: scoreDimension(expected.color, actual?.color, 'color'),
    spacing: scoreDimension(expected.spacing, actual?.spacing, 'px'),
    font: scoreDimension(expected.font, actual?.font, 'px'),
    radius: scoreDimension(expected.radius, actual?.radius, 'px'),
  }
  const scored = Object.values(dims).filter((d) => d.scored)
  if (scored.length === 0) {
    return { score: null, reason: 'no-expected', coverage: 0, dimensions: dims, diffs: [] }
  }
  const avg = scored.reduce((s, d) => s + d.score, 0) / scored.length
  const expectedTotal = scored.reduce((s, d) => s + d.expected, 0)
  const matchedTotal = scored.reduce((s, d) => s + d.matched, 0)
  const coverage = expectedTotal ? matchedTotal / expectedTotal : 0
  let score = clampScore(avg)
  if (coverage < STYLE_COVERAGE_THRESHOLD) score = Math.min(score, STYLE_COVERAGE_CAP)
  const diffs = []
  for (const [name, d] of Object.entries(dims)) {
    if (!d.scored) continue
    for (const miss of d.missed || []) {
      diffs.push({ dimension: name, expected: miss, actual: '(unmatched)' })
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

  let l0b = { pass: true, blockCount: 0, issues: [] }
  let l0bError = null
  try {
    const { CodeStructureValidator } = await import('../validators/code-structure-validator.js')
    l0b = CodeStructureValidator.validate(files, componentId, {
      ...(opts.l0bOptions || {}),
      target: isVue3 ? 'vue3' : undefined,
    })
    // Vue3 手写图片 import 是合法写法，剔除 CODE-008 假阳性（校验器未做 Vue3 分流）
    if (isVue3 && Array.isArray(l0b.issues)) {
      l0b = {
        ...l0b,
        issues: l0b.issues.filter((i) => (i?.id || '') !== 'CODE-008'),
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
  const expected = extractExpectedStyleLiterals(figma)
  const actual = extractDeclaredStyleLiterals(files)
  const style = computeStyleScore(expected, actual)

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
  }

  if (opts.persist !== false) persistQualityScore(componentDir, quality)
  return { componentDir, componentId, quality }
}

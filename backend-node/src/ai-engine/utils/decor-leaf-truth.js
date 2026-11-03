/**
 * 装饰叶子真值判据（P3 · 2026-11-03）
 *
 * 背景（离线重放 273 目录 · dist 真实实现实测）：
 *   `visual-parser#_generateCoverageReport` 的判定主循环里，命中
 *   「无语义名 ∧ 无 characters ∧ 非 UI 技术栈标记」的节点一律 `ignored`
 *   （`visual-parser.js:2156`）。这些被静默丢弃的节点里有大量**装饰叶子**
 *   （标题渐变装饰线 / 半透明底条 / 10px 图标），它们既不进 matched 也不进 missing，
 *   只落进 `excludedCount` ⇒ 分账不可见，读者无法判断「豁免是对的」还是「漏判了缺陷」。
 *
 * 实测结论（Phase 6 全量探针：273 目录 · dist 真实评分路径；决定了本模块只做「分账」而不做「并入 missing」）：
 *   · 1600 个装饰叶子（有可见填充/描边 ∧ 面积≥24 ∧ 最长边≥4）中
 *     1553 个（97.06%）在产物里能找到对应色值 ⇒ 并入 missing 会造 97% 假缺失；
 *     未落地 44（2.75%）+ 盲区豁免 3 ⇒ 三分之和恰为 1600（配平 0 误差，口径无遗漏）；
 *   · 阴性对照（目标色整体平移 RGB+70 / alpha ±0.35）命中率归零 ⇒ 颜色判据零假阳性；
 *   · 几何通道（同声明块内 width/height 同时 ±1px）阳性 6 / 阴性 234 ⇒ **零区分力**，故不采用。
 *
 * 因此本模块只回答一个问题：「这个装饰叶子的颜色，产物里到底有没有？」
 *   - 有 ⇒ verified（证明豁免正确）
 *   - 没有 ∧ 属于判据盲区（<12px VECTOR 图标 / 全透明渐变）⇒ exempt（显式豁免，可辩驳）
 *   - 没有 ∧ 不属盲区 ⇒ unverified（诚实暴露，WARN 级，不进 coverageRate 分母）
 *
 * 单一来源原则：`isNonSemanticName` / `isResourceWrapperName` / `collectDecorLeaves` 是本仓唯一实现，
 * `visual-parser` 的方法已改为委托本模块，禁止另立第二套口径。
 */

/** 覆盖率判定纳入的元素类型（与 visual-parser 原实现逐字一致） */
export const FILL_NODE_TYPES = ['TEXT', 'FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'RECTANGLE', 'ELLIPSE', 'VECTOR']

/** 图层名噪音过滤（与 visual-parser 原实现逐字一致） */
export const SKIP_PATTERNS = [/^\s*$/, /^[*/#].*/, /^[\d.]+(px|%)?$/, /^[.,;:!?，。；：！？\-—]+$/]

/** `@库/组件` 技术栈标记 */
export const TECH_MARKER_RX = /^@([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/

/** 遍历深度上限（与 `_traverse` 一致） */
export const MAX_DEPTH = 6

/**
 * 判断 Figma 节点名是否为「无语义名」（不应计入覆盖率统计）。
 * Figma 自动编号（Group 2136638523 / Vector / Rectangle 26 / Frame 1280）、
 * 通用占位名（bg / icon / g / circle / path）、技术组件名（@antd / @echarts）、
 * 结构占位名（btn / tit / charts / sub-header / header-）等。
 */
export function isNonSemanticName(name) {
  const n = (name || '').trim()
  if (!n) return true
  if (/^(group|vector|rectangle|ellipse|frame|line|polygon|star|slice|boolean)\b/i.test(n)) return true
  if (/^(bg|icon|img|g|circle|path|mask|shape|image|text|label|value|content)\b/i.test(n)) return true
  if (n.startsWith('@')) return true
  if (/^(btn|button|tit|charts|sub-header|header-?|footer|slot-|tab)\b/i.test(n)) return true
  return false
}

/**
 * 判断节点是否为「资源/技术组件封装」（应剪枝整个子树，内部结构不纳入还原考核）。
 * 只针对资源/技术封装，**不含** header/footer/tab 等结构容器——后者内部常有真实内容。
 */
export function isResourceWrapperName(name) {
  const n = (name || '').trim()
  if (!n) return false
  const mark = n.toLowerCase().match(/@([a-z]+)/)
  if (mark && /^(echarts?|chartjs|charts?|plotly|g2|g2plot|antv|d3|highcharts|bizcharts|vchart)$/.test(mark[1])) {
    return true
  }
  // 矢量组「g」：精确匹配，避免 /^g\b/ 误伤 g-xxx 这类真实命名
  if (n.toLowerCase() === 'g') return true
  return /^(bg|icon|img|image)\b/i.test(n)
}

// ---------------------------------------------------------------------------
// 装饰叶子描述
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round(n * 100) / 100

/** Figma paint → { r,g,b,a }（0-255 / 0-1）；fill.opacity 优先于 color.a */
function paintToTarget(paint) {
  const c = paint && paint.color
  if (!c) return null
  return {
    r: Math.round((c.r ?? 0) * 255),
    g: Math.round((c.g ?? 0) * 255),
    b: Math.round((c.b ?? 0) * 255),
    a: paint.opacity != null ? paint.opacity * (c.a != null ? c.a : 1) : (c.a != null ? c.a : 1),
  }
}

/**
 * 描述一个装饰叶子。不满足「有可见填充/描边 ∧ 面积≥minArea ∧ 最长边≥minSide」时返回 null。
 *
 * @param {object} node Figma 节点
 * @param {{depth?:number,minArea?:number,minSide?:number}} [opts]
 */
export function describeDecorLeaf(node, opts = {}) {
  const depth = opts.depth || 0
  const minArea = opts.minArea != null ? opts.minArea : 24
  const minSide = opts.minSide != null ? opts.minSide : 4
  const bb = node.absoluteBoundingBox || {}
  const w = Number(bb.width) || 0
  const h = Number(bb.height) || 0
  if (!(w > 0 && h > 0)) return null
  if (w * h < minArea || Math.max(w, h) < minSide) return null

  const visibleFills = (node.fills || []).filter((f) => f && f.visible !== false)
  const fill = visibleFills[0] || null
  const hasStroke = (node.strokes || []).some((s) => s && s.visible !== false)
  if (!fill && !hasStroke) return null

  const fillType = fill ? (fill.type || 'UNKNOWN') : 'STROKE_ONLY'
  const solid = fill && fillType === 'SOLID' ? paintToTarget(fill) : null
  const stops = fill && /^GRADIENT/.test(fillType) && Array.isArray(fill.gradientStops)
    ? fill.gradientStops.map(paintToTarget).filter(Boolean)
    : []

  return {
    id: node.id,
    name: String(node.name || '').slice(0, 60),
    type: node.type,
    depth,
    w: round2(w),
    h: round2(h),
    area: Math.round(w * h),
    fillType,
    solid,
    stops,
    hasStroke,
    cornerRadius: node.cornerRadius != null ? node.cornerRadius : null,
  }
}

/**
 * 采集全部装饰叶子（命中 `visual-parser.js:2156` 静默丢弃分支的那一族）。
 *
 * 与 `_generateCoverageReport` 的判定主循环**同源**：同一套剪枝（资源封装 / 深度 / SKIP_PATTERNS）、
 * 同一个 `:2156` 谓词（无语义名 ∧ 无 characters ∧ 非 UI 技术栈标记）、同一「叶子」定义（kids===0 ∧ 非 TEXT）。
 *
 * @param {object} root Figma 根节点（figma-node-data 的 document 或本体）
 * @param {{minArea?:number,minSide?:number}} [opts]
 * @returns {Map<object, object>} node 引用 → 叶子描述
 */
export function collectDecorLeaves(root, opts = {}) {
  const out = new Map()
  // 🛡️ 真实落盘形态兼容：`findFigmaNodeData` 返回的是
  // `{ fileKey, nodeId, tokenHash, cachedAt, document }` 包装体（实测 273/273 目录都带 document），
  // 而 `visual-parser.parse` 传入的已是裸根节点。此处统一解包，否则拿包装体当根会遍历不到任何子节点
  // ⇒ total 恒为 0、分账静默空转（真实的「假绿」陷阱）。与 `extractExpectedStructure` 的 `figmaNodeData?.document || figmaNodeData` 同口径。
  const startRoot =
    root && typeof root === 'object' && root.document && typeof root.document === 'object' && Array.isArray(root.document.children)
      ? root.document
      : root
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    const name = node.name || ''
    if (isResourceWrapperName(name)) return
    const isElem = name && !SKIP_PATTERNS.some((p) => p.test(name)) && FILL_NODE_TYPES.includes(node.type)
    if (isElem) {
      const charsLower = String(node.characters || '').toLowerCase()
      const isContentElement = node.type === 'TEXT' && (name.length > 2 || charsLower.length > 2)
      const kids = (node.children || []).length
      const pruned = (depth === 0 && kids > 10) || (depth > 5 && !isContentElement)
      const techMarker = name.trim().match(TECH_MARKER_RX)
      const hitsIgnoredBranch =
        !pruned &&
        isNonSemanticName(name) &&
        !charsLower.trim() &&
        !(techMarker && !isResourceWrapperName(name))
      if (hitsIgnoredBranch && kids === 0 && node.type !== 'TEXT') {
        const leaf = describeDecorLeaf(node, { depth, minArea: opts.minArea, minSide: opts.minSide })
        if (leaf) out.set(node, leaf)
      }
    }
    for (const child of node.children || []) walk(child, depth + 1)
  }
  walk(startRoot, 0)
  return out
}

// ---------------------------------------------------------------------------
// 产物侧颜色索引
// ---------------------------------------------------------------------------

const HEX_RX = /#([0-9a-fA-F]{3,8})\b/g
const FUNC_RX = /rgba?\([^)]*\)/gi

function normHex(h) {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 8) s = s.slice(0, 6)
  if (s.length !== 6) return null
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 }
}

/**
 * 解析 CSS 颜色字面量（hex / rgb / rgba）。渐变、url() 等返回 null（与 `normalizeCssColor` 同口径）。
 */
export function parseCssColor(raw) {
  const s = String(raw || '').trim()
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] != null ? +rgb[4] : 1 }
  if (/^#/.test(s)) return normHex(s)
  return null
}

/**
 * 从（已做变量替换的）产物文件建立颜色索引。
 *
 * @param {Array<{path:string,content:string}>} resolvedFiles
 * @returns {{colors:Set<string>, gradientCssCount:number}}
 */
export function buildColorIndex(resolvedFiles) {
  const colors = new Set()
  let gradientCssCount = 0
  for (const f of resolvedFiles || []) {
    const txt = String((f && f.content) || '')
    for (const m of txt.matchAll(HEX_RX)) colors.add(m[0])
    for (const m of txt.matchAll(FUNC_RX)) colors.add(m[0])
    gradientCssCount += (txt.match(/(?:linear|radial|conic)-gradient\s*\(/g) || []).length
  }
  return { colors, gradientCssCount }
}

/** 目标色是否以 RGB 各分量容差出现在产物颜色池中 */
export function colorPresent(colors, target, rgbTol = 3) {
  if (!target) return false
  for (const raw of colors) {
    const c = parseCssColor(raw)
    if (!c) continue
    if (Math.abs(c.r - target.r) > rgbTol) continue
    if (Math.abs(c.g - target.g) > rgbTol) continue
    if (Math.abs(c.b - target.b) > rgbTol) continue
    return true
  }
  return false
}

/** 目标色是否以 RGB±rgbTol 且 alpha±alphaTol 出现在产物颜色池中 */
export function colorPresentWithAlpha(colors, target, rgbTol = 3, alphaTol = 0.08) {
  if (!target) return false
  for (const raw of colors) {
    const c = parseCssColor(raw)
    if (!c) continue
    if (Math.abs(c.r - target.r) > rgbTol) continue
    if (Math.abs(c.g - target.g) > rgbTol) continue
    if (Math.abs(c.b - target.b) > rgbTol) continue
    if (Math.abs((c.a ?? 1) - (target.a ?? 1)) > alphaTol) continue
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export const DECOR_LEAF_THRESHOLDS = {
  minArea: 24,
  minSide: 4,
  rgbTol: 3,
  /** SOLID 的 alpha 容差（Figma fill.opacity 与 CSS rgba 第四位同源） */
  alphaTol: 0.08,
  /** 渐变 stop 视为「透明端」的阈值，不计入命中判定 */
  transparentAlpha: 0.1,
  /** 小于该边长的 VECTOR 图标视为「颜色不落 CSS 字面量」盲区（产物用 svg fill / background-image） */
  iconVectorMaxSide: 12,
  /** unverified 明细上限（避免 meta 膨胀） */
  sampleLimit: 40,
}

/**
 * 判定装饰叶子落地情况。
 *
 * @param {object} figmaRoot Figma 根节点
 * @param {Array<{path:string,content:string}>} resolvedFiles 已做变量替换的产物文件
 * @param {{minArea?:number,minSide?:number,rgbTol?:number,alphaTol?:number}} [opts]
 * @returns {object|null} figmaRoot 缺失时返回 null
 */
export function judgeDecorLeaves(figmaRoot, resolvedFiles, opts = {}) {
  if (!figmaRoot || typeof figmaRoot !== 'object') return null
  const th = {
    ...DECOR_LEAF_THRESHOLDS,
    ...(opts.minArea != null ? { minArea: opts.minArea } : {}),
    ...(opts.minSide != null ? { minSide: opts.minSide } : {}),
    ...(opts.rgbTol != null ? { rgbTol: opts.rgbTol } : {}),
    ...(opts.alphaTol != null ? { alphaTol: opts.alphaTol } : {}),
  }

  const leaves = collectDecorLeaves(figmaRoot, { minArea: th.minArea, minSide: th.minSide })
  const { colors, gradientCssCount } = buildColorIndex(resolvedFiles)

  const byFillType = {}
  let solidVerified = 0
  let gradientVerified = 0
  const exempt = { iconVectorBlind: 0, gradientTransparentOnly: 0, strokeOnly: 0, unknownFillType: 0 }
  const unverifiedItems = []
  let unverifiedCount = 0

  for (const leaf of leaves.values()) {
    byFillType[leaf.fillType] = (byFillType[leaf.fillType] || 0) + 1

    if (leaf.fillType === 'STROKE_ONLY') {
      exempt.strokeOnly++
      continue
    }

    if (leaf.fillType === 'SOLID') {
      const c = leaf.solid
      // 严格判定：RGB 各分量 ±rgbTol **且** alpha ±alphaTol（半透明底被写成不透明色是真实视觉差异，不能放过）
      const strictHit = c ? colorPresentWithAlpha(colors, c, th.rgbTol, th.alphaTol) : false
      if (strictHit) {
        solidVerified++
      } else if (leaf.type === 'VECTOR' && Math.max(leaf.w, leaf.h) < th.iconVectorMaxSide) {
        exempt.iconVectorBlind++
      } else {
        unverifiedCount++
        if (unverifiedItems.length < th.sampleLimit) {
          unverifiedItems.push({
            id: leaf.id,
            name: leaf.name,
            type: leaf.type,
            w: leaf.w,
            h: leaf.h,
            fillType: leaf.fillType,
            reason: 'solid-color-absent',
            color: c ? `rgba(${c.r},${c.g},${c.b},${round2(c.a)})` : null,
            cornerRadius: leaf.cornerRadius,
          })
        }
      }
      continue
    }

    if (/^GRADIENT/.test(leaf.fillType)) {
      const opaqueStops = leaf.stops.filter((s) => (s.a ?? 1) >= th.transparentAlpha)
      if (!opaqueStops.length) {
        exempt.gradientTransparentOnly++
        continue
      }
      const allHit = opaqueStops.every((s) => colorPresent(colors, s, th.rgbTol))
      if (allHit) {
        gradientVerified++
      } else {
        unverifiedCount++
        if (unverifiedItems.length < th.sampleLimit) {
          unverifiedItems.push({
            id: leaf.id,
            name: leaf.name,
            type: leaf.type,
            w: leaf.w,
            h: leaf.h,
            fillType: leaf.fillType,
            reason: 'gradient-stops-absent',
            stops: opaqueStops.map((s) => `rgba(${s.r},${s.g},${s.b},${round2(s.a)})`),
            cornerRadius: leaf.cornerRadius,
          })
        }
      }
      continue
    }

    // 未知填充类型：不算缺失（判据未覆盖，宁可沉默也不冤枉）
    exempt.unknownFillType++
  }

  const total = leaves.size
  const verifiedTotal = solidVerified + gradientVerified
  const exemptTotal = exempt.iconVectorBlind + exempt.gradientTransparentOnly + exempt.strokeOnly + exempt.unknownFillType

  return {
    version: 'v1',
    total,
    byFillType,
    verified: {
      solid: solidVerified,
      gradient: gradientVerified,
      total: verifiedTotal,
      rate: total > 0 ? round2((verifiedTotal / total) * 100) / 100 : 0,
    },
    exempt: {
      ...exempt,
      total: exemptTotal,
    },
    unverified: {
      count: unverifiedCount,
      rate: total > 0 ? round2((unverifiedCount / total) * 100) / 100 : 0,
      items: unverifiedItems,
    },
    thresholds: th,
    colorPool: {
      size: colors.size,
      gradientCssCount,
    },
    judgedAt: new Date().toISOString(),
  }
}

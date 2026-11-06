/**
 * 真值色板（#139 · N3）：从 Figma 节点树收集**按用途分桶**的精确色值，
 * 供 Less 变量补齐时「真值优先」，替代按变量名编造语义色。
 *
 * 背景（e7a50be7 实锤）：
 *   产物 theme-vars.less 里 84 处 `// 自动添加（语义推断）`（17 个唯一变量名 × 4 个 mixin），
 *   值全是按名字猜的——
 *   `@color-group-bg-gold: #ffffff`（真值 rgba(226,208,132,0.2)）、
 *   `@color-group-glow-gold: #333333`（真值 #ffc800）、
 *   `@color-accent-gold: #409EFF`（含 "accent" ⇒ 猜成 antd 蓝，真值是金）。
 *   ⇒ 面板底色/内发光/数字色全部漂移，「布局样式一直错」的样式侧主因。
 *
 * 分工原则（用户 2026-10-20 明确）：vision 出布局/排版/图表图例，**node 出颜色/大小/背景/样式**。
 *   本模块即 node 侧色值的唯一采集口径。
 */

/** Figma 颜色对象 → CSS 色值（alpha<1 用 rgba，否则 #hex） */
function colorToCss(color, alphaOverride) {
  if (!color || typeof color !== 'object') return null
  const to255 = (v) => Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255)))
  const r = to255(color.r)
  const g = to255(color.g)
  const b = to255(color.b)
  const a = alphaOverride != null ? Number(alphaOverride) : color.a != null ? Number(color.a) : 1
  if (!Number.isFinite(a)) return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  if (a >= 0.999) return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
}

/** 渐变 fill → CSS linear-gradient（与 figma-connector#fillsSummary 同口径：stop 透明度优先） */
function gradientToCss(fill) {
  const stops = Array.isArray(fill?.gradientStops) ? fill.gradientStops : []
  if (stops.length < 2) return null
  const list = stops
    .map((s) => {
      const c = colorToCss(s?.color, s?.color?.a)
      if (!c) return null
      const pos = Number.isFinite(s?.position) ? Math.round(s.position * 100) : null
      return pos == null ? c : `${c} ${pos}%`
    })
    .filter(Boolean)
  if (list.length < 2) return null
  const angle = Math.round(Number(fill?.gradientHandlePositions?.[0]?.x ?? 0.5) * 0) + 180
  return `linear-gradient(${angle}deg, ${list.join(', ')})`
}

/** 单节点可见 fills → 色值列表（纯色 + 渐变） */
function fillsToValues(node) {
  const out = []
  for (const f of node?.fills || []) {
    if (!f || f.visible === false) continue
    const type = String(f.type || '')
    if (type === 'SOLID') {
      const c = colorToCss(f.color, f.opacity != null ? f.opacity * (f.color?.a ?? 1) : f.color?.a)
      if (c) out.push(c)
    } else if (type.startsWith('GRADIENT')) {
      const g = gradientToCss(f)
      if (g) out.push(g)
    }
  }
  return out
}

/** 单节点可见 strokes → 色值列表 */
function strokesToValues(node) {
  const out = []
  for (const s of node?.strokes || []) {
    if (!s || s.visible === false) continue
    if (String(s.type || '') !== 'SOLID') continue
    const c = colorToCss(s.color, s.color?.a)
    if (c) out.push(c)
  }
  return out
}

/** 单节点可见阴影 effects → 色值列表 */
function shadowsToValues(node) {
  const out = []
  for (const e of node?.effects || []) {
    if (!e || e.visible === false) continue
    if (!/SHADOW/i.test(String(e.type || ''))) continue
    const c = colorToCss(e.color, e.color?.a)
    if (c) out.push(c)
  }
  return out
}

const TEXT_TYPES = new Set(['TEXT'])
const AREA_TYPES = new Set(['RECTANGLE', 'FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'ELLIPSE'])

/**
 * 构建真值色板：按用途分桶（backgrounds / shadows / borders / texts）。
 *
 * 判据（纯结构，命名无关）：
 *   - TEXT 节点的 fills ⇒ texts（文字色）
 *   - 面积型容器节点的 fills ⇒ backgrounds（面板底色/卡片底/渐变）
 *   - 任意可见 strokes ⇒ borders
 *   - 任意可见 SHADOW/INNER_SHADOW ⇒ shadows（发光色）
 *
 * 只收「有实际面积」的节点（bbox 宽高 > 0），避免 0 尺寸占位节点污染候选集。
 * 去重保序：产物侧按出现顺序与真值候选对齐时依赖顺序稳定（figma 树前序）。
 *
 * @param {object} figmaRoot figma.json 根（兼容 {document:…} 包装）
 * @returns {{backgrounds:string[], shadows:string[], borders:string[], texts:string[]}}
 */
export function buildTruthPalette(figmaRoot) {
  const root = figmaRoot?.document ?? figmaRoot
  const buckets = { backgrounds: [], shadows: [], borders: [], texts: [] }
  const seen = {
    backgrounds: new Set(),
    shadows: new Set(),
    borders: new Set(),
    texts: new Set(),
  }
  const push = (bucket, values) => {
    for (const v of values) {
      if (!v || seen[bucket].has(v)) continue
      seen[bucket].add(v)
      buckets[bucket].push(v)
    }
  }
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    const b = n.absoluteBoundingBox
    const hasArea = !b || ((Number(b.width) || 0) > 0 && (Number(b.height) || 0) > 0)
    const type = String(n.type || '').toUpperCase()
    if (hasArea) {
      if (TEXT_TYPES.has(type)) {
        push('texts', fillsToValues(n))
      } else if (AREA_TYPES.has(type)) {
        push('backgrounds', fillsToValues(n))
      } else {
        // VECTOR/BOOLEAN_OPERATION 等装饰：fills 仍可能是图标主体色，归 texts（前景色族）
        push('texts', fillsToValues(n))
      }
      push('borders', strokesToValues(n))
      push('shadows', shadowsToValues(n))
    }
    for (const c of n.children || []) walk(c)
  }
  walk(root)
  return buckets
}

/** 按属性名推断消费桶（用于「变量被哪个属性引用」→ 选对应真值桶） */
export function bucketOfProperty(prop = '') {
  const p = String(prop).toLowerCase()
  if (/box-shadow|text-shadow|shadow/.test(p)) return 'shadows'
  if (/^background|^bg/.test(p) || p === 'fill') return 'backgrounds'
  if (/border|stroke|outline/.test(p)) return 'borders'
  if (/^color|^text|font-color/.test(p)) return 'texts'
  return null
}

/**
 * 从**变量名**推断用途桶 —— 消费属性查不到时的退路。
 *
 * ⚠️ 与 `bucketOfProperty` 的分工：
 *   - `bucketOfProperty(prop)`：样式文本里真实消费属性 → 首选（事实）
 *   - `bucketFromVarName(name)`：名字里的用途词 → 退路（只用于「该拿哪个桶的
 *     中性色/真值」，**不产生任何新色值**，所以不构成「按名编造颜色」）
 *
 * 事故教训（#139 · N3 回归）：只认消费属性 ⇒ `@color-card-bg` 这类
 *   「定义在 theme mixin、消费在别处」的变量桶恒为 null ⇒ 全部退成 texts 中性色，
 *   `@color-card-bg` 从白底(#ffffff) 变灰字色(#333333)、`@color-card-border`
 *   深色主题下从 #4b4b4b 变 #e6e6e6（存量 spec 立刻抓到）。
 */
export function bucketFromVarName(varName = '') {
  const n = String(varName).replace(/^@/, '').toLowerCase()
  if (/(border|stroke|outline)/.test(n)) return 'borders'
  if (/(shadow|glow|light-?ring)/.test(n)) return 'shadows'
  if (/(bg|background|fill|backdrop)/.test(n)) return 'backgrounds'
  return 'texts'
}

/** 从样式文本里找某 Less 变量的消费属性（取首个命中；`@name` 需带 @） */export function findConsumerProperty(styleText = '', varName = '') {
  const name = String(varName).startsWith('@') ? String(varName) : `@${varName}`
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`([-a-zA-Z_$][\\w-]*)\\s*:\\s*[^;{}]*${escaped}(?![\\w-])`, 'g')
  let m
  while ((m = re.exec(String(styleText || '')))) {
    const prop = m[1]
    if (bucketOfProperty(prop)) return prop
  }
  return null
}

/** 桶内中性兜底色（可被 Less 颜色函数求值；backgrounds 用全透明最安全） */
export const NEUTRAL_BY_BUCKET = {
  backgrounds: 'rgba(0, 0, 0, 0)',
  shadows: 'rgba(0, 0, 0, 0.2)',
  borders: '#e8e8e8',
  texts: '#333333',
}

/**
 * 按明暗取「中性容器色」——**真值不可判定时的兜底**。
 *
 * 口径（#139 · N3）：兜底只能给**中性色**（白/黑/灰系），绝不能给语义彩色。
 *   事故里 `@color-accent-gold` 被猜成 `#409EFF`（antd 蓝）产生蓝色块/蓝色发光；
 *   而 `theme-vars.less` 里 gold 系变量真值是 `#ffc800` 金。中性白/灰至少不误导色相。
 *
 * ⚠️ backgrounds 不用 `rgba(0,0,0,0)`：全透明会让「面板/卡片底」直接消失，
 *   视觉上比错色更糟（e7a50be7 的 4 个被消费背景变量全是面板/条目底）。
 *   故按明暗给可辨识的容器色，等 N1/N2 把真值补到位后自然被替换。
 */
export function neutralForBucket(bucket, { dark = false } = {}) {
  switch (bucket) {
    case 'backgrounds':
      return dark ? '#2b2b2b' : '#ffffff'
    case 'shadows':
      return 'rgba(0, 0, 0, 0.2)'
    case 'borders':
      return dark ? '#4b4b4b' : '#e8e8e8'
    case 'texts':
    default:
      return dark ? '#e6e6e6' : '#333333'
  }
}

/**
 * CSS 色值 → { r, g, b, a }（#rgb / #rrggbb / rgb() / rgba()；渐变取**首个 stop**）
 * 解析失败返回 null。
 */
export function parseCssColor(value) {
  const v = String(value || '').trim()
  if (!v) return null
  let m = v.match(/^#([0-9a-f]{3,8})$/i)
  if (m) {
    let hex = m[1]
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length < 6) return null
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    if (![r, g, b].every(Number.isFinite)) return null
    return { r, g, b, a }
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (m) {
    const r = Number(m[1])
    const g = Number(m[2])
    const b = Number(m[3])
    let a = 1
    if (m[4] != null) {
      a = String(m[4]).endsWith('%') ? Number(String(m[4]).slice(0, -1)) / 100 : Number(m[4])
    }
    if (![r, g, b, a].every(Number.isFinite)) return null
    return { r, g, b, a }
  }
  // 渐变：取首个 stop 参与色系判定（只为「名字说 gold，值是不是 gold」这种粗判）
  m = v.match(/gradient\(\s*[^,]*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i)
  if (m) return parseCssColor(m[1])
  return null
}

/** 色系（按色相 + 相对彩度门限；近中性色返回 null，不参与色系匹配） */
export function colorFamily(cssColor) {
  const c = typeof cssColor === 'string' ? parseCssColor(cssColor) : cssColor
  if (!c) return null
  const max = Math.max(c.r, c.g, c.b)
  const min = Math.min(c.r, c.g, c.b)
  const delta = max - min
  // 相对彩度：极浅半透明面板（rgba(244,254,255,.35) delta=11/255≈4.3%）天然低彩度，
  // 门限取 3% —— 低于此值视作中性（#fff/#333/#eee 等不该被塞进任何色系）。
  if (max === 0 || delta / max < 0.03) return null
  let h
  if (delta === 0) h = 0
  else if (max === c.r) h = 60 * (((c.g - c.b) / delta) % 6)
  else if (max === c.g) h = 60 * ((c.b - c.r) / delta + 2)
  else h = 60 * ((c.r - c.g) / delta + 4)
  if (h < 0) h += 360
  if (h < 15 || h >= 345) return 'red'
  if (h < 40) return 'orange'
  if (h < 70) return 'gold'
  if (h < 160) return 'green'
  if (h < 200) return 'cyan'
  if (h < 255) return 'blue'
  if (h < 300) return 'purple'
  return 'pink'
}

/** 变量名里的色系词 → 色系（用于「名字与真值同族」收窄；与设计稿实际用色一致） */
const FAMILY_KEYWORDS = [
  [/\b(gold|yellow|amber)\b/, 'gold'],
  [/\b(mint|green|emerald)\b/, 'green'],
  [/\b(cyan|teal|aqua|turquoise)\b/, 'cyan'],
  [/\b(blue|azure)\b/, 'blue'],
  [/\b(red|crimson|ruby)\b/, 'red'],
  [/\b(orange)\b/, 'orange'],
  [/\b(purple|violet|indigo|magenta|pink)\b/, 'purple'],
]

/** 从变量名提取色系（`color-group-bg-gold` → 'gold'；无则 null） */
export function familyFromVarName(varName = '') {
  const n = String(varName).replace(/^@/, '').toLowerCase()
  // 用 `-`/`_` 作边界，避免 `goldenrod` 之类误命中
  const parts = n.split(/[-_\s]+/)
  for (const [re, fam] of FAMILY_KEYWORDS) {
    if (parts.some((p) => re.test(p))) return fam
  }
  return null
}

/** 透明度档位提示（仅 backgrounds 用）：条目/格子/chip 偏不透明，面板/容器偏半透明 */
const OPAQUE_HINTS = /(item|cell|chip|tag|badge|pill|btn|button|input)/
const TRANSLUCENT_HINTS = /(panel|card|container|wrap|stage|group|glass|overlay|mask)/

/**
 * 真值候选**收窄**（只做交集筛选，绝不新增色值）：
 *   ① 属性形态：`color` / `border` 在 CSS 里不接受渐变 ⇒ 排除 gradient 真值
 *   ② 色系：变量名带 gold/mint/cyan… ⇒ 只保留同色系真值（同色系为空则不过滤）
 *   ③ 透明度档位（仅 backgrounds）：`item/cell/chip` 偏不透明、`panel/group/容器` 偏半透明
 *
 * @returns {string[]} 收窄后的候选（可能 0/1/多个）
 */
export function narrowTruthCandidates(palette, bucket, { varName = '', property = '' } = {}) {
  let list = Array.isArray(palette?.[bucket]) ? [...palette[bucket]] : []
  if (!list.length) return []
  const p = String(property || '').toLowerCase()
  if (!/background/.test(p)) list = list.filter((v) => !/gradient/i.test(v))
  const fam = familyFromVarName(varName)
  if (fam) {
    const sameFam = list.filter((v) => colorFamily(v) === fam)
    if (sameFam.length) list = sameFam
  }
  if (bucket === 'backgrounds') {
    const n = String(varName || '').toLowerCase()
    const opaque = OPAQUE_HINTS.test(n)
    const translucent = TRANSLUCENT_HINTS.test(n)
    if (opaque !== translucent) {
      const tier = list.filter((v) => {
        const c = parseCssColor(v)
        if (!c) return false
        return opaque ? c.a >= 0.999 : c.a < 0.999
      })
      if (tier.length) list = tier
    }
  }
  return list
}

/** 收窄后**恰好 1 个**才认（多义 = 真值不可判定 ⇒ 返 null，交给中性兜底，不猜） */
export function pickTruthCandidate(palette, bucket, opts = {}) {
  const list = narrowTruthCandidates(palette, bucket, opts)
  return list.length === 1 ? list[0] : null
}


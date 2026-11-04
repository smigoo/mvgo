/**
 * N1（#139）：真值色值落地门禁 —— 「下发过的精确色值必须出现在产物里」。
 *
 * 事故（e7a50be7 / 用户截图实锤）：
 *   Figma 真值 `rgba(226,208,132,0.2)`（金面板底）、`#ffc800`（内发光）、
 *   `#fffdf1`（chips 底）都下发到了 prompt，但 LLM 把它们**换成了语义变量**
 *   （`background: @color-bg-card-active` / `box-shadow: inset ... fade(@color-accent-gold,100%)`），
 *   而变量值由系统按名推断 ⇒ 真值全丢（`@color-accent-gold` 被推断成蓝 `#409EFF`）。
 *   产物里只剩一处 `rgba(226,208,132,0.2)` 字面量，薄荷面板底 `rgba(216,255,233,0.32)` **零出现**。
 *
 * 判据（自锚定、零配置）：
 *   ① 「已实现区块」= 产物里出现了 `data-section-id="<figmaNodeId>"` 的节点（含 `-list`/`-tail-text`
 *      等合成后缀，按 `:` 前的基 id 归一）；**没实现的区块不判**，避免「设计里有、本次没做」的假阳性。
 *   ② 在该节点子树里收集**醒目色**：面积占比 ≥ minAreaRatio（默认 1%）的容器 fills / strokes /
 *      SHADOW effects 颜色；纯色才判，渐变跳过（渐变写法自由度太大，比对噪声高）。
 *   ③ 覆盖判定：真值归一化后出现在产物全文本的**颜色 token 集合**里即算落地。
 *      变量定义行同样是颜色 token ⇒ 「写进变量且变量的值等于真值」也算落地（这是允许的写法）。
 *
 * 判定为 **只报不改**（WARN）：真值缺失不一定等于错，但**必然**说明该处颜色不来自设计稿。
 */

/** 归一化 CSS 颜色为可比较的键（hex 小写展开 / rgba 去空格与尾零）；非颜色返回 null */
export function normalizeCssColor(value) {
  const v = String(value || '').trim()
  if (!v) return null
  let m = v.match(/^#([0-9a-fA-F]{3,8})$/)
  if (m) {
    let hex = m[1].toLowerCase()
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length === 6) return `#${hex}`
    if (hex.length === 8) return `#${hex.slice(0, 6)}@${(parseInt(hex.slice(6, 8), 16) / 255).toFixed(3)}`
    return null
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i)
  if (m) {
    const r = Math.round(Number(m[1]))
    const g = Math.round(Number(m[2]))
    const b = Math.round(Number(m[3]))
    let a = 1
    if (m[4] != null) {
      a = String(m[4]).endsWith('%') ? Number(String(m[4]).slice(0, -1)) / 100 : Number(m[4])
    }
    if (![r, g, b, a].every(Number.isFinite)) return null
    const alpha = Number(a.toFixed(3))
    if (alpha >= 0.999) return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}@${alpha}`
  }
  return null
}

/** 从任意文本里抽取全部颜色 token（并归一化） */
export function collectColorTokens(text) {
  const out = new Set()
  const re = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+%?\s*)?\)/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const n = normalizeCssColor(m[0])
    if (n) out.add(n)
  }
  return out
}

function colorToCss(color) {
  if (!color || typeof color !== 'object') return null
  const to255 = (v) => Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255)))
  const r = to255(color.r)
  const g = to255(color.g)
  const b = to255(color.b)
  const a = color.a != null ? Number(color.a) : 1
  if (!Number.isFinite(a)) return null
  if (a >= 0.999) return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
}

function nodeArea(node) {
  const b = node?.absoluteBoundingBox
  const w = Number(b?.width) || 0
  const h = Number(b?.height) || 0
  return w > 0 && h > 0 ? w * h : 0
}

/** 建 figma 节点索引（id → node） */
function indexFigmaNodes(root) {
  const index = new Map()
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.id) index.set(String(n.id), n)
    for (const c of n.children || []) walk(c)
  }
  walk(root)
  return index
}

/** 从产物文本收集已实现的 section 基 id 集合 */
export function collectImplementedSectionIds(text) {
  const ids = new Set()
  const re = /data-section-id="([^"]+)"/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const raw = String(m[1]).trim()
    if (!raw) continue
    // 合成后缀（`38:3211-list` / `38:3162-tail-text`）归一到图节点基 id
    const base = raw.includes(':') ? raw.split('-')[0] : raw
    ids.add(base)
    ids.add(raw)
  }
  return ids
}

/**
 * 收集「已实现区块」的醒目真值色。
 *
 * @param {object} figmaRoot figma 根（兼容 {document:…}）
 * @param {Iterable<string>} implementedIds 产物里出现的 section id
 * @param {{minAreaRatio?: number}} [opts]
 * @returns {Array<{bucket:string, value:string, nodeId:string, nodeName:string, areaRatio:number}>}
 */
export function collectProminentTruthColors(figmaRoot, implementedIds, opts = {}) {
  const root = figmaRoot?.document ?? figmaRoot
  if (!root) return []
  const minAreaRatio = Number(opts.minAreaRatio ?? 0.01)
  const rootArea = nodeArea(root) || 0
  const index = indexFigmaNodes(root)
  const ids = implementedIds instanceof Set ? implementedIds : new Set(implementedIds || [])
  const seen = new Set()
  const out = []
  const push = (bucket, value, node, area) => {
    const norm = normalizeCssColor(value)
    if (!norm) return
    const key = `${bucket}|${norm}|${node.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      bucket,
      value,
      nodeId: String(node.id),
      nodeName: String(node.name || ''),
      areaRatio: rootArea > 0 ? Number((area / rootArea).toFixed(4)) : 0,
    })
  }
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    const area = nodeArea(n)
    const ratio = rootArea > 0 ? area / rootArea : 0
    if (ratio >= minAreaRatio) {
      for (const f of n.fills || []) {
        if (!f || f.visible === false || String(f.type || '') !== 'SOLID') continue
        const c = colorToCss({ ...f.color, a: (f.color?.a ?? 1) * (f.opacity ?? 1) })
        if (c) push(String(n.type || '').toUpperCase() === 'TEXT' ? 'texts' : 'backgrounds', c, n, area)
      }
      for (const s of n.strokes || []) {
        if (!s || s.visible === false || String(s.type || '') !== 'SOLID') continue
        const c = colorToCss(s.color)
        if (c) push('borders', c, n, area)
      }
      for (const e of n.effects || []) {
        if (!e || e.visible === false || !/SHADOW/i.test(String(e.type || ''))) continue
        const c = colorToCss(e.color)
        if (c) push('shadows', c, n, area)
      }
    }
    for (const c of n.children || []) walk(c)
  }
  for (const id of ids) {
    const node = index.get(id)
    if (node) walk(node)
  }
  return out
}

/**
 * 审计：已实现区块的醒目真值色，有多少没在产物里落地。
 *
 * @param {{figmaRoot?: object, files?: Object<string,string>|Array<[string,string]>, minAreaRatio?: number}} params
 * @returns {{skipped:boolean, truthCount:number, covered:number, missing:Array, implementedSections:string[]}}
 */
export function auditTruthColorUsage({ figmaRoot, files, minAreaRatio } = {}) {
  const entries = Array.isArray(files) ? files : Object.entries(files || {})
  const allText = entries.map(([, c]) => String(c || '')).join('\n')
  const implementedSections = [...collectImplementedSectionIds(allText)].filter((id) => id.includes(':'))
  if (!figmaRoot || entries.length === 0 || implementedSections.length === 0) {
    return { skipped: true, truthCount: 0, covered: 0, missing: [], implementedSections }
  }
  const truth = collectProminentTruthColors(figmaRoot, implementedSections, { minAreaRatio })
  if (truth.length === 0) {
    return { skipped: false, truthCount: 0, covered: 0, missing: [], implementedSections }
  }
  const tokens = collectColorTokens(allText)
  const missing = []
  let covered = 0
  for (const t of truth) {
    const norm = normalizeCssColor(t.value)
    if (!norm) continue
    if (tokens.has(norm)) covered++
    else missing.push(t)
  }
  return { skipped: false, truthCount: truth.length, covered, missing, implementedSections }
}

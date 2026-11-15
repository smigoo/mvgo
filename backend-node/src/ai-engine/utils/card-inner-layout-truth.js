/**
 * 🛡️ 卡内结构 / 文字方向真值（2026-11-15 · mc-max-1794751473723-92612fc0 实锤）
 *
 * 病灶：vision 对 `stat-card`（2:8787 / 2:8806）只给「5 条扁平 elem」，**不给卡内布局**
 *   ⇒ 下游无从得知真值是「两行」（上：icon + line1；下：name + line2）⇒ 模型排成
 *   `flex-direction: row` 四元素一字排开 ⇒ 「总数:」被压成 15px 宽、竖折两行。
 *   同一节点 vision 的 tab 只给 fs，不给方向 ⇒ Figma 真值竖排（15×36）被渲染成横排（24×14.4）。
 *
 * 本模块把这两件事变成**确定性几何判据**（与 header-owner-truth 同族）：
 *   · `deriveCardInnerRows()`  —— 卡片直接子元素按 y 带聚类，输出行分组（纯结构）
 *   · `textOrientationOf()`    —— 单条 TEXT 的书写方向（竖排 / 横排 / 判不出）
 *
 * 硬约束：
 *   · **零图层名/零类名/零节点 id 特判**：只用 bbox、字符数、fontSize。
 *   · **无量纲**：容差与比例一律除以容器高 / fontSize，禁止固定 px。
 *   · **fail-open**：缺 bbox / 缺 fontSize / 单字 / 判不出 ⇒ 返回 null，调用方保持旧行为。
 *   · **只给事实，不改产物**：消费者自行决定怎么用。
 */

/** 行带容差：以容器高度为分母（真值 2:8787 = 64.8 高，同带 y 差 ≤ 4 ⇒ 6.2%；跨带 y 差 29 ⇒ 44.8%）。 */
export const BAND_TOL_RATIO = 0.08

/** 文本方向：宽 / fontSize 与 高 / fontSize 的判定比（真值竖排 1.07~1.21，横排 2.0~6.0）。 */
export const TEXT_VERTICAL_WIDTH_RATIO = 1.6
export const TEXT_SINGLE_LINE_HEIGHT_RATIO = 1.6

/** 背景层判定：面积占比 ≥ 该值且为第一个子节点 ⇒ 视为容器自身背景，不参与行带。 */
export const BACKGROUND_AREA_RATIO = 0.9

/** 装饰叶判定：子树无文本且面积占比 < 该值 ⇒ 不参与行带（与 layout-truth-healer 同族）。 */
export const DECOR_AREA_RATIO = 0.05

function boxOf(node) {
  const b = node?.absoluteBoundingBox || node?.absoluteRenderBounds
  if (!b) return null
  const x = Number(b.x)
  const y = Number(b.y)
  const width = Number(b.width)
  const height = Number(b.height)
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null
  return { x, y, width, height }
}

function hasText(node) {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'TEXT') return true
  for (const c of node.children || []) {
    if (hasText(c)) return true
  }
  return false
}

function charCount(text) {
  return String(text || '').replace(/\s+/g, '').length
}

function fontSizeOf(node) {
  const fs = Number(node?.style?.fontSize ?? node?.fontSize)
  return Number.isFinite(fs) && fs > 0 ? fs : null
}

/**
 * 单条文本的书写方向。
 *
 * 判据（全部无量纲）：
 *   · 字符数 ≤ 1 ⇒ null（单字无所谓方向，避免「5」被误判）
 *   · 宽/fs ≤ 1.6 且 高/fs ≥ 1.6 ⇒ 'vertical'   （真值「监控」15×36/fs14 = 1.07 / 2.57）
 *   · 高/fs ≤ 1.6 且 宽/fs ≥ 1.6 ⇒ 'horizontal'（产物横排 24×14.4/fs12 = 2.0 / 1.2）
 *   · 其余 ⇒ null
 *
 * @returns {{orientation:'vertical'|'horizontal', widthRatio:number, heightRatio:number,
 *            fontSize:number, charCount:number}|null}
 */
export function textOrientationOf(textNode) {
  if (!textNode || textNode.type !== 'TEXT') return null
  const chars = charCount(textNode.characters)
  if (chars <= 1) return null
  const fs = fontSizeOf(textNode)
  if (!fs) return null
  const box = boxOf(textNode)
  if (!box || box.width <= 0 || box.height <= 0) return null
  const widthRatio = box.width / fs
  const heightRatio = box.height / fs
  let orientation = null
  if (widthRatio <= TEXT_VERTICAL_WIDTH_RATIO && heightRatio >= TEXT_SINGLE_LINE_HEIGHT_RATIO) {
    orientation = 'vertical'
  } else if (heightRatio <= TEXT_SINGLE_LINE_HEIGHT_RATIO && widthRatio >= TEXT_VERTICAL_WIDTH_RATIO) {
    orientation = 'horizontal'
  }
  if (!orientation) return null
  return {
    orientation,
    widthRatio: Math.round(widthRatio * 100) / 100,
    heightRatio: Math.round(heightRatio * 100) / 100,
    fontSize: fs,
    charCount: chars,
  }
}

/**
 * 卡片直接子元素的行分组（纯结构，不看名字）。
 *
 * 真值 `2:8787`（193.4×64.8）：
 *   children = [bg(全幅) / t-隧道设备(45×16 @y514) / line1(105×23 @y481) / line2(59×23 @y510) / icon(35.2×28.3 @y483)]
 *   ⇒ bg 被面积规则排除；y 带 = {481,483} / {510,514} ⇒ 2 带 ⇒ axis='column'
 *   ⇒ rows = [ [icon, line1], [name, line2] ] —— 与 vision 的 inlineCompositeRows 两条 members 完全一致。
 *
 * @returns {{axis:'column'|'row', rows:Array<{top:number,height:number,members:string[]}>,
 *            bandCount:number, tolerance:number}|null}
 */
export function deriveCardInnerRows(cardNode) {
  if (!cardNode || typeof cardNode !== 'object') return null
  const container = boxOf(cardNode)
  if (!container || container.height <= 0) return null
  const kids = Array.isArray(cardNode.children) ? cardNode.children : []
  if (kids.length < 2) return null
  const containerArea = container.width * container.height
  const tolerance = Math.max(container.height * BAND_TOL_RATIO, 1)

  const candidates = []
  kids.forEach((kid, index) => {
    const box = boxOf(kid)
    if (!box) return
    const areaRatio = containerArea > 0 ? (box.width * box.height) / containerArea : 0
    // 容器自身背景：覆盖几乎整卡且排在最前 ⇒ 不是内容行
    if (index === 0 && areaRatio >= BACKGROUND_AREA_RATIO) return
    // 装饰叶：无文本且极小 ⇒ 不参与行带（否则 8×8 圆点会凭空多出一带）
    if (!hasText(kid) && areaRatio < DECOR_AREA_RATIO) return
    if (!kid.id) return
    candidates.push({ id: String(kid.id), y: box.y, height: box.height, areaRatio })
  })
  if (candidates.length < 2) return null

  candidates.sort((a, b) => a.y - b.y)
  const bands = []
  for (const item of candidates) {
    const band = bands[bands.length - 1]
    if (band && Math.abs(item.y - band.top) <= tolerance) {
      band.members.push(item.id)
      band.height = Math.max(band.height, item.height)
      continue
    }
    bands.push({ top: item.y, height: item.height, members: [item.id] })
  }
  return {
    axis: bands.length >= 2 ? 'column' : 'row',
    rows: bands.map((b) => ({
      top: Math.round(b.top * 100) / 100,
      height: Math.round(b.height * 100) / 100,
      members: b.members,
    })),
    bandCount: bands.length,
    tolerance: Math.round(tolerance * 100) / 100,
  }
}

/** 递归建 id → node 索引（供装配层一次遍历复用，避免 O(n²) 查找）。 */
export function indexFigmaNodes(rootNode, index = new Map()) {
  if (!rootNode || typeof rootNode !== 'object') return index
  if (rootNode.id) index.set(String(rootNode.id), rootNode)
  for (const c of rootNode.children || []) indexFigmaNodes(c, index)
  return index
}

/** 把 {document}/{nodes}/裸树 三种 Figma 入参归一成根节点。 */
export function unwrapFigmaRoot(figmaNodeData) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return null
  if (Array.isArray(figmaNodeData.children)) return figmaNodeData
  if (figmaNodeData.document && typeof figmaNodeData.document === 'object') {
    return unwrapFigmaRoot(figmaNodeData.document)
  }
  const nodes = figmaNodeData.nodes
  if (nodes && typeof nodes === 'object') {
    const first = Object.values(nodes)[0]
    if (first && typeof first === 'object') {
      if (first.document) return unwrapFigmaRoot(first.document)
      if (Array.isArray(first.children)) return first
    }
  }
  return null
}

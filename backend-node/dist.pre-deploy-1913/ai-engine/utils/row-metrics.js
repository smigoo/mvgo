/**
 * F18（2026-10-21）：行内列数 / 单项尺寸 / 间距的**算术推导**（纯几何，零硬编码）。
 *
 * 病灶（mc-max-1792497064987-195c8d0e 实锤）：真值 `4 × 126 + 3 × 20 = 564` 是**算得出来**的，
 * 但管线里没有任何一处做这个除法，列数只从 `display:grid` / 视觉分析拿 ⇒ 拿不到就让模型拍。
 * 产物因此写了 `flex: 1 1 calc(25% - 20px)` ⇒ chip 宽 121px（真值 126px）。
 *
 * 判据（纯几何、命名无关，任一条不满足即返回 null，绝不猜）：
 *   ① 全部 box 尺寸有限且 ≥2 项；
 *   ② 同一行：`max(y) - min(y) ≤ tol` 且 `max(h) - min(h) ≤ tol`；
 *   ③ 同构：`max(w) - min(w) ≤ tol`（宽度一致才谈得上「列数」）；
 *   ④ 间距一致：相邻项的 x 间隙 `max - min ≤ tol` 且非负（重叠即判废）。
 *
 * @param {Array<{x?:number,y?:number,width?:number,height?:number,w?:number,h?:number}>} boxes
 * @param {{tolerance?:number, minCount?:number}} [opts]
 * @returns {{count:number, itemWidth:number, itemHeight:number, gap:number}|null}
 */
export function deriveRowMetrics(boxes, opts = {}) {
  const tol = Number.isFinite(opts.tolerance) ? opts.tolerance : 2
  const minCount = Number.isFinite(opts.minCount) ? opts.minCount : 2
  const list = (Array.isArray(boxes) ? boxes : [])
    .map((b) => {
      if (!b || typeof b !== 'object') return null
      const x = Number(b.x)
      const y = Number(b.y)
      const width = Number(b.width ?? b.w)
      const height = Number(b.height ?? b.h)
      if (![x, y, width, height].every(Number.isFinite)) return null
      if (width <= 0 || height <= 0) return null
      return { x, y, width, height }
    })
    .filter(Boolean)

  if (list.length < Math.max(2, minCount)) return null

  const nums = (arr) => arr.map((b) => b[0])
  const spread = (values) => Math.max(...values) - Math.min(...values)

  // ② 同一行
  if (spread(list.map((b) => b.y)) > tol) return null
  if (spread(list.map((b) => b.height)) > tol) return null
  // ③ 同构（宽度一致）
  if (spread(list.map((b) => b.width)) > tol) return null

  // ④ 间距一致
  const sorted = [...list].sort((a, b) => a.x - b.x)
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    gaps.push(sorted[i].x - (prev.x + prev.width))
  }
  if (gaps.some((g) => g < -tol)) return null // 重叠 ⇒ 不是单行排布
  if (spread(gaps) > tol) return null // 间距不均匀 ⇒ 不是等宽网格

  const median = (values) => {
    const s = [...values].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }

  return {
    count: list.length,
    itemWidth: Math.round(median(list.map((b) => b.width)) * 100) / 100,
    itemHeight: Math.round(median(list.map((b) => b.height)) * 100) / 100,
    gap: Math.round(Math.max(0, median(gaps)) * 100) / 100,
  }
}

/**
 * L3-b（2026-10-21）：由子项 bbox 反推**间距**（gap）。
 *
 * 病灶：`extractLayoutMetadata` 只在 `section.layout` 是**对象**形态时读 `itemSpacing`，
 * 而真实语料里 layout 是字符串（`'vertical'`/`'horizontal'`）⇒ `gap` 恒 0 ⇒
 * prompt 的 `if (meta.gap > 0)` 永不成立 ⇒ 「间距下发」整条通道空转
 * （本组件实测真值 33 / 20 / 20）。
 *
 * 🔴 关键修正（同日实测）：**不能直接按主轴排序算相邻间隙**。真实 Figma 结构里
 *   `背景矩形(604×212)`、`icon(16×16)`、`标题 TEXT`、`三行行容器` 全是同一层兄弟 ——
 *   背景矩形与所有人 y 区间重叠 ⇒ 相邻间隙恒为负数 ⇒ 判据整体返回空（实测 5 段全部 []）。
 *   治法：先按**主轴上的重叠关系聚成「带」**（同带 = 同一行/同一列），只在**带与带之间**算间距。
 *   例：`38:3162` ⇒ 带 = [标题带(icon+标题)] [row1] [row2] [row3] ⇒ 真实段间距。
 *
 * 判据（纯几何、命名无关）：
 *   ① 子项 ≥2 且都有 bbox；
 *   ② 按副轴重叠聚带（重叠即同带，带高取带内极值）；
 *   ③ 带间间隙全非负；等距 ⇒ 直接返回；不等距 ⇒ `dominant` 模式取覆盖过半的众数，否则 0。
 *
 * @param {Array} boxes
 * @param {'row'|'column'|string|null} direction 主轴方向（row=按 x 聚带，其余按 y）
 * @param {{tolerance?:number, mode?:'uniform'|'dominant'}} [opts]
 * @returns {number} 0 表示推不出
 */
export function deriveGapFromBoxes(boxes, direction, opts = {}) {
  const tol = Number.isFinite(opts.tolerance) ? opts.tolerance : 2
  // 'uniform'（默认，安全）要求全部间隔一致；'dominant' 允许不等距，取**出现最多**的间隔
  // （覆盖达半数才采纳，否则 0）。真实组件实测 33/20/20 ⇒ dominant 得 20 + 序列 [33,20,20]。
  const mode = opts.mode === 'dominant' ? 'dominant' : 'uniform'
  const gaps = bandGaps(boxes, direction, tol)
  if (!gaps || gaps.length === 0) return 0
  const spread = Math.max(...gaps) - Math.min(...gaps)
  if (spread <= tol) {
    const s = [...gaps].sort((a, b) => a - b)
    const median = s[Math.floor(s.length / 2)]
    return median > 0 ? Math.round(median * 100) / 100 : 0
  }
  if (mode !== 'dominant') return 0 // 不均匀 ⇒ 默认不猜

  // dominant：聚类（±tol）后取频次最高的一簇；并列或覆盖不足半数 ⇒ 0
  const clusters = []
  for (const g of gaps) {
    const hit = clusters.find((c) => Math.abs(c.value - g) <= tol)
    if (hit) hit.count += 1
    else clusters.push({ value: g, count: 1 })
  }
  clusters.sort((a, b) => b.count - a.count)
  const best = clusters[0]
  if (!best || best.count * 2 < gaps.length) return 0
  if (clusters[1] && clusters[1].count === best.count) return 0 // 并列 ⇒ 不猜
  return best.value > 0 ? Math.round(best.value * 100) / 100 : 0
}

/**
 * 沿主轴把 boxes 聚成「带」，返回**带与带之间**的间隙序列（按主轴升序）。
 *
 * 同带判定：后一项的起点 < 当前带的终点 - 1px（即主轴区间重叠）。
 * `direction='row'` 按 x 聚带（列），其余按 y 聚带（行）。
 *
 * @param {Array} boxes
 * @param {'row'|'column'|string|null} direction
 * @param {number} [tol]
 * @returns {number[]|null} null = 入参不可用 / 出现负间隙（重叠）
 */
export function bandGaps(boxes, direction, tol = 2) {
  const list = (Array.isArray(boxes) ? boxes : [])
    .map((b) => {
      if (!b || typeof b !== 'object') return null
      const x = Number(b.x)
      const y = Number(b.y)
      const width = Number(b.width ?? b.w)
      const height = Number(b.height ?? b.h)
      if (![x, y, width, height].every(Number.isFinite)) return null
      return { x, y, width, height }
    })
    .filter(Boolean)
  if (list.length < 2) return null

  // 🛡️ 先剔除「外壳/背景」盒：真实 Figma 里卡片的背景矩形与内容**同层**，
  //   它的 y 区间覆盖所有兄弟 ⇒ 直接聚带会把整卡并成一带（实测 5 段全部返回空）。
  //   判据：该盒完整包含 ≥2 个兄弟且自身面积更大 ⇒ 外壳，不参与间距计算。
  const containsBox = (outer, inner) =>
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol
  const isShell = (b, idx) => {
    let n = 0
    for (let j = 0; j < list.length; j++) {
      if (j === idx) continue
      const o = list[j]
      if (o.width * o.height >= b.width * b.height) continue
      if (containsBox(b, o)) n += 1
    }
    return n >= 2
  }
  const content = list.filter((b, i) => !isShell(b, i))
  if (content.length < 2) return null

  const horizontal = String(direction || '').toLowerCase() === 'row'
  const start = (b) => (horizontal ? b.x : b.y)
  const extent = (b) => (horizontal ? b.width : b.height)
  const sorted = [...content].sort((a, b) => start(a) - start(b))

  const bands = []
  for (const b of sorted) {
    const cur = bands[bands.length - 1]
    const s = start(b)
    if (cur && s < cur.end - 1) {
      cur.items.push(b)
      cur.end = Math.max(cur.end, s + extent(b))
      cur.start = Math.min(cur.start, s)
    } else {
      bands.push({ start: s, end: s + extent(b), items: [b] })
    }
  }
  if (bands.length < 2) return null

  const gaps = []
  for (let i = 1; i < bands.length; i++) {
    gaps.push(bands[i].start - bands[i - 1].end)
  }
  if (gaps.some((g) => g < -tol)) return null // 带间仍重叠 ⇒ 不可用
  return gaps.map((g) => Math.max(0, Math.round(g * 100) / 100))
}

/**
 * L3-b 配套：子项沿主轴的**完整间隔序列**（带与带之间，按主轴升序）。
 * 用于「不等距」场景把真值完整下发（例：33/20/20），而非只给一个众数。
 *
 * @param {Array} boxes
 * @param {'row'|'column'|string|null} direction
 * @param {number} [tol]
 * @returns {number[]} 空数组 = 推不出（<2 带 / 重叠 / 非法 bbox）
 */
export function deriveGapSequence(boxes, direction, tol = 2) {
  const gaps = bandGaps(boxes, direction, tol)
  return gaps || []
}

/**
 * 由「容器内容宽 + 单项宽 + 间距」反算列数（用于验证推导结果与容器宽度自洽）。
 *
 * 真值示例：`floor((564 + 20) / (126 + 20)) = 4`。
 *
 * @param {number} containerInnerWidth
 * @param {number} itemWidth
 * @param {number} gap
 * @returns {number} 0 表示算不出（入参非法）
 */
/**
 * 「两个 section 是否并排」的几何容差（**唯一来源**）。
 *
 * 2026-11-12：此前 D3 判据（component-acceptance）与 C 层 `enforceSiblingRowDirection`
 * 各写一份 `4 / 4 / 3` ⇒ 改一处忘另一处必然漂移（判据非单一来源）。现两处统一引用本常量。
 *
 * 语义：`|Δy| ≤ y`（同一行）、`|Δx| > x`（横向分开）、`|Δw| ≤ width`（等宽才谈并排）。
 */
export const SIBLING_ROW_TOLERANCE = Object.freeze({ y: 4, x: 4, width: 3 })

export function columnsFromWidth(containerInnerWidth, itemWidth, gap) {
  const W = Number(containerInnerWidth)
  const w = Number(itemWidth)
  const g = Number(gap)
  if (![W, w, g].every(Number.isFinite)) return 0
  if (w <= 0 || g < 0 || W <= 0) return 0
  return Math.max(1, Math.floor((W + g) / (w + g)))
}

/**
 * 由「行带」反算网格列数（2026-11-12 · mc-1794428749650-cc633474 实锤）——**列数的唯一几何判据**。
 *
 * 病灶：`38:3137/3162/3206` 三组的 Figma 真值是
 *   `Frame2136639905(HORIZONTAL, itemSpacing=20) [126,126,126,126]`、`…906 [126,126]`、`…908 [126,126,126]`，
 *   即 **4 / 2 / 3 列的行带**，最大行带 564px ⇒ 真实列数 **4**。
 *   但视觉分析给的 `body.gridColumns` 是 3，且优先级压过几何 ⇒ 产物列数与 D-GRID 判据同时错。
 *
 * 判据（纯几何、命名无关、零阈值魔数，全部复用 `deriveRowMetrics`）：
 *   ① 每个「行带」内部必须满足 `deriveRowMetrics`（同行 + 同高 + **等宽** + 等距），否则该带作废；
 *   ② 有效带数 ≥ `minRows`（默认 1）；
 *   ③ 列数 = 有效带 `count` 的**众数**；并列时取较大值
 *      （最后一行不满是常态：`[4,4,4,3]`→4、`[4,2]`→4）；
 *   ④ 众数须覆盖 ≥ 半数有效带，否则返回 null（**不猜**）。
 *
 * 为什么用「行带内项数」而不是「容器子项 x 聚类」：本案例容器子项是行带本身
 *   （564/564/564/418 四个不同宽度的 Frame），x 聚类必然得到 1 列或错列；
 *   而列数的定义正是「一行放几项」，必须下钻到行带内部。
 *
 * @param {Array<{boxes?:Array}>} rows 行带候选，每项形如 `{ boxes: [{x,y,width,height}] }`
 * @param {{tolerance?:number, minCount?:number, minRows?:number}} [opts]
 * @returns {{count:number, itemWidth:number, gap:number, rows:number, agreement:number}|null}
 *   null = 无充分几何证据（调用方应保留既有值，不得臆造）
 */
export function deriveGridColumnsFromBands(rows, opts = {}) {
  const tol = Number.isFinite(opts.tolerance) ? opts.tolerance : 2
  const minCount = Number.isFinite(opts.minCount) ? opts.minCount : 2
  const minRows = Number.isFinite(opts.minRows) ? opts.minRows : 1
  const list = Array.isArray(rows) ? rows : []

  const per = []
  for (const r of list) {
    const boxes = r && Array.isArray(r.boxes) ? r.boxes : []
    const m = deriveRowMetrics(boxes, { tolerance: tol, minCount })
    if (m) per.push(m)
  }
  if (per.length < Math.max(1, minRows)) return null

  // ③ 众数（并列取较大值）：最后一行不满是常态，最大值才是满行宽度
  const freq = new Map()
  for (const m of per) freq.set(m.count, (freq.get(m.count) || 0) + 1)
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const [bestCount, bestHits] = ranked[0]

  // ④ 半数以上一致才采纳（`[3,2]` 这类拼接残骸不猜）
  if (bestHits * 2 < per.length) return null

  const rep = per.find((m) => m.count === bestCount)
  return {
    count: bestCount,
    itemWidth: rep.itemWidth,
    gap: rep.gap,
    rows: per.length,
    agreement: Math.round((bestHits / per.length) * 100) / 100,
  }
}

/**
 * 节点树 → 列数（`deriveGridColumnsFromBands` 的节点适配层，2026-11-12）。
 *
 * 只做「形状适配」，不做判据：两种真实形态各试一次，判据仍全在 `deriveRowMetrics`。
 *   形态 A（卡列表）：`children` 本身就是并排的卡（同行、等宽、等距）⇒ 直接数一行几项；
 *   形态 B（行带嵌套）：`children` 是若干**行带**（如 `Frame2136639905: [126,126,126,126]`），
 *     行带之间宽度不等（564/272/418）⇒ 必须下钻一层，数每带内部项数取众数。
 *
 * 形态 A 优先且互斥：行带形态下 A 必然失败（背景矩形 604 与 icon 16 不等宽）。
 *
 * @param {object} node 含 `children`，每个子项带 `absoluteBoundingBox` / `bbox` / `{x,y,width,height}`
 * @param {{tolerance?:number, minCount?:number, minRows?:number}} [opts]
 * @returns {{count:number, itemWidth:number, gap:number, rows:number, agreement:number, form:'single-row'|'bands'}|null}
 */
export function deriveGridColumnsFromNode(node, opts = {}) {
  const boxOf = (n) => {
    if (!n || typeof n !== 'object') return null
    const b = n.absoluteBoundingBox || n.bbox || n
    const x = Number(b.x)
    const y = Number(b.y)
    const width = Number(b.width)
    const height = Number(b.height)
    if (![x, y, width, height].every(Number.isFinite)) return null
    if (width <= 0 || height <= 0) return null
    return { x, y, width, height }
  }
  const kids = Array.isArray(node?.children) ? node.children : []
  const kidBoxes = kids.map(boxOf).filter(Boolean)
  if (kidBoxes.length < 2) return null

  const single = deriveRowMetrics(kidBoxes, {
    tolerance: opts.tolerance,
    minCount: opts.minCount,
  })
  if (single && single.count >= 2) {
    return { ...single, rows: 1, agreement: 1, form: 'single-row' }
  }

  const bands = []
  for (const c of kids) {
    const sub = Array.isArray(c?.children) ? c.children.map(boxOf).filter(Boolean) : []
    if (sub.length >= 2) bands.push({ boxes: sub })
  }
  const r = deriveGridColumnsFromBands(bands, opts)
  return r && r.count >= 2 ? { ...r, form: 'bands' } : null
}

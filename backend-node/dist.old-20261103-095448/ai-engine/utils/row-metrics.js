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
export function columnsFromWidth(containerInnerWidth, itemWidth, gap) {
  const W = Number(containerInnerWidth)
  const w = Number(itemWidth)
  const g = Number(gap)
  if (![W, w, g].every(Number.isFinite)) return 0
  if (w <= 0 || g < 0 || W <= 0) return 0
  return Math.max(1, Math.floor((W + g) / (w + g)))
}

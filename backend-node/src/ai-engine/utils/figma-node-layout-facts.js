/**
 * 🛡️ B' 事实层（2026-09-18 治本）：从 Figma 节点树确定性编译「每节点布局模型」
 * display / flex-direction，覆盖标准 Auto-Layout 与不标准（绝对定位）文件。
 *
 * 与 `sectionLayoutFacts`（`buildSectionLayoutFacts` @ figma-section-heights.js，vision 派生 + 仅 section 范围）
 * 的区别：本函数直接读 Figma 几何真值（`layoutMode` + `absoluteBoundingBox`），作用于【所有】节点
 * （含子组件节点，如 tab 列表容器），而非仅对齐到 vision 的 section 序列。这也正是
 * `c-env-monitor-tabs-list` 这类「子组件内部容器、自身无 flex 信号」缺 display 的根因——
 * 该节点在 Figma 里 4 个子项 side-by-side（绝对定位、layoutMode='NONE'），几何事实=row，
 * 但此前任何一层都没输出它。
 *
 * 治本定调（用户 09-18）：源文件绝对定位 ≠ 输出绝对定位；不标准文件照样用 flex；
 *   absolute 仅作极少数低置信兜底（本版默认不发 absolute，统一输出 flex）。
 *
 * 输出：{ [figmaNodeId]: { display, flexDirection, source, confidence } }
 *   - 标准 Auto-Layout：layoutMode HORIZONTAL/VERTICAL → flex + row/column，source=figma-layoutMode，high
 *   - 不标准（layoutMode 缺失/NONE）：几何推断（areBoxesSideBySide）→ flex + row/column，source=geometric-inference
 *   - 均匀网格（子节点 x 聚成均匀列）→ grid + gridColumns，source=geometric-grid-inference（**G1，2026-09-22 治本**）
 *   - 方向模糊（side-by-side 比例介于 0.25~0.75）→ 默认 row（用户定调：common failure 是横排被堆纵），confidence=low
 *   - 单子节点容器 → 默认 column（single-child-default，防 LLM 漏写 flex-direction 默认 row）
 *
 * ⚠️ 职责边界（2026-09-22 治本后定）：本模块是「容器级」布局方向的**单一事实源**。
 *   - 覆盖 display（flex/grid）+ 主轴方向（row/column/gridColumns）。
 *   - 「卡内文本子组方向 + icon 实测尺寸」归 figma-item-facts.js（item 内部，禁止本模块产出）。
 *   - grid 列数的几何聚类必须在本模块（decideGeometricLayout 前置 detectGridColumns），
 *     禁止下游再加 grid 对冲层（血泪：mc-1790058609462 曾用 itemFacts 对冲本模块的
 *     side-by-side 比例判据 bug，两个几何推断打架，靠执行顺序碰巧压对）。
 */
import { areBoxesSideBySide } from './section-tree.js'

/**
 * 🛡️ 均匀网格检测（2026-09-22 · mc-1790058609462 实锤）：子节点按 x 聚成「均匀列」
 * （≥2 列、每列 ≥2 个、列间数量差 ≤1）→ 网格布局，而非 flex column。
 *
 * 治本：side-by-side 两两比例判据对「3×4 网格」会误判 column（side-by-side 对数
 *   12/66≈0.18 < 0.25 → 高置信 column）——网格里同行卡相邻才算 side-by-side，跨行都算
 *   堆叠，比例天然偏低。故网格必须先于 side-by-side 判据检测。
 */
function detectGridColumns(children) {
  const boxes = (children || []).filter(
    (c) => c && (c.absoluteBoundingBox || c.bbox),
  )
  if (boxes.length < 4) return 0
  const sorted = [...boxes].sort(
    (a, b) => (a.absoluteBoundingBox?.x ?? a.bbox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? b.bbox?.x ?? 0),
  )
  const cols = []
  let cur = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const bx = sorted[i].absoluteBoundingBox?.x ?? sorted[i].bbox?.x ?? 0
    const curXs = cur.map((c) => c.absoluteBoundingBox?.x ?? c.bbox?.x ?? 0)
    const curWs = cur.map((c) => c.absoluteBoundingBox?.width ?? c.bbox?.width ?? 0)
    const prevX = curXs[curXs.length - 1]
    const avgW = curWs.reduce((s, w) => s + w, 0) / curWs.length
    if (bx - prevX > avgW * 0.5) {
      cols.push(cur)
      cur = [sorted[i]]
    } else {
      cur.push(sorted[i])
    }
  }
  cols.push(cur)
  if (cols.length < 2) return 0
  const sizes = cols.map((c) => c.length)
  const min = Math.min(...sizes)
  const max = Math.max(...sizes)
  if (min < 2 || max - min > 1) return 0 // 非均匀 → 非网格
  return cols.length
}

/**
 * 基于子节点 bbox 几何推断主轴方向 + 置信度。
 * 复用 section-tree 的 areBoxesSideBySide（唯一事实源：absoluteBoundingBox）。
 * @returns {{display:'grid'|'flex', gridColumns?:number, flexDirection?:'row'|'column', confidence:'high'|'low', ratio?:number}|null}
 */
/**
 * 🛡️ 2026-09-29 新增（mc-max-1790667854851-5f5bce3a 实锤）：剔除「整块背景层」子节点。
 *
 * 判据与 `section-tree#describeContainerLayout` **完全一致**（面积 ≥90% 父面积 = 背景层），
 * 避免同一事实两处各自定义「什么是背景层」。
 */
function excludeBackgroundLayers(boxes, parentBox) {
  if (!parentBox || !parentBox.width || !parentBox.height) return boxes
  const pArea = parentBox.width * parentBox.height
  return boxes.filter((c) => {
    const b = c.absoluteBoundingBox || c.bbox
    if (!b || !b.width || !b.height) return false
    // 🛡️ TEXT 永不视为背景层：父容器常按文字尺寸贴合（真机 `2:8041` 55×18 里就装着
    //    52×18 的 TEXT `危化品车`，面积占比 94.5% ≥ 0.9）⇒ 若按面积判会把**内容**剔掉，
    //    该容器随即因剩余子节点 <2 而彻底丢失布局事实（实测 children=2 的覆盖 15 → 9，
    //    6 个容器的事实凭空消失）。背景层语义是「块状色块/位图铺底」，文字天然不是。
    //    注：`section-tree#describeContainerLayout` 无此例外 —— 它只做「列聚类」用途，
    //    TEXT 被剔不影响其「N 列 × M 行」结论；此处用于**方向判定**，剔错会直接丢事实。
    if (String(c.type || '').toUpperCase() === 'TEXT') return true
    return (b.width * b.height) / pArea < 0.9
  })
}

function decideGeometricLayout(children, opts = {}) {
  const all = (children || []).filter(
    (c) => c && (c.absoluteBoundingBox || c.bbox),
  )
  if (all.length < 2) return null

  // 🛡️ 2026-09-29 治本（mc-max-1790667854851-5f5bce3a 实锤）：**先剔除整块背景层**再判方向。
  //   真机列表项 `136:129` 的 4 个 children = bg(140×74, x=37) / icon(48×52, x=41) /
  //   组1(50×18, x=89) / 组2(39×23, x=90)。`detectGridColumns` 会把 **bg 与 icon 按
  //   x 差 4px 归进同一列**（判据 `bx - prevX > avgW*0.5`，140 的一半=70 > 4）⇒ 凑出
  //   「2 列 × 每列 2 项」的**假均匀网格** ⇒ 下发 `display:grid; repeat(2, …)`，
  //   而真实布局是 **flex row（icon 左 / 文字列右）**。LLM 拿了错的 grid 事实 ⇒
  //   产物 `.list-item` 既没有 grid 也没有 flex ⇒ 三个 div 退化成 block 竖排堆叠
  //   （截图实锤：icon 在上、文字在下、数值被裁）。
  //   剔除背景层后剩 3 个（< 4，不判网格）⇒ 走 side-by-side 判定 ⇒ 正确得出 row。
  const filtered = excludeBackgroundLayers(all, opts.parentBox)
  // 🛡️ 过滤后不足 2 个（典型：1 背景层 + 1 内容）⇒ **回退用全集**，不返回 null。
  //   理由：本仓已实锤「**无事实 ⇒ LLM 只能猜 ⇒ 竖排堆叠/布局错乱**」是最坏结果
  //   （见文件头与本次事故）。含背景层的判定至多让 side-by-side 比例偏 column，
  //   属**既有行为**；而返回 null 会凭空抹掉事实、引入新回归（实测 children=2 的
  //   覆盖会从 15 掉到 10）。
  const boxes = filtered.length >= 2 ? filtered : all
  if (boxes.length < 2) return null

  // 🛡️ 刀 6（2026-10-27 · 8bbcf027 `36:1726` 实锤）：**同 bbox 叠层**优先于一切方向判定。
  //
  // 病灶：Mask group / icon 包装的子项（底 + 封面 + mask 矩形）bbox 完全相等，
  //   它们之间根本不存在「主轴方向」——是**层叠**。旧路径里 areBoxesSideBySide 对全等盒
  //   恒否 ⇒ ratio=0 ⇒ 高置信 `column` 假事实（全语料 174 组件实测 **549 个容器**全中），
  //   注入器再把 `flex-direction:column` 写进宿主类 ⇒ 层叠子项被拉成纵流。
  // 判据：≥2 个内容子项的 bbox **完全相等**（x/y/width/height 逐字段相等，不设近似阈值）。
  //   用剔除背景层后的 `boxes`（含「过滤后不足 2 回退全集」的结果）：Mask group 的
  //   子项与父同尺寸时会被背景层规则全剔、回退全集，此处仍能命中。
  // 输出 `display:'stack'`：**没有 flexDirection**（方向事实不存在，不是未知）。
  const firstBox = (() => {
    const b = boxes[0].absoluteBoundingBox || boxes[0].bbox
    return b || null
  })()
  if (firstBox) {
    const allIdentical = boxes.every((c) => {
      const b = c.absoluteBoundingBox || c.bbox
      return (
        b &&
        b.x === firstBox.x &&
        b.y === firstBox.y &&
        b.width === firstBox.width &&
        b.height === firstBox.height
      )
    })
    if (allIdentical) {
      return { display: 'stack', confidence: 'high' }
    }
  }

  // 🛡️ 均匀网格优先（side-by-side 比例对网格系统性误判 column）
  const gridCols = detectGridColumns(boxes)
  if (gridCols >= 2) {
    return {
      display: 'grid',
      gridColumns: gridCols,
      confidence: 'high',
    }
  }

  let sideBySide = 0
  let total = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      total++
      if (areBoxesSideBySide(boxes[i], boxes[j], opts)) sideBySide++
    }
  }
  if (total === 0) return null

  const ratio = sideBySide / total
  const direction = sideBySide > total / 2 ? 'row' : 'column'
  const confidence = ratio >= 0.75 || ratio <= 0.25 ? 'high' : 'low'
  // 🛡️ 2026-10-27 · mc-1793064994649-2ec8acc7 实锤：low 置信下**不再无条件兜底 row**。
  //
  // 历史兜底理由「不标准文件仍 flex，横排被堆纵是最常见的失败」只覆盖了**一半**失效；
  // 另一半（真值纵排却被兜底成横排）会把整段纵排内容压成一条窄列。本单 `807:2`
  // 就是这一半：`slot-con` 483×515，真值三段纵向（y=51637 / 51728 / 52138），
  // 归并后 pair 数 6→10、side-by-side 1→3 ⇒ `ratio 0.3(low)` ⇒ 兜底成 `row`
  // ⇒ 产物把「三张统计卡 / 表格 / 图例 / 链接」全部横排进一行，表格被压成右侧窄条。
  //
  // ⇒ 只在**几何事实成立**时改用 `column`，其余一律保持原兜底 `row`：
  //     ① 几何多数判 `column`（`direction === 'column'`，即 side-by-side 不足半数）
  //     ② 且满足下列任一：**容器自身**「高 > 宽」（纵向主轴的容器里横排必然溢出成窄条）
  //        或 刀 5 的「内容堆成 ≥2 条带」证据（覆盖宽容器真纵排，见下）
  //   为什么 ① 必须配 ②：单看 ① 会把 `2:8419`（388×30 的 header，ratio 0.464）翻成纵排。
  //   全语料量化（168 组件 / 9534 个容器 / low 置信 777 个）：
  //     · 「几何判 column」共 105 个，其中容器高>宽的**正好 10 个**（全是同一 `807:2` 设计）
  //     · 其余 95 个是宽容器：`2:8419`×38（真值 row）/ `2:3438`×19 / `2:3446`×38（真值 column）
  //       ⇒ 刀 5 之后这 95 个里 57 个翻成 column（正确的两种），38 个保持 row（正确）
  //   ⇒ 爆炸半径 = 10 个（②-a）+ 57 个（②-b），其余「几何判 row」的 672 个构造上碰不到。
  const parentBox = opts.parentBox
  const pw = Number(parentBox?.width)
  const ph = Number(parentBox?.height)
  const tallContainer = Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > pw
  // 🛡️ 2026-10-27 · 刀 5：`tallContainer` 这一条只覆盖「竖长方形」容器，**宽容器真纵排**漏检。
  //
  // 视觉裁判（设计稿裁剪目视判读，见 `__tests__/fixtures/direction-truth-cases.ts`）实测：
  // 全语料「low ∧ 几何判 column ∧ 宽容器」只有 **95 个容器 / 3 种结构**，其中
  //   · `2:3438` 387×142 ×19 —— 真值 `column`（标题带 + 两张分布卡横排），闸不覆盖 ⇒ 错判 row
  //   · `2:3446` 192×114 ×38 —— 真值 `column`（标题带 + 客车/环形图/货车内容带）⇒ 错判 row
  //   · `2:8419` 388×30  ×38 —— 真值 `row`（设备监测 + 三组数值一行）⇒ 保持 row 是对的
  // ⇒ 缺的是**「内容确实堆成 ≥2 条带」这个几何证据**，而不是「容器够不够高」。
  //
  // 第三条事实（`hasStackedContentBands`）= 剔除装饰后按 y 重叠聚带，要求：
  //   ① 带数 ≥ 2（真的纵向分层）
  //   ② 首带之后**最厚的一条带**高 ≥ 50% 父高 ∧ 横向覆盖 ≥ 60% 父宽
  //      —— ② 是挡 `2:8419` 的关键：它的「第二带」只有 6px 下划线（thickH≈27%），
  //      而 `2:3438` 是 80%、`2:3446` 是 70%。只判「带数 ≥ 2」会把下划线当第二段内容。
  // 爆炸半径实测：95 个里翻 57 个（= 上面前两种结构），`2:8419` 那 38 个一位不动。
  const stackedBands = !tallContainer && direction === 'column' && confidence === 'low'
    ? hasStackedContentBands(boxes, parentBox)
    : false
  const flexDirection =
    confidence === 'low'
      ? direction === 'column' && (tallContainer || stackedBands)
        ? 'column'
        : 'row'
      : direction
  return { display: 'flex', flexDirection, confidence, ratio }
}

/**
 * 内容是否真的**纵向堆成 ≥2 条带**（刀 5 的第三条事实，只服务 low 置信方向闸）。
 *
 * 与「行/列带聚类度量」的区别（那个已被视觉裁判否掉，2/22 = 9.1%）：
 *   · 本函数**只输出布尔证据**，不取代 `ratio` 度量，也不给方向结论；
 *   · 先剔装饰（细长条 / 孤立极小图标）—— 那正是 bands 度量失败的根因
 *     （`807:2` 的 6px 滚动条被当成第二列带、`2:8419` 的下划线被当成一条带）；
 *   · 不用父容器尺寸之外的比例阈值去「猜」，只量「这一带有多厚、有多宽」。
 *
 * @param {Array<object>} boxes 已剔除背景层的内容子项（读 `absoluteBoundingBox` / `bbox`）
 * @param {object} parentBox 父容器 bbox
 * @returns {boolean}
 */
function hasStackedContentBands(boxes, parentBox) {
  const pw = Number(parentBox?.width)
  const ph = Number(parentBox?.height)
  if (!Number.isFinite(pw) || !Number.isFinite(ph) || pw <= 0 || ph <= 0) return false

  const boxOf = (c) => {
    const b = c?.absoluteBoundingBox || c?.bbox
    const x = Number(b?.x)
    const y = Number(b?.y)
    const width = Number(b?.width)
    const height = Number(b?.height)
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
      ? { x, y, width, height }
      : null
  }
  // 装饰元素：细长条（宽或高 < 8px）、孤立极小图标（宽高都 < 10px）。
  // 两者都不是「一段内容」，把它们算进来会凭空造出第二条带。
  const isDecoration = (b) =>
    b.width < 8 || b.height < 8 || (b.width < 10 && b.height < 10)

  const content = (boxes || [])
    .map(boxOf)
    .filter(Boolean)
    .filter((b) => !isDecoration(b))
  if (content.length < 2) return false

  // 按 y 重叠聚带：与上一条带的首项重叠超过「较矮者高度的一半」算同一条带。
  const sorted = [...content].sort((a, b) => a.y - b.y)
  const bands = []
  let cur = []
  for (const b of sorted) {
    if (cur.length === 0) {
      cur = [b]
      continue
    }
    const ref = cur[0]
    const ov = Math.min(ref.y + ref.height, b.y + b.height) - Math.max(ref.y, b.y)
    const minSize = Math.min(ref.height, b.height)
    if (ov > 0.5 * minSize) cur.push(b)
    else {
      bands.push(cur)
      cur = [b]
    }
  }
  if (cur.length) bands.push(cur)
  if (bands.length < 2) return false

  const spanOf = (band) => ({
    width:
      Math.max(...band.map((b) => b.x + b.width)) - Math.min(...band.map((b) => b.x)),
    height:
      Math.max(...band.map((b) => b.y + b.height)) - Math.min(...band.map((b) => b.y)),
  })
  // 首带是标题/头部，判据看**首带之后**那一段内容；取最厚的一条（多段时只要有一段够厚即可）
  const rest = bands.slice(1).map(spanOf)
  const thick = rest.reduce((m, b) => (b.height > m.height ? b : m), rest[0])
  return thick.height >= 0.5 * ph && thick.width >= 0.6 * pw
}

/**
 * 🔴 R23（2026-10-21 · 66d79bff 实锤）：对**任意一组 bbox 节点**复用同一套方向判据。
 *
 * 为什么要单独开门：`decideGeometricLayout` 只在「走 Figma 原生 children」时被调用，
 * 而真机上存在「**派生结构把根级兄弟节点归并进容器**」的情况（卡片 `38:3260` 原生只有
 * bg VECTOR + icon，`合作厂商`/`33` 是根级兄弟 TEXT）。此时原生 children 里剔掉背景层
 * 只剩 1 项 ⇒ `decideGeometricLayout` 回退用全集 ⇒ 0/1=0 ⇒ 判 column(high)；
 * 而归并后的真实内容（icon 左 / 文本列右）复算得 2/3=0.667 ⇒ row。
 *
 * 本函数**不新增任何判据**，只把同一实现暴露给「归并后结构」使用（副本纪律：判据单一来源）。
 *
 * @param {Array<object>} boxes 参与判定的节点（读 `absoluteBoundingBox` / `bbox` / `type`）
 * @param {object|null} parentBox 父容器 bbox（背景层剔除用）
 * @param {object} [opts] 透传 `areBoxesSideBySide` 的容差
 * @returns {{display:'grid'|'flex', gridColumns?:number, flexDirection?:'row'|'column', confidence:'high'|'low', ratio?:number}|null}
 */
export function decideLayoutForBoxes(boxes, parentBox = null, opts = {}) {
  return decideGeometricLayout(boxes, { ...opts, parentBox })
}

/**
 * 遍历 Figma 节点树，为每个「有子节点」的节点产出布局事实。
 * 🛡️ 约束覆盖范围扩大（2026-09-19）：单子节点容器也生成布局约束（默认 column），
 * 避免 LLM 在单子节点容器上漏写 flex-direction 导致默认 row。
 * 
 * @param {Object} figmaNodeData Figma 节点树（接受 {document} 包裹或直接根节点）
 * @param {Object} [opts] 透传给 areBoxesSideBySide（yOverlapRatio / xOverlapRatio）
 * @returns {Record<string,{display:string,flexDirection:'row'|'column',source:string,confidence:'high'|'low'}>}
 */
export function buildNodeLayoutFacts(figmaNodeData, opts = {}) {
  const root =
    figmaNodeData && typeof figmaNodeData === 'object'
      ? figmaNodeData.document ?? figmaNodeData
      : null
  if (!root || typeof root !== 'object') return {}

  const map = {}
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    const nodeId = node.id != null ? String(node.id) : ''
    const children = Array.isArray(node.children) ? node.children : []
    
    // 🛡️ 扩大覆盖范围：≥1 个子节点（原 ≥2）都生成布局事实
    if (children.length >= 1 && nodeId) {
      const mode = node.layoutMode
      let fact = null
      if (mode === 'HORIZONTAL') {
        fact = {
          display: 'flex',
          flexDirection: 'row',
          source: 'figma-layoutMode',
          confidence: 'high',
        }
      } else if (mode === 'VERTICAL') {
        fact = {
          display: 'flex',
          flexDirection: 'column',
          source: 'figma-layoutMode',
          confidence: 'high',
        }
      } else if (children.length >= 2) {
        // 非 Auto-Layout / 绝对定位文件 → 几何推断（默认 flex，不还原 absolute）
        // 🛡️ 把父容器 bbox 传下去，供剔除「整块背景层」（否则背景层会与内容层
        //    凑成假网格，见 decideGeometricLayout 的注释）。不原地改 opts（外部引用）。
        const decide = decideGeometricLayout(children, {
          ...opts,
          parentBox: node.absoluteBoundingBox || node.bbox,
        })
        if (decide) {
          fact = {
            ...(decide.display === 'stack'
              ? // 刀 6 同 bbox 叠层：无 flexDirection（方向事实不存在），
                // 下游注入器/prompt 各自按 stack 分支处理，禁止当 flex 容器下发。
                { display: 'stack', source: 'geometric-stack-inference' }
              : decide.display === 'grid'
              ? { display: 'grid', gridColumns: decide.gridColumns, source: 'geometric-grid-inference' }
              : { display: 'flex', flexDirection: decide.flexDirection, source: 'geometric-inference' }),
            confidence: decide.confidence,
          }
        }
      } else {
        // 🛡️ 单子节点容器：默认 column（用户定调：纵向堆叠是最常见的失败）
        fact = {
          display: 'flex',
          flexDirection: 'column',
          source: 'single-child-default',
          confidence: 'low',
        }
      }
      if (fact) map[nodeId] = fact
    }
    for (const child of children) walk(child)
  }
  walk(root)
  return map
}

export default buildNodeLayoutFacts

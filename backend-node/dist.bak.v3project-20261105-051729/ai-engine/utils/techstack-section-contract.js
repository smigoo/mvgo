/**
 * techstack-section-contract — 🛡️ #78 技术栈接管（S2 语义收编 + S3 内容抽取）
 *
 * 背景（mc-max-1790830432735-07a812f7 实锤）：Figma 把数据表格整块命名为 `@antd/table`
 * （契约 = 该区域由对应库组件渲染），但 planner 仍按几何把表格拆成 3 个列容器叶子
 * section ⇒ LLM 把表格手写成 3 个列子组件（a-table 0 次、:deep 0 次），P1-8 门禁
 * `TECHSTACK-NOT-RENDERED` 报警但无治本出口。
 *
 * 两段确定性治理（零 LLM）：
 *  - S2 语义收编：section 锚点（`id` / `sourceNodeIds`）**直接命中**数据驱动标记节点
 *    （table/select/input/datepicker/modal/form）⇒ 挂 `sec.techStack`；对 table 且契约
 *    抽取成功时**吸收 children**（列容器叶子不再独立成 .vue），把容器变成单一
 *    techstack 叶子。自绘容器（tab/tabs/collapse）**不**接管（P2-9 同口径：照常下钻重建）。
 *  - S3 内容抽取：`extractTableContract` 从真值子树确定性抽出 columns/dataSource/
 *    rowSelection，随 prompt 下发（照 itemSkeleton 的「确定性契约注入」样板）。
 *
 * ⚠️ 风险纪律：S2 必须与 S3 同批生效 —— table 吸收**只在 contract 抽取成功时**执行；
 *    契约抽不出来（结构不认识）就 fail-open 保持现状（拆列重建），绝不产出空 `<a-table />`。
 *
 * 祖先链标注（次路径）：锚点没直接命中、但祖先链上有数据驱动标记时只挂
 * `via:'ancestor-chain'` 标签（不吸收、不改结构）——供 prompt 提示「勿手写该组件内部网格」。
 */
import { createLogger } from '../logger/index.js'
import { collectTechStackMarkerNodes, techStackTagHint } from '../validators/element-coverage-validator.js'

const logger = createLogger({ name: 'techstack-section-contract' })

/** 数据驱动组件：内部构造不应还原（P2-9 同口径集合） */
const DATA_DRIVEN_COMPONENTS = new Set(['table', 'select', 'input', 'datepicker', 'modal', 'form'])

/** 祖先链上溯深度上限（防病态深树） */
const ANCESTOR_MAX_DEPTH = 10

/** 行选择控件名匹配（radio/checkbox 任意形态） */
const ROW_SELECTION_RX = /radio|checkbox/i

/** 从节点子树收集文本（TEXT.characters 优先，name 兜底） */
function collectTexts(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return out
  if (node.type === 'TEXT') {
    const t = String(node.characters ?? node.name ?? '').trim()
    if (t) out.push(t)
  }
  for (const c of node.children || []) collectTexts(c, out, depth + 1)
  return out
}

/** 子树内是否存在行选择控件（按节点名，词边界不受限——radio 组名形态多样） */
function hasRowSelectionControl(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return false
  if (ROW_SELECTION_RX.test(String(node.name || ''))) return true
  for (const c of node.children || []) {
    if (hasRowSelectionControl(c, depth + 1)) return true
  }
  return false
}

const usableBox = (n) => {
  const b = n?.absoluteBoundingBox
  return b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)
    ? b
    : null
}

/** SOLID fills → '#rrggbb'（精确 hex，node 真值）；无有效 SOLID → null */
function solidFillHex(node) {
  for (const f of node?.fills || []) {
    if (f?.type === 'SOLID' && f.visible !== false) {
      const c = f.color || {}
      return (
        '#' +
        [c.r, c.g, c.b]
          .map((v) => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 255).toString(16).padStart(2, '0'))
          .join('')
      )
    }
  }
  return null
}

/** 首个可见 SOLID strokes → '#rrggbb'；无 → null */
function firstStrokeHex(node) {
  for (const s of node?.strokes || []) {
    if (s?.type === 'SOLID' && s.visible !== false) {
      const c = s.color || {}
      return (
        '#' +
        [c.r, c.g, c.b]
          .map((v) => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 255).toString(16).padStart(2, '0'))
          .join('')
      )
    }
  }
  return null
}

/** 子树内首个 TEXT 节点 */
function firstTextIn(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null
  if (node.type === 'TEXT') return node
  for (const c of node.children || []) {
    const t = firstTextIn(c, depth + 1)
    if (t) return t
  }
  return null
}

/** 数组去重取唯一值（null/空丢弃；不唯一 ⇒ null，不臆造） */
function uniqOrNull(arr) {
  const set = new Set(arr.filter((v) => v !== null && v !== undefined && v !== ''))
  return set.size === 1 ? [...set][0] : null
}

/**
 * 🛡️ P3-15d（2026-10-01 · 用户截图实锤「按钮右下角/表格靠左」）：子节点相对父容器的
 *   水平对齐事实。判据 = 子中心 x 与父中心 x 的偏差，容差 max(8px, 父宽 2%)。
 *   返回 align + alignDevPx（**实际偏差**，随每张设计稿动态计算，禁止写死）。
 *   @returns {{align:'center'|'left'|'right', alignDevPx:number}|null}
 */
function alignOf(node, parentNode) {
  const b = node?.absoluteBoundingBox
  const p = parentNode?.absoluteBoundingBox
  if (!b || !p || !Number.isFinite(p.width) || p.width <= 0 || !Number.isFinite(b.x)) return null
  const dev = b.x + b.width / 2 - (p.x + p.width / 2)
  const tol = Math.max(8, p.width * 0.02)
  const align = Math.abs(dev) <= tol ? 'center' : dev < 0 ? 'left' : 'right'
  return { align, alignDevPx: Math.round(Math.abs(dev)) }
}

/**
 * 🛡️ P3-15d：节点与「上方最近兄弟」的垂直间距（真值 px），无上方兄弟/间距 ≤0 ⇒ null。
 */
function gapAbove(node, parentNode) {
  const b = node?.absoluteBoundingBox
  if (!b || !parentNode || !Array.isArray(parentNode.children)) return null
  const sibs = parentNode.children.filter(
    (c) => c !== node && c !== undefined && c.absoluteBoundingBox,
  )
  const above = sibs
    .filter((s) => s.absoluteBoundingBox.y + s.absoluteBoundingBox.height <= b.y + 1)
    .sort((a, c) => c.absoluteBoundingBox.y + c.absoluteBoundingBox.height - (a.absoluteBoundingBox.y + a.absoluteBoundingBox.height))
  if (above.length === 0) return null
  const prev = above[0]
  const gap = Math.round(b.y - (prev.absoluteBoundingBox.y + prev.absoluteBoundingBox.height))
  return gap > 0 ? gap : null
}

/**
 * 表格样式契约（P3-15，2026-10-01 · 用户截图实锤「斑马纹/表头底色/单元格背景丢失」）：
 * 全部从 node 真值（fills/strokes/style）确定性抽取，**全列/全行一致才取值**（不臆造）。
 * 渲染出口：a-table 公开 API（rowClassName/bordered/size）+ 唯一 :deep 白名单（thead th）。
 */
function extractTableStyle(colCells) {
  const style = {}

  // 表头底色 / 表头字重
  style.headerBg = uniqOrNull(colCells.map((cells) => solidFillHex(cells[0])))
  style.headerFontWeight = uniqOrNull(
    colCells.map((cells) => firstTextIn(cells[0])?.style?.fontWeight),
  )

  // 数据行背景：逐行全列一致色 → cellBg（首行）+ zebraBg（交替第二色）
  // 🛡️ P3-15c：同时记录斑马**行号**（1-based 数据行）——「隔行」这种模糊词会被 LLM
  //   误读成按列交替（横向表格斑马变纵向实锤），精确行号 + 显式方向声明才能锁死。
  const dataRowCount = Math.max(...colCells.map((cells) => cells.length)) - 1
  const rowBgs = []
  for (let ri = 1; ri <= dataRowCount; ri++) {
    rowBgs.push(uniqOrNull(colCells.map((cells) => solidFillHex(cells[ri]))))
  }
  const present = rowBgs.filter(Boolean)
  if (present.length >= 2 && new Set(present).size === 2 && rowBgs[0] !== rowBgs[1]) {
    style.cellBg = rowBgs[0]
    style.zebraBg = present.find((c) => c !== rowBgs[0]) || null
    style.zebraRows = rowBgs
      .map((bg, i) => (bg && bg === style.zebraBg ? i + 1 : 0))
      .filter(Number.isFinite)
      .filter((n) => n > 0)
  } else if (present.length >= 1 && new Set(present).size === 1) {
    style.cellBg = present[0]
  }

  // 行高（数据行全列一致才取）
  style.rowHeight = uniqOrNull(
    colCells.flatMap((cells) =>
      cells.slice(1).map((c) => Math.round(c.absoluteBoundingBox.height)),
    ),
  )

  // 边框色（全表一致才取）
  style.borderColor = uniqOrNull(colCells.flat().map((cell) => firstStrokeHex(cell)))

  // 对齐 / 正文字色
  let anyText = false
  let allCenter = true
  const bodyColors = []
  for (const cells of colCells) {
    for (let ri = 1; ri < cells.length; ri++) {
      const t = firstTextIn(cells[ri])
      if (!t) continue
      anyText = true
      if (t.style?.textAlignHorizontal && t.style.textAlignHorizontal !== 'CENTER') allCenter = false
      const c = solidFillHex(t)
      if (c) bodyColors.push(c)
    }
  }
  if (anyText && allCenter) style.align = 'center'
  style.textColor = uniqOrNull(bodyColors)

  // 删 null 键，保持契约紧凑
  for (const k of Object.keys(style)) {
    if (style[k] == null) delete style[k]
  }
  return style
}

/**
 * S3：从 `@antd/table` 真值节点确定性抽取表格契约。
 *
 * 识别形态（07a812f7 真值）：table 的 children = 列容器（按 x 排序），每列容器
 * children = 单元格帧（按 y 排序），首行 = 表头。第一列数据行含 radio ⇒ rowSelection。
 *
 * @param {object} tableNode `@antd/table` 标记节点（真值子树）
 * @returns {object|null} null = 结构不认识（fail-open，调用方**不得**吸收/接管）
 */
export function extractTableContract(tableNode) {
  if (!tableNode || typeof tableNode !== 'object') return null
  const rawCols = (Array.isArray(tableNode.children) ? tableNode.children : []).filter(
    (c) => c && typeof c === 'object' && usableBox(c),
  )
  if (rawCols.length < 2) return null // <2 列不像表格
  const cols = [...rawCols].sort((a, b) => a.absoluteBoundingBox.x - b.absoluteBoundingBox.x)

  // 单元格网格只算一遍（主循环 / rowSelection / style 三处共用）
  const colCells = cols.map((colNode) => {
    const cells = (colNode.children || []).filter((c) => c && typeof c === 'object' && usableBox(c))
    cells.sort((a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y)
    return cells
  })
  if (colCells.some((cells) => cells.length < 2)) return null // 每列至少 表头+1 数据行

  const columns = []
  const dataSource = []
  for (let ci = 0; ci < cols.length; ci++) {
    const cells = colCells[ci]
    const headerTexts = collectTexts(cells[0], [])
    columns.push({
      title: headerTexts.join(' ').trim(),
      dataIndex: `field${ci + 1}`,
      width: Math.round(cols[ci].absoluteBoundingBox.width),
    })

    for (let ri = 1; ri < cells.length; ri++) {
      const cell = cells[ri]
      if (!dataSource[ri - 1]) dataSource[ri - 1] = {}
      // ⚠️ 文本照常抽取：行选择控件（radio/checkbox 组）由 Ellipse 等无文本图形构成，
      //   本身不产文本；同格的 TEXT（如姓名列「张斌」）是真实数据，不得因有控件而丢弃。
      const texts = collectTexts(cell, [])
      dataSource[ri - 1][`field${ci + 1}`] = texts.join(' ').trim()
    }
  }

  // ⚠️ 契约有效性门槛：表头全空 + 数据全空 ⇒ 结构不认识，fail-open
  const hasTitle = columns.some((c) => c.title)
  const hasData = dataSource.some((row) => Object.values(row).some((v) => v))
  if (!hasTitle && !hasData) return null

  // rowSelection：任一**数据单元格**子树含 radio/checkbox（表头不算）
  let rowSelection = false
  for (const cells of colCells) {
    for (let ri = 1; ri < cells.length; ri++) {
      if (hasRowSelectionControl(cells[ri])) {
        rowSelection = true
        break
      }
    }
    if (rowSelection) break
  }

  const contract = {
    kind: 'table',
    columns,
    dataSource,
    rowSelection,
    columnCount: cols.length,
    rowCount: Math.max(...colCells.map((cells) => cells.length)),
  }

  // P3-15：样式契约（node 真值精确 hex；全列/全行一致才取值）
  const style = extractTableStyle(colCells)
  if (style && Object.keys(style).length > 0) contract.style = style

  return contract
}

/**
 * S2：把 techStack 契约挂到命中的 section 上（原地修改）。
 *
 * @param {Array} sections effectiveSections（嵌套树，原地修改）
 * @param {object} figmaNodeData Figma 真值节点树（或 {document} 包装）
 * @returns {{enriched:number, absorbed:number, ancestorTagged:number, details:Array}}
 */
export function enrichSectionsWithTechStack(sections, figmaNodeData) {
  const stats = { enriched: 0, absorbed: 0, ancestorTagged: 0, orphanRebuilt: 0, details: [] }
  if (!Array.isArray(sections) || sections.length === 0) return stats
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return stats

  // 标记索引（单一事实源 = element-coverage-validator 的非去重收集器）
  const markers = collectTechStackMarkerNodes(figmaNodeData)
  if (markers.length === 0) return stats
  const markerById = new Map()
  for (const m of markers) {
    if (m.nodeId && !markerById.has(String(m.nodeId))) markerById.set(String(m.nodeId), m)
  }

  // 父链索引 + 标记节点引用 + 全节点索引（一次遍历）
  const parentOf = new Map()
  const nodeById = new Map()
  const anyNodeById = new Map()
  const root = figmaNodeData?.document || figmaNodeData
  const walkTree = (node, parent, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 40) return
    if (node.id != null) {
      const idStr = String(node.id)
      if (parent && !parentOf.has(idStr)) parentOf.set(idStr, parent)
      if (markerById.has(idStr) && !nodeById.has(idStr)) nodeById.set(idStr, node)
      if (!anyNodeById.has(idStr)) anyNodeById.set(idStr, node)
    }
    for (const c of node.children || []) walkTree(c, node, depth + 1)
  }
  walkTree(root, null)

  const anchorChainIds = (anchorId) => {
    const chain = []
    let cur = parentOf.get(String(anchorId))
    while (cur && chain.length < ANCESTOR_MAX_DEPTH) {
      if (cur.id == null) break
      const id = String(cur.id)
      chain.push({ id, node: cur })
      cur = parentOf.get(id)
    }
    return chain
  }

  const attach = (sec, marker, node, via) => {
    const tag = techStackTagHint(marker)
    const ts = {
      library: marker.library,
      component: marker.component,
      nodeName: marker.nodeName,
      nodeId: marker.nodeId,
      tag,
      via,
    }
    // ⚠️ 风险纪律：table 只在契约抽取成功时才挂（否则宁可维持拆列现状，
    // 也不能让 LLM 产出没有 columns/dataSource 的空 `<a-table />`）
    if (marker.component === 'table') {
      const contract = node ? extractTableContract(node) : null
      if (!contract) return false
      // 🛡️ P3-15d（2026-10-01 · 用户截图实锤「表格靠左未撑满」）：宽度事实 ——
      //   表格相对父容器的宽度占比，≥0.98 ⇒ fullWidth（撑满父容器），否则给固定 px。
      const parent = parentOf.get(String(marker.nodeId))
      const pb = parent?.absoluteBoundingBox
      const nb = node?.absoluteBoundingBox
      if (pb && nb && Number.isFinite(pb.width) && pb.width > 0 && Number.isFinite(nb.width)) {
        contract.style = contract.style || {}
        contract.style.width = Math.round(nb.width)
        if (nb.width / pb.width >= 0.98) contract.style.fullWidth = true
      }
      ts.contract = contract
    }
    sec.techStack = ts
    return true
  }

  // 🛡️ 最小归属认领：E1 容器的 sourceNodeIds 是**子树全集**（272:2 srcN=38，含 table
  //   节点 id）——不设防则外层容器会「抢走」内层数据驱动标记的命中。三道防线：
  //   ① Phase 1（deep-first 直接命中）：先递归 children，内层认领登记 claimed，外层跳过；
  //      非 `sec.id` 候选还须过**几何最小归属**（标记中心落入子 section bbox ⇒ owner 更深）；
  //   ② Phase 2（deep-first 祖先链）：跳过已认领标记；祖先链认领也登记（内层切片优先）；
  //      外层紧包父容器因内层切片已认领而被挡（几何门对「父中心也在子 bbox 内」无效）。
  //   与 section-content-guard 的 isProperSubset 最小归属丢弃同源原则。
  const claimed = new Set()

  const bboxOf = (sec) => {
    const b = sec?.absoluteBoundingBox
    return b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)
      ? b
      : null
  }
  const centerIn = (markerBox, secBox) => {
    if (!markerBox || !secBox) return false
    const cx = markerBox.x + markerBox.width / 2
    const cy = markerBox.y + markerBox.height / 2
    return (
      cx >= secBox.x && cx <= secBox.x + secBox.width &&
      cy >= secBox.y && cy <= secBox.y + secBox.height
    )
  }

  const sectionAnchors = (sec) =>
    [sec.id, ...(Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [])]
      .map((a) => String(a ?? ''))
      .filter(Boolean)

  const applyAbsorption = (sec, marker) => {
    const absorbedCount = Array.isArray(sec.children) ? sec.children.length : 0
    if (absorbedCount === 0) {
      stats.details.push({ id: sec.id, component: marker.component, absorbed: 0 })
      return
    }
    sec.children = []
    sec.isLayoutContainer = false
    sec.layoutSource = 'techstack-leaf'
    sec.collapsed = false
    // 🛡️ P3-15c（2026-10-01 · 用户实锤「横向表格斑马纹变纵向」）：吸收前容器分支抽出的
    //   `layout:'horizontal'` 是「列容器并排」的几何事实，对表格叶子的内部排列**毫无意义**
    //   且有害 —— prompt 里「布局 horizontal + 斑马纹」叠加会被 LLM 读成按列（纵向）交替。
    //   置 null = 三态范式的「不断言方向」（2026-09-30 P0-1 已确立），叶子格式化时布局注消失。
    sec.layout = null
    if (sec.type === 'container') sec.type = 'techstack'
    if (!sec.responsibility || /布局容器/.test(String(sec.responsibility))) {
      sec.responsibility = `技术栈接管：@${marker.library}/${marker.component} 区域，用 <${sec.techStack.tag || '组件'}> 渲染，内部结构禁止手写还原`
    }
    stats.absorbed++
    stats.details.push({ id: sec.id, component: marker.component, absorbed: absorbedCount })
    logger.info('🛡️ 技术栈接管：数据驱动容器已吸收 children 为单一 techstack 叶子', {
      sectionId: sec.id,
      component: `${marker.library}/${marker.component}`,
      absorbed: absorbedCount,
      columnCount: sec.techStack.contract?.columnCount,
      rowCount: sec.techStack.contract?.rowCount,
      rowSelection: sec.techStack.contract?.rowSelection,
    })
  }

  // ── Phase 1：直接命中（deep-first，吸收后 children 即被移除）──
  const phaseDirect = (list) => {
    for (const sec of list) {
      if (!sec || typeof sec !== 'object') continue
      if (Array.isArray(sec.children) && sec.children.length > 0) phaseDirect(sec.children)

      const childBoxes = (Array.isArray(sec.children) ? sec.children : [])
        .map(bboxOf)
        .filter(Boolean)
      for (const a of sectionAnchors(sec)) {
        if (claimed.has(a)) continue
        const marker = markerById.get(a)
        if (!marker || !DATA_DRIVEN_COMPONENTS.has(marker.component)) continue
        if (a !== String(sec.id ?? '')) {
          // sourceNodeIds 候选：须过几何最小归属（无 bbox 无法判定 ⇒ 不认领）
          const markerBox = nodeById.get(a)?.absoluteBoundingBox
          if (!markerBox) continue
          if (childBoxes.some((cb) => centerIn(markerBox, cb))) continue
        }
        if (!attach(sec, marker, nodeById.get(a), 'direct')) continue
        claimed.add(a)
        stats.enriched++
        applyAbsorption(sec, marker)
        break
      }
    }
  }

  // ── Phase 2：祖先链标注（deep-first，内层切片优先认领；不改结构）──
  const phaseAncestor = (list) => {
    for (const sec of list) {
      if (!sec || typeof sec !== 'object') continue
      if (Array.isArray(sec.children) && sec.children.length > 0) phaseAncestor(sec.children)
      if (sec.techStack) continue

      outer: for (const a of sectionAnchors(sec)) {
        for (const { id, node } of anchorChainIds(a)) {
          if (claimed.has(id)) continue // 已被直接命中/祖先链认领的标记不再标注
          const marker = markerById.get(id)
          if (!marker || !DATA_DRIVEN_COMPONENTS.has(marker.component)) continue
          const secBox = bboxOf(sec)
          const markerBox = node?.absoluteBoundingBox
          if (!(secBox && markerBox ? centerIn(secBox, markerBox) : false)) break outer
          if (attach(sec, marker, node, 'ancestor-chain')) {
            claimed.add(id)
            stats.enriched++
            stats.ancestorTagged++
            stats.details.push({ id: sec.id, component: marker.component, via: 'ancestor-chain' })
          }
          break outer
        }
      }
    }
  }

  // ── Phase 1.5：孤儿标记节点重建（P3-15b，2026-10-01 · 07a812f7 保存按钮实锤）──
  // E1 下小控件（@antd/button 仅 1 个 TEXT 子）既非行内行也非容器 ⇒ 不成 section，
  // 其父容器（slot-con 272:2）又是 container-rebuild 不生成 .vue ⇒ 控件在规划层静默消失
  // （P1-8 记录的「保存按钮整块消失」根因）。治本：标记节点未被任何 section 承载、
  // 且其**直接父节点**对应现存容器 section 时，为其新建 techstack 叶子 section 插入
  // 父 children（按 y 重排保视觉序）。父不对应 section ⇒ fail-open（不重建）。
  const sectionIdSet = new Set()
  const containerById = new Map()
  const collectSectionIds = (list) => {
    for (const s of list || []) {
      if (!s || typeof s !== 'object') continue
      if (s.id != null) {
        sectionIdSet.add(String(s.id))
        if (s.isLayoutContainer && !containerById.has(String(s.id))) {
          containerById.set(String(s.id), s)
        }
      }
      collectSectionIds(s.children)
    }
  }
  collectSectionIds(sections)

  const collectSubtreeIds = (node, out = [], depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return out
    if (node.id != null) out.push(String(node.id))
    for (const c of node.children || []) collectSubtreeIds(c, out, depth + 1)
    return out
  }

  const buildOrphanSection = (marker, node, tag) => {
    // 控件契约：外观事实（底色/圆角/尺寸/字色/字号）全部 node 真值，inline style 承载
    const contract = {
      kind: tag === 'a-button' ? 'button' : 'control',
      tag,
      text: collectTexts(node, []).join(' ').trim(),
    }
    const style = {}
    const bg = solidFillHex(node)
    if (bg) style.background = bg
    const cr = node?.cornerRadius
    if (Number.isFinite(cr) && cr > 0) style.borderRadius = cr
    const b = usableBox(node)
    if (b) {
      style.width = Math.round(b.width)
      style.height = Math.round(b.height)
    }
    const t = firstTextIn(node)
    if (t) {
      if (Number.isFinite(t.style?.fontSize)) style.fontSize = t.style.fontSize
      if (Number.isFinite(t.style?.fontWeight)) style.fontWeight = t.style.fontWeight
      const tc = solidFillHex(t)
      if (tc) style.textColor = tc
    }
    // 🛡️ P3-15d：对齐 + 与上方区块的间距（真值几何，防 LLM 自由摆放——按钮右下角实锤）
    const parentNode = parentOf.get(String(marker.nodeId))
    const alignInfo = alignOf(node, parentNode)
    if (alignInfo) {
      style.align = alignInfo.align
      style.alignDevPx = alignInfo.alignDevPx
    }
    const gap = gapAbove(node, parentNode)
    if (gap != null) style.marginTop = gap
    if (Object.keys(style).length > 0) contract.style = style

    return {
      id: String(marker.nodeId),
      title: String(contract.text || marker.nodeName).slice(0, 30),
      type: 'techstack',
      isLayoutContainer: false,
      layoutSource: 'techstack-leaf',
      collapsed: false,
      responsibility: `技术栈接管：@${marker.library}/${marker.component} 控件，用 <${tag}> 渲染（外观事实见契约，禁止手画）`,
      elementCount: 1,
      absoluteBoundingBox: node?.absoluteBoundingBox || null,
      sourceNodeIds: collectSubtreeIds(node),
      techStack: {
        library: marker.library,
        component: marker.component,
        nodeName: marker.nodeName,
        nodeId: marker.nodeId,
        tag,
        via: 'orphan-rebuild',
        contract,
      },
      children: [],
      complexityScore: 0,
      complexityReasons: { elementCount: 0, charts: 0, interactions: 0, maxDepth: 0 },
    }
  }

  const phaseOrphans = () => {
    for (const [mid, node] of nodeById) {
      if (claimed.has(mid) || sectionIdSet.has(mid)) continue
      const marker = markerById.get(mid)
      const tag = techStackTagHint(marker)
      if (!tag) continue // 图表库 / 未知库 fail-open（无标签不臆造）
      const parent = parentOf.get(mid)
      const host = parent?.id != null ? containerById.get(String(parent.id)) : null
      if (!host || !Array.isArray(host.children)) continue
      const orphan = buildOrphanSection(marker, node, tag)
      host.children.push(orphan)
      // 🛡️ 视觉序按 figma 真值 y：吸收后的 section 无 absoluteBoundingBox（buildEffectiveSection
      //   不透传）⇒ 不能用 section bbox 排序（undefined→0 会把表格排到按钮后），统一回查真值树
      const yOf = (sec) => {
        const b = sec?.absoluteBoundingBox
        if (b && Number.isFinite(b.y)) return b.y
        const n = anyNodeById.get(String(sec?.id ?? ''))
        return n?.absoluteBoundingBox?.y ?? 0
      }
      host.children.sort((a, b) => yOf(a) - yOf(b))
      claimed.add(mid)
      stats.enriched++
      stats.orphanRebuilt++
      stats.details.push({ id: orphan.id, component: marker.component, via: 'orphan-rebuild' })
      logger.info('🛡️ 技术栈接管：孤儿标记控件已重建为 techstack 叶子 section', {
        sectionId: orphan.id,
        component: `${marker.library}/${marker.component}`,
        hostId: host.id,
        tag,
      })
    }
  }

  phaseDirect(sections)
  phaseOrphans()
  phaseAncestor(sections)
  return stats
}

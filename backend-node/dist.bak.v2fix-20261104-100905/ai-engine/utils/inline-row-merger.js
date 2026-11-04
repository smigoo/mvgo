/**
 * 🛡️ Loop 2.1.A（2026-09-10）：把 inlineCompositeRows 真正合并进 layout.sections。
 *
 * 旧行为：`rebuildSectionsPreservingInlineRows` 只把同行兄弟挂在
 * `parsed.inlineCompositeRows` 旁路字段，layout.sections 仍是 Vision 误拆的竖排——
 * 下游 planner/engineer 不读旁路字段，结构纠正在写盘前就丢了。
 *
 * 新行为：把每个同行复合 group 作为一个 `layout:'horizontal'` 的 block 并入 sections，
 * 其 children 为 members（按 x 升序还原左右顺序）；标记 `layoutSource:'inline-row'`
 * 供下游优先采用 bbox 推导的 horizontal 行。原业务 sections 全部保留，不删不改。
 *
 * 🛡️ 回归治理（2026-09-10）：rebuildSectionsPreservingInlineRows 递归整棵 Figma 树，
 * 会把**每个层级**的并行 frame 都抽成 inline-row（实证 44 个，含 depth 2~6 的
 * switch/active/default 状态态与卡片内部 Group）。旧 merger 无条件把这些行 `push` 到
 * 顶层 sections → 深层嵌套被提升为平级顶层 section、结构层级被拍平（device-monitor 组件
 * 3 个 section 被炸成 41 个平级 inline-row，子组件内部层级全丢）。
 * 治本：传入 figmaData 时，仅保留「父节点是组件根直接子（parentDepth===0）」的并行块
 * 作为顶层 inline-row；其余深层 frame 的并行交给 card-internal / container-rebuild 处理，
 * 不再污染顶层结构表。不传 figmaData 时保持旧行为（零回归）。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest（CJS require）直接单测。
 *
 * @param {object} layout - { type, direction, sections:[] }
 * @param {Array} inlineRows - rebuildSectionsPreservingInlineRows 产出
 *        [{ id, name, layout:'horizontal', members:[figmaNodeId,...] }]
 * @param {object} [figmaData] - Figma 节点树根（含 document 或 children），用于层级收敛
 * @param {object} [opts] - preserveVisionStructure=true 时仅保留 vision 骨架，inlineRows 不注入、不删除、不重排
 * @returns {object} 新的 layout（不修改入参）
 */

/** 语义壳被几何行「覆盖」时的子元素命中率阈值（达到即判为重复，剔除语义壳） */
const SEMANTIC_SUPERSEDE_THRESHOLD = 0.6

/** Figma 自动生成的通用节点名（Frame 2136638825 / Group 2136637552…），不作为语义命中依据 */
const GENERIC_NODE_NAME =
  /^(?:Frame|Group|Rectangle|Vector|Ellipse|Line|Path|Component|Union|Subtract|Mask|Boolean|Slice|Image)\b/i

function isGeometricSection(sec) {
  const ls = String((sec && sec.layoutSource) || '')
  return ls === 'inline-row' || ls === 'container-rebuild'
}

import { indexFigmaNodes, getFigmaBox } from './section-tree.js'
// 🔴 R22-d：`collectSectionFigmaRefs` / `FIGMA_ID_RE` 的唯一来源（勿在本文件另写副本）
import {
  collectSectionFigmaRefs as collectSectionFigmaRefsImpl,
  FIGMA_ID_RE,
} from './section-anchor-truth.js'

/**
 * 🛡️ F17（2026-10-21 · mc-max-1792497064987-195c8d0e「合作厂商弹窗」实锤）：
 * 同行成员 **bbox 包含去重**。
 *
 * 病灶：Vision 把「两张统计卡 + 各自卡内的标题/数字」一共 6 个节点报成同一行成员
 *   （`inlineCompositeRows` = `{id:'796:3', members:[38:3260, 38:3262, 38:3263,
 *   38:3282, 38:3284, 38:3285]}`）。merger 原样把 6 个成员拍平成 6 个平级 item ⇒
 *   「卡」这一层消失，标题/数字变成卡的兄弟 ⇒ 产物里 `33`、`合作厂商` 各自成一个块。
 *   这不是模型理解错：行成员的**包含关系**是纯几何可判的事实，只是没人判。
 *
 * 判据（纯几何、命名无关）：
 *   ① A 完整包含 B（四边容差 2px）且 A 面积 > B 面积 ⇒ B 是 A 的后代，不是同行兄弟；
 *   ② 多个候选包含者取**面积最小者**（=直接父级）；面积并列 ⇒ 歧义，放弃（宁可漏并不误并）；
 *   ③ 传递关系按「最小包含者」自然成链（A⊃B⊃C ⇒ C 挂 B）。
 *
 * @param {Array<string|number>} members 行成员 figma id（保持输入顺序）
 * @param {(id:string)=>({x:number,y:number,width:number,height:number}|null)} boxOf
 * @param {{tolerance?:number}} [opts]
 * @returns {{roots:string[], childrenOf:Map<string,string[]>}} childrenOf 只含非空项
 */
export function groupRowMembersByContainment(members, boxOf, opts = {}) {
  const tol = Number.isFinite(opts.tolerance) ? opts.tolerance : 2
  const ids = (Array.isArray(members) ? members : []).map((m) => String(m))
  // ⚠️ bbox 字段名两套口径：Figma 原始 `absoluteBoundingBox` 用 width/height，
  //   `section-tree#getFigmaBox` 归一化成 w/h。这里统一成 width/height 再判，
  //   否则面积恒为 0 ⇒ 包含判定恒 false ⇒ **静默失效**（本篇要防的正是这种假绿）。
  const normBox = (b) => {
    if (!b || typeof b !== 'object') return null
    const x = Number(b.x)
    const y = Number(b.y)
    const width = Number(b.width ?? b.w)
    const height = Number(b.height ?? b.h)
    if (![x, y, width, height].every(Number.isFinite)) return null
    return { x, y, width, height }
  }
  const infos = ids.map((id) => {
    let box = null
    try {
      box = normBox(boxOf ? boxOf(id) : null)
    } catch {
      box = null
    }
    return { id, box }
  })
  const areaOf = (b) => (Number(b.width) || 0) * (Number(b.height) || 0)
  const contains = (outer, inner) => {
    if (!outer || !inner) return false
    const oa = areaOf(outer)
    const ia = areaOf(inner)
    if (!(oa > 0) || !(ia > 0) || !(oa > ia)) return false
    return (
      inner.x >= outer.x - tol &&
      inner.y >= outer.y - tol &&
      inner.x + (Number(inner.width) || 0) <= outer.x + (Number(outer.width) || 0) + tol &&
      inner.y + (Number(inner.height) || 0) <= outer.y + (Number(outer.height) || 0) + tol
    )
  }

  const parentOf = new Map()
  for (const inner of infos) {
    if (!inner.box) continue
    const outers = infos.filter((o) => o.id !== inner.id && contains(o.box, inner.box))
    if (outers.length === 0) continue
    outers.sort((a, b) => areaOf(a.box) - areaOf(b.box))
    // 面积并列 ⇒ 无法确定直接父级，放弃该成员的去重（保守）
    if (outers.length > 1 && areaOf(outers[1].box) === areaOf(outers[0].box)) continue
    parentOf.set(inner.id, outers[0].id)
  }

  const roots = ids.filter((id) => !parentOf.has(id))
  const childrenOf = new Map()
  for (const id of ids) {
    const p = parentOf.get(id)
    if (!p) continue
    if (!childrenOf.has(p)) childrenOf.set(p, [])
    childrenOf.get(p).push(id)
  }
  return { roots, childrenOf }
}

/** 将共享 index 适配为 merger 的历史 byId 契约；业务裁决仍留在本模块。 */
function buildFigmaIndex(figmaData) {
  const root = (figmaData && (figmaData.document || figmaData)) || null
  return { root, byId: indexFigmaNodes(root) }
}

/** figma id 的尾段数字（"2:7890" → "7890"），用于跨前缀比对 */
function idSuffixOf(id) {
  const m = String(id == null ? '' : id).match(/(\d+)$/)
  return m ? m[1] : ''
}

/**
 * 几何行的「子树证据」：把该行 figma 子树里的所有 id / id 尾号 / 文本 / 非通用节点名收集起来，
 * 用于判定某个语义壳描述的内容是否已被这一行覆盖。
 */
function collectSubtreeEvidence(index, rootId) {
  const ids = new Set()
  const idSuffixes = new Set()
  const texts = new Set()
  const names = new Set()
  const walk = (nodeId) => {
    const record = index?.byId?.get(String(nodeId))
    if (!record) return
    ids.add(record.id)
    const sfx = idSuffixOf(record.id)
    if (sfx) idSuffixes.add(sfx)
    const rawNode = record.rawNode || record
    if (record.type === 'TEXT') {
      const text = String(rawNode.characters || '').trim()
      if (text) texts.add(text)
    }
    const name = String(record.name || '').trim()
    if (name && !GENERIC_NODE_NAME.test(name)) names.add(name)
    for (const child of rawNode.children || []) walk(child.id)
  }
  walk(rootId)
  return { ids, idSuffixes, texts, names }
}

/** 元素上可用于回指 Figma 的引用（节点 id + 资源文件名尾号，如 icon-7941 → 7941） */
function childRefTokens(child) {
  const out = []
  if (!child) return out
  if (child.figmaNode) out.push(String(child.figmaNode))
  if (child.figmaNodeId) out.push(String(child.figmaNodeId))
  for (const key of ['resourceFile', 'resource', 'src']) {
    const v = child[key]
    if (typeof v !== 'string') continue
    const base = v.split('/').pop().split('?')[0].replace(/\.[a-z0-9]+$/i, '')
    const m = base.match(/(\d{3,})$/)
    if (m) out.push(m[1])
  }
  return out
}

/** 元素上可用于回指 Figma 的引用（节点 id + 资源文件名尾号，如 icon-7941 → 7941）——已抽到 childRefTokens */

/**
 * 单个元素是否被某个几何行的子树证据覆盖（id 精确命中 / id 尾号命中 / 文案命中 / 语义名命中）。
 *
 * 🛡️ 治本（2026-09-11 · mc-max-1789097821000-c6194696 设备监测实锤）：语义壳（section-main，
 * figmaNode=null）的**直接子元素**是「左侧竖向Tab切换栏 / 右侧内容区」这类纯语义名，无任何
 * 可回指 Figma 的 token，旧逻辑只查这一层 → 判不出覆盖 → 去重失效 → 两套 tabs 重复渲染。
 * 但语义壳**深层** tab 项的 name（监控/照明/摄像机…）恰好是几何行子树 TEXT 的 characters——
 * 只要递归收集后代的 name/text/label 与 resourceFile 尾号，就能命中并正确判为「被覆盖」。
 * 治本：递归 child 自身 + 其 children 后代，任一后代命中即视为该语义壳子元素被几何行覆盖。
 */
function childCoveredByEvidence(child, ev) {
  // 🛡️ 递归命中判定：child 自身及其所有后代（children 递归）中，任一命中证据即 true。
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object') return false
    if (depth > 8) return false // 防病态深链，语义壳正常深度 ≤ 4
    for (const token of childRefTokens(node)) {
      const sfx = idSuffixOf(token)
      if (sfx && ev.idSuffixes.has(sfx)) return true
      if (ev.ids.has(token)) return true
    }
    for (const key of ['name', 'text', 'label']) {
      const v = node[key]
      if (typeof v !== 'string') continue
      const t = v.trim()
      if (t.length < 2) continue
      if (ev.texts.has(t) || ev.names.has(t)) return true
    }
    const kids = node.children || node.items || node.elements
    if (Array.isArray(kids)) {
      for (const k of kids) if (walk(k, depth + 1)) return true
    }
    return false
  }
  return walk(child, 0)
}

/**
 * 收集 section **直接子级**引用的 Figma 节点 id。
 *
 * ⚠️ 只认 `figmaNode` / `figmaNodeId` / 形如 `12:345` 的 `id`。
 *   `section.id` 本身**不可**作同区域判据：Vision 在那里写的是自由文本/语义名/幻觉 id
 *   （c-d79b-66d79bff 实测给了 `38:3258`，Figma 里其实是普通段的「鲁邦通」TEXT）。
 *
 * 🔴 R22-d：实现已下沉到 `section-anchor-truth.js`（**单一来源**），此处仅转出，
 *   避免同一判据两份副本（memory：同判据 ≥2 份 = 事故温床）。
 */
function collectSectionFigmaRefs(section) {
  return collectSectionFigmaRefsImpl(section)
}

/**
 * 判定「已存在的 section 是否描述这一行的**同一区域**」。
 *
 * 🔴 R22（2026-10-21 · c-d79b-66d79bff「合作厂商弹窗」实锤）：旧判据只有 `s.id === row.id`。
 *   Vision 的 `section.id` 不可信（本例 `38:3258` 是幻觉）⇒ 永不命中 ⇒ 几何块必然追加 ⇒
 *   下游「语义壳去重」必然把视觉段整段删除（丢掉 stat-card / layout / icon / label-value 顺序）。
 *
 * 两条独立通道，任一命中即同一区域：
 *   ① **成员集合**（主）：row 收敛后的**全部根成员**都被该 section 直接引用 ⇒ 讲的是同几个节点。
 *      要求「全部根」是为了不让「一个 tab 的语义壳」把整行吞掉（那只应让行保留）。
 *      —— 命名无关、几何无关，也不受 section.id 幻觉影响。
 *   ② **几何兜底**（次）：section 引用节点的 bbox 并集 ∩ row bbox ≥ row 面积的 80%。
 *      只用于「视觉没写成员 id、但区域明显重叠」的情形；不做双向比较，
 *      因为「大行里的小卡片」天然 100% 被包住，会误判成同一区域。
 */
function sameInlineRowRegion(section, row, roots, index) {
  if (!section || !row) return false
  if (section.id != null && String(section.id) === String(row.id)) return true
  if (String(section.figmaNodeId || '') === String(row.id)) return true
  const refs = collectSectionFigmaRefs(section)
  if (refs.size === 0) return false
  if (Array.isArray(roots) && roots.length > 0 && roots.every((r) => refs.has(String(r)))) return true

  const recordOf = (id) => index?.byId?.get(String(id)) || null
  const rowBox = getFigmaBox(recordOf(row.id))
  if (!rowBox || !(rowBox.w > 0) || !(rowBox.h > 0)) return false
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of refs) {
    const b = getFigmaBox(recordOf(id))
    if (!b) continue
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return false
  const ix = Math.max(0, Math.min(maxX, rowBox.x + rowBox.w) - Math.max(minX, rowBox.x))
  const iy = Math.max(0, Math.min(maxY, rowBox.y + rowBox.h) - Math.max(minY, rowBox.y))
  return (ix * iy) / (rowBox.w * rowBox.h) >= 0.8
}

/**
 * 节点是否携带「几何块表达不了」的结构信息。
 *
 * 几何块（`buildMemberNode` 产物）每个 item 只有 `id / name / role:'item' / figmaNode / children`，
 * 没有方向、没有图标语义、没有 label/value 区分、没有面板底引用。所以：
 *   - `role` 存在且 ≠ 'item'（stat-card / tabs / chart…）
 *   - `layout` 存在（horizontal / vertical → 卡内排布）
 *   - `type` 存在（icon / label / value / group / row）
 *   - `bgPlaceholder` 存在（面板底真值）
 * 任一出现 ⇒ 几何块是该语义壳的**信息子集**，不可用它替换。
 *
 * ⚠️ 刻意**不**把 `resourceFile` 计入：它只说明挂哪个图，不说明结构；既有「header-controls
 *   因资源尾号命中被剔除」的行为必须保持（那种壳去掉图标不会丢布局语义，几何行的文案证据
 *   已覆盖同区域）。
 */
function hasStructuredNode(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return false
  const role = String(node.role || '').trim()
  if (role && role !== 'item') return true
  for (const key of ['layout', 'type', 'bgPlaceholder']) {
    const v = node[key]
    if (typeof v === 'string' && v.trim()) return true
  }
  const kids = node.children || node.items || node.elements
  if (Array.isArray(kids)) {
    for (const k of kids) if (hasStructuredNode(k, depth + 1)) return true
  }
  return false
}

/** 语义壳整体是否携带结构信息（含 e4b4a2d 原有三类：gridColumns / body.items / content-grid） */
function carriesStructure(section) {
  if (!section || typeof section !== 'object') return false
  const gridCols = Number(section.gridColumns ?? section.body?.gridColumns ?? NaN)
  if (Number.isFinite(gridCols) && gridCols > 1) return true
  if (Array.isArray(section.body?.items) && section.body.items.length > 0) return true
  const role = String(section.role || section.body?.role || '').trim()
  if (role === 'content-grid') return true
  const kids = [
    ...(Array.isArray(section.children) ? section.children : []),
    ...(Array.isArray(section.body?.children) ? section.body.children : []),
  ]
  for (const kid of kids) if (hasStructuredNode(kid)) return true
  return false
}

export function mergeInlineRowsIntoSections(layout, inlineRows, figmaData, opts = {}) {
  if (!layout || typeof layout !== 'object') return layout
  const sections = Array.isArray(layout.sections) ? layout.sections : []
  if (!Array.isArray(inlineRows) || inlineRows.length === 0) {
    return { ...layout, sections: sections.slice() }
  }
  // 🔴 结构主权边界（mc-max-1793349445991-9e0b7a97）：原始 vision 已正确给出
  // header → list → footer，旧 merger 又把两个同锚点 565:3 几何行注入顶层并按
  // Figma y 重排 ⇒ 同一 6 卡列表被刀53与 LLM 各物化一次。vision 主路径下
  // inlineCompositeRows 只能作辅助事实，不得改变 section 数量、层级、顺序或内容。
  if (opts.preserveVisionStructure === true) {
    return { ...layout, sections: sections.slice() }
  }

  // 🛡️ 层级收敛（仅在提供 figmaData 时启用）：rebuildSectionsPreservingInlineRows 递归整棵树，
  // 会把**每个层级**的并行 frame 都抽成 inline-row（44 个里 43 个是 depth 2~6 的深层帧，
  // 包括 switch/active/default 状态态与卡片内部 Group）。旧 merger 无条件把这些行 push 到顶层
  // sections → 深层嵌套被提升为平级顶层 section、结构层级被拍平（device-monitor 组件 3 个业务
  // section 被炸成 41 个平级 inline-row，子组件内部层级全丢）。
  // 治本：仅保留「真正顶层的并行块」——满足 (a) 其父节点不是任何 inline-row；(b) 父节点是
  // 组件根直接子或一级容器（parentDepth ≤ 1）；(c) 其 id 不被其他 inline-row 作为成员引用。
  // 满足以上即「最大连通分量根」，深层帧的并行交给 card-internal / container-rebuild 处理，不再
  // 污染顶层结构表。不传 figmaData 时保持旧行为（零回归）。
  let allowedRows = inlineRows
  if (figmaData) {
    const root = figmaData.document || figmaData
    const depthOf = new Map()
    const parentOf = new Map()
    const walkParent = (n, d, p) => {
      depthOf.set(n.id, d)
      if (p) parentOf.set(n.id, p.id)
      for (const c of n.children || []) walkParent(c, d + 1, n)
    }
    if (root) walkParent(root, 0, null)
    const rowIdSet = new Set(inlineRows.map((r) => r && r.id).filter(Boolean))
    const referenced = new Set()
    for (const row of inlineRows) {
      if (row && Array.isArray(row.members)) {
        for (const m of row.members) referenced.add(m)
      }
    }
    allowedRows = inlineRows.filter((row) => {
      if (!row) return false
      const p = parentOf.get(row.id)
      if (p && rowIdSet.has(p)) return false // 父本身是行 → 嵌套，剔除
      const pDepth = p ? depthOf.get(p) ?? 0 : 0
      if (pDepth > 1) return false // 仅保留组件根直接子 / 一级容器下的并行
      if (referenced.has(row.id)) return false // 被其他行引用 → 非最外层
      return true
    })
  }

  const merged = sections.slice()
  // 🛡️ 顺序治本（2026-09-10）：旧逻辑无条件把 inline-row push 到 sections 末尾，
  // 导致 header（figma 顶部 y 最小）被排到业务 section 之后 =「头部插槽放到了下面」。
  // 治本：收敛后的 inline-row 均带 figmaNodeId，按 Figma 真值 y 坐标排序后插入，
  // 使结构表顺序与视觉上下顺序一致（header 在最上）。业务 section 同样按 y 参与排序；
  // 查不到 y 的（如纯语义 section）保持原相对顺序。
  // Figma 索引（一次遍历，供 y 查找与「语义壳被几何行覆盖」判定共用）
  let figmaIndex = null
  const getIndex = () => {
    if (!figmaIndex) figmaIndex = buildFigmaIndex(figmaData)
    return figmaIndex
  }
  const figmaYOf = (id) => {
    if (!figmaData) return null
    const node = getIndex().byId.get(String(id))
    const box = getFigmaBox(node)
    return box && Number.isFinite(box.y) ? box.y : null
  }
  // 业务 section 的 y 锚点。
  //
  // 🔴 R22-b（2026-10-21 · c-d79b-66d79bff 实锤）：旧实现只看 `figmaNodeId || id`。
  //   Vision 的 `section.id` 可能是**存在但无关**的幻觉节点（本例 `38:3258` 在 Figma 里是
  //   普通段的「鲁邦通」TEXT，y=52212）—— 它查得到 y，于是统计卡被排到整页最底部。
  //   判据：自身锚点只在它确实是**包含**其直接子级内容的容器时才可信；否则改用
  //   「直接子级引用节点 bbox 并集的顶部」（子级 id 是模型真正引用的节点，比 section.id 可靠）。
  const sectionY = (sec) => {
    const ownId = sec && (sec.figmaNodeId || sec.id)
    const ownY = ownId ? figmaYOf(ownId) : null
    const refs = collectSectionFigmaRefs(sec)
    if (refs.size === 0 || !figmaData) {
      return ownY == null ? Number.POSITIVE_INFINITY : ownY
    }
    const recordOf = (id) => getIndex().byId.get(String(id)) || null
    const ownBox = ownY == null ? null : getFigmaBox(recordOf(ownId))
    let minY = Number.POSITIVE_INFINITY
    let containsAll = ownBox != null
    for (const id of refs) {
      const b = getFigmaBox(recordOf(id))
      if (!b) continue
      minY = Math.min(minY, b.y)
      if (!ownBox) continue
      const tol = 2
      const inside =
        b.x >= ownBox.x - tol &&
        b.y >= ownBox.y - tol &&
        b.x + b.w <= ownBox.x + ownBox.w + tol &&
        b.y + b.h <= ownBox.y + ownBox.h + tol
      if (!inside) containsAll = false
    }
    if (!Number.isFinite(minY)) return ownY == null ? Number.POSITIVE_INFINITY : ownY
    // 自身锚点确实是「装得下自己内容」的容器 ⇒ 用它（更接近 section 顶边）
    if (ownBox && containsAll) return ownBox.y
    return minY
  }
  let newBlocks = []
  for (const row of allowedRows) {
    if (!row || !Array.isArray(row.members) || row.members.length < 2) continue
    // 🛡️ F17：成员先按 bbox 包含关系收敛（被包含者降为子项），避免「卡 + 卡内文本」被拍平
    const memberIds = row.members.map((m) => String(m))
    const grouping = getIndex()
      ? groupRowMembersByContainment(memberIds, (id) =>
          getFigmaBox(getIndex().byId.get(String(id))),
        )
      : { roots: memberIds, childrenOf: new Map() }
    // 收敛后仍需 ≥2 个并列项才构成「行」；否则交回 E1 按普通容器处理（不产出扁平块）
    if (grouping.roots.length < 2) continue
    // 同一行已存在于 sections（**同一区域**命中）则跳过，避免重复追加。
    // 🔴 R22：判据由「id 字符串相等」改为 sameInlineRowRegion（成员集合 + 几何兜底），
    //   原因见该函数注释 —— Vision 的 section.id 是幻觉，旧判据恒不命中。
    if (merged.some((s) => s && sameInlineRowRegion(s, row, grouping.roots, getIndex()))) continue
    const orderOf = new Map(memberIds.map((m, i) => [m, i + 1]))
    const buildMemberNode = (m) => {
      // 🛡️ 覆盖率根因（2026-09-11 · env-monitor 10% 实锤）：name 只写节点号（String(m)）会让覆盖率
      // 把「一氧化碳/洞内照明/洞外光强」等 tab 文案判 missing（节点号 vs 文案子串匹配不上）→ 虚低覆盖率。
      // 治本：从 member 的 figma 子树抽真实文案（TEXT.characters，collectSubtreeEvidence 已收 texts），
      // 拼接作为 name，覆盖率子串即可命中。抽不到文案才回退节点号（保持原行为）。
      const ev = getIndex() ? collectSubtreeEvidence(getIndex(), m) : null
      const texts = ev && ev.texts ? [...ev.texts] : []
      const kidIds = grouping.childrenOf.get(m) || []
      const kids = kidIds.map(buildMemberNode)
      // 被吸入的子项自带文案（卡内标题/数字），拼进父 name 以免覆盖度只看到节点号
      const kidTexts = kids
        .map((k) => String(k.name || '').trim())
        .filter((n) => n && !/^\d+:\d+/.test(n))
      return {
        id: `${row.id}-m${orderOf.get(m) || 0}`,
        name: texts.join('') || kidTexts.join(' / ') || String(m),
        role: 'item',
        figmaNode: m,
        ...(kids.length ? { children: kids } : {}),
      }
    }
    const children = grouping.roots.map(buildMemberNode)
    newBlocks.push({
      id: row.id,
      name: row.name || 'inline-row',
      role: 'inline-row',
      layout: 'horizontal',
      layoutSource: 'inline-row',
      figmaNodeId: row.id,
      // 顶层 children：供结构断言 / planner 直接消费
      children,
      header: { title: row.name || 'inline-row' },
      // body.children：向下游 extractElements(_extractElements) 兼容（读 body.children）
      body: { layout: 'horizontal', children },
      _y: figmaYOf(row.id) ?? Number.POSITIVE_INFINITY,
    })
  }

  // 若没有 figmaData（零回归路径），保持旧行为：业务在前、inline-row 追加末尾
  if (!figmaData) {
    for (const b of newBlocks) {
      const { _y, ...rest } = b
      merged.push(rest)
    }
    return { ...layout, sections: merged }
  }

  // 🛡️ 语义壳去重治本（2026-09-10 · env-monitor 实锤「两套 tabs / 两套 icons」）：
  // Vision 把同一行拆成若干语义壳（header-tabs / header-controls），merger 又把该行整体
  // 提升为几何块（89:42，成员含 tabs-list + tabs-icon）→ 两者描述同一片 figma 区域，
  // 下游 planner 会各生成一个子组件 → 同一组 tab/icon 渲染两遍。
  //
  // 🔴 R22-c（2026-10-21 · c-d79b-66d79bff 实锤）：原判据是「覆盖即删」——
  //   `return !(hits > 0 && coverage >= 0.6)`，**从不问几何块是不是信息超集**。
  //   注释里的前提「几何行代表 Figma 真值几何」对 tab 行成立（只要文案），对**结构化卡片
  //   不成立**：几何 item 只有 id/name，没有 layout/icon/label-value 顺序/面板底。
  //   于是「去重」变成了「信息丢失」——一份 stat-card 结构被换成扁平 item。
  //   治本：把「删」改成三态——纯文本壳才删；携带结构的壳保留，改为**撤掉覆盖它的几何块**
  //   （几何块信息更少，没有保留价值）；同一行已被更早的壳认领则本壳判重复剔除。
  const evidenceOf = []
  for (const s of merged) {
    if (isGeometricSection(s) && s.id) {
      evidenceOf.push({ id: String(s.id), ...collectSubtreeEvidence(getIndex(), s.id) })
    }
  }
  for (const b of newBlocks) {
    evidenceOf.push({ id: String(b.id), ...collectSubtreeEvidence(getIndex(), b.id) })
  }

  let keptSections = merged
  if (evidenceOf.length > 0) {
    const withdrawnGeoIds = new Set() // 因保留结构化语义壳而撤掉的几何块 id
    keptSections = merged.filter((s) => {
      if (!s || isGeometricSection(s)) return true
      const children = s.body && Array.isArray(s.body.children) ? s.body.children : null
      if (!children || children.length === 0) return true
      let hits = 0
      let coveringEvidence = null
      for (const c of children) {
        const matchedEv = evidenceOf.find((ev) => childCoveredByEvidence(c, ev))
        if (matchedEv) {
          hits++
          if (!coveringEvidence) coveringEvidence = matchedEv
        }
      }
      const coverage = hits / children.length
      const isSuperseded = hits > 0 && coverage >= SEMANTIC_SUPERSEDE_THRESHOLD
      if (!isSuperseded) return true
      const coveringId = coveringEvidence && coveringEvidence.id ? String(coveringEvidence.id) : ''
      // ① 携带几何块表达不了的结构 ⇒ 保留语义壳
      if (carriesStructure(s)) {
        // 同一行已被更早的结构化壳认领 ⇒ 本壳是重复的，剔除
        if (coveringId && withdrawnGeoIds.has(coveringId)) return false
        if (coveringId) withdrawnGeoIds.add(coveringId)
        return true
      }
      // ② 纯文本语义壳（几何块能完整表达）⇒ 照旧剔除
      return false
    })
    if (withdrawnGeoIds.size > 0) {
      newBlocks = newBlocks.filter((b) => !withdrawnGeoIds.has(String(b.id)))
    }
  }

  // 有 figmaData：业务 section（带 _y）与 inline-row 按 y 升序统一重排。
  // 无 y 的业务常驻 section（纯语义壳，通常是 inline-row 的语义镜像）沉底，
  // 避免其压过真实视觉顶部的 header。有 y 的几何块（header/slot-con…）按 y 升序在前。
  const withY = keptSections.map((s, idx) => {
    const y = sectionY(s)
    const effectiveY = Number.isFinite(y) ? y : 1e6 + idx
    return { ...s, _y: effectiveY, _idx: idx }
  })
  const ordered = withY.concat(newBlocks).sort((a, b) => {
    const ya = a._y == null || !Number.isFinite(a._y) ? 1e6 + (a._idx ?? 0) : a._y
    const yb = b._y == null || !Number.isFinite(b._y) ? 1e6 + (b._idx ?? 0) : b._y
    if (ya !== yb) return ya - yb
    return (a._idx ?? 0) - (b._idx ?? 0)
  })
  const result = ordered.map(({ _y, _idx, ...rest }) => rest)
  return { ...layout, sections: result }
}

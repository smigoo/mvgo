/**
 * section 装配结构契约：最终生效树 → contentType/placement/parent/children。
 *
 * 只在 resolvePlanSections() 之后派生，不写回 planner；placement 是空间归属，
 * 与 type=header 的内容语义分离。index 的插槽、bodyRoots、递归渲染共用本契约。
 */
import { isLayoutContainerSection } from './section-tree.js'

function hasBusinessBody(section) {
  return ['body', 'declaredContent'].some((root) => {
    const value = section?.[root]
    return ['items', 'children', 'elements'].some(
      (key) => Array.isArray(value?.[key]) && value[key].length > 0,
    )
  })
}

function sourceIds(section) {
  return Array.isArray(section?.sourceNodeIds)
    ? section.sourceNodeIds.map(String).filter(Boolean)
    : []
}

/**
 * @param {Array} sections resolvePlanSections() 的最终生效树
 * @param {{headerSlots?:Array}} opts
 */
export function buildSectionStructureContract(sections, opts = {}) {
  const roots = Array.isArray(sections) ? sections : []
  const byId = new Map()
  const leaves = []

  const walk = (list, parent = null) => {
    for (const section of Array.isArray(list) ? list : []) {
      if (!section || typeof section !== 'object') continue
      const container = isLayoutContainerSection(section)
      const childSections = container && Array.isArray(section.children) ? section.children : []
      const id = String(section.id ?? '')
      const node = {
        id,
        contentType: container ? 'container' : String(section.type || 'content'),
        placement: 'body',
        parent,
        children: childSections.map((child) => String(child?.id ?? '')).filter(Boolean),
        section,
      }
      byId.set(id, node)
      if (container) walk(childSections, id)
      else leaves.push(section)
    }
  }
  walk(roots)

  let slotRevokedRespected = 0
  const headerSlotNodeIds = new Set()
  for (const slot of Array.isArray(opts.headerSlots) ? opts.headerSlots : []) {
    const slotType = String(slot?.slotType || '').toLowerCase()
    if (slotType !== 'header-right' && slotType !== 'title-right') continue
    // 子节点 figmaNodeId 与宿主 sectionId 是互补证据，不能用 || 只留前者。
    // 例如 Tab 容器 2:7954 属于 header section 2:7959；最终入槽的是宿主段。
    for (const id of [slot?.figmaNodeId, slot?.sectionId, slot?.id]) {
      if (id) headerSlotNodeIds.add(String(id))
    }
  }

  const typedHeaders = leaves.filter((section) => section.type === 'header')
  const safeHeaders = typedHeaders.filter((section) => !hasBusinessBody(section))
  let candidates = safeHeaders
  if (headerSlotNodeIds.size > 0) {
    const matched = leaves.filter((section) =>
      sourceIds(section).some((id) => headerSlotNodeIds.has(id)),
    )
    // 🛡️ 2026-11-07（mc-max-1794041862682-9f43a112 实锤）：**尊重插槽资格复核的撤单**。
    //   病灶：derived 插槽不带 sectionId ⇒ 复核按 sectionId 过滤拦不住它；结构契约又按
    //   sourceNodeIds（含子节点 id）匹配 ⇒ 整个父段（146 行 StatsMonitor）被拉进 38px 定高
    //   #header-right ⇒ 溢出压住 body。复核撤单是资格判据的权威结论（`_slotRevoked` 已由
    //   visual-parser 挂到段对象上），契约必须照办：撤单段一律回落 body。
    const revokedMatched = matched.filter((section) => section && section._slotRevoked)
    if (revokedMatched.length > 0) {
      slotRevokedRespected = revokedMatched.length
      const keep = matched.filter((section) => !section._slotRevoked)
      if (keep.length > 0) candidates = keep
      else candidates = [] // 全被撤 ⇒ 不产 header 叶，全部回落 body
    } else if (matched.length > 0) {
      candidates = matched
    }
  }
  // 🛡️ 2026-11-06（f91aa545 实锤）：**planner 显式声明的插槽宿主段**优先兜底。
  //   真机 vision 从没产出 `type==='header'` 的段（标题栏被当 chrome），插槽 id 又是文本/
  //   统计节点、不在任何段的 `sourceNodeIds` 里 ⇒ 上面两条全空 ⇒ `headerSlotsEmitted=0`
  //   ⇒ index 无 `#header-right` ⇒ 插槽内容退回 body 再渲一遍。
  //   planner 已按「isPanelHeader ∧ 有插槽业务内容」保住宿主并打 `_headerSlotHost`，
  //   本契约认这个显式事实（不靠 type 猜、不做几何推断）。
  if (candidates.length === 0) {
    const hosts = leaves.filter(
      (section) => section && section._headerSlotHost === true && !section._slotRevoked,
    )
    if (hosts.length > 0) candidates = [hosts[0]]
  }

  if (candidates.length > 1) {
    const topLevelHeaderIds = new Set(
      roots.filter((section) => section?.type === 'header').map((section) => String(section?.id)),
    )
    const topOnly = candidates.filter((section) => topLevelHeaderIds.has(String(section?.id)))
    candidates = [(topOnly.length > 0 ? topOnly : candidates)[0]]
  }

  const headerSet = new Set(candidates)
  for (const section of leaves) {
    byId.get(String(section.id ?? '')).placement = headerSet.has(section) ? 'header-right' : 'body'
  }
  const bodyLeaves = leaves.filter((section) => !headerSet.has(section))
  const bodyLeafSet = new Set(bodyLeaves)
  const hasBodyLeaf = (section) => {
    if (!section || typeof section !== 'object') return false
    if (!isLayoutContainerSection(section)) return bodyLeafSet.has(section)
    return (Array.isArray(section.children) ? section.children : []).some(hasBodyLeaf)
  }

  return {
    byId,
    leaves,
    headerLeaves: candidates,
    bodyLeaves,
    bodyRoots: roots.filter(hasBodyLeaf),
    droppedHeaderLeaves: typedHeaders.filter((section) => !headerSet.has(section)),
    stats: {
      nodes: byId.size,
      leaves: leaves.length,
      headerLeavesBefore: typedHeaders.length,
      headerSlotsEmitted: candidates.length,
      slotRevokedRespected,
      contracted: typedHeaders.length > 1 ? 1 : 0,
      bodyRoots: roots.filter(hasBodyLeaf).length,
    },
  }
}

export default buildSectionStructureContract

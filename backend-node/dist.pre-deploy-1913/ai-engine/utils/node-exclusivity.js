/**
 * 🛡️ Loop 2.1.C（2026-09-10）：header vs content 互斥表（figmaNodeId 只落一次）。
 *
 * 根因：vision 把同一份统计数据同时放进 headerSlots 和 layout.sections（如 header-stats），
 * 下游两路消费（section → 子组件；slots → T09 兜底注入）→ 同一节点渲染两次。
 *
 * 规则（确定性，几何/角色裁决，不新增 CODE 码）：
 *  1. 同一 figmaNodeId 同时出现在 slots 与 content sections：
 *     - 若 slot.elementType ∈ {tab, icon, button, switch, input, select}（业务交互控件）
 *       → slot 保留，content 侧同 node 移除（交互语义在 header，内容兜底会让位）。
 *     - 否则 → content 保留，slot 移除（内容已是真实业务区块，slot 属重复）。
 *  2. chrome 标题节点（role=chrome 或 elementType=title）既不进 content 也不进 slots。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；不修改入参。
 *
 * @param {Array} slots - headerSlots（含 slotType/elementType/figmaNodeId）
 * @param {Array} sections - layout.sections（含 role/body.children[].figmaNode）
 * @returns {{slots:Array, sections:Array, removedSlots:Array, removedContentNodes:string[]}}
 */
const BUSINESS_INTERACTIVE = new Set(['tab', 'icon', 'button', 'switch', 'input', 'select'])

/**
 * 🛡️ header 专属插槽通道（2026-11-10 修订 · 设备 15f40155/重点车辆 084e8c19 真机实锤）：
 *   `title-left|title-right|header-right` 是 headerSlots 通道的专属契约形态（R6/T09 从
 *   Figma header 容器确定性推导，零臆造）。旧裁决只认 elementType 交互控件（tab/icon/…），
 *   statistic/label 重叠时判「content 赢」⇒ header 通道清空 ⇒ T09 无数据可兜底 ⇒
 *   头部统计词全丢（设备「设备类型/设备总数/完好率」10 条未承载）+ LLM 把胶囊塞进内容区
 *   （重点车辆）——content 赢已实锤为负收益。
 *   slot 赢时 content 侧同 node 仍被移除（removedContentNodes），「防双份渲染」目的不变，
 *   只是渲染位置回到语义正确的 header 通道（与 tab 同权）。
 *   无 slotType 的 slot 保持旧裁决（向后兼容）。
 */
const SLOT_CHANNEL_TYPES = new Set(['header-right', 'title-left', 'title-right'])

function isChromeTitle(node) {
  const role = String(node?.role || '').toLowerCase()
  const elementType = String(node?.elementType || '').toLowerCase()
  return role === 'chrome' || elementType === 'title'
}

function contentNodesOf(section) {
  const children = Array.isArray(section?.body?.children) ? section.body.children : []
  return children.map((c) => c?.figmaNode || c?.id).filter(Boolean)
}

export function resolveNodeExclusivity(slots, sections) {
  const slotList = Array.isArray(slots) ? slots : []
  const sectionList = Array.isArray(sections) ? sections : []

  // 1) chrome 标题节点集合：既不在 slots 也不在 content
  const chromeTitleNodes = new Set()
  for (const s of slotList) if (isChromeTitle(s)) chromeTitleNodes.add(s?.figmaNodeId || s?.id)
  for (const s of sectionList) {
    if (String(s?.role || '').toLowerCase() !== 'chrome') continue
    for (const n of contentNodesOf(s)) chromeTitleNodes.add(n)
  }

  // 2) content 侧涉及的全部 node
  const contentNodeSet = new Set()
  for (const s of sectionList) for (const n of contentNodesOf(s)) contentNodeSet.add(n)

  const removedSlots = []
  const removedContentNodes = []
  const keptSlots = []
  for (const slot of slotList) {
    const id = slot?.figmaNodeId || slot?.id
    if (!id) {
      keptSlots.push(slot)
      continue
    }
    if (chromeTitleNodes.has(id)) {
      removedSlots.push(slot)
      continue
    }
    if (!contentNodeSet.has(id)) {
      keptSlots.push(slot)
      continue
    }
    // 重叠：业务交互控件 / header 专属插槽通道 → slot 赢；否则 content 赢
    const et = String(slot?.elementType || '').toLowerCase()
    const st = String(slot?.slotType || '')
      .toLowerCase()
      .replace(/_/g, '-')
    if (BUSINESS_INTERACTIVE.has(et) || SLOT_CHANNEL_TYPES.has(st)) {
      keptSlots.push(slot)
      removedContentNodes.push(id)
    } else {
      removedSlots.push(slot)
    }
  }

  const removedContentSet = new Set(removedContentNodes)
  const keptSections = sectionList.map((s) => {
    // chrome 标题 section 的 content 子节点整体不进 content（已交由 headerSlots 或丢弃）
    if (String(s?.role || '').toLowerCase() === 'chrome') {
      return {
        ...s,
        body: { ...s.body, children: [] },
        _excludedFromContent: true,
      }
    }
    const children = Array.isArray(s?.body?.children) ? s.body.children : null
    if (!children) return s
    const filtered = children.filter((c) => {
      if (isChromeTitle(c)) return false
      const id = c?.figmaNode || c?.id
      return !(id && removedContentSet.has(id))
    })
    if (filtered.length === children.length) return s
    return { ...s, body: { ...s.body, children: filtered } }
  })

  return {
    slots: keptSlots,
    sections: keptSections,
    removedSlots,
    removedContentNodes,
  }
}

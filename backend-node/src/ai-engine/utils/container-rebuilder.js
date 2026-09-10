/**
 * 🛡️ A′（2026-09-10）：纵向容器层级重建 —— 把视觉分区/merger 阶段被丢弃的
 * slot-con 类纵向容器恢复为带 `children` 的嵌套 section。
 *
 * 问题：Vision 把容器子节点拆散（如 device `89:40 slot-con` 的 `switch`/`@antd/tab`
 * 被拆到 `section-main` 之外），`inline-row-merger` 又只把「左右并列」子节点提升为
 * section、对「上下堆叠」的父容器不保留 → 容器层级在 `plan()` 输入前就丢失。
 * 下游 planner/engineer 拿到平级 section，无从区分「并列区块」与「同属一个纵向容器」。
 *
 * 治本：确定性几何重建（无 LLM）。在 merger 之后、planner 之前，基于 figma 真值回查
 * 「全部直接子都被提升为平级顶层 section、自身却不在 sections 中」的容器节点，
 * 判定为纵向容器后重建为嵌套 section，children 按 bbox.y 升序。
 *
 * 纯函数、零依赖、无 import.meta —— 便于 jest（CJS require）直接单测。
 * 方向判定复用 `flex-direction-inferrer.js` 的 `inferFlexDirection`（sideBySide 单一事实源）。
 *
 * @param {object} layout - { sections: [] }（visual-parser 的 layoutStructure.layout）
 * @param {object} figmaData - Figma 节点树（document 根）
 * @returns {object} 新的 layout（不修改入参）
 */
import { inferFlexDirection } from './flex-direction-inferrer.js'

function getBBox(node) {
  const bb = node && node.absoluteBoundingBox
  return bb ? { x: bb.x, y: bb.y, w: bb.width, h: bb.height } : null
}

function collectFigmaNodes(node, acc) {
  if (!node) return acc
  acc.push(node)
  for (const c of node.children || []) collectFigmaNodes(c, acc)
  return acc
}

export function rebuildSlotConContainers(layout, figmaData) {
  if (!layout || typeof layout !== 'object') return layout
  const sections = Array.isArray(layout.sections) ? layout.sections : []
  if (sections.length === 0) return { ...layout, sections: sections.slice() }
  if (!figmaData) return { ...layout, sections: sections.slice() }

  const secIds = new Set(sections.map((s) => s.id))
  const allNodes = collectFigmaNodes(figmaData.document || figmaData, [])
  const byId = new Map(allNodes.map((n) => [n.id, n]))

  const rebuilt = []
  const consumed = new Set() // member section id 已被某容器占用

  for (const node of allNodes) {
    const kids = node.children || []
    if (kids.length < 2) continue
    // 候选信号：全部直接子命中顶层 sections & 自身非顶层 section
    const allChildrenInSections = kids.every((k) => secIds.has(k.id))
    if (!allChildrenInSections) continue
    if (secIds.has(node.id)) continue

    const members = kids.filter((k) => secIds.has(k.id))
    if (members.length < 2) continue
    // 一个 member 只能属于一个容器（取第一个命中的容器）
    if (members.some((m) => consumed.has(m.id))) continue

    // 纵向判定：member 的 bbox 主导方向为 vertical（无横向并列对）→ 才重建；
    // 横向容器（如 device cons 12 子 grid）交给 merger 处理，不在此重建。
    const memberBoxes = members
      .map((m) => byId.get(m.id))
      .filter(Boolean)
      .map(getBBox)
      .filter(Boolean)
    if (memberBoxes.length < 2) continue
    if (inferFlexDirection(memberBoxes) === 'horizontal') continue

    const sortedMembers = members
      .map((m) => sections.find((s) => s.id === m.id))
      .filter(Boolean)
      .sort((a, b) => {
        const ba = getBBox(byId.get(a.id)) || { y: 0 }
        const bb = getBBox(byId.get(b.id)) || { y: 0 }
        return (ba.y || 0) - (bb.y || 0)
      })

    const containerSection = {
      id: node.id,
      name: node.name || 'container',
      role: 'content-container',
      layout: 'vertical',
      layoutSource: 'container-rebuild',
      figmaNodeId: node.id,
      children: sortedMembers,
      header: { title: node.name || 'container' },
      body: { layout: 'vertical', children: sortedMembers },
    }
    rebuilt.push({ container: containerSection, memberIds: members.map((m) => m.id) })
    members.forEach((m) => consumed.add(m.id))
  }

  if (rebuilt.length === 0) return { ...layout, sections: sections.slice() }

  // 组装：容器 section 插入第一个 member 的原位置，移除被消费的 member
  const consumedMemberIds = new Set()
  rebuilt.forEach((r) => r.memberIds.forEach((id) => consumedMemberIds.add(id)))

  const result = []
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    if (consumedMemberIds.has(sec.id)) {
      // 在该 member 原位置插入其所属容器（仅一次）
      const rb = rebuilt.find((r) => r.memberIds.includes(sec.id))
      const alreadyIn = result.some(
        (x) => x.layoutSource === 'container-rebuild' && x.id === rb.container.id,
      )
      if (rb && !alreadyIn) result.push(rb.container)
      continue // 跳过 member 本身
    }
    result.push(sec)
  }

  return { ...layout, sections: result }
}

/**
 * 从 sections 中收集容器归属提示（供 prompt 注入）。展平会丢失容器嵌套，
 * 此函数在展平前调用，产出「容器 id → 有序子区块」的提示，避免 info 丢失。
 *
 * @param {Array} sections
 * @returns {Array<{containerId:string,name:string,childIds:string[],childNames:string[]}>}
 */
export function collectContainerHints(sections) {
  if (!Array.isArray(sections)) return []
  const hints = []
  for (const sec of sections) {
    if (sec && sec.layoutSource === 'container-rebuild' && Array.isArray(sec.children)) {
      hints.push({
        containerId: sec.id,
        name: sec.name || 'container',
        childIds: sec.children.map((c) => c.id),
        childNames: sec.children.map((c) => c.name || c.header?.title || c.id),
      })
    }
  }
  return hints
}

/**
 * 把含容器的嵌套 sections 展平为 planner 可消费的扁平列表。
 * 容器本身不作为独立 effectiveSection 槽位（否则 switch/tab 会在 effectiveSections 里消失）；
 * 仅把其 children 按序展开为顶层项，并保留 `parentContainerId` 提示。
 *
 * @param {Array} sections
 * @returns {Array} 展平后的 sections（原数组顺序，容器位置替换为展开的子项）
 */
export function flattenContainerSections(sections) {
  if (!Array.isArray(sections)) return []
  const out = []
  for (const sec of sections) {
    if (sec && sec.layoutSource === 'container-rebuild' && Array.isArray(sec.children)) {
      for (const child of sec.children) {
        out.push({ ...child, parentContainerId: sec.id })
      }
      continue
    }
    out.push(sec)
  }
  return out
}

/**
 * 🛡️ A′（2026-09-10）：容器层级重建 —— 把视觉分区/merger 阶段被丢弃的
 * slot-con 类容器恢复为带 `children` 的嵌套 section。
 *
 * 问题：Vision 把容器子节点拆散（如 device `89:40 slot-con` 的 `switch`/`@antd/tab`
 * 被拆到 `section-main` 之外），`inline-row-merger` 又只把「左右并列」子节点提升为
 * section、对「上下堆叠」的父容器不保留 → 容器层级在 `plan()` 输入前就丢失。
 * 下游 planner/engineer 拿到平级 section，无从区分「并列区块」与「同属一个纵向容器」。
 *
 * 治本：确定性几何重建（无 LLM）。在 merger 之后、planner 之前，基于 figma 真值回查
 * 「全部直接子都被提升为平级顶层 section、自身却不在 sections 中」的容器节点，
 * 重建为带 children 的嵌套 section。方向由 `inferFlexDirection` 单一裁决：
 *   - vertical   → children 按 bbox.y 升序
 *   - horizontal → children 按 bbox.x 升序（`layout:'horizontal'`）
 *
 * 🔴 T-TOPO（2026-11-05）：旧实现只重建纵向、把横向「交给 merger」，但 merger 在
 * `preserveVisionStructure:true` 下是纯浅拷贝（零结构改动）⇒ 横向容器的父子关系
 * 无人生还，下游只看到平级段，生成 `flex-direction: column`（`89:37 @antd/tab` 的
 * 竖 tab 轨 + 卡片网格被上下堆叠，实锤于 mc-max-1793880532372-38f97905）。
 * 现改为横向/纵向都由本函数重建；下游 `isLayoutContainerSection` 与 planner 的
 * `isHorizontalContainer` 分支本就支持 `layout:'horizontal'`，无需改动。
 *
 * 纯函数、零依赖、无 import.meta —— 便于 jest（CJS require）直接单测。
 * 方向判定复用 `flex-direction-inferrer.js` 的 `inferFlexDirection`（sideBySide 单一事实源）。
 *
 * @param {object} layout - { sections: [] }（visual-parser 的 layoutStructure.layout）
 * @param {object} figmaData - Figma 节点树（document 根）
 * @returns {object} 新的 layout（不修改入参）
 */
import { inferFlexDirection } from './flex-direction-inferrer.js'
import { indexFigmaNodes, getFigmaBox } from './section-tree.js'

function getBBox(node) {
  return getFigmaBox(node)
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
  const figmaIndex = indexFigmaNodes(figmaData.document || figmaData)
  const allNodes = [...figmaIndex.values()].map((record) => record.rawNode || record)
  const byId = figmaIndex

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

    // 🛡️ T-TOPO（2026-11-05 · mc-max-1793880532372-38f97905 实锤）：方向由共享 primitive
    //   单一裁决，**横向与纵向都重建**（旧实现「横向交给 merger」是空承诺：两个调用点都传
    //   `preserveVisionStructure:true`，`inline-row-merger.js:338-340` 在该开关下只做浅拷贝，
    //   零结构改动 ⇒ 横向容器的父子关系无人生还，下游只看到平级段 ⇒ flex-direction: column）。
    //
    //   🔴 入参形状铁律：必须喂**原始节点/索引记录**（带 `absoluteBoundingBox`/`bbox`）。
    //   旧实现在此先 `.map(getBBox)` 压成 `{x,y,w,h}` 再判定，而 `inferFlexDirection`
    //   （flex-direction-inferrer.js:23）只认 `node.absoluteBoundingBox || node.bbox` ⇒
    //   全部被过滤 ⇒ 恒返回 'vertical' ⇒ 横向容器被**反向**包成竖直容器（正是本刀要修的 bug）。
    const direction = inferFlexDirection(members) === 'horizontal' ? 'horizontal' : 'vertical'

    const sortedMembers = members
      .map((m) => sections.find((s) => s.id === m.id))
      .filter(Boolean)
      .sort((a, b) => {
        const ba = getBBox(byId.get(String(a.id))) || {}
        const bb = getBBox(byId.get(String(b.id))) || {}
        // 横向按 x 升序（左右顺序），纵向按 y 升序（上下顺序）
        const ka = direction === 'horizontal' ? ba.x || 0 : ba.y || 0
        const kb = direction === 'horizontal' ? bb.x || 0 : bb.y || 0
        return ka - kb
      })

    const containerSection = {
      id: node.id,
      name: node.name || 'container',
      role: 'content-container',
      layout: direction,
      layoutSource: 'container-rebuild',
      figmaNodeId: node.id,
      children: sortedMembers,
      header: { title: node.name || 'container' },
      body: { layout: direction, children: sortedMembers },
    }
    rebuilt.push({ container: containerSection, memberIds: members.map((m) => m.id) })
    members.forEach((m) => consumed.add(m.id))
  }

  // 🛡️ v3 半提升回收（2026-11-12 · mc-1794474674611-37ed205e 实锤）：
  //   vision 把某 section 的**部分**直接子提升为顶层 section（88:33 当日总流量的
  //   1744:127/128 两组柱状图被提走，88:32/2:3660 留作 header/内容）⇒ 上一轮
  //   all-or-nothing 判据（kids.every(in sections)）对此放弃 ⇒ 柱状图被拆成独立
  //   组件挂页面底部。兜底回收判据（双条件，缺一不可）：
  //   ① **树父子关系**：候选必须是该 section 在 Figma 树上的直接子（父子唯一 ⇒ 无抢占冲突；
  //     仅靠 bbox 包含不安全——slot 框常有重叠死区，如 2:3438 车型分布框几乎全落
  //     88:33 框内，但树上是 1744:125 的子，绝不能被 88:33 抢走）；
  //   ② **bbox 完整包含**（容差 2px）：防误收无关平级段。
  //   回收后按方向（inferFlexDirection 单一裁决）重排 children，并在顶层结果中移除。
  // 🔴 形状铁律：getFigmaBox 返回 {x,y,w,h}，figma 原生 absoluteBoundingBox 是 {width,height}
  //   —— 两种形状都要兼容（旧坑复刻：T-TOPO 注释里「先 map 压形状导致恒 vertical」同类）。
  const normBox = (b) =>
    b ? { x: b.x || 0, y: b.y || 0, w: b.width ?? b.w ?? 0, h: b.height ?? b.h ?? 0 } : null
  const isBoxContained = (inner, outer, tol = 2) => {
    const a = normBox(inner)
    const o = normBox(outer)
    if (!a || !o || (!o.w && !o.h)) return false
    return (
      a.x >= o.x - tol &&
      a.y >= o.y - tol &&
      a.x + a.w <= o.x + o.w + tol &&
      a.y + a.h <= o.y + o.h + tol
    )
  }
  const sectionById = new Map()
  const seenSecObjs = new Set()
  const visitSec = (s) => {
    if (!s || typeof s !== 'object' || seenSecObjs.has(s)) return
    seenSecObjs.add(s)
    const sid = String(s.id)
    // 🔴 首见优先：children 树上的对象先注册；body.children 是镜像克隆（不同对象，
    //   粒度也不同——88:33.body.children 挂的是统计卡内部块），不得覆盖树对象，
    //   否则回收会写进克隆、树对象原地不动（实测踩坑）。
    if (!sectionById.has(sid)) sectionById.set(sid, s)
    for (const c of s.children || []) visitSec(c)
    for (const c of s.body?.children || []) visitSec(c)
  }
  for (const s of sections) visitSec(s)
  for (const rb of rebuilt) visitSec(rb.container)

  const reclaimedIds = new Set()
  for (const [pid, record] of byId.entries()) {
    const parentSec = sectionById.get(String(pid))
    if (!parentSec) continue
    const raw = record.rawNode || record
    const parentBox = getBBox(raw)
    if (!parentBox || !(parentBox.height ?? parentBox.h)) continue
    if (!Array.isArray(parentSec.children)) parentSec.children = []
    let changed = false
    for (const kid of raw.children || []) {
      const kidId = String(kid.id)
      if (kidId === String(pid)) continue
      if (!secIds.has(kidId)) continue // 只回收「被提升为顶层 section」的直接子
      if (parentSec.children.some((c) => String(c.id) === kidId)) continue
      if (reclaimedIds.has(kidId)) continue
      const kidRec = byId.get(kidId)
      const kidBox = getBBox(kidRec?.rawNode || kidRec)
      if (!isBoxContained(kidBox, parentBox)) continue
      const secObj = sections.find((s) => String(s.id) === kidId)
      if (!secObj) continue
      parentSec.children.push(secObj)
      reclaimedIds.add(kidId)
      changed = true
    }
    if (changed) {
      const kidRecords = parentSec.children.map((c) => byId.get(String(c.id))?.rawNode || c)
      const axis = inferFlexDirection(kidRecords) === 'horizontal' ? 'x' : 'y'
      parentSec.children.sort((a, b) => {
        const ba = getBBox(byId.get(String(a.id))?.rawNode || byId.get(String(a.id))) || {}
        const bb = getBBox(byId.get(String(b.id))?.rawNode || byId.get(String(b.id))) || {}
        return (ba[axis] || 0) - (bb[axis] || 0)
      })
      parentSec.reclaimedChildren = parentSec.children
        .filter((c) => reclaimedIds.has(String(c.id)))
        .map((c) => String(c.id))
    }
  }

  if (rebuilt.length === 0 && reclaimedIds.size === 0) return { ...layout, sections: sections.slice() }

  // 组装：容器 section 插入第一个 member 的原位置，移除被消费的 member 与被回收的 member
  const consumedMemberIds = new Set()
  rebuilt.forEach((r) => r.memberIds.forEach((id) => consumedMemberIds.add(id)))

  const result = []
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    if (reclaimedIds.has(String(sec.id))) continue // 已被父 section 回收，不再顶层平级
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

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

export function mergeInlineRowsIntoSections(layout, inlineRows, figmaData) {
  if (!layout || typeof layout !== 'object') return layout
  const sections = Array.isArray(layout.sections) ? layout.sections : []
  if (!Array.isArray(inlineRows) || inlineRows.length === 0) {
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
  // 业务 section 的 y：优先用其 figmaNodeId / id 查 figma；查不到返回 Infinity（沉底，保持原序）
  const sectionY = (sec) => {
    const id = sec && (sec.figmaNodeId || sec.id)
    const y = id ? figmaYOf(id) : null
    return y == null ? Number.POSITIVE_INFINITY : y
  }
  const newBlocks = []
  for (const row of allowedRows) {
    if (!row || !Array.isArray(row.members) || row.members.length < 2) continue
    // 同一行已存在于 sections（id 命中）则跳过，避免重复追加
    if (merged.some((s) => s && s.id === row.id)) continue
    const children = row.members.map((m, i) => {
      // 🛡️ 覆盖率根因（2026-09-11 · env-monitor 10% 实锤）：name 只写节点号（String(m)）会让覆盖率
      // 把「一氧化碳/洞内照明/洞外光强」等 tab 文案判 missing（节点号 vs 文案子串匹配不上）→ 虚低覆盖率。
      // 治本：从 member 的 figma 子树抽真实文案（TEXT.characters，collectSubtreeEvidence 已收 texts），
      // 拼接作为 name，覆盖率子串即可命中。抽不到文案才回退节点号（保持原行为）。
      const ev = getIndex() ? collectSubtreeEvidence(getIndex(), m) : null
      const texts = ev && ev.texts ? [...ev.texts] : []
      return {
        id: `${row.id}-m${i + 1}`,
        name: texts.join('') || String(m),
        role: 'item',
        figmaNode: m,
      }
    })
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
  // 治本：几何行代表 Figma 真值几何（横向 + flex 比例），保留；语义壳若其子元素
  // 已被某几何行的子树覆盖（id 尾号 / 资源文件名尾号 / 文案 / 语义节点名命中 ≥60%），
  // 判为重复 → 从 sections 中剔除，保证「同一 figma 节点只落一次」。
  const evidenceOf = []
  for (const s of merged) {
    if (isGeometricSection(s) && s.id) evidenceOf.push(collectSubtreeEvidence(getIndex(), s.id))
  }
  for (const b of newBlocks) evidenceOf.push(collectSubtreeEvidence(getIndex(), b.id))

  let keptSections = merged
  if (evidenceOf.length > 0) {
    keptSections = merged.filter((s) => {
      if (!s || isGeometricSection(s)) return true
      const children = s.body && Array.isArray(s.body.children) ? s.body.children : null
      if (!children || children.length === 0) return true
      let hits = 0
      for (const c of children) {
        if (evidenceOf.some((ev) => childCoveredByEvidence(c, ev))) hits++
      }
      const coverage = hits / children.length
      return !(hits > 0 && coverage >= SEMANTIC_SUPERSEDE_THRESHOLD)
    })
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

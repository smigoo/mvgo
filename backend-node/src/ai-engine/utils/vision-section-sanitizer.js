/**
 * 🛡️ 根治⑩（2026-11-12 · mc-max-1794480764511-f3085ec6 实锤）：
 *   vision section 对 Figma 真值的确定性消毒 —— 布局引擎侧治本，非闸门。
 *
 * 病灶（用户把 Figma 从嵌套整理为平铺后系统性失配）：
 *   ① vision 把整板背景 `bg-[m]`（2:3436，BOOLEAN_OPERATION，807px）声明为顶层
 *      section（role:"装饰"，bgPlaceholder:"section-bg-2-3436"）→ 管线当内容区
 *      materialize 成 ContentSection.vue，flex = 807/959 = 0.841，吞掉 84% 高度，
 *      且 5 个图表被塞进去双份渲染；
 *   ② 5 个内容 section 全部锚在 21~30px 的标题条（sub-header/sub-title）上，
 *      真身内容块（1统计 91px / 2charts 131px / 3charts 131px / 5cards 114px /
 *      @echarts/line 141px）就挂在同一父级的正下方，无人认领 → flex 全错
 *      （0.022~0.031，1080p 屏上图表仅 24px 高）。
 *
 * 修复（两条确定性规则，Figma 真值裁决，命名/模型无关）：
 *   R1 背景板/装饰 section 剔除 —— 命中任一即从顶层 sections 移除：
 *      a) 锚节点 type ∈ 装饰形状集合（BOOLEAN_OPERATION/VECTOR/...）；
 *      b) 锚节点名 /^bg(\b|[-_])/i；
 *      c) vision role ∈ {装饰,背景,background,decoration} 且 section 无实质内容
 *        （无 children/body.items —— 卡片语义的 bgPlaceholder 不受影响，卡片有内容）。
 *      面板背景不丢失：旧成功单（4ca879eb）实证 bg 图由 base-panel + 资源挂载链
 *      （mountCardBgGroups/hardConstraints）承接，从不依赖内容 section。
 *   R2 标题条锚点纠偏 —— 锚节点 h ≤ 40px（且 ≤ 父高 15%）且名不含 header/头部语义：
 *      在同父兄弟中找「正下方、高于锚、y < 下一锚 y」的首个节点，把 section 重锚到它
 *      （id/figmaNodeId/bbox/figmaHeightPx 全量改绑，打 reanchoredFrom 标记）。
 *      「标题条 → 紧随其后的内容块」是数据大屏的普适版式；flex 由锚高决定，
 *      锚对了 flex 自然回真值（③ 无需独立代码）。
 *
 * 纯函数、幂等、零 LLM；复用 indexFigmaNodes/getFigmaBox 单一几何源。
 * 触发计数走 meta 出参（调用方打计数行，铁律：零命中也要可见）。
 */
import { indexFigmaNodes, getFigmaBox } from './section-tree.js'

const DECORATIVE_NODE_TYPES = new Set([
  'BOOLEAN_OPERATION',
  'VECTOR',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'STAR',
  'POLYGON',
  'REGULAR_POLYGON',
  'SLICE',
])

const DECOR_ROLES = new Set(['装饰', '背景', 'background', 'decoration', 'decor'])

const BG_NAME_RE = /^bg(\b|[-_])/i

/** 头部语义保护：这些 section 锚在标题条上是**正确**形态，不做 R2 纠偏。 */
const HEADER_NAME_RE = /header|头部|标题|导航|topbar|工具栏/i

/** R2 标题条高度上限（px）——双条件之一，另需 ≤ 父高 15%，双保险防大容器误纠。 */
const TITLE_BAR_MAX_H = 40

function hasRealContent(sec) {
  if (Array.isArray(sec?.children) && sec.children.length > 0) return true
  const body = sec?.body
  if (!body || typeof body !== 'object') return false
  if (Array.isArray(body.items) && body.items.length > 0) return true
  if (Array.isArray(body.children) && body.children.length > 0) return true
  return false
}

/**
 * @param {object} layout - { sections: [] }（vision 布局槽）
 * @param {object} figmaData - Figma 节点树
 * @param {object} [meta] - 出参计数：{ removed: string[], reanchored: Array<{from,to}> }
 * @returns {object} 新 layout（不改入参；sections 为新数组，section 对象尽量原样透传）
 */
export function sanitizeVisionSections(layout, figmaData, meta = null) {
  if (!layout || typeof layout !== 'object') return layout
  const sections = Array.isArray(layout.sections) ? layout.sections : []
  if (sections.length === 0 || !figmaData) return layout

  const index = indexFigmaNodes(figmaData.document || figmaData)
  if (index.size === 0) return layout

  const recordOf = (sec) => {
    const id = sec?.figmaNodeId || sec?.id
    if (id == null) return null
    return index.get(String(id)) || null
  }
  const removedIds = new Set()

  // ── R1：背景板/装饰 section 剔除 ─────────────────────────────────────
  for (const sec of sections) {
    const rec = recordOf(sec)
    const role = String(sec?.role || '').trim().toLowerCase()
    const decorByRole = DECOR_ROLES.has(role) && !hasRealContent(sec)
    const hit =
      (rec && (DECORATIVE_NODE_TYPES.has(rec.type) || BG_NAME_RE.test(rec.name))) || decorByRole
    if (!hit) continue
    removedIds.add(String(sec.id))
    if (meta && !meta.removed.includes(String(sec.id))) {
      meta.removed.push(String(sec.id))
    }
  }

  const kept = sections.filter((s) => !removedIds.has(String(s.id)))

  // ── R2：标题条锚点纠偏 ──────────────────────────────────────────────
  // 真实树两种版式（f3085ec6 实测坐标）：
  //   a) 组内标题：sub-title(2:7625, h21) 是 2charts(1744:127, h131) 的**内部首子**
  //      → 重锚到父块（父块不含其他 section 锚才允许，防把 stats 锚到整根 slot-con）；
  //   b) 独立标题条：0sub-header(88:32) 与 1统计(2:3660) 是 slot-con 的**并列兄弟**
  //      → 重锚到「正下方、更高、不越过下一锚」的首个兄弟。
  // 边界（nextAnchorY）一律用纠偏前的锚集合计算，一轮内不级联。
  const anchorBoxes = new Map() // section -> box|null（纠偏前快照）
  for (const sec of kept) {
    const rec = recordOf(sec)
    anchorBoxes.set(sec, rec ? getFigmaBox(rec) : null)
  }
  const chainContains = (recId, ancestorId) => {
    let cur = index.get(String(recId))
    const guard = new Set()
    while (cur && cur.parentId && !guard.has(cur.id)) {
      guard.add(cur.id)
      if (String(cur.parentId) === String(ancestorId)) return true
      cur = index.get(String(cur.parentId))
    }
    return false
  }
  const isDecorRecord = (rec) =>
    !!rec && (DECORATIVE_NODE_TYPES.has(rec.type) || BG_NAME_RE.test(rec.name))
  const reanchored = []
  for (const sec of kept) {
    const box = anchorBoxes.get(sec)
    if (!box || !box.h) continue
    if (box.h > TITLE_BAR_MAX_H) continue
    if (HEADER_NAME_RE.test(String(sec.name || ''))) continue
    const rec = recordOf(sec)
    if (!rec || !rec.parentId) continue
    const parent = index.get(rec.parentId)
    if (!parent) continue
    const parentBox = getFigmaBox(parent)
    // 锚相对父高 >25% ⇒ 不是标题条比例（普通内容块），不纠偏
    // （组内标题实测 21/131=16% 须放行；0.15 会误杀，f3085ec6 spec 钉）
    if (parentBox && parentBox.h && box.h > parentBox.h * 0.25) continue

    const otherAnchors = [...anchorBoxes].filter(([s]) => s !== sec)
    let target = null

    // 策略 a：父块优先 —— 锚是父块的首部标题（父块不含任何其他 section 锚）
    if (!isDecorRecord(parent) && parentBox && parentBox.h > box.h) {
      // 占用判定：其他锚的祖先链包含父块 ⇒ 父块是公共容器，不可作目标
      const occupiedByChain = kept.some((s) => {
        if (s === sec) return false
        const oRec = recordOf(s)
        return oRec ? chainContains(oRec.id, parent.id) : false
      })
      const anchorAtTop = box.y <= (parentBox.y || 0) + parentBox.h * 0.5
      if (!occupiedByChain && anchorAtTop) {
        target = { rec: parent, box: parentBox }
      }
    }

    // 策略 b：兄弟回退 —— 正下方首个更高兄弟，且不越过下一锚 y
    if (!target) {
      let nextAnchorY = Infinity
      for (const [other, oBox] of otherAnchors) {
        if (!oBox) continue
        if (oBox.y > box.y && oBox.y < nextAnchorY) nextAnchorY = oBox.y
      }
      const siblings = (parent.rawNode?.children || [])
        .map((c) => index.get(String(c.id)))
        .filter(Boolean)
        .sort((a, b) => (getFigmaBox(a)?.y || 0) - (getFigmaBox(b)?.y || 0))
      for (const sib of siblings) {
        if (sib.id === rec.id) continue
        if (isDecorRecord(sib)) continue
        if (kept.some((s) => s !== sec && String(s.figmaNodeId || s.id) === sib.id)) continue
        const sibBox = getFigmaBox(sib)
        if (!sibBox || !sibBox.h) continue
        if (sibBox.h <= box.h) continue
        if (sibBox.y < box.y + box.h - 2) continue // 非正下方（重叠/同条）
        if (sibBox.y >= nextAnchorY) continue // 越过下一区块 ⇒ 不属于本段
        target = { rec: sib, box: sibBox }
        break // 取 y 序首个（标题紧邻的内容块）
      }
    }
    if (!target) continue

    const fromId = String(sec.id)
    sec.id = target.rec.id
    sec.figmaNodeId = target.rec.id
    const raw = target.rec.rawNode
    if (raw?.absoluteBoundingBox) sec.absoluteBoundingBox = raw.absoluteBoundingBox
    if (sec.styles && typeof sec.styles === 'object') {
      sec.styles.figmaHeightPx = target.box.h
    }
    if (!sec.reanchoredFrom) sec.reanchoredFrom = fromId
    if (meta && !meta.reanchored.some((r) => r.from === fromId)) {
      meta.reanchored.push({ from: fromId, to: target.rec.id })
    }
    reanchored.push(sec)
    anchorBoxes.set(sec, target.box) // 后续 section 的边界用新锚算
  }

  if (removedIds.size === 0 && reanchored.length === 0) return layout
  return { ...layout, sections: kept }
}

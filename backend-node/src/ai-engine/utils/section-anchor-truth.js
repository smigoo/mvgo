/**
 * section-anchor-truth.js —— 视觉 section 的「Figma 锚点」真值审计（纯函数、零业务依赖）。
 *
 * 🔴 背景（2026-10-21 · c-d79b-66d79bff「合作厂商弹窗」实锤）：
 *   Vision 给 section 写的 `id` 是**自由文本**，可以出现三种形态：
 *     ① 语义 id（`section-cards`，合法）
 *     ② Figma 形态的**幻觉 id**（`38:3258` —— 树里确实存在，但它是普通段里的「鲁邦通」TEXT）
 *     ③ `figmaNodeId` 指向不存在的节点
 *   ②最危险：它**查得到几何**，于是 `sectionY` 排序、同区域判定、祖先回溯全部拿到一个
 *   语义无关的坐标 —— 表现为「卡片被排到整页最底部」这类"能跑但全错"的症状。
 *
 * 判据（刻意做成**类型无关、命名无关**）：
 *   一个 section 的锚点，必须是它**自己的内容（直接子级引用的 Figma 节点）的祖先**。
 *   否则无论它是 TEXT / VECTOR / 别的什么，锚点都不可信 —— 不需要猜节点类型白名单。
 *
 * 修复（只增不改）：把修正后的锚点写到**新字段** `figmaAnchorId`（最近公共祖先 LCA），
 *   **绝不改写 `id` / `figmaNodeId`**。原因：`subcomponent-planner` 用
 *   `String(s.figmaNodeId || s.id)` 作为 `heightById` / `visionSemantic` 的 key，
 *   改这两个字段会让既有查找静默落空（典型案例：白名单重建剥字段，见 memory #123/#127/#138）。
 *
 * 幂等：判定用 `figmaAnchorId || figmaNodeId || id` 作为"当前声明锚点"，修复后再次运行
 *   会以 `figmaAnchorId` 为准 ⇒ 无 issue、无新 fix。
 *
 * fail-open：section 没有可回指的直接子级引用 ⇒ **不判**（无真值不判，避免臆造）。
 */
import { indexFigmaNodes, getFigmaBox } from './section-tree.js'

/** Figma 节点 id 形态（`12:345`）—— 只有这种形态才是在「宣称自己是 Figma 节点」 */
export const FIGMA_ID_RE = /^\d+:\d+$/

/**
 * 收集 section **直接子级**引用的 Figma 节点 id。
 *
 * 只认 `figmaNode` / `figmaNodeId` / 形如 `12:345` 的 `id`；`section.id` 本身不作引用
 * （它可能是语义名或幻觉 id）。`id` 字段在视觉输出里常被用来放真实节点 id
 * （如 stat-card 的子项 `{ "id": "38:3260" }`），所以必须收。
 */
export function collectSectionFigmaRefs(section) {
  const refs = new Set()
  if (!section || typeof section !== 'object') return refs
  const kids = [
    ...(Array.isArray(section.children) ? section.children : []),
    ...(Array.isArray(section.body?.children) ? section.body.children : []),
  ]
  for (const kid of kids) {
    if (!kid || typeof kid !== 'object') continue
    for (const key of ['figmaNode', 'figmaNodeId', 'id']) {
      const v = kid[key]
      if (typeof v === 'string' && FIGMA_ID_RE.test(v)) refs.add(v)
    }
  }
  return refs
}

/** id 的祖先链（含自身），做环保护 */
function ancestorChain(index, id) {
  const chain = []
  let cur = index.get(String(id)) || null
  let guard = 0
  while (cur && guard++ < 128) {
    chain.push(String(cur.id))
    cur = cur.parentId != null ? index.get(String(cur.parentId)) || null : null
  }
  return chain
}

/** ancestorId 是否为 id 的祖先（含自身） */
function isAncestorOrSelf(index, ancestorId, id) {
  return ancestorChain(index, id).includes(String(ancestorId))
}

/** 一组节点的最近公共祖先（无法确定 ⇒ null） */
function lowestCommonAncestor(index, ids) {
  const lists = []
  for (const id of ids) {
    const chain = ancestorChain(index, id)
    if (chain.length > 0) lists.push(chain)
  }
  if (lists.length === 0) return null
  for (const candidate of lists[0]) {
    if (lists.every((chain) => chain.includes(candidate))) return candidate
  }
  return null
}

/**
 * 审计并修复 section 锚点。
 *
 * @param {Array<object>} sections 视觉结构表（`layout.sections`）
 * @param {object} figmaRoot Figma 节点树（可传 `{document}` 包装或 document 本体）
 * @returns {{issues:Array, fixes:Array, stats:{judged:number, repaired:number}}}
 *   issues: `{ sectionId, anchorId, kind, refs, detail }`
 *   fixes:  `{ sectionId, from, to, reason }`
 */
export function auditSectionAnchors(sections, figmaRoot) {
  const root = (figmaRoot && (figmaRoot.document || figmaRoot)) || null
  const index = indexFigmaNodes(root)
  const issues = []
  const fixes = []
  if (!index.size || !Array.isArray(sections)) {
    return { issues, fixes, stats: { judged: 0, repaired: 0 } }
  }

  let judged = 0

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const refs = collectSectionFigmaRefs(section)
    if (refs.size === 0) continue // 无真值不判

    // 当前声明的锚点：修复产物优先（幂等锚点）
    const repaired = typeof section.figmaAnchorId === 'string' ? section.figmaAnchorId.trim() : ''
    const explicit = typeof section.figmaNodeId === 'string' ? section.figmaNodeId.trim() : ''
    const rawId = typeof section.id === 'string' ? section.id.trim() : ''
    const claimed = repaired || explicit || (FIGMA_ID_RE.test(rawId) ? rawId : '')

    // 语义 id（如 `section-cards`）是合法的，不算锚点声明 ⇒ 不判
    if (!claimed) continue
    judged += 1

    const sectionId = rawId || explicit || repaired
    const anchor = index.get(claimed) || null
    let kind = ''
    let detail = ''

    if (!anchor) {
      kind = 'anchor-unknown'
      detail = `锚点 ${claimed} 不在 Figma 树中`
    } else if (![...refs].every((ref) => isAncestorOrSelf(index, claimed, ref))) {
      const outside = [...refs].filter((ref) => !isAncestorOrSelf(index, claimed, ref))
      kind = 'anchor-not-ancestor'
      detail = `锚点 ${claimed}(${anchor.type || '?'} ${anchor.name || ''}) 不是其内容 ${outside.join(',')} 的祖先`
    }

    if (!kind) continue

    const issue = { sectionId, anchorId: claimed, kind, refs: [...refs], detail }
    issues.push(issue)

    const lca = lowestCommonAncestor(index, [...refs])
    if (lca && lca !== claimed && index.has(lca)) {
      section.figmaAnchorId = lca
      fixes.push({ sectionId, from: claimed, to: lca, reason: kind })
    }
  }

  return { issues, fixes, stats: { judged, repaired: fixes.length } }
}

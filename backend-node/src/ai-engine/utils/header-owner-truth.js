/**
 * header-owner-truth.js — header 归属「单一事实源」（2026-11-15 · mc-max-1794749284344-c5e0aadc 实锤）
 *
 * 病灶（用户原话：「有的不是插槽进入了头部，有的是，却留在了内容区域」）：
 *   同一张设计稿的头部归属有四处独立判据、互不校验，任一环判错即双向错位——
 *   ① `header-slot-validator#deriveHeaderSlotsFromFigma`（按**图层名**找 header 容器）；
 *   ② vision 的 `headerRelation` / `header.controls`（采样 LLM，非确定）；
 *   ③ `chrome-section-filter#isChromeOnlySection`（只认 title-* 关系与 controls）；
 *   ④ `resource-mounter#ensureHeaderSlots` 的 P1-3 去重（只看文本是否出现过）。
 *   c5e0aadc 实锤：vision 把 `GROUP 'header'` 标成 `content-below-title` 且 `controls=[]`
 *   ⇒ ③ 不剥离、②无可消费；② 契约侧其实已正确推导 3 条 header-right；
 *   ⇒ ④ 因模型把这些文本写进了内容区 section 而判「重复」跳过注入；
 *   ⇒ 真插槽留在内容区；同时该 section 只分到 30px（Figma 高 30.09）却塞 3 组统计，
 *     主轴又被刀 56 判成 column（装饰圆点算进 y 带）⇒ 溢出 12px 压住下方 switch 条，
 *     视觉上「不是插槽的东西进了头部」。
 *
 * ── 判据（结构锚 + 无量纲几何；零图层名、零绝对像素）─────────────────────────
 *   T  标题锚：root 顶部 `TITLE_BAND_RATIO` 带内的 TEXT，按 (fontSize desc, x asc) 取第一条。
 *   O  owner：标题 TEXT 向上回溯到「其父即 root」的那个祖先 —— **纯结构关系，
 *      不看图层名**（Figma 里叫 header / 头部 / 顶部栏 / 随便什么，结论一致）。
 *   Ⓐ owner 有有效 bbox；
 *   Ⓑ owner 高 / root 高 ≤ `MAX_HEIGHT_RATIO`（头部是薄条，防把整块内容误判成头部）；
 *   Ⓒ |owner.top − root.top| / root 高 ≤ `TOP_TOL_RATIO`（贴顶，无量纲）；
 *   Ⓓ owner 宽 / root 宽 ≥ `MIN_WIDTH_RATIO`（头部横贯面板）；
 *   Ⓔ 无标题锚时回退：root 直系子节点中满足 Ⓐ~Ⓓ 且子树内含 TEXT 者；
 *      命中多个 ⇒ 优先包含标题锚的那个，否则 `ambiguous=true` 且返回 null（fail-open）。
 *   缺失/不满足 ⇒ 返回 null，调用方保持旧行为（fail-open、零副作用）。
 *
 * ── vision 的角色 ───────────────────────────────────────────────────────────
 *   只作**旁证**，不作判定：`summarizeVisionAgreement()` 把 vision 的
 *   `headerRelation`/`header.controls` 与 owner 对账，输出 agree / disagree / absent，
 *   供调用方打计数行（可辩驳、可回归归因）。实测 2120 份分析中同一节点
 *   `2:8419` 出现过 5 种标签 ⇒ 采样标签不能当事实源。
 *
 * 纯函数、零 IO、零 import：可单测、可被 graph/engineer/validator 多处共用。
 */

export const HEADER_OWNER_TITLE_BAND_RATIO = 0.2
export const HEADER_OWNER_MAX_HEIGHT_RATIO = 0.25
export const HEADER_OWNER_TOP_TOL_RATIO = 0.02
export const HEADER_OWNER_MIN_WIDTH_RATIO = 0.5

/** vision 中「承认这是头部」的关系词表（与 headerRelation 字面一一对应）。 */
export const HEADER_RELATION_AGREE_SET = new Set([
  'title-itself',
  'panel-title',
  'title-note',
  'sub-header',
  'header-only',
  'title-same-row',
])

function boxOf(node) {
  const b = node?.absoluteBoundingBox || node?.bbox
  if (!b || typeof b !== 'object') return null
  const x = Number(b.x)
  const y = Number(b.y)
  const w = Number(b.width)
  const h = Number(b.height)
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null
  if (w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

/** 支持裸 root / { document } / { nodes: { key: { document } } } 三种既有入参形态。 */
function unwrapRoot(figmaRoot) {
  if (!figmaRoot || typeof figmaRoot !== 'object') return null
  if (Array.isArray(figmaRoot.children)) return figmaRoot
  const doc = figmaRoot.document
  if (doc && Array.isArray(doc.children)) return doc
  const nodes = figmaRoot.nodes
  if (nodes && typeof nodes === 'object') {
    for (const entry of Object.values(nodes)) {
      const d = entry?.document
      if (d && Array.isArray(d.children)) return d
    }
  }
  return null
}

function indexTree(root) {
  const nodes = []
  const parentOf = new Map()
  const byId = new Map()
  const walk = (node, parentId) => {
    if (!node || typeof node !== 'object') return
    const id = String(node.id ?? '')
    if (id) {
      parentOf.set(id, parentId)
      byId.set(id, node)
    }
    nodes.push(node)
    for (const child of node.children || []) walk(child, id || parentId)
  }
  walk(root, null)
  return { nodes, parentOf, byId }
}

function textNodesUnder(node) {
  const out = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'TEXT' && String(n.characters ?? '').trim() !== '') out.push(n)
    for (const c of n.children || []) walk(c)
  }
  walk(node)
  return out
}

function fontSizeOf(node) {
  const raw = node?.style?.fontSize
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function subtreeIdsOf(node) {
  const ids = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.id) ids.push(String(n.id))
    for (const c of n.children || []) walk(c)
  }
  walk(node)
  return ids
}

function metricsOf(owner, rootBox) {
  const box = boxOf(owner)
  if (!box || !rootBox) return null
  return {
    rootWidth: rootBox.w,
    rootHeight: rootBox.h,
    ownerWidth: box.w,
    ownerHeight: box.h,
    widthRatio: Number((box.w / rootBox.w).toFixed(4)),
    heightRatio: Number((box.h / rootBox.h).toFixed(4)),
    topDeltaRatio: Number(((box.y - rootBox.y) / rootBox.h).toFixed(4)),
  }
}

function ownerPassesGeometry(owner, rootBox) {
  const m = metricsOf(owner, rootBox)
  if (!m) return { pass: false, metrics: null, reason: 'no-box' }
  if (m.heightRatio > HEADER_OWNER_MAX_HEIGHT_RATIO) return { pass: false, metrics: m, reason: 'too-tall' }
  if (Math.abs(m.topDeltaRatio) > HEADER_OWNER_TOP_TOL_RATIO) return { pass: false, metrics: m, reason: 'not-top' }
  if (m.widthRatio < HEADER_OWNER_MIN_WIDTH_RATIO) return { pass: false, metrics: m, reason: 'too-narrow' }
  return { pass: true, metrics: m, reason: 'ok' }
}

function buildResult(owner, { root, rootBox, titleNode, source, candidateCount, ambiguous, index }) {
  const metrics = metricsOf(owner, rootBox)
  const memberIds = (owner.children || []).map((c) => String(c.id ?? '')).filter(Boolean)
  return {
    ownerId: String(owner.id ?? ''),
    ownerType: String(owner.type ?? ''),
    ownerName: String(owner.name ?? ''),
    rootId: String(root.id ?? ''),
    titleNodeId: titleNode ? String(titleNode.id ?? '') : null,
    titleText: titleNode ? String(titleNode.characters ?? '') : null,
    memberIds,
    subtreeIds: subtreeIdsOf(owner),
    metrics,
    source,
    candidateCount,
    ambiguous: !!ambiguous,
  }
}

/**
 * 解析 header 归属（单一事实源）。
 * @param {object} figmaRoot Figma 节点树（裸 root / {document} / {nodes}）
 * @param {{ titleBandRatio?: number, maxHeightRatio?: number, topTolRatio?: number, minWidthRatio?: number }} [options]
 * @returns {null | {ownerId:string, ownerType:string, ownerName:string, rootId:string,
 *   titleNodeId:string|null, titleText:string|null, memberIds:string[], subtreeIds:string[],
 *   metrics:object|null, source:'title-anchor'|'top-band', candidateCount:number, ambiguous:boolean}}
 */
export function resolveHeaderOwner(figmaRoot, options = {}) {
  let root = unwrapRoot(figmaRoot)
  if (!root) return null
  // 几何坐标系归一：`{document: FRAME}`（缓存）与 `{document: DOCUMENT → FRAME}`（原始 API）
  // 两种形态都要对。DOCUMENT 自身无 bbox ⇒ 唯一带 bbox 的直系子节点即面板根，逐层下探。
  let guardDown = 0
  while (!boxOf(root) && guardDown < 4) {
    const withBox = (root.children || []).filter((c) => boxOf(c))
    if (withBox.length !== 1) return null
    root = withBox[0]
    guardDown += 1
  }
  const rootBox = boxOf(root)
  if (!rootBox) return null

  const titleBandRatio = Number.isFinite(Number(options.titleBandRatio))
    ? Number(options.titleBandRatio)
    : HEADER_OWNER_TITLE_BAND_RATIO

  const { nodes, parentOf, byId } = indexTree(root)

  // T. 标题锚：顶部带内、字号最大（同字号取最左）
  const bandLimit = rootBox.y + rootBox.h * titleBandRatio
  const titleCandidates = []
  for (const n of nodes) {
    if (n.type !== 'TEXT') continue
    if (String(n.characters ?? '').trim() === '') continue
    const b = boxOf(n)
    if (!b) continue
    if (b.y < rootBox.y || b.y > bandLimit) continue
    if (b.x + b.w < rootBox.x || b.x > rootBox.x + rootBox.w) continue
    titleCandidates.push({ node: n, box: b, fs: fontSizeOf(n) })
  }
  titleCandidates.sort((a, b) => (b.fs - a.fs) || (a.box.x - b.box.x))
  const titleAnchor = titleCandidates.length > 0 ? titleCandidates[0].node : null

  // O. owner = 标题向上「其父即 root」的祖先（纯结构，不看名字）
  if (titleAnchor) {
    let curId = String(titleAnchor.id ?? '')
    let guard = 0
    while (curId && guard < 64) {
      const parentId = parentOf.get(curId)
      if (!parentId || parentId === String(root.id ?? '')) break
      curId = parentId
      guard += 1
    }
    const ownerNode = curId && parentOf.get(curId) === String(root.id ?? '') ? byId.get(curId) : null
    // 标题直接挂在 root 下 ⇒ owner 就是标题自己 ⇒ 没有 header 容器，走回退
    if (ownerNode && ownerNode !== titleAnchor) {
      const g = ownerPassesGeometry(ownerNode, rootBox)
      const texts = textNodesUnder(ownerNode)
      if (g.pass && texts.length > 0) {
        return buildResult(ownerNode, {
          root,
          rootBox,
          titleNode: titleAnchor,
          source: 'title-anchor',
          candidateCount: 1,
          ambiguous: false,
          index: { parentOf, byId },
        })
      }
    }
  }

  // Ⓔ 回退：root 直系子节点中，贴顶 + 薄条 + 横贯 + 含文本
  const candidates = []
  for (const child of root.children || []) {
    const g = ownerPassesGeometry(child, rootBox)
    if (!g.pass) continue
    const texts = textNodesUnder(child)
    if (texts.length === 0) continue
    candidates.push({ node: child, texts, metrics: g.metrics })
  }
  if (candidates.length === 0) return null

  if (candidates.length > 1) {
    const withTitle = titleAnchor
      ? candidates.filter((c) => c.texts.some((t) => String(t.id ?? '') === String(titleAnchor.id ?? '')))
      : []
    if (withTitle.length === 1) {
      return buildResult(withTitle[0].node, {
        root,
        rootBox,
        titleNode: titleAnchor,
        source: 'top-band',
        candidateCount: candidates.length,
        ambiguous: false,
        index: { parentOf, byId },
      })
    }
    // 多候选且无法归因 ⇒ fail-open（调用方保持旧行为），但把事实登记出来
    return {
      ownerId: null,
      ownerType: '',
      ownerName: '',
      rootId: String(root.id ?? ''),
      titleNodeId: titleAnchor ? String(titleAnchor.id ?? '') : null,
      titleText: titleAnchor ? String(titleAnchor.characters ?? '') : null,
      memberIds: [],
      subtreeIds: [],
      metrics: null,
      source: 'top-band',
      candidateCount: candidates.length,
      ambiguous: true,
    }
  }

  return buildResult(candidates[0].node, {
    root,
    rootBox,
    titleNode: titleAnchor,
    source: 'top-band',
    candidateCount: 1,
    ambiguous: false,
    index: { parentOf, byId },
  })
}

/**
 * vision 旁证对账（只记账，不改判）。
 * @param {object|null} owner resolveHeaderOwner 的返回值
 * @param {Array<{id?:string, name?:string, headerRelation?:string, header?:{controls?:Array}}>} sections
 * @returns {{verdict:'agree'|'disagree'|'absent'|'no-owner', relation:string, controls:number, sectionName:string}}
 */
export function summarizeVisionAgreement(owner, sections) {
  const list = Array.isArray(sections) ? sections : []
  if (!owner || !owner.ownerId) {
    return { verdict: 'no-owner', relation: '', controls: 0, sectionName: '' }
  }
  const hit = list.find((s) => String(s?.id ?? '') === String(owner.ownerId))
  if (!hit) return { verdict: 'absent', relation: '', controls: 0, sectionName: '' }
  const relation = String(hit.headerRelation ?? '').trim().toLowerCase()
  const controls = Array.isArray(hit?.header?.controls) ? hit.header.controls.length : 0
  const agree = HEADER_RELATION_AGREE_SET.has(relation) || controls > 0
  return {
    verdict: agree ? 'agree' : 'disagree',
    relation: relation || '(none)',
    controls,
    sectionName: String(hit.name ?? ''),
  }
}

/** 按 id 在树中取节点（供消费方把 ownerId 还原成容器节点）。 */
export function findNodeByIdInTree(figmaRoot, nodeId) {
  const root = unwrapRoot(figmaRoot)
  const id = String(nodeId ?? '')
  if (!root || !id) return null
  const stack = [root]
  while (stack.length > 0) {
    const n = stack.pop()
    if (!n || typeof n !== 'object') continue
    if (String(n.id ?? '') === id) return n
    for (const c of n.children || []) stack.push(c)
  }
  return null
}

/** 一步拿到 owner 与容器节点：`{ owner, node }`；owner 无效时 node 为 null。 */
export function findHeaderOwnerNode(figmaRoot, options = {}) {
  const owner = resolveHeaderOwner(figmaRoot, options)
  if (!owner || !owner.ownerId) return { owner, node: null }
  return { owner, node: findNodeByIdInTree(figmaRoot, owner.ownerId) }
}

/** 判定某节点是否落在 owner 子树内（供 T09 去重门禁 / 接管复用）。 */
export function isInHeaderOwnerSubtree(owner, nodeId) {
  if (!owner || !nodeId) return false
  const id = String(nodeId)
  if (!id) return false
  if (owner.ownerId && id === String(owner.ownerId)) return true
  return Array.isArray(owner.subtreeIds) && owner.subtreeIds.includes(id)
}

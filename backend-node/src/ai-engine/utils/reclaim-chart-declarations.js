/**
 * 🛡️ 步骤 1（2026-11-15 · mc-max-1794752955560-c0cb00f1 实锤）：回收 chart 声明归一
 *
 * ## 断点（治理对象 = 契约层双轨，不是某一行写错）
 * 上游 `container-rebuilder.js` 用 `section.children` 表达「这个段里还有内容」，把
 * 折线子段 `2:3573` 挂成回收子段（`reclaimedChildren`）；下游主内容轨却是
 * `body.children` / 其派生视图 `declaredContent`（`generation-context-assembler.js:241`
 * 的 `normalizeBodyContract` 只读 `body.items / body.children / body.elements`）。
 * `subcomponent-planner.js:2425` 叶子分支为防树爆炸只放行 `collapsed` / `v-for` 子段，
 * **没给「含真值内容的回收子段」留守恒通道** ⇒ 只要视觉把图表建模成回收子段，就静默丢。
 * 本单两个柱状图活着，只因为它们的声明恰好在 `body.children` 轨上。
 *
 * ## 本修复器做什么（统一表示轨 = 归一，不是补丁式放行白名单）
 * 把「回收轨里已声明、但主轨没有」的 chart 声明**搬运**进宿主段的 `body.children`
 * （与两个存活柱状图同一条主轨），assembler 的 `declaredContent` 会自动派生带上。
 * ⚠️ 步骤 0 配方写 `targetMount='declaredContent.children'` 是**观测层视角**：核查后确认
 *    `declaredContent` 是 assembler 的派生键，planner 直写会被 `normalizeSectionNode`
 *    白名单重建覆盖；在 planner 新造该字段反而是第三条轨。故实现层落点为 `body.children`，
 *    「既有 body 字段逐字不动、只在内容数组末尾追加」由本模块与 spec 深等于断言共同保证。
 *
 * ## 判据（结构事实 / 单一来源 / 零命名 / 零硬编码 px）
 * ① 视觉侧：宿主段的回收子段（`sourceSections[].children`）里存在 chart 声明；
 * ② 主轨侧：同一宿主段 `body.children` 里没有等价声明（按 `figmaNode ?? id` 去重）；
 * ③ 唯一宿主：全批段中「① 且 ②」恰好 1 个（多宿主 = 指空段，绝不猜）；
 * ④ 真值侧（只读 Figma `absoluteBoundingBox`）：段 ref 有 box，`findOwningChartContainer`
 *    上溯到拥有更下方内容的容器，且 `container.bottom − ref.top > ref.h × 2`；
 * ⑤ 真值唯一面板：该容器**直接子节点**中位于标题条下方、且未被任何段主轨引用的
 *    节点恰好 1 个（本单 = `2:3604 @echarts/line-7`, y764.3 h140.7）；
 * ⑥ 五条全中才搬运；任一不中 ⇒ 原样返回 + `skippedReason`（fail-open）。
 * 🔴 不读 `name` / `type` 语义做命中裁决、不读模型自报 `geometryPx`、不读观测器的
 *    conserved 结论；chart 声明形态识别只由共享 `chart-declaration-truth.js` 提供。
 *
 * ## 纪律
 * - 纯函数：不改入参、不改 `sourceSections` / `figmaNodeData`；命中段浅拷贝后写回。
 * - 幂等：主轨已有等价声明 ⇒ 不再追加（`skippedReason='already-present'`）。
 * - 纯附加：既有 `body` 键与既有内容节点逐字保留，只追加新节点 + `chartReclaim` 配方。
 * - 不改段高 / flex / G02「无宿主不注入」禁令；不新建宿主段（防臆造图表复活）。
 * - 恒打计数行：调用方无论命中与否一律打 stats（0 也打）。
 */
import { indexCoverageTree } from './section-plan-coverage.js'
import {
  boxOfNode, findOwningChartContainer, isChartDeclarationShape,
  TAIL_CHART_MIN_HEIGHT_RATIO,
} from './chart-declaration-truth.js'

export const CHART_RECLAIM_VERSION = 'step1-20261115'

/** 规格 / 几何 / 另一条轨，不是「段内容声明」，扫进去必然假绿。 */
const SKIP_KEYS = new Set([
  'chartSpec', 'internalSubcomponents', 'internalGeometry', 'layoutMetadata',
  'styles', 'absoluteBoundingBox', 'figmaBox', 'sourceNodeIds', 'rowPeerIds',
  'itemSkeleton', 'recipes', 'heightOwnership', 'chartReclaim', 'themeVars',
  'elementStyleMap',
])
const CONTENT_ARRAY_KEYS = ['children', 'items', 'elements', 'parts']
const MAX_DEPTH = 10

/** 声明必须能指向一个节点（id / figmaNode / name），纯 `{type:'line'}` 规格不算挂载声明。 */
function isChartDecl(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const isNode = 'id' in obj || 'figmaNode' in obj || 'name' in obj
  return isNode && isChartDeclarationShape(obj)
}

function declKey(obj) {
  return String(obj?.figmaNode ?? obj?.id ?? obj?.name ?? '')
}

/** 限定挂载点扫描（不递归整段对象），与观测器的全对象递归是两套独立实现。 */
function collectChartDecls(roots) {
  const found = new Map()
  const seen = new Set()
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > MAX_DEPTH || seen.has(o)) return
    seen.add(o)
    if (Array.isArray(o)) {
      for (const x of o) walk(x, depth + 1)
      return
    }
    if (isChartDecl(o)) {
      const key = declKey(o)
      if (key && !found.has(key)) found.set(key, o)
      return
    }
    for (const k of Object.keys(o)) {
      if (SKIP_KEYS.has(k)) continue
      walk(o[k], depth + 1)
    }
  }
  for (const root of roots) if (root) walk(root, 0)
  return found
}

/** 宿主段主内容轨：body / declaredContent / children / 控件。 */
function mainTrackRoots(section) {
  return [
    ...CONTENT_ARRAY_KEYS.map((k) => section?.body?.[k]),
    ...CONTENT_ARRAY_KEYS.map((k) => section?.declaredContent?.[k]),
    section?.children,
    section?.header?.controls,
    section?.controls,
  ]
}

/** 回收轨：只认 `children` 里的回收子段，不认 `reclaimedChildren`（那是 id 字符串数组）。 */
function reclaimedTrackRoots(sourceSection) {
  const kids = Array.isArray(sourceSection?.children) ? sourceSection.children : []
  const roots = []
  for (const kid of kids) {
    if (!kid || typeof kid !== 'object') continue
    for (const k of CONTENT_ARRAY_KEYS) {
      if (Array.isArray(kid?.body?.[k])) roots.push(kid.body[k])
      if (Array.isArray(kid?.declaredContent?.[k])) roots.push(kid.declaredContent[k])
    }
    if (Array.isArray(kid.children)) roots.push(kid.children)
  }
  return roots
}

/** 段 ref 候选：自适应 id / figmaAnchorId / figmaNodeId / sourceNodeIds。 */
function sectionRefCandidates(section) {
  const out = []
  const push = (v) => {
    if (v == null) return
    const s = String(v)
    if (s && !out.includes(s)) out.push(s)
  }
  push(section?.figmaAnchorId)
  push(section?.figmaNodeId)
  push(section?.id)
  for (const n of Array.isArray(section?.sourceNodeIds) ? section.sourceNodeIds : []) push(n)
  return out
}

/**
 * 真值唯一面板：容器内、标题条下方、未被任何段主轨引用的直接子节点恰好 1 个。
 * 纯几何，零命名 / 零 type 语义。
 */
function findUniqueTruthPanel(tree, refId, refBox, usedRefs) {
  const container = findOwningChartContainer(tree, refId, refBox)
  if (!container) return null
  const truthHeightPx = Math.round(container.box.bottom - refBox.top)
  if (!(truthHeightPx > refBox.h * TAIL_CHART_MIN_HEIGHT_RATIO)) return null
  const node = tree.byId.get(container.id)
  const kids = Array.isArray(node?.children) ? node.children : []
  const candidates = []
  for (const kid of kids) {
    const kb = boxOfNode(kid)
    if (!kb) continue
    if (!(kb.top >= refBox.bottom - 1) || !(kb.bottom > refBox.bottom)) continue
    const id = String(kid?.id ?? '')
    if (id && usedRefs.has(id)) continue
    candidates.push({ id, box: kb })
  }
  if (candidates.length !== 1) return null
  return {
    containerId: container.id,
    truthPanelId: candidates[0].id,
    truthPanelBox: candidates[0].box,
    truthHeightPx,
    formula: 'container.absoluteBoundingBox.bottom - ref.absoluteBoundingBox.top',
  }
}

/**
 * @param {{sections?:Array<object>, sourceSections?:Array<object>, figmaNodeData?:object}} input
 * @returns {{sections:Array<object>, stats:{...}}} 纯附加；未命中段保持同一引用。
 */
export function reclaimChartDeclarations({ sections, sourceSections, figmaNodeData } = {}) {
  const stats = {
    version: CHART_RECLAIM_VERSION,
    evaluated: Array.isArray(sections) ? sections.length : 0,
    sourceMatched: 0,
    reclaimedDeclarations: 0,
    hostCandidates: 0,
    truthPanels: 0,
    attached: 0,
    skipped: false,
    skippedReason: null,
    details: [],
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    stats.skipped = true
    stats.skippedReason = 'no-sections'
    return { sections: sections || [], stats }
  }
  if (!Array.isArray(sourceSections) || sourceSections.length === 0) {
    stats.skipped = true
    stats.skippedReason = 'no-source-sections'
    return { sections, stats }
  }
  const tree = indexCoverageTree(figmaNodeData)
  if (!tree) {
    stats.skipped = true
    stats.skippedReason = 'no-figma-tree'
    return { sections, stats }
  }

  const sourceById = new Map(
    sourceSections
      .filter((s) => s && s.id != null)
      .map((s) => [String(s.id), s]),
  )
  // 全批段主轨 chart 引用（供「真值面板未被占用」判据），独立于观测器取数。
  const mainDeclsBySection = sections.map((s) => collectChartDecls(mainTrackRoots(s)))
  const usedRefs = new Set()
  for (const m of mainDeclsBySection) {
    for (const [key, decl] of m) {
      usedRefs.add(key)
      if (decl?.id != null) usedRefs.add(String(decl.id))
      if (decl?.figmaNode != null) usedRefs.add(String(decl.figmaNode))
    }
  }

  // ① ② 找「回收轨有、主轨没有」的宿主段。
  const candidates = []
  sections.forEach((section, i) => {
    const source = sourceById.get(String(section?.id ?? ''))
    if (!source) return
    stats.sourceMatched += 1
    const reclaimed = collectChartDecls(reclaimedTrackRoots(source))
    if (reclaimed.size === 0) return
    stats.reclaimedDeclarations += reclaimed.size
    const missing = [...reclaimed.entries()].filter(([key]) => !mainDeclsBySection[i].has(key))
    if (missing.length === 0) return // 已归一 ⇒ 幂等
    candidates.push({ index: i, section, missing })
  })

  if (candidates.length === 0) {
    stats.skipped = true
    // 区分「压根没有回收轨 chart」与「已归一（幂等）」：恒打计数行必须可辩驳。
    stats.skippedReason = stats.reclaimedDeclarations === 0
      ? 'no-reclaimed-chart'
      : 'already-present'
    return { sections, stats }
  }
  stats.hostCandidates = candidates.length
  // ③ 唯一宿主：多段同时缺 ⇒ 无法指认归属（指空段 = 没给），绝不猜。
  if (candidates.length !== 1) {
    stats.skipped = true
    stats.skippedReason = 'ambiguous-host'
    return { sections, stats }
  }

  const { index, section, missing } = candidates[0]
  const refs = sectionRefCandidates(section)
  const refId = refs.find((id) => tree.byId.has(id)) || ''
  const refBox = refId ? boxOfNode(tree.byId.get(refId)) : null
  if (!refId || !refBox) {
    stats.skipped = true
    stats.skippedReason = 'no-figma-ref-box'
    return { sections, stats }
  }
  // ④ ⑤ 真值几何唯一面板。
  const panel = findUniqueTruthPanel(tree, refId, refBox, usedRefs)
  if (!panel) {
    stats.skipped = true
    stats.skippedReason = 'no-unique-truth-panel'
    return { sections, stats }
  }
  stats.truthPanels = 1

  // ⑥ 搬运：既有 body 内容逐字保留，只在**既有内容数组**末尾追加；原样克隆声明节点。
  const body = { ...(section.body || {}) }
  const mountKey = CONTENT_ARRAY_KEYS.find((k) => Array.isArray(body[k]))
  const additions = missing.map(([, decl]) => ({ ...decl }))
  body[mountKey || 'children'] = [
    ...(mountKey ? body[mountKey] : []),
    ...additions,
  ]
  const recipe = {
    version: CHART_RECLAIM_VERSION,
    hostSectionId: String(section.id ?? ''),
    refId,
    containerId: panel.containerId,
    truthPanelId: panel.truthPanelId,
    truthHeightPx: panel.truthHeightPx,
    formula: panel.formula,
    targetMount: `body.${mountKey || 'children'}`,
    reclaimedChartIds: additions.map(declKey).filter(Boolean),
    chartTypes: additions.map((d) => String(d?.type ?? d?.role ?? '')).filter(Boolean),
    reason: '回收子段 chart 声明未归一进宿主主内容轨',
  }
  stats.attached = additions.length
  stats.details.push(recipe)

  const out = sections.slice()
  out[index] = {
    ...section,
    body,
    chartReclaim: recipe,
  }
  return { sections: out, stats }
}

export default reclaimChartDeclarations

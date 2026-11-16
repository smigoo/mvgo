/**
 * 🛡️ 步骤 1（2026-11-15 · mc-max-1794752955560-c0cb00f1 实锤）：图表真值**逐条**覆盖判定。
 *
 * ## 断点（第 4 次定性修正后的事实）
 * `chart-section.js#injectChartSectionIfMissing` 的 Figma 兜底通道**一直存在且两个 entry
 * 都已接线**（`mc-component-graph-phase2.js:5189` / `mc-component-graph-vue3.js:2491`），
 * 断的是**开关粒度**：
 *
 *     if (truthDecision.source !== 'figma-fallback') return plan   // chart-section.js:368
 *
 * `resolveChartTruth` 里 `visionPresent = visionCharts.length > 0 || mountedCharts.length > 0`
 * 是**整条通道**的全局开关 —— 本单视觉侧有 3 条 chart ⇒ `source='vision'` ⇒ 直接 return，
 * 下面 `collectEchartsNodes` → `uncoveredNodes`（375 行）根本没执行。
 * 于是「视觉只认领了 3 个图、Figma 真值有 5 个 `@echarts` 节点、plan 只承载 4 个」的差
 * 无人判，第 5 个（`2:3604 @echarts/line-7`，流量预测折线）整段丢失。
 *
 * ## 本模块给什么（只判定，不注入 / 不改 plan）
 * 对每个 Figma `@echarts` 真值节点逐条回答三问：
 *   ① **归属段**：plan 里哪个段拥有它？（锚点 S = 前兄弟 else 父级；宿主 D = 候选真叶子段中
 *      面积最大者；**候选必须唯一**，多候选一律不判 —— 指空段 = 没给，不猜）
 *   ② **是否已承载**：D 的段内容轨是否已声明该图？（自宿主 / 内容轨引用 id ∈ 祖先链 /
 *      内容轨含 chart 形态节点）
 *   ③ **视觉是否佐证**：视觉 `charts[].section`（归一为 Figma id）是否落在 D 的区域里？
 *      —— 无视觉佐证时**不补**，防止把「视觉都没看到的区域」臆造成图表。
 *
 * `needsInjection = 视觉佐证 && 未承载 && 候选唯一 && 未被视觉逐条认领`。
 *
 * ## 实证（离线回放 269 单 / 925 个 `@echarts` 节点）
 * | 判据版本 | 会补 | 假阳性 |
 * |---|---|---|
 * | 朴素「未被承载就补」 | 975 | 极高（好件 `2:3604` 在四支全未被承载） |
 * | + 逐条视觉覆盖 | 14 | 11 |
 * | + 守恒取数门控 | 10 | 7 |
 * | **+ 视觉区域佐证（本模块）** | **2** | **0** |
 * 命中恰好是两支必红单的 `2:3604`（`c0cb00f1` / `0fd2168a`，产物均无 line 图），
 * 两支必绿锚（`3cacdefb` / `9b2ecb41`）与 `97d8dc97` 防假绿锚全部不触发。
 *
 * ## 纪律
 * - 纯函数：不写 plan、不 import logger、不改入参。
 * - 判据单一来源：chart 类型集合 / 声明形态一律 import `chart-declaration-truth.js`，
 *   不得内联副本；Figma 索引复用 `section-tree#indexFigmaNodes`。
 * - ⚠️ 刻意**不用** `sectionAnchorKey` 取段锚：其候选优先级（figmaAnchorId→figmaNodeId→
 *   nodeId→figmaNode→id）与本节实测口径（`sourceNodeIds[0] || id`）不同，
 *   换过去会改几何 → 等于换判据（`90eae287` 段 `2:3559` 的 `sourceNodeIds[0]` 是 `2:3660`）。
 * - ⚠️ 刻意**不用** `collectLeafSections`：它把「有子段但非 layout 容器」的段也算叶子
 *   （`97d8dc97` 的 `89:42 sub-t`），候选集会变；本模块只认**无子段**的真叶子。
 *
 * ## 已知边界（登记为次生缺口，不在本步解决）
 * - 视觉**盲区**（vision 压根没看到该图）+ plan 又丢了段 ⇒ 视觉佐证不成立 ⇒ 不补。
 *   该形态与「视觉看到但 plan 丢段」是两类缺陷，需另立判据。
 * - 多候选宿主（本语料 0 例）一律降级为观测。
 */

import { CHART_TYPES, isChartDeclarationShape, boxOfNode } from './chart-declaration-truth.js'
import { indexFigmaNodes } from './section-tree.js'

export const CHART_TRUTH_COVERAGE_VERSION = 'step1-20261115'

/** Figma 图层里的图表真值标记（沿用 `chart-section.js#collectEchartsNodes` 的口径）。 */
const ECHARTS_NAME_RE = /^@echarts/i

/** 这些键是规格 / 几何 / 另一条轨，不是段内容轨声明，扫进去必然假绿。 */
const SKIP_KEYS = new Set([
  'chartSpec', 'internalSubcomponents', 'internalGeometry', 'layoutMetadata',
  'styles', 'absoluteBoundingBox', 'figmaBox', 'sourceNodeIds', 'rowPeerIds',
  'itemSkeleton', 'recipes', 'heightOwnership', 'chartReclaim', 'themeVars', 'elementStyleMap',
])

const MAX_DEPTH = 12
const MAX_ANCESTOR_GUARD = 40

/** `@echarts/line-7` ⇒ `line`；无名/未知 ⇒ null（只作配方提示，不参与裁决）。 */
function chartTypeHintOf(name) {
  const m = ECHARTS_NAME_RE.exec(String(name || '')) ? String(name).slice(1).split('/')[1] : ''
  if (!m) return null
  const base = String(m).trim().toLowerCase().replace(/-\d+$/, '')
  return CHART_TYPES.has(base) ? base : null
}

/** 段在 Figma 真值里的节点 id（`sourceNodeIds[0] || id`；见文件头「刻意不用 sectionAnchorKey」）。 */
export function sectionTruthRef(section) {
  const ids = section?.sourceNodeIds
  if (Array.isArray(ids) && ids.length > 0 && ids[0] != null && String(ids[0]) !== '') {
    return String(ids[0])
  }
  return section?.id == null || String(section.id) === '' ? null : String(section.id)
}

/** 真叶子段 = **无子段**的段（与 `collectLeafSections` 的装配口径不同，见文件头）。 */
export function collectTerminalSections(sections, acc = []) {
  if (!Array.isArray(sections)) return acc
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue
    const kids = Array.isArray(sec.children) ? sec.children : []
    if (kids.length === 0) acc.push(sec)
    else collectTerminalSections(kids, acc)
  }
  return acc
}

/** 全部段（含非叶子），供 id→ref 归一 / 视觉 section 反查。 */
export function collectAllSections(sections, acc = []) {
  if (!Array.isArray(sections)) return acc
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue
    acc.push(sec)
    collectAllSections(sec.children, acc)
  }
  return acc
}

/** Figma 树索引：byId / parentOf / kidsOf（复用 `indexFigmaNodes`，不自建第三份 walk）。 */
export function buildChartTruthTree(figmaRoot) {
  const index = indexFigmaNodes(figmaRoot)
  const byId = new Map()
  const parentOf = new Map()
  const kidsOf = new Map()
  for (const [id, rec] of index) {
    byId.set(id, {
      id,
      name: rec.name,
      type: rec.type,
      box: boxOfNode(rec.rawNode),
      parentId: rec.parentId == null ? null : String(rec.parentId),
    })
    const kids = Array.isArray(rec.rawNode?.children) ? rec.rawNode.children : []
    kidsOf.set(id, kids.filter((c) => c && c.id != null).map((c) => String(c.id)))
    if (rec.parentId != null) parentOf.set(id, String(rec.parentId))
  }
  return { byId, parentOf, kidsOf }
}

function ancestorsOf(parentOf, nodeId) {
  const out = []
  let cur = parentOf.get(String(nodeId))
  let guard = 0
  while (cur && guard < MAX_ANCESTOR_GUARD) {
    out.push(cur)
    cur = parentOf.get(cur)
    guard += 1
  }
  return out
}

function subtreeOf(kidsOf, nodeId) {
  const out = new Set()
  const stack = [String(nodeId)]
  while (stack.length > 0) {
    const cur = stack.pop()
    if (out.has(cur)) continue
    out.add(cur)
    for (const k of kidsOf.get(cur) || []) stack.push(k)
  }
  return out
}

/** Figma 真值里的 `@echarts` 节点（命中即止，不递归其子树 —— 与 `collectEchartsNodes` 同口径）。 */
export function collectEchartsTruthNodes(figmaRoot) {
  const out = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (ECHARTS_NAME_RE.test(String(node.name || ''))) {
      out.push({
        nodeId: node.id == null ? null : String(node.id),
        name: String(node.name || ''),
        chartType: chartTypeHintOf(node.name),
        box: boxOfNode(node),
      })
      return
    }
    const kids = Array.isArray(node.children) ? node.children : []
    for (const c of kids) walk(c)
  }
  walk(figmaRoot)
  return out.filter((n) => n.nodeId)
}

/**
 * 锚点：`@echarts` 节点在真值树里的**前兄弟**（同父第 0 个 ⇒ 退到父级）。
 * 为什么不是几何包含：四支夹具的「流量预测」段 ref 全是 y≈730 的标题条小盒，
 * 没有一支段盒含 `2:3604` 中心 ⇒ 几何判不了；兄弟序才是真值结构事实。
 */
export function resolveChartAnchor(nodeId, tree) {
  const id = String(nodeId)
  const parentId = tree.parentOf.get(id) || null
  if (!parentId) return { anchorId: null, via: 'no-parent' }
  const sibs = tree.kidsOf.get(parentId) || []
  const i = sibs.indexOf(id)
  if (i > 0) return { anchorId: sibs[i - 1], via: 'prev-sibling' }
  return { anchorId: parentId, via: 'parent' }
}

/** 段内容轨：{ refs:Set<id>, hasChartShape:boolean }（排除规格/几何键，防假绿）。 */
export function collectSectionContentTrack(section) {
  const refs = new Set()
  let hasChartShape = false
  const seen = new Set()
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > MAX_DEPTH || seen.has(o)) return
    seen.add(o)
    if (Array.isArray(o)) {
      for (const item of o) walk(item, depth + 1)
      return
    }
    if (isChartDeclarationShape(o)) hasChartShape = true
    for (const k of ['id', 'figmaNode']) {
      if (o[k] != null && String(o[k]) !== '') refs.add(String(o[k]))
    }
    for (const k of Object.keys(o)) {
      if (SKIP_KEYS.has(k)) continue
      walk(o[k], depth + 1)
    }
  }
  walk(section, 0)
  return { refs, hasChartShape }
}

/**
 * 宿主段：候选真叶子段中面积最大者。
 * 候选 = `ref ∈ subtree(S) ∪ ancestors(S) ∪ {P} ∪ ancestors(P)`。
 */
export function resolveChartHost({ nodeId, sections, tree }) {
  const pid = String(nodeId)
  const { anchorId, via } = resolveChartAnchor(pid, tree)
  if (!anchorId) return { anchorId: null, via, host: null, candidateCount: 0, ambiguous: false }
  const closure = new Set()
  for (const x of subtreeOf(tree.kidsOf, anchorId)) closure.add(x)
  for (const x of ancestorsOf(tree.parentOf, anchorId)) closure.add(x)
  closure.add(pid)
  for (const x of ancestorsOf(tree.parentOf, pid)) closure.add(x)

  const cands = []
  for (const sec of collectTerminalSections(sections)) {
    const ref = sectionTruthRef(sec)
    if (ref && closure.has(ref)) cands.push({ section: sec, ref })
  }
  if (cands.length === 0) {
    return { anchorId, via, host: null, candidateCount: 0, ambiguous: false }
  }
  const areaOf = (c) => {
    const b = tree.byId.get(c.ref)?.box || boxOfNode(c.section)
    return b ? b.w * b.h : 0
  }
  cands.sort((a, b) => areaOf(b) - areaOf(a))
  const picked = cands[0]
  return {
    anchorId,
    via,
    host: picked.section,
    hostRef: picked.ref,
    candidateCount: cands.length,
    ambiguous: cands.length > 1,
  }
}

/** 宿主段是否已承载该图：自宿主 / 内容轨引用祖先链 / 内容轨含 chart 形态。 */
export function isChartCarried({ host, hostRef, nodeId, tree }) {
  if (!host) return { carried: false, how: 'no-host' }
  const pid = String(nodeId)
  const chain = new Set([pid, ...ancestorsOf(tree.parentOf, pid)])
  const sub = subtreeOf(tree.kidsOf, pid)
  if (hostRef && (chain.has(String(hostRef)) || sub.has(String(hostRef)))) {
    return { carried: true, how: 'self-host' }
  }
  const track = collectSectionContentTrack(host)
  for (const r of track.refs) {
    if (chain.has(r)) return { carried: true, how: `content-ref(${r})` }
  }
  if (track.hasChartShape) return { carried: true, how: 'content-chart-shape' }
  return { carried: false, how: 'none' }
}

/**
 * 视觉区域佐证：视觉 `charts[].section`（可能是合成段 id，先归一为 Figma id）
 * 是否等于宿主 ref / 落在宿主子树 / 是宿主的祖先。
 */
export function visionCorroboratesHost({ hostRef, tree, visionCharts, sectionIdToRef }) {
  if (!hostRef) return { corroborates: false, by: 'no-host-ref' }
  const dref = String(hostRef)
  const sub = subtreeOf(tree.kidsOf, dref)
  const anc = new Set(ancestorsOf(tree.parentOf, dref))
  for (const chart of Array.isArray(visionCharts) ? visionCharts : []) {
    const raw = chart?.section ?? chart?.id
    if (raw == null || String(raw) === '') continue
    const sref = String(sectionIdToRef.get(String(raw)) ?? String(raw))
    if (sref === dref) return { corroborates: true, by: `section=${sref}` }
    if (sub.has(sref)) return { corroborates: true, by: `in-subtree(${sref})` }
    if (anc.has(sref)) return { corroborates: true, by: `ancestor(${sref})` }
  }
  return { corroborates: false, by: 'none' }
}

/** 视觉是否已**逐条**认领该节点（节点自身 / 其祖先 / 其子树）。 */
function visionCoversNode({ nodeId, tree, visionCharts, sectionIdToRef }) {
  const pid = String(nodeId)
  const zone = new Set([pid, ...ancestorsOf(tree.parentOf, pid), ...subtreeOf(tree.kidsOf, pid)])
  for (const chart of Array.isArray(visionCharts) ? visionCharts : []) {
    const raw = chart?.section ?? chart?.id
    if (raw == null || String(raw) === '') continue
    const sref = String(sectionIdToRef.get(String(raw)) ?? String(raw))
    if (zone.has(sref)) return true
  }
  return false
}

/**
 * 逐条裁决入口。
 * @param {{figmaRoot:object, plan:object|Array, visionCharts?:Array}} input
 * @returns {{version:string, nodes:Array, counts:object}}
 */
export function resolveChartTruthCoverage({ figmaRoot, plan, visionCharts } = {}) {
  const sections = Array.isArray(plan?.effectiveSections)
    ? plan.effectiveSections
    : (Array.isArray(plan) ? plan : [])
  const truthNodes = collectEchartsTruthNodes(figmaRoot)
  const tree = buildChartTruthTree(figmaRoot)
  const sectionIdToRef = new Map()
  for (const sec of collectAllSections(sections)) {
    if (sec?.id == null) continue
    const ref = sectionTruthRef(sec)
    if (ref) sectionIdToRef.set(String(sec.id), ref)
  }

  const counts = {
    truthNodes: truthNodes.length,
    visionCovered: 0,
    carried: 0,
    needsInjection: 0,
    noHost: 0,
    ambiguous: 0,
    noVisionEvidence: 0,
    planAvailable: sections.length > 0 ? 1 : 0,
  }
  const nodes = []
  for (const node of truthNodes) {
    const hostInfo = resolveChartHost({ nodeId: node.nodeId, sections, tree })
    const carriedInfo = isChartCarried({
      host: hostInfo.host, hostRef: hostInfo.hostRef, nodeId: node.nodeId, tree,
    })
    const corroboration = visionCorroboratesHost({
      hostRef: hostInfo.hostRef, tree, visionCharts, sectionIdToRef,
    })
    const visionCovered = visionCoversNode({
      nodeId: node.nodeId, tree, visionCharts, sectionIdToRef,
    })
    const needsInjection =
      Boolean(hostInfo.host) &&
      !hostInfo.ambiguous &&
      !carriedInfo.carried &&
      corroboration.corroborates &&
      !visionCovered

    if (visionCovered) counts.visionCovered += 1
    else if (carriedInfo.carried) counts.carried += 1
    else if (!hostInfo.host) counts.noHost += 1
    else if (hostInfo.ambiguous) counts.ambiguous += 1
    else if (!corroboration.corroborates) counts.noVisionEvidence += 1
    if (needsInjection) counts.needsInjection += 1

    nodes.push({
      nodeId: node.nodeId,
      name: node.name,
      chartType: node.chartType,
      anchorId: hostInfo.anchorId,
      anchorVia: hostInfo.via,
      hostSectionId: hostInfo.host?.id == null ? null : String(hostInfo.host.id),
      hostSectionName: hostInfo.host ? String(hostInfo.host.name || hostInfo.host.title || '') : null,
      hostRef: hostInfo.hostRef ?? null,
      candidateCount: hostInfo.candidateCount,
      carried: carriedInfo.carried,
      carriedHow: carriedInfo.how,
      visionCovered,
      visionEvidence: corroboration.by,
      needsInjection,
    })
  }
  return { version: CHART_TRUTH_COVERAGE_VERSION, nodes, counts }
}

/** 恒打计数行（0 也打；不编造缺失值）。 */
export function chartTruthCoverageCounts(coverage) {
  const c = coverage?.counts || {}
  return {
    version: coverage?.version ?? CHART_TRUTH_COVERAGE_VERSION,
    truthNodes: c.truthNodes ?? 0,
    visionCovered: c.visionCovered ?? 0,
    carried: c.carried ?? 0,
    needsInjection: c.needsInjection ?? 0,
    noHost: c.noHost ?? 0,
    ambiguous: c.ambiguous ?? 0,
    noVisionEvidence: c.noVisionEvidence ?? 0,
    planAvailable: c.planAvailable ?? 0,
  }
}

export default resolveChartTruthCoverage

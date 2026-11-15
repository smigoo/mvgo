/**
 * 🛡️ 步骤 0 · chart 守恒观测基线（2026-11-15 · mc-max-1794752955560-c0cb00f1 实锤）
 *
 * ## 断点（本单实证）
 * 视觉声明 3 个 chart → `subcomponent-planner.js:2425-2428` 叶子分支只放行
 * `collapsed` / `v-for` 子段 ⇒ 回收在 `section.children` 的折线子段（`2:3573`）被整段丢弃
 * ⇒ 段内容轨只剩 2 个 bar ⇒ 产物只有 2 个图表文件，折线图压根没有 DOM。
 * 既有 `[vision-truth] 图表真值守恒` 只数 `internalSubcomponents` 里的
 * `type='chart-component'` 出口（本单 0/0/0），口径不覆盖「段内容轨」与「产物挂载点」，
 * 且仅 `logger.info` ⇒ 「视觉 3 / 出口 0」的差明摆着却无人判。
 *
 * ## 本文件做什么（只观测，不改判据严格度 / 不阻断 / 不入参 / 不改产物）
 * 三段**独立取数**：
 *   ① 视觉声明：`visionCharts[].section | id`（精确相等，不用 covers / 语义 / name）；
 *   ② plan 内容轨：`effectiveSections` 内 `declaredContent / body / children / items /
 *      elements / header.controls / controls` 的 chart 声明；**显式排除**
 *      `internalSubcomponents`（那是既有 `exitChartSubcomponents` 的另一轨）与
 *      `chartSpec`（`chartSpec.type='line'` 是规格不是挂载声明，扫到必假绿）；
 *   ③ 产物挂载点：full-truth files map 中含 `echarts.init(` 的**去重 .vue 文件数**。
 *      同一文件里「主路径 init + ResizeObserver 兜底 init」是同一图表实例，
 *      按调用次数会重复计数（本单实测 4 vs 真实 2）⇒ 按宿主文件去重，
 *      原始调用点数另存 `initCallSites` 仅供观测，不参与 verdict。
 * 只输出实测数 + 差集 + 可照抄配方；不自行宣布「已守恒」、不写回 plan、不接门禁。
 *
 * ## 🔴 裁决口径：数量守恒，不用逐 id 精确对齐
 * 离线 14 单回放实证：视觉 `charts[].section` 的建模口径逐单漂移 —— 有时是 @echarts
 * 真值节点（`2:7625`）、有时是段容器（`1744:127`）、有时是派生 id（`2:3565-chart`）、
 * 有时干脆是语义串（`chart-section`）；plan 声明节点又是另一套 id。两者做精确相等
 * 会把大量 `3/3/3` 好件误判成 gap（假红），而放宽成双向 covers 又会重演 P0 首轮
 * 「单字符假命中」的假绿。故：**守恒裁决只看三段数量**；精确引用差集
 * `missingChartIds` 降级为「配方定位用观测」，不参与 verdict。
 * ⚠️ 边界（步骤 2 收紧前必须补）：数量守恒不保证「类型 / 归属段」一致，
 *   当前未做类型直方图与段归属对账，登记为次生缺口。
 *
 * ## 纪律
 * - 判据单一来源：三段各读各的原形，不读任何修复器自报的 conserved 字段。
 * - 纯函数：不改入参；`files` 缺席 ⇒ 产物段输出 `null` + `artifactAvailable:false`，
 *   **不编 0**（planner 产出点本就还没有产物，写 0 就是塞入参 = 假绿）。
 * - fail-open / 指空段=没给：配方找不到归属段 ⇒ `hostSectionId=null` + `status='no-host'`。
 * - 恒打计数行：调用方无论命中与否一律打（0 也打），由 `chartConservationCounts` 统一扁平化。
 *
 * ✅ 步骤 1 已收敛次生缺口：图表类型集合改为 import `chart-declaration-truth.js#CHART_TYPES`
 *   （观测 / P0.5 修复器 / 归一修复器三方同源），本模块不再内联副本，读数口径不变。
 */
// 🛡️ 步骤 1：判据单一来源（与 P0.5 / 归一修复器同源）。
import { CHART_TYPES } from './chart-declaration-truth.js'

export const CHART_CONSERVATION_VERSION = 'step0-20261115'

/** 这些键是规格 / 几何 / 另一条轨，不是段内容轨声明，扫进去必然假绿。 */
const SKIP_KEYS = new Set([
  'chartSpec', 'internalSubcomponents', 'internalGeometry', 'layoutMetadata',
  'styles', 'absoluteBoundingBox', 'figmaBox', 'sourceNodeIds', 'rowPeerIds',
  'itemSkeleton', 'recipes', 'heightOwnership', 'chartReclaim', 'themeVars', 'elementStyleMap',
])

const MAX_DEPTH = 12

function isChartDecl(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const isNode = 'id' in obj || 'figmaNode' in obj || 'name' in obj
  if (!isNode) return false
  const role = String(obj.role ?? obj.control ?? '').toLowerCase()
  const type = String(obj.type ?? '').toLowerCase()
  return role === 'chart' || CHART_TYPES.has(type)
}

function declRefs(obj) {
  const out = []
  for (const k of ['figmaNode', 'id']) {
    if (obj[k] != null && String(obj[k])) out.push(String(obj[k]))
  }
  return out
}

/** 收集 plan 段内容轨的 chart 声明（按引用 id 去重，保留首见节点）。 */
function collectPlanChartDeclarations(plan) {
  const sections = Array.isArray(plan?.effectiveSections)
    ? plan.effectiveSections
    : (Array.isArray(plan) ? plan : [])
  const seenObj = new Set()
  const byRef = new Map()
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > MAX_DEPTH || seenObj.has(o)) return
    seenObj.add(o)
    if (Array.isArray(o)) {
      for (const item of o) walk(item, depth + 1)
      return
    }
    if (isChartDecl(o)) {
      const refs = declRefs(o)
      const key = refs[0] || `anonymous#${byRef.size}`
      if (!byRef.has(key)) byRef.set(key, o)
      for (const r of refs) if (!byRef.has(r)) byRef.set(r, o)
      return
    }
    for (const k of Object.keys(o)) {
      if (SKIP_KEYS.has(k)) continue
      walk(o[k], depth + 1)
    }
  }
  for (const section of sections) walk(section, 0)
  // 去重后的声明节点集合（一个节点可能同时有 id 与 figmaNode 两个 key）
  const nodes = [...new Set(byRef.values())]
  const refs = new Set(byRef.keys())
  return { count: nodes.length, refs, nodes }
}

/** 视觉声明 id：只认 section / id，未解析的标 unresolved 不参与差集。 */
function visionChartIds(visionCharts) {
  const ids = []
  const unresolved = []
  if (!Array.isArray(visionCharts)) return { ids, unresolved }
  for (const c of visionCharts) {
    if (!c || typeof c !== 'object') continue
    const id = c.section ?? c.id
    if (id == null || String(id) === '') unresolved.push(c)
    else ids.push(String(id))
  }
  return { ids: [...new Set(ids)], unresolved }
}

/**
 * 从视觉 layout sections 里定位 chart 的归属段（配方化 = 可照抄代码形态 + 归属段定位）。
 * 命中条件：段自身 id 或段内任意节点的 id / figmaNode 精确等于 chartId（含 reclaimedChildren）。
 * 找不到 ⇒ null（指空段 = 没给），绝不猜「尾部段」。
 */
function findChartHost(layoutSections, chartId) {
  if (!Array.isArray(layoutSections)) return null
  for (const section of layoutSections) {
    if (!section || typeof section !== 'object') continue
    const sectionId = section.id == null ? null : String(section.id)
    if (sectionId === chartId) return { hostSectionId: sectionId, hostMount: 'self' }
    let hit = null
    const seen = new Set()
    const walk = (o, path, depth) => {
      if (hit || !o || typeof o !== 'object' || depth > MAX_DEPTH || seen.has(o)) return
      seen.add(o)
      if (Array.isArray(o)) {
        o.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1))
        return
      }
      if ('id' in o && String(o.id) === chartId) { hit = `${path}.id`; return }
      if ('figmaNode' in o && String(o.figmaNode) === chartId) { hit = `${path}.figmaNode`; return }
      if (Array.isArray(o.reclaimedChildren) && o.reclaimedChildren.some((v) => String(v) === chartId)) {
        hit = `${path}.reclaimedChildren`
        return
      }
      for (const k of Object.keys(o)) {
        if (SKIP_KEYS.has(k) || k === 'reclaimedChildren') continue
        walk(o[k], `${path}.${k}`, depth + 1)
      }
    }
    walk(section, 'section', 0)
    if (hit) return { hostSectionId: sectionId, hostMount: hit }
  }
  return null
}

function readFileText(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const c = value.content ?? value.code ?? value.text
    return typeof c === 'string' ? c : ''
  }
  return ''
}

/**
 * 产物挂载点：按「含 echarts.init( 的去重 .vue 文件」计数。
 * 没给 files / 没有 .vue / 内容不可读 ⇒ available:false + count:null（不编 0）。
 */
function countArtifactMountPoints(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { available: false, count: null, initCallSites: 0, artifactFiles: [] }
  }
  const vueEntries = Object.entries(files).filter(([p]) => /\.vue$/i.test(String(p)))
  if (vueEntries.length === 0) {
    return { available: false, count: null, initCallSites: 0, artifactFiles: [] }
  }
  const artifactFiles = []
  let initCallSites = 0
  let readable = 0
  for (const [path, value] of vueEntries) {
    const text = readFileText(value)
    if (!text) continue
    readable += 1
    const calls = (text.match(/\becharts\s*\.\s*init\s*\(/g) || []).length
    initCallSites += calls
    if (calls > 0) artifactFiles.push({ file: path, initCalls: calls })
  }
  if (readable === 0) {
    return { available: false, count: null, initCallSites: 0, artifactFiles: [] }
  }
  return { available: true, count: artifactFiles.length, initCallSites, artifactFiles }
}

/**
 * @param {{visionCharts?:Array, plan?:object|Array, files?:object|null,
 *   layoutSections?:Array, stage?:string}} input
 * @returns 观测结果（纯附加数据，不含任何 FAIL / 阻断结论）
 */
export function auditChartConservation({ visionCharts, plan, files = null, layoutSections, stage = 'observe' } = {}) {
  const { ids: chartIds, unresolved } = visionChartIds(visionCharts)
  const planAvailable = Array.isArray(plan?.effectiveSections) || Array.isArray(plan)
  const planDecls = collectPlanChartDeclarations(plan)
  const artifact = countArtifactMountPoints(files)
  // plan 缺席 = 没读到（不是「0 个声明」）⇒ 不下 gap 结论，避免读入参造假绿
  const missingChartIds = planAvailable
    ? chartIds.filter((id) => !planDecls.refs.has(id))
    : []

  // 只有「段内容轨数量确实少于视觉声明」才算缺口 ⇒ 不拿 id 口径差异冒充缺口。
  const hasPlanGap = planAvailable && planDecls.count < chartIds.length
  const gapCount = planAvailable ? Math.max(0, chartIds.length - planDecls.count) : 0
  const recipes = hasPlanGap ? missingChartIds.map((id) => {
    const vision = (Array.isArray(visionCharts) ? visionCharts : []).find(
      (c) => c && String(c.section ?? c.id ?? '') === id,
    ) || {}
    const host = findChartHost(layoutSections, id)
    return {
      missingChartId: id,
      chartType: vision.type ?? null,
      series: Array.isArray(vision.series) ? vision.series.slice(0, 8) : [],
      hostSectionId: host?.hostSectionId ?? null,
      hostMount: host?.hostMount ?? null,
      // 步骤 1 契约归一的建议落点（本步不执行、不写回）
      targetMount: 'declaredContent.children',
      status: host ? 'resolvable' : 'no-host',
      reason: host
        ? '视觉声明存在，但 plan 段内容轨无该 chart 声明（回收子段未归一）'
        : 'plan 与 layout 均无归属段（指空段 = 没给，不猜）',
    }
  }) : []

  let verdict = 'no-charts'
  if (chartIds.length > 0) {
    if (!planAvailable) verdict = 'plan-unavailable'
    else if (planDecls.count < chartIds.length) verdict = 'plan-gap'
    else if (planDecls.count > chartIds.length) verdict = 'plan-extra'
    else if (!artifact.available) verdict = 'plan-only'
    else if (artifact.count < chartIds.length) verdict = 'artifact-gap'
    else if (artifact.count > chartIds.length) verdict = 'artifact-extra'
    else verdict = 'conserved'
  }

  return {
    version: CHART_CONSERVATION_VERSION,
    stage,
    visionCharts: chartIds.length,
    unresolvedVisionCharts: unresolved.length,
    planAvailable,
    planChartDeclarations: planDecls.count,
    planChartRefs: [...planDecls.refs].slice(0, 24),
    artifactChartMountPoints: artifact.count,
    artifactAvailable: artifact.available,
    initCallSites: artifact.initCallSites,
    artifactFiles: artifact.artifactFiles.map((f) => f.file).slice(0, 12),
    missingChartIds,
    exactRefMissCount: missingChartIds.length,
    gapCount,
    recipes,
    verdict,
    skipped: chartIds.length === 0,
    skippedReason: chartIds.length === 0 ? 'no-vision-charts' : null,
  }
}

/** planner 产出点追加到既有 `[vision-truth]` 行的纯附加字段（不覆盖任何既有键）。 */
export function chartConservationPlanFields(audit) {
  const a = audit || {}
  return {
    ccVersion: CHART_CONSERVATION_VERSION,
    ccStage: 'plan',
    ccPlanAvailable: a.planAvailable ? 1 : 0,
    ccVisionCharts: a.visionCharts ?? 0,
    ccPlanChartDeclarations: a.planChartDeclarations ?? 0,
    ccExactRefMissCount: Array.isArray(a.missingChartIds) ? a.missingChartIds.length : 0,
    ccGapCount: a.gapCount ?? 0,
    ccMissingChartIds: Array.isArray(a.missingChartIds) ? a.missingChartIds.slice(0, 12) : [],
    ccRecipes: Array.isArray(a.recipes) ? a.recipes.slice(0, 6) : [],
    ccArtifactAvailable: 0,
  }
}

/** 恒打计数行（0 也打）；产物缺席时 `artifactChartMountPoints` 输出 null，不编 0。 */
export function chartConservationCounts(audit) {
  const a = audit || {}
  return {
    version: a.version ?? CHART_CONSERVATION_VERSION,
    stage: a.stage ?? 'observe',
    visionCharts: a.visionCharts ?? 0,
    unresolvedVisionCharts: a.unresolvedVisionCharts ?? 0,
    planAvailable: a.planAvailable ? 1 : 0,
    planChartDeclarations: a.planChartDeclarations ?? 0,
    artifactChartMountPoints: a.artifactChartMountPoints ?? null,
    artifactAvailable: a.artifactAvailable ? 1 : 0,
    initCallSites: a.initCallSites ?? 0,
    artifactFiles: a.artifactFiles ?? [],
    missingChartIds: a.missingChartIds ?? [],
    exactRefMissCount: a.exactRefMissCount ?? (Array.isArray(a.missingChartIds) ? a.missingChartIds.length : 0),
    gapCount: a.gapCount ?? 0,
    recipes: Array.isArray(a.recipes) ? a.recipes.slice(0, 6) : [],
    verdict: a.verdict ?? 'unknown',
    skipped: a.skipped ? 1 : 0,
    skippedReason: a.skippedReason ?? null,
  }
}

export default auditChartConservation

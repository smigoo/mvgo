/**
 * resolve-chart-anchor.js
 *
 * 🛡️ G07（2026-11-14 · 视觉真值根治改造 R3）：**图表真值单一来源裁决**。
 *
 * 实锤（12:34 失败件 `2ef1e1e8` 未过滤 checkpoint 逐项对账）：
 *   - 视觉顶层 `charts[]` = 3 条（bar / bar / line），**全部带完整规格**
 *     （series / seriesTypes / legend / legendPosition / seriesColors / axes …），
 *     且 3/3 标 `sectionUnresolved:true`；`analysisDiagnostics` 逐字写明
 *     「下游宿主注入将按『无宿主不注入』处理」（G02 决策 2 = 绝对禁令）。
 *   - 视觉已把 3 条图表**重锚挂进宿主段**：`layout.sections[].body.children[].charts`；
 *     planner 的全保真 `subComponentPlan.effectiveSections[].body.children[].charts`
 *     逐字保留了它们（G04 后判据层读的正是这份全保真 plan）。
 *   - 但 `chart-section.js` 用 Figma `@echarts` 节点名 + 窄 id 覆盖名单反客为主，
 *     派生 4 个 `chart-<nodeId>` chart-component（reason='R1-geo:…'），
 *     `chartSpec` 全为 null → `microcode-engineer.js:1740` 的 `cs` 崩溃。
 *
 * 根治 = 职责分离：**视觉声明决定「几个图表 / 什么规格 / 挂在哪」；Figma 树只在视觉真值
 *   完全缺失时提供显式 fallback，且必须记账 `source='figma-fallback'`。**
 *
 * 本模块只做裁决与收集，不改任何 plan / 产物；不持有 Figma 树遍历以外的判据。
 */

/** 图表规格白名单（与 chart-section#matchChartSpecForSub / planner CHART_SPEC_FIELDS 同族）。 */
export const CHART_SPEC_FIELDS = Object.freeze([
  'type', 'series', 'seriesTypes', 'legend', 'legendPosition', 'legendType',
  'seriesColors', 'axes', 'tooltip', 'innerRadius', 'stack', 'markLine',
])

/** 从单条视觉 chart 提取规格（不做任何猜测匹配；缺字段就不产键）。 */
export function chartSpecOf(chart) {
  if (!chart || typeof chart !== 'object') return null
  const spec = {}
  for (const k of CHART_SPEC_FIELDS) {
    if (chart[k] !== undefined && chart[k] !== null) spec[k] = chart[k]
  }
  return Object.keys(spec).length > 0 ? spec : null
}

function forEachSection(list, fn) {
  for (const sec of Array.isArray(list) ? list : []) {
    if (!sec || typeof sec !== 'object') continue
    fn(sec)
    if (Array.isArray(sec.children) && sec.children.length > 0) forEachSection(sec.children, fn)
  }
}

/**
 * 收集**已重锚挂进宿主段**的视觉图表真值（plan 全保真形态）。
 * 一条段内 child 可带多张图；逐条附宿主 id / title，供守恒计数定位。
 *
 * @param {object} plan subComponentPlan（planner 全保真原形）
 * @returns {Array<object>} [{...chart, _hostSectionId, _hostSectionTitle, _childIndex, _chartIndex}]
 */
export function collectMountedCharts(plan) {
  const out = []
  forEachSection(plan?.effectiveSections, (sec) => {
    const body = sec.body
    const children = Array.isArray(body?.children) ? body.children : []
    children.forEach((child, ci) => {
      const charts = Array.isArray(child?.charts) ? child.charts : []
      charts.forEach((chart, xi) => {
        if (!chart || typeof chart !== 'object') return
        out.push({
          ...chart,
          _hostSectionId: sec.id ?? null,
          _hostSectionTitle: sec.title ?? null,
          _childIndex: ci,
          _chartIndex: xi,
        })
      })
    })
  })
  return out
}

/**
 * 图表真值单一来源裁决。
 *
 * @param {object} sources
 * @param {object} sources.plan              全保真 subComponentPlan（用于读段内挂载）
 * @param {Array}  sources.charts            视觉顶层 charts[]（state.charts）
 * @param {object} sources.layoutStructure   视觉事实层（G06 同源）；顶层 charts 为空时从 .charts 补读
 * @param {object} sources.figmaNodeData     Figma 节点树（仅供 fallback 计数）
 * @param {boolean} sources.allowFigmaFallback 视觉真值缺失时是否允许 Figma 节点名派生
 * @returns {object} decision（纯附加，不写入 plan）
 */

/** 视觉图表条目去重键（顶层 charts 与 layoutStructure.charts 常是同一批真值的两份投影）。 */
function chartKey(c) {
  const section = c?.section ?? c?.id ?? ''
  const type = c?.type ?? c?.chartType ?? ''
  const series = Array.isArray(c?.series)
    ? c.series.map((s) => (typeof s === 'string' ? s : (s?.name ?? ''))).join('|')
    : ''
  return `${type}::${section}::${series}`
}

export function resolveChartTruth(sources = {}) {
  const {
    plan = null, charts = null, layoutStructure = null,
    figmaNodeData = null, allowFigmaFallback = true,
  } = sources
  const topCharts = Array.isArray(charts) ? charts.filter((c) => c && typeof c === 'object') : []
  // 🛡️ G07 上游防线：视觉分析缓存命中路径写的是 `cached.charts || []`；若旧缓存把
  //   charts 只存在 layoutStructure 内（G06 已证诊断族就是这种「顶层空、内层真」形态），
  //   只读顶层会误判「视觉真值缺失」⇒ 重新走 Figma 兜底 ⇒ 臆造图表复活。
  //   两处都读并按内容去重，保证 visionPresent 只由视觉声明决定。
  const layoutCharts = Array.isArray(layoutStructure?.charts)
    ? layoutStructure.charts.filter((c) => c && typeof c === 'object') : []
  const seenChartKeys = new Set()
  const visionCharts = []
  for (const c of [...topCharts, ...layoutCharts]) {
    const k = chartKey(c)
    if (seenChartKeys.has(k)) continue
    seenChartKeys.add(k)
    visionCharts.push(c)
  }
  const mountedCharts = collectMountedCharts(plan)
  const visionPresent = visionCharts.length > 0 || mountedCharts.length > 0

  // 视觉禁令：顶层 section 锚点未解析 ⇒ 不得再按 Figma 节点名找宿主注入。
  const sectionUnresolved = visionCharts.filter((c) => c.sectionUnresolved === true).length
  // 已重锚挂进宿主段的图表，本身就是「不需要再注入」的事实。
  const noHostInject = visionPresent && (sectionUnresolved > 0 || mountedCharts.length > 0)

  let figmaEchartsCount = 0
  const root = figmaNodeData && typeof figmaNodeData === 'object'
    ? (figmaNodeData.document || figmaNodeData) : null
  const countWalk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.name && String(node.name).startsWith('@echarts')) { figmaEchartsCount += 1; return }
    for (const c of node.children || []) countWalk(c)
  }
  if (root) countWalk(root)

  const source = visionPresent
    ? 'vision'
    : (allowFigmaFallback !== false && figmaEchartsCount > 0 ? 'figma-fallback' : 'none')

  return {
    source,
    visionCharts,
    visionChartCount: visionCharts.length,
    mountedCharts,
    mountedChartCount: mountedCharts.length,
    mountedByHost: mountedCharts.reduce((acc, c) => {
      const k = String(c._hostSectionId ?? 'unknown')
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {}),
    sectionUnresolved,
    noHostInject,
    figmaEchartsCount,
    // 视觉真值存在时被压制的 Figma 派生数（改造前正是这 5 个节点造出 4 个臆造图表）
    suppressedFigmaDerived: visionPresent ? figmaEchartsCount : 0,
    // 🛡️ fallback **候选上限**（不是实际出口数）：视觉真值路径恒 0 = G02 绝对禁令。
    //   ⚠️ 语义边界：裁决器看不到 `sectionCoversNode` 结果，无法知道多少 @echarts 节点
    //   已被现有 section 覆盖 ⇒ 实际注入数只能在 injectChartSectionIfMissing 尾部实测
    //   （见 `[chart-section] 图表兜底注入裁决` 的 actualInjectedChartSections）。
    //   ⚠️ 这里**不设 conserved 自判字段**：裁决器自己判自己恒为绿，属假绿。
    //   产物守恒只由两个独立来源验收：
    //     ① 真机：G01 `[vision-truth] 图表真值守恒` 从 finalPlan 实数 _exitChartSubs；
    //     ② 离线：G07 阴阳夹具以真实 checkpoint 重放 injectChartSectionIfMissing。
    //   两者都不读本裁决器的结论字段 ⇒ 不存在「改的人=验的人」。
    fallbackCandidateNodes: source === 'figma-fallback' ? figmaEchartsCount : 0,
    // 信息性维度（不参与任何判真）：段内挂载数是否等于视觉声明数。
    //   好件实测 0/3 仍能正常出图（图表由 LLM 从全保真 layoutStructure 直读生成），
    //   故**不得**用 mounted==vision 当守恒判据，否则好件会被误报不守恒。
    mountedMatchesVision: mountedCharts.length === visionCharts.length ? 1 : 0,
    visionChartSource: topCharts.length > 0 ? 'topLevel'
      : (layoutCharts.length > 0 ? 'layoutStructure' : 'none'),
    layoutStructureCharts: layoutCharts.length,
    orphanCount: 0,
  }
}

/** 真机计数行：恒打（0 也必须出现），区分「没读 / 读了没值 / 读了有值」。 */
export function chartTruthCounts(decision) {
  const d = decision || {}
  return {
    chartTruthSource: d.source || 'none',
    visionCharts: d.visionChartCount || 0,
    mountedInSections: d.mountedChartCount || 0,
    mountedByHost: d.mountedByHost || {},
    sectionUnresolved: d.sectionUnresolved || 0,
    noHostInject: d.noHostInject ? 1 : 0,
    figmaEchartsNodes: d.figmaEchartsCount || 0,
    suppressedFigmaDerived: d.suppressedFigmaDerived || 0,
    fallbackCandidateNodes: d.fallbackCandidateNodes || 0,
    mountedMatchesVision: d.mountedMatchesVision || 0,
    visionChartSource: d.visionChartSource || 'none',
    layoutStructureCharts: d.layoutStructureCharts || 0,
    orphanCount: d.orphanCount || 0,
  }
}

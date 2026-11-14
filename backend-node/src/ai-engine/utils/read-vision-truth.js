/**
 * read-vision-truth.js
 *
 * 🛡️ G06（2026-11-14 · 视觉真值根治改造 R2）：**视觉诊断族的唯一读取器**。
 *
 * 实锤（12:34 失败件 / 18:47 好件两份未过滤 checkpoint 逐字段复算）：
 *   `visual-parser._buildCompleteResult()` 把 29 个字段整体放进 `result.layoutStructure`
 *   （= analyze() 的 parsed 原形），顶层只镜像 9 个。于是
 *     top.analysisDiagnostics      = []        inner = 6 / 8 条
 *     top.analysisFixes            = []        inner = 4 / 3 条
 *     top.resourceDiagnostics      = []        inner = 10 条
 *     top.coverageReport           = null      inner = { 15 keys, coverageRate: 90 }
 *     top.textTruthValidation      = null      inner = { 3 keys }
 *   而两张 max 图在 `_visualParserCache` / `_saveCheckpoint('visual')` / state 返回 /
 *   planner diagnostics / 覆盖率硬校验处**全部读顶层** ⇒ 视觉声明的
 *   `chart-anchor-unresolved`（逐字：「下游宿主注入将按『无宿主不注入』处理」）
 *   在下游恒等于不存在。这是「视觉正确、下游出错」的第二条断链。
 *
 * 本模块职责（只做读取，不改任何 result / plan / 产物）：
 *   1. 一律优先读 `result.layoutStructure`（事实层）；顶层镜像只在内部缺键时兼容兜底，
 *      并且 `byKey` 逐项留痕 —— 兼容不是偷偷降级。
 *   2. 同一函数同时服务「实时 analyze() 返回」与「断点续跑缓存 visual.json」
 *      （后者顶层同样为空、内部同样有值），无需两套读取路径。
 *   3. `collectVisionBans()` 把视觉已经写明的禁令结构化输出，供 G07 图表决策消费；
 *      本模块**不自行阻断**，避免引入新的生成期门禁（不误伤其他组件）。
 *
 * 上游契约零改动：`visual-parser.analyze()` 返回对象不改字段、不删顶层镜像。
 */

/** 诊断族字段唯一名单：新增字段只在此登记，禁止两图各写一份。 */
export const VISION_TRUTH_KEYS = Object.freeze([
  'analysisDiagnostics',
  'analysisFixes',
  'chromeSectionDiagnostics',
  'resourceDiagnostics',
  'coverageReport',
  'textTruthValidation',
  'chartDataHints',
  'charts',
  'contractAudit',
  'sectionAnchorAudit',
  'contentAnchorAudit',
])

const ARRAY_KEYS = Object.freeze([
  'analysisDiagnostics',
  'analysisFixes',
  'chromeSectionDiagnostics',
  'resourceDiagnostics',
  'chartDataHints',
  'charts',
])

/** 核心真值：这几项缺失要在计数行里点名（不等于门禁 FAIL）。 */
export const CORE_VISION_TRUTH_KEYS = Object.freeze([
  'analysisDiagnostics',
  'analysisFixes',
  'resourceDiagnostics',
  'coverageReport',
  'textTruthValidation',
  'chartDataHints',
])

function emptyValueOf(key) {
  return ARRAY_KEYS.includes(key) ? [] : null
}

function hasOwn(obj, key) {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)
}

function isPresent(value) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/**
 * 从视觉结果（实时 result 或缓存 checkpoint）读取诊断族真值。
 *
 * @param {object|null} result visual-parser 返回对象 / visual.json 内容
 * @returns {object} 含 VISION_TRUTH_KEYS 全部字段 + {source, byKey, missing, degraded}
 */
export function readVisionTruth(result) {
  const inner =
    result && typeof result === 'object' && result.layoutStructure &&
    typeof result.layoutStructure === 'object'
      ? result.layoutStructure
      : null
  const top = result && typeof result === 'object' ? result : {}
  const truth = {
    source: inner ? 'layoutStructure' : 'none',
    byKey: {},
    missing: [],
    degraded: false,
  }

  for (const key of VISION_TRUTH_KEYS) {
    const innerHas = hasOwn(inner, key)
    const innerVal = innerHas ? inner[key] : undefined
    const topVal = top[key]
    // 事实层优先：内部「定义了但为空」也是真值（0 条诊断就是 0 条），
    // 不得因为空数组就回退到顶层的镜像空值 / 旧缓存。
    const from = innerHas ? 'inner' : isPresent(topVal) ? 'top' : 'none'
    truth[key] = from === 'inner' ? (innerVal ?? emptyValueOf(key))
      : from === 'top' ? topVal
        : emptyValueOf(key)
    truth.byKey[key] = from
    if (from === 'top') truth.degraded = true
    if (CORE_VISION_TRUTH_KEYS.includes(key) && !isPresent(truth[key])) {
      truth.missing.push(key)
    }
  }
  return truth
}

/**
 * 可直接 spread 进 `_visualParserCache` / `_saveCheckpoint('visual')` / state 返回 /
 * planner diagnostics 的标准形态。避免两图各写一份字段清单造成第 N 次漂移。
 */
export function visionTruthDiagnostics(truth) {
  const t = truth && typeof truth === 'object' ? truth : readVisionTruth(null)
  return {
    analysisDiagnostics: t.analysisDiagnostics || [],
    analysisFixes: t.analysisFixes || [],
    chromeSectionDiagnostics: t.chromeSectionDiagnostics || [],
    resourceDiagnostics: t.resourceDiagnostics || [],
    coverageReport: t.coverageReport || null,
    textTruthValidation: t.textTruthValidation || null,
    chartDataHints: t.chartDataHints || null,
  }
}

/** 真机计数行：恒打（0 也必须出现），区分「没读 / 读了没值 / 读了有值」。 */
export function visionTruthCounts(truth) {
  const t = truth && typeof truth === 'object' ? truth : readVisionTruth(null)
  const n = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? 1 : 0)
  return {
    visionTruthSource: t.source || 'none',
    visionTruthDegraded: t.degraded ? 1 : 0,
    visionTruthMissingKeys: t.missing || [],
    diagnostics: n(t.analysisDiagnostics),
    fixes: n(t.analysisFixes),
    chromeSectionDiagnostics: n(t.chromeSectionDiagnostics),
    resourceDiagnostics: n(t.resourceDiagnostics),
    coverageReport: n(t.coverageReport),
    coverageRate: t.coverageReport && typeof t.coverageReport.coverageRate === 'number'
      ? t.coverageReport.coverageRate : null,
    textTruthValidation: n(t.textTruthValidation),
    chartDataHints: n(t.chartDataHints),
    visionCharts: n(t.charts),
    ...collectVisionBansCounts(t),
  }
}

function collectVisionBansCounts(truth) {
  const bans = collectVisionBans(truth)
  return {
    chartAnchorUnresolved: bans.chartAnchorUnresolved,
    noHostInject: bans.noHostInject ? 1 : 0,
    sectionUnresolved: bans.sectionUnresolved,
  }
}

/**
 * 视觉已写明的禁令结构化输出（G02 决策 2：`sectionUnresolved` 为绝对禁令）。
 * 只输出事实，不在此处阻断；是否 FAIL 由 G07 守恒门禁按真错判定。
 */
export function collectVisionBans(truth) {
  const t = truth && typeof truth === 'object' ? truth : readVisionTruth(null)
  const diagnostics = Array.isArray(t.analysisDiagnostics) ? t.analysisDiagnostics : []
  const anchorBans = diagnostics.filter(
    (d) => d && typeof d === 'object' && String(d.kind || '') === 'chart-anchor-unresolved',
  )
  const charts = Array.isArray(t.charts) ? t.charts : []
  const unresolvedCharts = charts.filter((c) => c && c.sectionUnresolved === true)
  const bannedItems = anchorBans.flatMap((d) => (Array.isArray(d.items) ? d.items : []))
  return {
    // 视觉诊断逐字：「下游宿主注入将按『无宿主不注入』处理」⇒ 绝对禁令
    noHostInject: anchorBans.length > 0 || unresolvedCharts.length > 0,
    chartAnchorUnresolved: anchorBans.length,
    bannedItems,
    sectionUnresolved: unresolvedCharts.length,
    details: anchorBans.map((d) => String(d.detail || '')),
  }
}

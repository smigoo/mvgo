/**
 * 🛡️ Loop 2.1.E（2026-09-10）：chartType 冻结进 block + 非法 series.type 拒收。
 *
 * 根因：traffic 样本出现 series.type:'分组柱状图'（非 echarts 注册名）→ 图表 init 失败 / 空白。
 * 治本：chartType 由 Manifest/Figma 真值驱动（block.chartType ∈ {bar,line,pie,none}），
 * LLM 只允许写合法 echarts option；非法别名（分组柱状图/柱状图/折线图…）一律 fail-closed 回退。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；不修改入参（返回新对象）。
 *
 * @param {string} type - 待校验的 series.type
 * @param {Object} [block] - 真值块（含 chartType 字段）
 * @returns {boolean}
 */
const REGISTERED_ECHARTS_TYPES = new Set([
  'bar',
  'line',
  'pie',
  'scatter',
  'effectScatter',
  'radar',
  'gauge',
  'funnel',
  'candlestick',
  'heatmap',
  'graph',
  'tree',
  'treemap',
  'sunburst',
  'boxplot',
  'parallel',
  'sankey',
  'map',
  'lines',
  'pictorialBar',
  'themeRiver',
  'custom',
])

export function isValidEchartsType(type, block) {
  const t = String(type || '').trim().toLowerCase()
  if (!REGISTERED_ECHARTS_TYPES.has(t)) return false
  // 真值块规定只准某一类型时，其它注册名也不放行（fail-closed）
  const truth = block && block.chartType ? String(block.chartType).toLowerCase() : null
  if (truth && truth !== 'none' && truth !== t) return false
  return true
}

/**
 * 把 option.series[].type 规范成合法 echarts 注册名。
 * - 已是注册名且 block 真值一致 → 保留
 * - 中文别名/非法 → 回退：block.chartType 优先，否则 'line'（fail-closed 不臆造）
 *
 * @param {Object} option - echarts option（含 series）
 * @param {Object} [block] - 真值块
 * @returns {Object} 新 option（series.type 已规范化）
 */
export function normalizeChartOptionType(option, block) {
  if (!option || typeof option !== 'object') return option
  const truth = block && block.chartType ? String(block.chartType).toLowerCase() : null
  const fallback = truth && truth !== 'none' ? truth : 'line'

  const next = Array.isArray(option.series)
    ? option.series.map((s) => {
        if (!s || typeof s !== 'object') return s
        const t = String(s.type || '').trim().toLowerCase()
        const ok = REGISTERED_ECHARTS_TYPES.has(t) && (!truth || truth === 'none' || truth === t)
        return ok ? s : { ...s, type: fallback }
      })
    : option.series
  return { ...option, series: next }
}

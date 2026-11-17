/**
 * 图表类型检测底层纯函数（无依赖叶子模块 · 2026-11-17 抽离）
 *
 * 抽离动机：判据单一来源。原实现在 validators/do-not-invent-validator.js 内，
 * 新增 utils/chart-missing-types.js（N2 兜底与门禁共用缺失类型判定）后若继续
 * 从 validator import 会形成循环依赖（validator → chart-missing-types → validator）。
 * 故把三个纯函数下沉到本无依赖模块，validator 与 chart-missing-types 各自 import，
 * validator 仍 re-export 保持对外 API 与既有 spec 的 import 路径零变更。
 */

/**
 * vision 图表类型归一化：
 * - pie / doughnut / donut / ring / 环形 / 饼图 → 'pie'
 * - bar / column / 柱状 / 柱形 → 'bar'
 * - line / area / curve / 折线 / 曲线 / 面积 → 'line'
 * - radar / gauge / scatter → 对应归一化值
 * - 无法归一化的（multiple / 空 / 未知）→ null（跳过检查，避免误伤）
 */
export function normalizeChartType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (!t) return null
  if (/pie|doughnut|donut|ring|环形|饼图/.test(t)) return 'pie'
  if (/bar|column|柱状|柱形/.test(t)) return 'bar'
  if (/line|area|curve|折线|曲线|面积/.test(t)) return 'line'
  if (/radar|雷达/.test(t)) return 'radar'
  if (/gauge|仪表/.test(t)) return 'gauge'
  if (/scatter|散点/.test(t)) return 'scatter'
  return null
}

/**
 * 收集产物代码中所有 echarts series 的 type 归一化集合（扫描全产物含子组件）。
 * 匹配 series 对象内 `type: 'xxx'`（单/双引号），逐条归一化去重。
 */
export function collectChartSeriesTypes(vueContent) {
  const types = new Set()
  if (!vueContent || typeof vueContent !== 'string') return types
  const typeRe = /type\s*:\s*['"]([a-zA-Z]+)['"]/g
  let m
  while ((m = typeRe.exec(vueContent)) !== null) {
    const norm = normalizeChartType(m[1])
    if (norm) types.add(norm)
  }
  return types
}

/**
 * 「文字数字卡承载」图表类型集合（豁免判据，2026-11-09 · 00f3626c 实锤）。
 * vision chart.section 的 Figma 子树内有 TEXT 节点（数据以文字形态在场）⇒ 该类型
 * 视为已被文字形态承载，不要求产物必须有对应 echarts series。
 *
 * @param {Array} charts vision charts（{section, type}）
 * @param {Map|null} figmaIndex indexFigmaNodes 产物；null ⇒ 空集（fail-open 不豁免）
 * @returns {Set<string>} 归一化类型集合
 */
export function collectTextCarriedChartTypes(charts, figmaIndex) {
  const out = new Set()
  const idx = figmaIndex && typeof figmaIndex.get === 'function' ? figmaIndex : null
  if (!idx) return out
  for (const c of Array.isArray(charts) ? charts : []) {
    const normT = normalizeChartType(c?.type)
    const sid = c?.section != null ? String(c.section) : ''
    if (!normT || !sid) continue
    const hit = idx.get(sid)
    const raw = hit?.rawNode
    if (!raw) continue
    if (subtreeHasNumericText(raw, 0)) out.add(normT)
  }
  return out
}

/** 子树内是否存在含数字的 TEXT 节点（深度限 8；characters 缺失时按 TEXT 存在计） */
function subtreeHasNumericText(node, depth) {
  if (!node || typeof node !== 'object' || depth > 8) return false
  if (String(node.type) === 'TEXT') {
    const chars = node.characters
    if (chars == null || /\d/.test(String(chars))) return true
  }
  for (const c of node.children || []) {
    if (subtreeHasNumericText(c, depth + 1)) return true
  }
  return false
}

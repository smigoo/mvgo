/**
 * 🛡️ 图表 section 兜底注入（2026-09-16 · mc-1789501340553-e25b9b55 实锤）
 *
 * 根因：visual-parser 有时完全漏识别图表区域（如环形图），导致 effectiveSections
 * 中无任何 chart 类型 section → LLM 不生成 echarts 代码 → 产物缺图表。
 *
 * 本工具在规划阶段扫描 Figma 节点树中的 @echarts 标记节点，若存在但
 * effectiveSections 尚无 chart 类型 section 覆盖，则强制注入 chart section，
 * 确保图表区域进入生成。
 *
 * 模式：与 nav-section.js 完全一致（detect → inject → 重算 isForced）。
 */

import {
  collectLeafSections,
  findSectionById,
} from './section-tree.js'
import { resolveEchartsType } from './chart-type-guard.js'

/**
 * 从 @echarts 节点名推断 echarts 类型。
 * @param {string} nodeName - 如 "@echarts/pie"、"@echarts/bar"、"@echarts"
 * @returns {string} echarts 类型（pie/bar/line/scatter/radar/gauge）
 */
function inferChartType(nodeName) {
  const name = String(nodeName || '').toLowerCase()
  if (name.includes('/pie') || name.includes('/donut') || name.includes('/ring') || name.includes('/环形') || name.includes('/饼')) return 'pie'
  if (name.includes('/bar') || name.includes('/柱')) return 'bar'
  if (name.includes('/line') || name.includes('/折线') || name.includes('/面积')) return 'line'
  if (name.includes('/scatter') || name.includes('/散点')) return 'scatter'
  if (name.includes('/radar') || name.includes('/雷达')) return 'radar'
  if (name.includes('/gauge') || name.includes('/仪表盘') || name.includes('/进度')) return 'gauge'
  return 'pie' // 默认兜底：环形/饼图最常见
}

/**
 * 递归收集 Figma 节点树中所有 @echarts 标记节点。
 * @param {object} figmaNodeData - Figma 节点树根
 * @returns {Array<{id: string, name: string, chartType: string, bbox: object}>}
 */
export function collectEchartsNodes(figmaNodeData) {
  const results = []
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return results

  const root = figmaNodeData.document || figmaNodeData
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.name && String(node.name).startsWith('@echarts')) {
      results.push({
        id: String(node.id),
        name: node.name,
        chartType: inferChartType(node.name),
        bbox: node.absoluteBoundingBox || null,
      })
      // 不递归子树：@echarts 节点本身就是图表容器
      return
    }
    for (const child of node.children || []) walk(child)
  }
  walk(root)
  return results
}

/**
 * 检测是否存在「图表」信号。
 *
 * 两路信号（2026-09-16 扩展，c-d7334a-d7334a67 实锤）：
 *   ① vision 顶层 charts[] 有真值（如 doughnut + series）—— 最权威信号，即便 Figma 节点名
 *      无 @echarts 标记（如「中间图表」这类中文名）也能命中；
 *   ② Figma 节点树中存在 @echarts 标记节点（原信号）。
 *
 * 实锤：d7334a67 charts 字段识别出 doughnut（section 臆造为 "2:200"），但 Figma 节点实际是
 * 「中间图表」(287:4)、无 @echarts 标记 → 原 detectChartSignal 只看 @echarts 返回 false →
 * 兜底不注入 → effectiveSections 无 chart section → LLM 不生成 echarts → 产物缺环形图。
 *
 * @param {{figmaNodeData?:object, charts?:Array}} sources
 * @returns {boolean}
 */
export function detectChartSignal(sources = {}) {
  const { figmaNodeData, charts } = sources
  if (Array.isArray(charts) && charts.length > 0) return true
  if (!figmaNodeData) return false
  const nodes = collectEchartsNodes(figmaNodeData)
  return nodes.length > 0
}

/**
 * 判断 section 是否为 chart 类型。
 */
function isChartSection(sec) {
  const hay = `${sec?.type || ''} ${sec?.title || ''} ${sec?.responsibility || ''}`.toLowerCase()
  return (
    hay === 'chart' ||
    /图表/.test(hay) ||
    /echarts/.test(hay) ||
    /chart/.test(hay)
  )
}

/**
 * 判断 section 是否覆盖了指定的 Figma 节点 ID。
 */
function sectionCoversNode(sec, nodeId) {
  const ids = sec?.sourceNodeIds || []
  return ids.some((id) => String(id) === String(nodeId))
}

/**
 * 若 Figma 节点树中有 @echarts 标记节点 / vision charts[] 有真值，但 effectiveSections
 * 尚无 chart section 覆盖，则强制注入 chart section。
 *
 * 注入规则（两路，2026-09-16 扩展）：
 *   ① @echarts 标记节点：收集 → 检查覆盖 → 未覆盖的按 y 坐标排序 → 注入
 *   ② charts[] 真值：charts 字段有 type/series 但 effectiveSections 无 chart section
 *      （且 @echarts 未覆盖）→ 用 charts 真值注入（chartType 归一化，series 透传）
 *
 * @param {object} plan - subComponentPlan（含 effectiveSections）
 * @param {boolean} chartSignal - detectChartSignal 的结果
 * @param {{figmaNodeData?:object, charts?:Array}} [sources]
 * @returns {object} 可能修改后的 plan（新对象，不污染入参）
 */
export function injectChartSectionIfMissing(plan, chartSignal, sources = {}) {
  if (!chartSignal) return plan

  const { figmaNodeData, charts } = sources
  const effectiveSections = Array.isArray(plan?.effectiveSections) ? plan.effectiveSections : []
  const allLeaves = collectLeafSections(effectiveSections)
  const hasChartSection = allLeaves.some((sec) => isChartSection(sec))

  // ① @echarts 节点兜底
  const echartsNodes = collectEchartsNodes(figmaNodeData)
  const uncoveredNodes = echartsNodes.filter(
    (node) => !allLeaves.some((sec) => sectionCoversNode(sec, node.id)),
  )

  // ② charts[] 真值兜底（2026-09-16 · c-d7334a-d7334a67 实锤）：vision 顶层 charts 有真值
  // （doughnut + series），但 Figma 节点是「中间图表」无 @echarts 标记 → ① 找不到节点。
  // 只要 charts 有 type/series 且 effectiveSections 无 chart section，就按真值注入。
  const chartsTruth = (Array.isArray(charts) ? charts : []).filter(
    (c) => c && (c.type || (Array.isArray(c.series) && c.series.length > 0)),
  )
  const needChartFromTruth =
    uncoveredNodes.length === 0 && chartsTruth.length > 0 && !hasChartSection

  let chartSections = []
  if (uncoveredNodes.length > 0) {
    // 按 y 坐标排序（与视觉文档序一致）
    uncoveredNodes.sort(
      (a, b) =>
        ((a.bbox?.y ?? 0) - (b.bbox?.y ?? 0)) ||
        ((a.bbox?.x ?? 0) - (b.bbox?.x ?? 0)),
    )
    chartSections = uncoveredNodes.map((node, idx) => ({
      id: `chart-${node.id}`,
      type: 'chart',
      chartType: node.chartType,
      responsibility: '图表区域（echarts）',
      elementCount: 1,
      title: `图表${uncoveredNodes.length > 1 ? idx + 1 : ''}`,
      sourceNodeIds: [node.id],
      complexityScore: 1,
      complexityReasons: {
        elementCount: 1,
        charts: 1,
        interactions: 0,
        maxDepth: 1,
      },
      layoutMetadata: {
        direction: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        height: node.bbox?.height || 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    }))
  } else if (needChartFromTruth) {
    chartSections = chartsTruth.map((c, idx) => ({
      id: `chart-truth-${idx}`,
      type: 'chart',
      chartType: resolveEchartsType(c.type) || 'pie',
      responsibility: '图表区域（echarts）',
      elementCount: 1,
      title: `图表${chartsTruth.length > 1 ? idx + 1 : ''}`,
      // 🛡️ 透传视觉真值（series/legend/colors），供下游 prompt/N2 兜底消费
      chartSeries: Array.isArray(c.series) ? c.series : [],
      chartLegend: c.legend || null,
      chartColors: Array.isArray(c.seriesColors) ? c.seriesColors : [],
      sourceNodeIds: c.section ? [c.section] : [],
      complexityScore: 1,
      complexityReasons: {
        elementCount: 1,
        charts: 1,
        interactions: 0,
        maxDepth: 1,
      },
      layoutMetadata: {
        direction: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        height: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    }))
  }

  if (chartSections.length === 0) return plan

  const nextSections = [...effectiveSections, ...chartSections]
  const leafCount = collectLeafSections(nextSections).length
  const minSectionsForced = 3
  const isForced = leafCount >= minSectionsForced

  return {
    ...plan,
    effectiveSections: nextSections,
    isForced,
    minFiles: isForced ? leafCount : 0,
    reason: isForced
      ? `叶子 sections=${leafCount} ≥ ${minSectionsForced} → 强制拆分（含强制注入的 ${chartSections.length} 个图表 section）`
      : `叶子 sections=${leafCount} < ${minSectionsForced} → 不强制拆分（已注入 ${chartSections.length} 个图表 section）`,
  }
}

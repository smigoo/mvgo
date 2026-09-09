/**
 * 图表类型映射工具
 * 将Figma节点名称或中文图表类型映射到标准的图表类型
 *
 * 问题：AI将水球图识别为progress-circle（进度环形图）
 * 解决：添加中文图表类型映射，将"水球图"映射到"liquidFill"
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'chart-type-mapper' })

/**
 * 中文图表类型到标准类型的映射
 */
const CHINESE_CHART_TYPE_MAP = {
  // 水球图
  '水球图': 'liquidFill',
  '液体填充图': 'liquidFill',
  '水位图': 'liquidFill',

  // 常见图表类型
  '柱状图': 'bar',
  '条形图': 'bar',
  '折线图': 'line',
  '曲线图': 'line',
  '饼图': 'pie',
  '环形图': 'pie',
  '散点图': 'scatter',
  '雷达图': 'radar',
  '仪表盘': 'gauge',
  '仪表图': 'gauge',
  '漏斗图': 'funnel',
  '桑基图': 'sankey',
  '关系图': 'graph',
  '树图': 'tree',
  '矩形树图': 'treemap',
  '旭日图': 'sunburst',
  '地图': 'map',
  'K线图': 'candlestick',
  '箱线图': 'boxplot'
}

/**
 * Figma节点命名规范映射
 * 格式：@echarts/图表类型
 */
const FIGMA_NODE_PATTERN = /@echarts\/(.+)/i

export class ChartTypeMapper {
  /**
   * 映射图表类型
   * @param {string} input - 输入的图表名称（可能是中文、Figma节点名等）
   * @returns {string|null} 标准的图表类型，如果无法识别则返回null
   */
  static map(input) {
    if (!input || typeof input !== 'string') {
      return null
    }

    const trimmed = input.trim()

    // 1. 检查是否是 Figma 节点命名规范：@echarts/水球图
    const figmaMatch = trimmed.match(FIGMA_NODE_PATTERN)
    if (figmaMatch) {
      const chartName = figmaMatch[1]
      const mappedType = CHINESE_CHART_TYPE_MAP[chartName]

      if (mappedType) {
        logger.info('映射Figma节点到图表类型', {
          input: trimmed,
          chartName,
          mappedType
        })
        return mappedType
      }
    }

    // 2. 直接查找中文图表类型映射
    if (CHINESE_CHART_TYPE_MAP[trimmed]) {
      logger.info('映射中文图表类型', {
        input: trimmed,
        mappedType: CHINESE_CHART_TYPE_MAP[trimmed]
      })
      return CHINESE_CHART_TYPE_MAP[trimmed]
    }

    // 3. 如果输入本身就是标准类型，直接返回
    const standardTypes = [
      'bar', 'line', 'pie', 'scatter', 'radar', 'gauge',
      'funnel', 'sankey', 'graph', 'tree', 'treemap',
      'sunburst', 'map', 'candlestick', 'boxplot', 'liquidFill'
    ]

    if (standardTypes.includes(trimmed.toLowerCase())) {
      return trimmed.toLowerCase()
    }

    logger.warn('无法识别图表类型', { input: trimmed })
    return null
  }

  /**
   * 检查是否是水球图
   * @param {string} input - 输入的图表名称
   * @returns {boolean}
   */
  static isLiquidFill(input) {
    const mapped = this.map(input)
    return mapped === 'liquidFill'
  }

  /**
   * 获取所有支持的中文图表类型
   * @returns {string[]}
   */
  static getSupportedChineseTypes() {
    return Object.keys(CHINESE_CHART_TYPE_MAP)
  }

  /**
   * 获取所有标准图表类型
   * @returns {string[]}
   */
  static getStandardTypes() {
    return [...new Set(Object.values(CHINESE_CHART_TYPE_MAP))]
  }
}

export default ChartTypeMapper

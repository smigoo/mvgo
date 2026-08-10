/**
 * 图表规则验证器
 * 检查 ECharts 图表配置是否符合规范
 */

import { RuleValidator } from './rule-validator.js'

export class ChartValidator extends RuleValidator {
  constructor() {
    super()
    this.registerChartRules()
  }

  /**
   * 注册图表相关规则
   * @private
   */
  registerChartRules() {
    // 规则 1: 图表必须提供 tooltip
    this.registerRule('chart-tooltip-required', {
      name: '图表必须提供 tooltip',
      category: 'chart',
      level: 'L3',
      docRef: 'legend-tooltip-rules.md#tooltip必须提供',
      stages: ['preview', 'figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true // 没有图表，规则不适用
        }
        return this.hasTooltip(context.code)
      },
      message: 'ECharts 图表缺少 tooltip 配置，必须提供 tooltip'
    })

    // 规则 2: 图表必须设置 grid.containLabel
    this.registerRule('chart-grid-contain-label', {
      name: '图表必须设置 grid.containLabel',
      category: 'chart',
      level: 'L3',
      docRef: 'chart-configuration-rules.md#grid配置',
      stages: ['preview', 'figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true
        }
        return this.hasContainLabel(context.code)
      },
      message: '图表缺少 grid.containLabel: true 配置，可能导致坐标轴标签溢出'
    })

    // 规则 3: 图表容器必须设置高度
    this.registerRule('chart-container-height', {
      name: '图表容器必须设置高度',
      category: 'chart',
      level: 'L2',
      docRef: 'chart-configuration-rules.md#图表容器尺寸规范',
      stages: ['preview', 'figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true
        }
        return this.hasChartContainerHeight(context.code)
      },
      message: '图表容器缺少明确的 height 设置'
    })

    // 规则 4: 图表必须监听 resize
    this.registerRule('chart-resize-listener', {
      name: '图表必须监听 resize',
      category: 'chart',
      level: 'L2',
      docRef: 'chart-configuration-rules.md#响应式调整',
      stages: ['preview', 'figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true
        }
        return this.hasResizeListener(context.code)
      },
      message: '图表缺少 resize 监听，窗口尺寸变化时不会自动调整'
    })

    // 规则 5: 图表颜色必须使用主题变量
    this.registerRule('chart-theme-colors', {
      name: '图表颜色必须使用主题变量',
      category: 'chart',
      level: 'L2',
      docRef: 'chart-configuration-rules.md#主题变量使用规范',
      stages: ['figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true
        }
        return this.usesThemeColors(context.code)
      },
      message: '图表颜色未使用 props.cssVars，无法适配主题切换'
    })

    // 规则 6: 图例必须设置 itemWidth/itemHeight
    this.registerRule('legend-size-required', {
      name: '图例必须设置尺寸',
      category: 'chart',
      level: 'L2',
      docRef: 'legend-tooltip-rules.md#图例尺寸还原规则',
      stages: ['figma'],
      check: (context) => {
        if (!this.hasLegend(context.code)) {
          return true
        }
        return this.hasLegendSize(context.code)
      },
      message: '图例未设置 itemWidth/itemHeight，将使用 ECharts 默认尺寸（25x14）偏大'
    })

    // 规则 7: 禁止使用 DOM 模拟图表元素
    this.registerRule('no-dom-chart-elements', {
      name: '禁止 DOM 模拟图表元素',
      category: 'chart',
      level: 'L3',
      docRef: 'chart-configuration-rules.md#图表元素强制使用ECharts',
      stages: ['preview', 'figma'],
      check: (context) => {
        return !this.hasDomChartElements(context.code)
      },
      message: '检测到 DOM 元素模拟图表功能（如 markLine、label），必须使用 ECharts 原生配置'
    })

    // 规则 8: 图表必须正确销毁
    this.registerRule('chart-dispose-on-unmount', {
      name: '图表必须正确销毁',
      category: 'chart',
      level: 'L2',
      docRef: 'chart-configuration-rules.md#数据绑定',
      stages: ['preview', 'figma'],
      check: (context) => {
        if (!this.hasChart(context.code)) {
          return true
        }
        return this.hasChartDispose(context.code)
      },
      message: '图表未在 onUnmounted 中调用 dispose()，可能导致内存泄漏'
    })
  }

  /**
   * 检查代码中是否有图表
   * @private
   */
  hasChart(code) {
    return /echarts\.init|import.*echarts/i.test(code)
  }

  /**
   * 检查是否有 tooltip 配置
   * @private
   */
  hasTooltip(code) {
    // 检查是否有 tooltip 配置且未被禁用
    const hasTooltipConfig = /tooltip\s*:\s*\{/.test(code)
    const hasShowFalse = /tooltip\s*:\s*\{\s*show\s*:\s*false/.test(code)
    return hasTooltipConfig && !hasShowFalse
  }

  /**
   * 检查是否设置了 containLabel
   * @private
   */
  hasContainLabel(code) {
    return /containLabel\s*:\s*true/.test(code)
  }

  /**
   * 检查图表容器是否有高度
   * @private
   */
  hasChartContainerHeight(code) {
    // 检查 style 或 CSS 中是否设置了 height
    const hasInlineHeight = /height\s*:\s*['"]?\d+px['"]?/.test(code)
    const hasCssHeight = /\.chart.*\{[^}]*height\s*:\s*\d+px/.test(code)
    return hasInlineHeight || hasCssHeight
  }

  /**
   * 检查是否有 resize 监听
   * @private
   */
  hasResizeListener(code) {
    return /chart\.resize\(\)|chart\?\.resize\(\)/.test(code) &&
           (/addEventListener\(['"]resize['"]|watch\([^)]*resize/.test(code))
  }

  /**
   * 检查是否使用主题变量
   * @private
   */
  usesThemeColors(code) {
    // 检查是否使用 props.cssVars
    return /props\.cssVars\.|cssVars\./i.test(code)
  }

  /**
   * 检查是否有图例
   * @private
   */
  hasLegend(code) {
    return /legend\s*:\s*\{/.test(code)
  }

  /**
   * 检查图例是否设置了尺寸
   * @private
   */
  hasLegendSize(code) {
    const hasItemWidth = /itemWidth\s*:\s*\d+/.test(code)
    const hasItemHeight = /itemHeight\s*:\s*\d+/.test(code)
    return hasItemWidth && hasItemHeight
  }

  /**
   * 检查是否有 DOM 模拟图表元素
   * @private
   */
  hasDomChartElements(code) {
    // 检查是否有类似 "warning-line", "chart-label" 等 DOM 元素
    const suspiciousClasses = [
      'warning-line',
      'warning-text',
      'chart-label',
      'reference-line',
      'threshold-line'
    ]

    return suspiciousClasses.some(cls =>
      new RegExp(`class=['"].*${cls}.*['"]`).test(code)
    )
  }

  /**
   * 检查是否正确销毁图表
   * @private
   */
  hasChartDispose(code) {
    return /onUnmounted\([^)]*\{[^}]*dispose\(\)/.test(code) ||
           /onUnmounted.*chart.*dispose/.test(code)
  }
}

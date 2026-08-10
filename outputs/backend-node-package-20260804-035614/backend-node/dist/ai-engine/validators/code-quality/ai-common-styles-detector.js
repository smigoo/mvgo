/**
 * AI 常用样式检测器
 * 检测是否使用了 AI 常添加但 Figma 中不存在的样式
 */

import forbiddenStylesConfig from '../../config/forbidden-styles.config.js'

export class AICommonStylesDetector {
  constructor() {
    this.config = forbiddenStylesConfig
  }

  /**
   * 检测可疑的 AI 常用样式
   * @param {Object} refinement - 智能体的精修结果
   * @param {Object} figmaNode - 原始 Figma 数据
   * @returns {Array} 检测到的问题列表
   */
  detect(refinement, figmaNode) {
    const issues = []

    // 1. 检查圆角
    issues.push(...this.detectBorderRadius(refinement, figmaNode))

    // 2. 检查边框
    issues.push(...this.detectBorders(refinement, figmaNode))

    // 3. 检查颜色
    issues.push(...this.detectColors(refinement, figmaNode))

    // 4. 检查阴影
    issues.push(...this.detectShadows(refinement, figmaNode))

    return issues
  }

  /**
   * 检测圆角
   */
  detectBorderRadius(refinement, figmaNode) {
    const issues = []
    const refinedCSS = refinement.refinedCSS || {}

    for (const [selector, styles] of Object.entries(refinedCSS)) {
      if (styles['border-radius']) {
        const value = styles['border-radius']

        // 检查是否在禁止列表中
        if (this.config.forbiddenBorderRadius.includes(value)) {
          // 验证 Figma 中是否真的有这个圆角
          const figmaRadius = figmaNode.cornerRadius
          const expectedValue = figmaRadius !== undefined ? `${figmaRadius}px` : null

          if (value !== expectedValue) {
            issues.push({
              type: 'ai-common-style',
              category: 'border-radius',
              selector,
              property: 'border-radius',
              value,
              severity: 'error',
              message: `使用了 AI 常用圆角 ${value}，但 Figma 中${figmaRadius !== undefined ? `是 ${expectedValue}` : '无圆角'}`,
              suggestion: figmaRadius !== undefined ? `改为 ${expectedValue}` : '删除此属性'
            })
          }
        }
      }
    }

    return issues
  }

  /**
   * 检测边框
   */
  detectBorders(refinement, figmaNode) {
    const issues = []
    const refinedCSS = refinement.refinedCSS || {}

    for (const [selector, styles] of Object.entries(refinedCSS)) {
      const border = styles['border']

      if (border) {
        // 检查是否在禁止列表中
        const isForbidden = this.config.forbiddenBorders.some(forbidden =>
          border.includes(forbidden) || border === forbidden
        )

        if (isForbidden) {
          // 验证 Figma 中是否有边框
          const hasFigmaBorder = figmaNode.strokes && figmaNode.strokes.length > 0

          if (!hasFigmaBorder) {
            issues.push({
              type: 'ai-common-style',
              category: 'border',
              selector,
              property: 'border',
              value: border,
              severity: 'error',
              message: `添加了 AI 常用边框 ${border}，但 Figma 中无边框定义`,
              suggestion: '删除此属性'
            })
          }
        }
      }
    }

    return issues
  }

  /**
   * 检测颜色
   */
  detectColors(refinement, figmaNode) {
    const issues = []
    const refinedCSS = refinement.refinedCSS || {}

    // 收集所有禁止的颜色
    const allForbiddenColors = [
      ...this.config.forbiddenColors.tailwind,
      ...this.config.forbiddenColors.common,
      ...this.config.forbiddenColors.bluePurple
    ]

    for (const [selector, styles] of Object.entries(refinedCSS)) {
      // 检查各种颜色属性
      const colorProps = ['color', 'background-color', 'background', 'border-color']

      for (const prop of colorProps) {
        const value = styles[prop]
        if (!value) continue

        // 跳过 CSS 变量（允许使用）
        if (value.startsWith('var(')) continue

        // 标准化颜色值（统一转为小写，去除空格）
        const normalizedValue = this.normalizeColor(value)

        // 检查是否是禁止的颜色
        if (allForbiddenColors.some(forbidden =>
          this.normalizeColor(forbidden) === normalizedValue
        )) {
          // 验证 Figma 中是否有这个颜色
          const figmaColor = this.extractFigmaColor(figmaNode, prop)

          issues.push({
            type: 'ai-common-style',
            category: 'color',
            selector,
            property: prop,
            value,
            severity: 'error',
            message: `使用了 AI 常用颜色 ${value}（Tailwind/Bootstrap 默认色），但 Figma 中${figmaColor ? `是 ${figmaColor}` : '无此颜色'}`,
            suggestion: figmaColor ? `改为 ${figmaColor}` : '使用微码 CSS 变量或删除'
          })
        }
      }
    }

    return issues
  }

  /**
   * 检测阴影
   */
  detectShadows(refinement, figmaNode) {
    const issues = []
    const refinedCSS = refinement.refinedCSS || {}

    for (const [selector, styles] of Object.entries(refinedCSS)) {
      const shadow = styles['box-shadow']

      if (shadow) {
        // 检查是否在禁止列表中
        const isForbidden = this.config.forbiddenShadows.some(forbidden =>
          shadow.includes(forbidden) || shadow === forbidden
        )

        if (isForbidden) {
          // 验证 Figma 中是否有阴影
          const hasFigmaShadow = figmaNode.effects?.some(e =>
            e.type === 'DROP_SHADOW' && e.visible !== false
          )

          if (!hasFigmaShadow) {
            issues.push({
              type: 'ai-common-style',
              category: 'shadow',
              selector,
              property: 'box-shadow',
              value: shadow,
              severity: 'error',
              message: `添加了 AI 常用阴影 ${shadow}，但 Figma 中无阴影效果`,
              suggestion: '删除此属性'
            })
          }
        }
      }
    }

    return issues
  }

  /**
   * 标准化颜色值（便于比较）
   */
  normalizeColor(color) {
    return color.toLowerCase().replace(/\s+/g, '')
  }

  /**
   * 从 Figma 节点提取颜色
   */
  extractFigmaColor(figmaNode, prop) {
    if (prop === 'background-color' || prop === 'background') {
      if (figmaNode.fills && figmaNode.fills.length > 0) {
        const fill = figmaNode.fills[0]
        if (fill.type === 'SOLID') {
          return this.rgbaToHex(fill.color)
        }
      }
    }

    if (prop === 'color') {
      // 文本颜色
      if (figmaNode.fills && figmaNode.fills.length > 0) {
        const fill = figmaNode.fills[0]
        if (fill.type === 'SOLID') {
          return this.rgbaToHex(fill.color)
        }
      }
    }

    if (prop === 'border-color') {
      if (figmaNode.strokes && figmaNode.strokes.length > 0) {
        const stroke = figmaNode.strokes[0]
        if (stroke.type === 'SOLID') {
          return this.rgbaToHex(stroke.color)
        }
      }
    }

    return null
  }

  /**
   * Figma RGBA 转 Hex
   */
  rgbaToHex(color) {
    const r = Math.round(color.r * 255)
    const g = Math.round(color.g * 255)
    const b = Math.round(color.b * 255)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  /**
   * 生成检测报告
   */
  generateReport(issues) {
    if (issues.length === 0) {
      return {
        passed: true,
        message: '未检测到 AI 常用样式'
      }
    }

    const byCategory = {}
    for (const issue of issues) {
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = []
      }
      byCategory[issue.category].push(issue)
    }

    return {
      passed: false,
      totalIssues: issues.length,
      byCategory,
      summary: Object.entries(byCategory).map(([category, items]) =>
        `${category}: ${items.length} 项`
      ).join(', ')
    }
  }
}

export default AICommonStylesDetector

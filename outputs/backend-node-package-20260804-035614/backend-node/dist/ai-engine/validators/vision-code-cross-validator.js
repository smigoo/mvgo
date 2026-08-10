/**
 * Vision-Code Cross Validator - Vision 与 Code 交叉验证器
 * 验证 Vision 分析与生成的代码之间的一致性
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'vision-code-cross-validator' })

export class VisionCodeCrossValidator {
  constructor(config = {}) {
    this.strictMode = config.strictMode || false
  }

  /**
   * 执行交叉验证
   * @param {Object} visionAnalysis - Vision 分析结果
   * @param {string} generatedCode - 生成的代码
   * @param {Object} options - 配置选项
   * @returns {Object} 验证结果
   */
  validate(visionAnalysis, generatedCode, options = {}) {
    const results = {
      layout: this.validateLayoutConsistency(visionAnalysis, generatedCode),
      elements: this.validateElementCount(visionAnalysis, generatedCode),
      charts: this.validateCharts(visionAnalysis, generatedCode),
      interactions: this.validateInteractions(visionAnalysis, generatedCode),
      styles: this.validateStyles(visionAnalysis, generatedCode)
    }

    // 计算总体评分
    const allChecks = [
      ...results.layout.checks,
      ...results.elements.checks,
      ...results.charts.checks,
      ...results.interactions.checks,
      ...results.styles.checks
    ]

    const passedCount = allChecks.filter(c => c.passed).length
    const score = allChecks.length > 0 ? Math.round((passedCount / allChecks.length) * 100) : 0

    // 收集所有问题
    const allIssues = []
    const allWarnings = []

    for (const [key, result] of Object.entries(results)) {
      if (result.issues) allIssues.push(...result.issues)
      if (result.warnings) allWarnings.push(...result.warnings)
    }

    return {
      passed: allIssues.length === 0,
      score,
      results,
      issues: allIssues,
      warnings: allWarnings,
      summary: {
        totalChecks: allChecks.length,
        passedChecks: passedCount,
        failedChecks: allChecks.length - passedCount,
        criticalIssues: allIssues.filter(i => i.severity === 'error').length
      }
    }
  }

  /**
   * 验证布局一致性
   */
  validateLayoutConsistency(visionAnalysis, generatedCode) {
    const issues = []
    const warnings = []
    const checks = []

    const visionLayout = visionAnalysis.layout || {}
    const sections = visionLayout.sections || []

    // 检查布局类型声明
    if (visionLayout.type) {
      const layoutType = visionLayout.type.toLowerCase()

      if (layoutType === 'vertical') {
        const hasColumnLayout = /flex-direction:\s*column|display:\s*grid|grid-template-rows/g.test(generatedCode)
        checks.push({
          name: 'layout.vertical_implementation',
          passed: hasColumnLayout,
          expected: 'flex-direction: column 或 display: grid',
          actual: hasColumnLayout ? '已实现' : '未实现'
        })

        if (!hasColumnLayout) {
          warnings.push({
            type: 'layout_mismatch',
            severity: 'warning',
            message: '声明了纵向布局但代码中未找到 column 相关样式',
            suggestion: '请确认使用了 flex-direction: column 或 grid'
          })
        }
      } else if (layoutType === 'horizontal' || layoutType === 'horizontal-2-columns' || layoutType === 'horizontal-3-columns') {
        const hasRowLayout = /flex-direction:\s*row|display:\s*flex|display:\s*grid|grid-template-columns/g.test(generatedCode)
        checks.push({
          name: 'layout.horizontal_implementation',
          passed: hasRowLayout,
          expected: 'flex-direction: row',
          actual: hasRowLayout ? '已实现' : '未实现'
        })

        if (!hasRowLayout) {
          warnings.push({
            type: 'layout_mismatch',
            severity: 'warning',
            message: '声明了横向布局但代码中未找到 row 相关样式',
            suggestion: '请确认使用了 flex-direction: row'
          })
        }
      }
    }

    // 检查 section 数量与代码中的组件数量
    if (sections.length > 0) {
      // 提取代码中的组件数量（通过 v-for 或 class 名称）
      const componentMatches = generatedCode.match(/v-for=.*?in\s+(\w+)/g) || []
      const declaredComponents = componentMatches.length

      checks.push({
        name: 'layout.sections_vs_components',
        passed: Math.abs(sections.length - declaredComponents) <= 1,
        expected: `${sections.length} 个 section`,
        actual: `${declaredComponents} 个组件`
      })
    }

    return { issues, warnings, checks }
  }

  /**
   * 验证元素数量
   */
  validateElementCount(visionAnalysis, generatedCode) {
    const issues = []
    const warnings = []
    const checks = []

    // 统计 Vision 中的元素数量
    const visionElements = this.countVisionElements(visionAnalysis)

    // 统计代码中的元素数量
    const codeElements = this.countCodeElements(generatedCode)

    // 检查数据卡片数量
    if (visionElements.cardCount > 0) {
      const codeCardCount = codeElements.cardCount

      checks.push({
        name: 'elements.card_count',
        passed: codeCardCount >= visionElements.cardCount,
        expected: `>= ${visionElements.cardCount} 个卡片`,
        actual: `${codeCardCount} 个卡片`
      })

      if (codeCardCount < visionElements.cardCount) {
        warnings.push({
          type: 'element_count_mismatch',
          severity: 'warning',
          message: `代码中卡片数量 (${codeCardCount}) 少于 Vision 分析 (${visionElements.cardCount})`,
          suggestion: '请检查是否遗漏了某些元素'
        })
      }
    }

    return { issues, warnings, checks }
  }

  /**
   * 统计 Vision 中的元素
   */
  countVisionElements(analysis) {
    let cardCount = 0
    let chartCount = 0
    let controlCount = 0

    // 从 sections 统计
    if (analysis.layout?.sections) {
      const countFromSections = (sections) => {
        for (const section of sections) {
          if (section.role === 'stat-card' || section.name?.includes('卡片') || section.name?.includes('统计')) {
            cardCount++
          }
          if (section.body?.children) {
            for (const child of section.body.children) {
              if (child.role === 'stat-card' || child.name?.includes('卡片')) {
                cardCount++
              }
              if (child.role === 'chart' || child.name?.includes('图')) {
                chartCount++
              }
            }
          }
          if (section.header?.controls) {
            controlCount += section.header.controls.length
          }
          if (section.children) {
            countFromSections(section.children)
          }
        }
      }

      countFromSections(analysis.layout.sections)
    }

    // 从 charts 统计
    if (analysis.charts) {
      chartCount += analysis.charts.length
    }

    return { cardCount, chartCount, controlCount }
  }

  /**
   * 统计代码中的元素
   */
  countCodeElements(code) {
    let cardCount = 0
    let chartCount = 0

    // 统计卡片
    const cardPatterns = [
      /class=".*card.*"/gi,
      /class=".*stat.*"/gi,
      /class=".*summary.*"/gi,
      /:class=".*card.*"/gi
    ]

    for (const pattern of cardPatterns) {
      const matches = code.match(pattern)
      if (matches) cardCount += matches.length
    }

    // 统计图表
    const chartPatterns = [
      /class=".*chart.*"/gi,
      /<EChart/g,
      /<echarts/g,
      /chart\s*:/gi
    ]

    for (const pattern of chartPatterns) {
      const matches = code.match(pattern)
      if (matches) chartCount += matches.length
    }

    return { cardCount, chartCount }
  }

  /**
   * 验证图表
   */
  validateCharts(visionAnalysis, generatedCode) {
    const issues = []
    const warnings = []
    const checks = []

    const charts = visionAnalysis.charts || []

    if (charts.length > 0) {
      // 检查代码中是否有图表
      const hasChart = /<EChart|<echarts|ECharts|echarts|chart\s*:/g.test(generatedCode)

      checks.push({
        name: 'charts.presence',
        passed: hasChart,
        expected: `${charts.length} 个图表`,
        actual: hasChart ? '代码中有图表组件' : '代码中无图表组件'
      })

      if (!hasChart) {
        warnings.push({
          type: 'missing_charts',
          severity: 'warning',
          message: `Vision 分析包含 ${charts.length} 个图表，但代码中未找到图表组件`,
          suggestion: '请添加图表组件（如 ECharts）'
        })
      }

      // 检查图表类型
      for (const chart of charts) {
        if (chart.type) {
          const expectedType = chart.type.toLowerCase()
          const hasCorrectType = generatedCode.toLowerCase().includes(expectedType) ||
            expectedType.includes('bar') && /bar|column/g.test(generatedCode) ||
            expectedType.includes('line') && /line/g.test(generatedCode) ||
            expectedType.includes('pie') && /pie|gauge/g.test(generatedCode)

          if (!hasCorrectType) {
            warnings.push({
              type: 'chart_type_mismatch',
              severity: 'warning',
              message: `Vision 分析图表类型为 "${chart.type}"，但代码中未找到对应实现`,
              suggestion: '请实现对应的图表类型'
            })
          }
        }
      }
    }

    return { issues, warnings, checks }
  }

  /**
   * 验证交互
   */
  validateInteractions(visionAnalysis, generatedCode) {
    const issues = []
    const warnings = []
    const checks = []

    const interactions = visionAnalysis.interactions || []

    for (const interaction of interactions) {
      const type = interaction.type

      // 检查对应的交互实现
      if (type === 'dropdown') {
        const hasDropdown = /<el-select|<van-picker|<select|<Dropdown/g.test(generatedCode)
        if (!hasDropdown) {
          warnings.push({
            type: 'missing_interaction',
            severity: 'warning',
            message: `Vision 分析包含 "${interaction.target}" 下拉框，但代码中未找到下拉组件`,
            suggestion: '请添加下拉选择组件'
          })
        }
      } else if (type === 'tab-switch') {
        const hasTabs = /<el-tabs|<van-tabs|<Tabs/g.test(generatedCode)
        if (!hasTabs) {
          warnings.push({
            type: 'missing_interaction',
            severity: 'warning',
            message: `Vision 分析包含 Tab 切换，但代码中未找到 Tab 组件`,
            suggestion: '请添加 Tab 组件'
          })
        }
      } else if (type === 'tooltip') {
        const hasTooltip = /<el-tooltip|<van-popover|<Tooltip/g.test(generatedCode)
        if (!hasTooltip) {
          warnings.push({
            type: 'missing_interaction',
            severity: 'warning',
            message: `Vision 分析包含 Tooltip，但代码中可能未完整实现`,
            suggestion: '请确认 Tooltip 实现'
          })
        }
      }
    }

    checks.push({
      name: 'interactions.check',
      passed: warnings.filter(w => w.type === 'missing_interaction').length === 0,
      expected: '交互元素完整',
      actual: `${warnings.filter(w => w.type === 'missing_interaction').length} 个缺失`
    })

    return { issues, warnings, checks }
  }

  /**
   * 验证样式
   */
  validateStyles(visionAnalysis, generatedCode) {
    const issues = []
    const warnings = []
    const checks = []

    const styles = visionAnalysis.styles || {}

    // 检查 backgroundBrightness
    if (styles.backgroundBrightness) {
      const brightness = styles.backgroundBrightness

      if (brightness === 'dark') {
        const hasDarkStyles = /background.*#0|#1a2|#222|#333|dark|background-color.*black/g.test(generatedCode)
        checks.push({
          name: 'styles.dark_theme',
          passed: hasDarkStyles,
          expected: '深色主题样式',
          actual: hasDarkStyles ? '已实现' : '未明确'
        })
      } else if (brightness === 'light') {
        const hasLightStyles = /background.*#fff|#f5|#eee|light|background-color.*white/g.test(generatedCode)
        checks.push({
          name: 'styles.light_theme',
          passed: hasLightStyles,
          expected: '浅色主题样式',
          actual: hasLightStyles ? '已实现' : '未明确'
        })
      }
    }

    // 检查是否有 CSS 变量使用
    const hasCSSVars = /var\(--/g.test(generatedCode)
    checks.push({
      name: 'styles.css_variables',
      passed: hasCSSVars,
      expected: '使用 CSS 变量',
      actual: hasCSSVars ? '已使用' : '未使用'
    })

    return { issues, warnings, checks }
  }

  /**
   * 生成详细报告
   */
  generateReport(result, options = {}) {
    const { componentName = 'unknown', imagePath = 'unknown' } = options

    let report = `\n`
    report += `═══════════════════════════════════════════════════════════════\n`
    report += `  Vision vs Code 交叉验证报告\n`
    report += `═══════════════════════════════════════════════════════════════\n`
    report += `组件: ${componentName}\n`
    report += `图片来源: ${imagePath}\n`
    report += `时间: ${new Date().toISOString()}\n`
    report += `\n`

    // 总体状态
    report += `【总体状态】\n`
    report += `  ${result.passed ? '✅ 通过' : '❌ 失败'}\n`
    report += `  评分: ${result.score}/100\n`
    report += `\n`

    // 各维度验证结果
    report += `【分项验证】\n`
    for (const [key, val] of Object.entries(result.results)) {
      const passedChecks = val.checks?.filter(c => c.passed).length || 0
      const totalChecks = val.checks?.length || 0
      const status = passedChecks === totalChecks ? '✅' : '⚠️'
      report += `  ${status} ${key}: ${passedChecks}/${totalChecks} 通过\n`
    }
    report += `\n`

    // 问题列表
    if (result.issues.length > 0) {
      report += `【问题 (${result.issues.length} 项)】\n`
      result.issues.forEach((issue, index) => {
        report += `  ${index + 1}. [${issue.type}] ${issue.message}\n`
      })
      report += `\n`
    }

    // 警告列表
    if (result.warnings.length > 0) {
      report += `【警告 (${result.warnings.length} 项)】\n`
      result.warnings.forEach((warning, index) => {
        report += `  ${index + 1}. [${warning.type}] ${warning.message}\n`
        if (warning.suggestion) {
          report += `     建议: ${warning.suggestion}\n`
        }
      })
      report += `\n`
    }

    // 摘要
    if (result.summary) {
      report += `【摘要】\n`
      report += `  总检查项: ${result.summary.totalChecks}\n`
      report += `  通过: ${result.summary.passedChecks}\n`
      report += `  失败: ${result.summary.failedChecks}\n`
      report += `  严重问题: ${result.summary.criticalIssues}\n`
    }

    report += `\n`

    return report
  }

  /**
   * 快速验证
   */
  quickValidate(visionAnalysis, generatedCode) {
    const result = this.validate(visionAnalysis, generatedCode)
    return {
      pass: result.passed,
      score: result.score,
      issues: result.issues.map(i => i.message),
      warnings: result.warnings.map(w => w.message)
    }
  }
}

export default VisionCodeCrossValidator

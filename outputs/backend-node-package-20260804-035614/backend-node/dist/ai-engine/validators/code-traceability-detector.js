/**
 * Code Traceability Detector - 代码溯源检测器
 * 检查生成的代码内容是否来自 Vision 分析，而非外部知识补充
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'code-traceability-detector' })

// 通用知识词汇（这些词汇本身不算臆造，但需要具体来源）
const GENERIC_TERMS = [
  '流量', '速度', '指数', '趋势', '图表',
  '统计', '数据', '监测', '监控', '状态',
  '时间', '日期', '名称', '标题', '列表',
  '小时', '天', '周', '月', '年'
]

// 可疑的数值模式（可能臆造）
const SUSPICIOUS_NUMERIC_PATTERNS = [
  /^\d{4,}$/,      // 4位以上数字（年份除外）
  /^\d+\.\d{2,}$/, // 超过2位小数
  /^[一二三四五六七八九十]+$/, // 中文数字
]

export class CodeTraceabilityDetector {
  constructor(config = {}) {
    this.strictMode = config.strictMode || false
  }

  /**
   * 检测代码内容是否可溯源
   * @param {string} generatedCode - 生成的代码
   * @param {Object} visionAnalysis - Vision 分析结果
   * @param {Object} options - 配置选项
   * @returns {Object} 检测结果
   */
  detect(generatedCode, visionAnalysis, options = {}) {
    const issues = []
    const warnings = []
    const checks = []

    // 1. 提取代码中的文本内容
    const codeTexts = this.extractTemplateTexts(generatedCode)
    const codeDataValues = this.extractDataValues(generatedCode)

    // 2. 提取 Vision 分析中的所有文本
    const visionTexts = this.flattenVisionTexts(visionAnalysis)

    // 3. 检查每个代码文本的来源
    const textTracingResults = this.traceTexts(codeTexts, visionTexts, visionAnalysis)
    issues.push(...textTracingResults.issues)
    warnings.push(...textTracingResults.warnings)

    // 4. 检查数据值的来源
    const valueTracingResults = this.traceValues(codeDataValues, visionAnalysis)
    issues.push(...valueTracingResults.issues)
    warnings.push(...valueTracingResults.warnings)

    // 5. 检查样式来源
    const styleResults = this.checkStyleTraceability(generatedCode, visionAnalysis)
    issues.push(...styleResults.issues)
    warnings.push(...styleResults.warnings)

    // 6. 检查布局一致性
    const layoutResults = this.checkLayoutConsistency(generatedCode, visionAnalysis)
    warnings.push(...layoutResults.warnings)
    checks.push(...layoutResults.checks)

    // 7. 计算评分
    const score = this.calculateScore(codeTexts, codeDataValues, issues, warnings)

    return {
      passed: issues.length === 0,
      score,
      issues,
      warnings,
      checks,
      details: {
        codeTextsFound: codeTexts.length,
        visionTextsFound: visionTexts.length,
        untracedContents: issues.filter(i => i.type === 'untraced_content').length,
        suspiciousValues: issues.filter(i => i.type === 'suspicious_value').length
      },
      summary: this.generateSummary(issues, warnings, codeTexts, codeDataValues)
    }
  }

  /**
   * 从模板中提取文本内容
   */
  extractTemplateTexts(code) {
    const texts = []

    // 提取双花括号中的内容
    const doubleBracePattern = /\{\{([^}]+)\}\}/g
    let match
    while ((match = doubleBracePattern.exec(code)) !== null) {
      const content = match[1].trim()
      // 排除变量引用和表达式
      if (!content.includes('(') && !content.includes('=>') && !content.includes('.')) {
        texts.push(content)
      }
    }

    // 提取引号中的字符串
    const quotePattern = /['"]([^'"]+)['"]/g
    while ((match = quotePattern.exec(code)) !== null) {
      const content = match[1].trim()
      if (content.length > 1 && !content.startsWith('@/') && !content.startsWith('/')) {
        texts.push(content)
      }
    }

    return [...new Set(texts)]
  }

  /**
   * 从代码中提取数据值
   */
  extractDataValues(code) {
    const values = []

    // 提取 ref/reactive 中的数据
    const dataPattern = /(?:\w+Data|\w+List|\w+Options)\s*=\s*ref\s*\(\s*\[([\s\S]*?)\]\s*\)/g
    let match
    while ((match = dataPattern.exec(code)) !== null) {
      const content = match[1]
      // 提取字符串值
      const stringMatch = content.match(/['"]([^'"]+)['"]/g)
      if (stringMatch) {
        values.push(...stringMatch.map(s => s.replace(/['"]/g, '')))
      }
    }

    // 提取对象属性值
    const valuePattern = /value:\s*['"]([^'"]+)['"]/g
    while ((match = valuePattern.exec(code)) !== null) {
      values.push(match[1])
    }

    return [...new Set(values)]
  }

  /**
   * 扁平化 Vision 分析中的所有文本
   */
  flattenVisionTexts(analysis) {
    const texts = []

    // 从 layout.sections 提取
    if (analysis.layout?.sections) {
      this.extractFromSections(analysis.layout.sections, texts)
    }

    // 从 summary 提取
    if (analysis.summary) {
      texts.push(analysis.summary)
    }

    // 从 imageEvidence 提取
    if (analysis.imageEvidence) {
      texts.push(...analysis.imageEvidence)
    }

    // 从 interactions 提取
    if (analysis.interactions) {
      for (const interaction of analysis.interactions) {
        if (interaction.target) texts.push(interaction.target)
        if (interaction.description) texts.push(interaction.description)
      }
    }

    // 从 charts 提取
    if (analysis.charts) {
      for (const chart of analysis.charts) {
        if (chart.section) texts.push(chart.section)
        if (chart.series) texts.push(...chart.series)
        if (chart.legend) texts.push(...chart.legend)
      }
    }

    // 去重
    return [...new Set(texts)]
  }

  /**
   * 从 sections 递归提取文本
   */
  extractFromSections(sections, texts) {
    for (const section of sections) {
      if (section.name) texts.push(section.name)
      if (section.id) texts.push(section.id)

      // 提取 header
      if (section.header) {
        if (section.header.title) texts.push(section.header.title)
        if (section.header.controls) {
          for (const control of section.header.controls) {
            if (control.name) texts.push(control.name)
            if (control.value) texts.push(control.value)
          }
        }
      }

      // 递归处理 children
      if (section.body?.children) {
        this.extractFromChildren(section.body.children, texts)
      }
    }
  }

  /**
   * 从 children 递归提取文本
   */
  extractFromChildren(children, texts) {
    for (const child of children) {
      if (child.name) texts.push(child.name)
      if (child.value) texts.push(String(child.value))
      if (child.role) texts.push(child.role)

      if (child.children) {
        this.extractFromChildren(child.children, texts)
      }
    }
  }

  /**
   * 追踪文本来源
   */
  traceTexts(codeTexts, visionTexts, visionAnalysis) {
    const issues = []
    const warnings = []

    for (const text of codeTexts) {
      // 跳过短文本
      if (text.length < 2) continue

      // 检查是否来自 Vision
      const hasSource = visionTexts.some(vt =>
        vt.includes(text) || text.includes(vt) || this.similarity(text, vt) > 0.8
      )

      // 检查是否为通用知识
      const isGeneric = GENERIC_TERMS.some(term => text.includes(term))

      if (!hasSource) {
        if (isGeneric) {
          warnings.push({
            type: 'untraced_generic_content',
            content: text,
            severity: 'warning',
            message: `代码文本 "${text}" 来自通用知识，无 Vision 来源`,
            suggestion: '建议从 Vision 分析中获取具体内容'
          })
        } else {
          // 检查是否为可疑数值
          const isSuspiciousValue = SUSPICIOUS_NUMERIC_PATTERNS.some(pattern => pattern.test(text))

          issues.push({
            type: isSuspiciousValue ? 'suspicious_value' : 'untraced_content',
            content: text,
            severity: isSuspiciousValue ? 'error' : 'error',
            message: `代码文本 "${text}" 无 Vision 来源，可能是臆造`,
            suggestion: '请确保代码内容来自 Vision 分析结果'
          })
        }
      }
    }

    return { issues, warnings }
  }

  /**
   * 追踪数据值来源
   */
  traceValues(values, visionAnalysis) {
    const issues = []
    const warnings = []

    const visionTexts = this.flattenVisionTexts(visionAnalysis)

    for (const value of values) {
      // 检查是否为数值
      if (/^\d+(\.\d+)?$/.test(value)) {
        const hasSource = visionTexts.some(vt => vt.includes(value))
        if (!hasSource) {
          issues.push({
            type: 'suspicious_value',
            content: value,
            severity: 'error',
            message: `数值 "${value}" 无 Vision 来源，可能是臆造`,
            suggestion: '请提供真实的测试数据或标记为占位符'
          })
        }
      }
    }

    return { issues, warnings }
  }

  /**
   * 检查样式溯源
   */
  checkStyleTraceability(code, visionAnalysis) {
    const issues = []
    const warnings = []

    // 检查是否有 padding/margin 数值（可能臆造）
    const paddingPattern = /padding:\s*(\d+)px/g
    const marginPattern = /margin:\s*(\d+)px/g

    let match
    while ((match = paddingPattern.exec(code)) !== null) {
      const value = parseInt(match[1])
      // 如果 padding > 15，可能需要验证
      if (value > 15) {
        warnings.push({
          type: 'large_padding',
          content: `padding: ${value}px`,
          severity: 'warning',
          message: `检测到大数值 padding: ${value}px`,
          suggestion: '请确认此样式值来自 Vision 分析'
        })
      }
    }

    while ((match = marginPattern.exec(code)) !== null) {
      const value = parseInt(match[1])
      if (value > 15) {
        warnings.push({
          type: 'large_margin',
          content: `margin: ${value}px`,
          severity: 'warning',
          message: `检测到大数值 margin: ${value}px`,
          suggestion: '请确认此样式值来自 Vision 分析'
        })
      }
    }

    return { issues, warnings }
  }

  /**
   * 检查布局一致性
   */
  checkLayoutConsistency(code, visionAnalysis) {
    const warnings = []
    const checks = []

    const sections = visionAnalysis.layout?.sections || []

    // 检查是否声明了纵向布局但没有使用 flex-direction: column
    if (visionAnalysis.layout?.type === 'vertical' || visionAnalysis.layout?.direction === 'top-to-bottom') {
      const hasColumnLayout = /flex-direction:\s*column|flex\s*:\s*1|display:\s*grid/g.test(code)

      checks.push({
        name: 'layout.vertical_implementation',
        passed: hasColumnLayout,
        expected: '应使用 column 布局',
        actual: hasColumnLayout ? '已实现' : '未明确实现'
      })
    }

    return { warnings, checks }
  }

  /**
   * 计算相似度
   */
  similarity(str1, str2) {
    const s1 = str1.toLowerCase()
    const s2 = str2.toLowerCase()

    if (s1 === s2) return 1
    if (s1.includes(s2) || s2.includes(s1)) return 0.8

    // 简单的 Jaccard 相似度
    const set1 = new Set(s1.split(''))
    const set2 = new Set(s2.split(''))
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])

    return intersection.size / union.size
  }

  /**
   * 计算评分
   */
  calculateScore(codeTexts, codeDataValues, issues, warnings) {
    const total = codeTexts.length + codeDataValues.length + warnings.length

    if (total === 0) return 100

    const criticalCount = issues.length * 2
    const warningCount = warnings.length

    const score = Math.max(0, 100 - (criticalCount * 20) - (warningCount * 5))

    return score
  }

  /**
   * 生成摘要
   */
  generateSummary(issues, warnings, codeTexts, codeDataValues) {
    return {
      totalCodeTexts: codeTexts.length,
      totalDataValues: codeDataValues.length,
      untracedContents: issues.filter(i => i.type === 'untraced_content').length,
      suspiciousValues: issues.filter(i => i.type === 'suspicious_value').length,
      untracedGeneric: warnings.filter(w => w.type === 'untraced_generic_content').length,
      styleWarnings: warnings.filter(w => w.type.includes('padding') || w.type.includes('margin')).length
    }
  }

  /**
   * 生成详细报告
   */
  generateReport(result, options = {}) {
    const { componentName = 'unknown' } = options

    let report = `\n`
    report += `═══════════════════════════════════════════════════════════════\n`
    report += `  代码溯源检测报告\n`
    report += `═══════════════════════════════════════════════════════════════\n`
    report += `组件: ${componentName}\n`
    report += `时间: ${new Date().toISOString()}\n`
    report += `\n`

    // 总体状态
    report += `【总体状态】\n`
    report += `  ${result.passed ? '✅ 通过' : '❌ 失败'}\n`
    report += `  评分: ${result.score}/100\n`
    report += `\n`

    // 详细信息
    if (result.details) {
      report += `【详细信息】\n`
      report += `  代码文本数: ${result.details.codeTextsFound}\n`
      report += `  Vision 文本数: ${result.details.visionTextsFound}\n`
      report += `  无来源内容: ${result.details.untracedContents}\n`
      report += `  可疑数值: ${result.details.suspiciousValues}\n`
      report += `\n`
    }

    // 问题列表
    if (result.issues.length > 0) {
      report += `【错误 (${result.issues.length} 项)】\n`
      result.issues.forEach((issue, index) => {
        report += `  ${index + 1}. [${issue.type}] ${issue.message}\n`
        if (issue.suggestion) {
          report += `     建议: ${issue.suggestion}\n`
        }
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

    return report
  }

  /**
   * 快速检查
   */
  quickCheck(generatedCode, visionAnalysis) {
    const result = this.detect(generatedCode, visionAnalysis)
    return {
      pass: result.passed,
      score: result.score,
      issues: result.issues.map(i => i.message),
      warnings: result.warnings.map(w => w.message)
    }
  }
}

export default CodeTraceabilityDetector

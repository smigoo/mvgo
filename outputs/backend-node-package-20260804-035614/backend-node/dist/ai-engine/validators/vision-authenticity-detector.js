/**
 * Vision Authenticity Detector - Vision 真实性检测器
 * 检查 preview-analysis.json 是否真正分析到了图片内容，而非包含占位符
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'vision-authenticity-detector' })

// 禁止的占位符列表
const FORBIDDEN_PLACEHOLDERS = [
  '未知',
  '标题',
  '图表',
  '数据',
  '监控',
  '标准图表交互模式',
  '未识别',
  '无法确定',
  '图例',
  '暂无',
  '待填充',
  '待定',
  '由figma阶段填充',
  'TODO',
  'TBD'
]

// 必填字段（必须非空）
const REQUIRED_FIELDS = [
  'generatedAt',
  'stage',
  'componentName',
  'summary'
]

// 结构性必填字段
const STRUCTURAL_FIELDS = [
  { path: 'layout.type', type: 'string' },
  { path: 'layout.sections', type: 'array' },
  { path: 'styles.backgroundBrightness', type: 'string' }
]

export class VisionAuthenticityDetector {
  constructor(config = {}) {
    this.strictMode = config.strictMode || false
  }

  /**
   * 检查 Vision 分析结果是否真实有效
   * @param {Object} analysis - preview-analysis.json 内容
   * @param {Object} options - 配置选项
   * @returns {Object} 检测结果
   */
  detect(analysis, options = {}) {
    const issues = []
    const warnings = []
    const checks = []

    // 1. 检查必填字段
    const requiredFieldResults = this.checkRequiredFields(analysis)
    issues.push(...requiredFieldResults.issues)
    checks.push(...requiredFieldResults.checks)

    // 2. 检查禁止占位符
    const placeholderResults = this.checkForbiddenPlaceholders(analysis)
    issues.push(...placeholderResults.issues)
    checks.push(...placeholderResults.checks)

    // 3. 检查结构性字段
    const structuralResults = this.checkStructuralFields(analysis)
    issues.push(...structuralResults.issues)
    warnings.push(...structuralResults.warnings)
    checks.push(...structuralResults.checks)

    // 4. 检查 layout.sections 内容质量
    const sectionsResults = this.checkSectionsQuality(analysis)
    issues.push(...sectionsResults.issues)
    warnings.push(...sectionsResults.warnings)
    checks.push(...sectionsResults.checks)

    // 5. 计算综合评分
    const score = this.calculateScore(checks)

    return {
      passed: issues.length === 0 && (this.strictMode ? warnings.length === 0 : true),
      score,
      issues,
      warnings,
      checks,
      summary: this.generateSummary(issues, warnings, checks)
    }
  }

  /**
   * 检查必填字段
   */
  checkRequiredFields(analysis) {
    const issues = []
    const checks = []

    for (const field of REQUIRED_FIELDS) {
      const value = analysis[field]
      const hasValue = value !== undefined && value !== null && value !== ''

      checks.push({
        name: `required.${field}`,
        passed: hasValue,
        expected: '非空值',
        actual: value || '(空)'
      })

      if (!hasValue) {
        issues.push({
          type: 'missing_required_field',
          field,
          severity: 'error',
          message: `必填字段 "${field}" 为空`,
          suggestion: `请确保 Vision 阶段正确分析了图片并填充此字段`
        })
      }
    }

    return { issues, checks }
  }

  /**
   * 检查禁止占位符
   */
  checkForbiddenPlaceholders(analysis) {
    const issues = []
    const checks = []

    // 检查 summary
    const summaryText = analysis.summary || ''
    for (const placeholder of FORBIDDEN_PLACEHOLDERS) {
      if (summaryText.includes(placeholder)) {
        issues.push({
          type: 'forbidden_placeholder',
          field: 'summary',
          placeholder,
          severity: 'error',
          message: `summary 包含禁止占位符: "${placeholder}"`,
          suggestion: '请提供实际分析内容，而非通用占位符'
        })
      }
    }

    // 检查 imageEvidence
    const imageEvidence = analysis.imageEvidence || []
    for (const evidence of imageEvidence) {
      for (const placeholder of FORBIDDEN_PLACEHOLDERS) {
        if (evidence.includes(placeholder)) {
          issues.push({
            type: 'forbidden_placeholder',
            field: 'imageEvidence',
            placeholder,
            evidence,
            severity: 'error',
            message: `imageEvidence 包含禁止占位符: "${placeholder}"`,
            suggestion: '请提供实际观察到的内容'
          })
        }
      }
    }

    // 检查 firstVisibleText（如果有）
    const firstVisibleText = analysis.firstVisibleText
    if (firstVisibleText) {
      for (const placeholder of FORBIDDEN_PLACEHOLDERS) {
        if (firstVisibleText.includes(placeholder)) {
          issues.push({
            type: 'forbidden_placeholder',
            field: 'firstVisibleText',
            placeholder,
            severity: 'error',
            message: `firstVisibleText 包含禁止占位符: "${placeholder}"`,
            suggestion: '请提供图片中实际看到的第一个文字'
          })
        }
      }
    }

    checks.push({
      name: 'placeholder_check',
      passed: issues.length === 0,
      found: issues.length,
      details: issues.map(i => i.placeholder)
    })

    return { issues, checks }
  }

  /**
   * 检查结构性字段
   */
  checkStructuralFields(analysis) {
    const issues = []
    const warnings = []
    const checks = []

    for (const fieldDef of STRUCTURAL_FIELDS) {
      const value = this.getNestedValue(analysis, fieldDef.path)
      const hasValue = value !== undefined && value !== null && value !== ''

      checks.push({
        name: `structure.${fieldDef.path}`,
        passed: hasValue,
        expected: fieldDef.type,
        actual: typeof value
      })

      if (!hasValue) {
        issues.push({
          type: 'missing_structural_field',
          field: fieldDef.path,
          severity: 'error',
          message: `结构字段 "${fieldDef.path}" 缺失或为空`,
          suggestion: '请确保 layout 结构完整'
        })
      }
    }

    // 检查 backgroundBrightness 值是否有效
    const brightness = analysis.styles?.backgroundBrightness
    if (brightness && !['dark', 'light'].includes(brightness)) {
      issues.push({
        type: 'invalid_value',
        field: 'styles.backgroundBrightness',
        value: brightness,
        severity: 'error',
        message: `backgroundBrightness 值无效: "${brightness}"`,
        suggestion: '值必须是 "dark" 或 "light"'
      })
    }

    return { issues, warnings, checks }
  }

  /**
   * 检查 sections 内容质量
   */
  checkSectionsQuality(analysis) {
    const issues = []
    const warnings = []
    const checks = []

    const sections = analysis.layout?.sections || []

    checks.push({
      name: 'sections.count',
      passed: sections.length > 0,
      actual: sections.length,
      expected: '>= 1'
    })

    if (sections.length === 0) {
      issues.push({
        type: 'empty_sections',
        severity: 'error',
        message: 'layout.sections 为空数组',
        suggestion: 'Vision 阶段未识别到任何布局结构，请检查图片是否正确加载'
      })
    }

    // 检查每个 section 是否有实质内容
    let sectionsWithContent = 0
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const hasContent = section.name || section.id || section.header || section.body

      if (hasContent) {
        sectionsWithContent++
      } else {
        warnings.push({
          type: 'empty_section',
          index: i,
          severity: 'warning',
          message: `第 ${i + 1} 个 section 缺少名称和内容`,
          suggestion: '请提供 section 的 name 或 id'
        })
      }
    }

    checks.push({
      name: 'sections.with_content',
      passed: sectionsWithContent === sections.length,
      actual: sectionsWithContent,
      expected: sections.length
    })

    return { issues, warnings, checks }
  }

  /**
   * 获取嵌套字段值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * 计算综合评分
   */
  calculateScore(checks) {
    if (checks.length === 0) return 0

    const passedCount = checks.filter(c => c.passed).length
    return Math.round((passedCount / checks.length) * 100)
  }

  /**
   * 生成摘要
   */
  generateSummary(issues, warnings, checks) {
    const passedCount = checks.filter(c => c.passed).length

    return {
      totalChecks: checks.length,
      passedChecks: passedCount,
      failedChecks: checks.length - passedCount,
      criticalIssues: issues.filter(i => i.severity === 'error').length,
      warnings: warnings.length,
      score: this.calculateScore(checks)
    }
  }

  /**
   * 生成详细报告
   */
  generateReport(result, options = {}) {
    const { componentName = 'unknown', imagePath = 'unknown' } = options

    let report = `\n`
    report += `═══════════════════════════════════════════════════════════════\n`
    report += `  Vision 真实性检测报告\n`
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

    // 问题列表
    if (result.issues.length > 0) {
      report += `【错误 (${result.issues.length} 项)】\n`
      result.issues.forEach((issue, index) => {
        report += `  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.message}\n`
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
        report += `  ${index + 1}. [${warning.severity.toUpperCase()}] ${warning.message}\n`
        if (warning.suggestion) {
          report += `     建议: ${warning.suggestion}\n`
        }
      })
      report += `\n`
    }

    // 检查摘要
    if (result.summary) {
      report += `【检查摘要】\n`
      report += `  总检查项: ${result.summary.totalChecks}\n`
      report += `  通过: ${result.summary.passedChecks}\n`
      report += `  失败: ${result.summary.failedChecks}\n`
    }

    report += `\n`

    return report
  }

  /**
   * 快速检查（用于集成）
   */
  quickCheck(analysis) {
    const result = this.detect(analysis)
    return {
      pass: result.passed,
      score: result.score,
      issues: result.issues.map(i => i.message),
      warnings: result.warnings.map(w => w.message)
    }
  }
}

export default VisionAuthenticityDetector

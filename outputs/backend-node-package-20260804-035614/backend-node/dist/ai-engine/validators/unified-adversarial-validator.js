/**
 * Unified Adversarial Validator - 统一对抗性验证器
 * 整合 L1/L2/L3 三层检查，为组件生成提供完整验证
 */

import { createLogger } from '../logger/index.js'
import { VisionAuthenticityDetector } from './vision-authenticity-detector.js'
import { CodeTraceabilityDetector } from './code-traceability-detector.js'
import { VisionCodeCrossValidator } from './vision-code-cross-validator.js'

const logger = createLogger({ name: 'unified-adversarial-validator' })

export class UnifiedAdversarialValidator {
  constructor(config = {}) {
    this.strictMode = config.strictMode || false

    // 初始化各层检测器
    this.visionDetector = new VisionAuthenticityDetector(config)
    this.codeDetector = new CodeTraceabilityDetector(config)
    this.crossValidator = new VisionCodeCrossValidator(config)
  }

  /**
   * 执行完整的对抗性验证
   * @param {Object} params - 验证参数
   * @param {Object} params.visionAnalysis - Vision 分析结果 (preview-analysis.json)
   * @param {string} params.generatedCode - 生成的代码
   * @param {Object} params.options - 配置选项
   * @returns {Object} 完整验证结果
   */
  async validate(params, options = {}) {
    const { visionAnalysis, generatedCode, componentName, imagePath } = params

    const startTime = Date.now()
    logger.info('开始统一对抗性验证', { componentName })

    // L1: Vision 真实性检查
    const l1Result = this.visionDetector.detect(visionAnalysis, options)
    logger.info(`L1 Vision 真实性检查: ${l1Result.passed ? '通过' : '失败'} (${l1Result.score}/100)`)

    // L2: 代码溯源检查
    const l2Result = this.codeDetector.detect(generatedCode, visionAnalysis, options)
    logger.info(`L2 代码溯源检查: ${l2Result.passed ? '通过' : '失败'} (${l2Result.score}/100)`)

    // L3: Vision vs Code 交叉验证
    const l3Result = this.crossValidator.validate(visionAnalysis, generatedCode, options)
    logger.info(`L3 交叉验证: ${l3Result.passed ? '通过' : '失败'} (${l3Result.score}/100)`)

    // 计算总体评分
    const overallScore = Math.round((l1Result.score + l2Result.score + l3Result.score) / 3)

    // 收集所有问题
    const allIssues = [
      ...l1Result.issues.map(i => ({ ...i, layer: 'L1_vision_authenticity' })),
      ...l2Result.issues.map(i => ({ ...i, layer: 'L2_code_traceability' })),
      ...l3Result.issues.map(i => ({ ...i, layer: 'L3_cross_validation' }))
    ]

    const allWarnings = [
      ...l1Result.warnings.map(w => ({ ...w, layer: 'L1_vision_authenticity' })),
      ...l2Result.warnings.map(w => ({ ...w, layer: 'L2_code_traceability' })),
      ...l3Result.warnings.map(w => ({ ...w, layer: 'L3_cross_validation' }))
    ]

    // 判断是否通过
    const passed = allIssues.length === 0 && (
      this.strictMode ? allWarnings.length === 0 : true
    )

    const result = {
      passed,
      score: overallScore,
      layers: {
        L1_vision_authenticity: {
          status: l1Result.passed ? 'PASS' : 'FAIL',
          score: l1Result.score,
          issues: l1Result.issues,
          warnings: l1Result.warnings
        },
        L2_code_traceability: {
          status: l2Result.passed ? 'PASS' : 'FAIL',
          score: l2Result.score,
          issues: l2Result.issues,
          warnings: l2Result.warnings,
          details: l2Result.details
        },
        L3_cross_validation: {
          status: l3Result.passed ? 'PASS' : 'FAIL',
          score: l3Result.score,
          issues: l3Result.issues,
          warnings: l3Result.warnings
        }
      },
      issues: allIssues,
      warnings: allWarnings,
      duration: Date.now() - startTime,
      metadata: {
        componentName,
        imagePath,
        timestamp: new Date().toISOString(),
        strictMode: this.strictMode
      }
    }

    logger.info(`统一验证完成: ${passed ? '✅ 通过' : '❌ 失败'} (${overallScore}/100)`, {
      duration: result.duration,
      issues: allIssues.length,
      warnings: allWarnings.length
    })

    return result
  }

  /**
   * 仅检查 Vision 真实性 (L1)
   */
  checkVisionAuthenticity(visionAnalysis, options = {}) {
    return this.visionDetector.detect(visionAnalysis, options)
  }

  /**
   * 仅检查代码溯源 (L2)
   */
  checkCodeTraceability(generatedCode, visionAnalysis, options = {}) {
    return this.codeDetector.detect(generatedCode, visionAnalysis, options)
  }

  /**
   * 仅执行交叉验证 (L3)
   */
  crossValidate(visionAnalysis, generatedCode, options = {}) {
    return this.crossValidator.validate(visionAnalysis, generatedCode, options)
  }

  /**
   * 生成完整报告
   */
  generateReport(result, options = {}) {
    const { componentName = 'unknown', imagePath = 'unknown', outputFormat = 'text' } = options

    if (outputFormat === 'json') {
      return JSON.stringify(result, null, 2)
    }

    let report = `\n`
    report += `═══════════════════════════════════════════════════════════════════════\n`
    report += `                    统一对抗性验证报告\n`
    report += `═══════════════════════════════════════════════════════════════════════\n`
    report += `组件: ${componentName}\n`
    report += `图片来源: ${imagePath}\n`
    report += `验证时间: ${result.metadata?.timestamp || new Date().toISOString()}\n`
    report += `验证耗时: ${result.duration}ms\n`
    report += `\n`

    // 总体状态
    report += `┌─────────────────────────────────────────────────────────────────────┐\n`
    report += `│ 【总体状态】                                                          │\n`
    report += `│   ${result.passed ? '✅ 通过' : '❌ 失败'}                                                            │\n`
    report += `│   总体评分: ${result.score}/100                                            │\n`
    report += `│   严格模式: ${result.metadata?.strictMode ? '开启' : '关闭'}                                            │\n`
    report += `└─────────────────────────────────────────────────────────────────────┘\n`
    report += `\n`

    // 分层结果
    report += `┌─────────────────────────────────────────────────────────────────────┐\n`
    report += `│ 【分层验证结果】                                                      │\n`
    report += `├─────────────────────────────────────────────────────────────────────┤\n`

    for (const [layerName, layerResult] of Object.entries(result.layers)) {
      const layerShort = layerName.replace('L1_', '').replace('L2_', '').replace('L3_', '').replace('_', ' ')
      const statusIcon = layerResult.status === 'PASS' ? '✅' : '❌'
      const issueCount = (layerResult.issues?.length || 0) + (layerResult.warnings?.length || 0)

      report += `│ ${statusIcon} ${layerShort.padEnd(20)} 评分: ${String(layerResult.score).padStart(3)}/100 ${issueCount > 0 ? `(${issueCount} 项问题)` : '(无问题)'.padEnd(20)} │\n`
    }

    report += `└─────────────────────────────────────────────────────────────────────┘\n`
    report += `\n`

    // L1 详情
    if (result.layers.L1_vision_authenticity.issues.length > 0) {
      report += `【L1 Vision 真实性问题】\n`
      result.layers.L1_vision_authenticity.issues.forEach((issue, index) => {
        report += `  ${index + 1}. ${issue.message}\n`
        if (issue.suggestion) report += `     → ${issue.suggestion}\n`
      })
      report += `\n`
    }

    // L2 详情
    if (result.layers.L2_code_traceability.issues.length > 0) {
      report += `【L2 代码溯源问题】\n`
      result.layers.L2_code_traceability.issues.forEach((issue, index) => {
        report += `  ${index + 1}. ${issue.message}\n`
        if (issue.suggestion) report += `     → ${issue.suggestion}\n`
      })
      report += `\n`
    }

    // L2 警告
    if (result.layers.L2_code_traceability.warnings.length > 0) {
      report += `【L2 代码溯源警告】\n`
      result.layers.L2_code_traceability.warnings.forEach((warning, index) => {
        report += `  ${index + 1}. ${warning.message}\n`
        if (warning.suggestion) report += `     → ${warning.suggestion}\n`
      })
      report += `\n`
    }

    // L3 详情
    if (result.layers.L3_cross_validation.warnings.length > 0) {
      report += `【L3 交叉验证警告】\n`
      result.layers.L3_cross_validation.warnings.forEach((warning, index) => {
        report += `  ${index + 1}. ${warning.message}\n`
        if (warning.suggestion) report += `     → ${warning.suggestion}\n`
      })
      report += `\n`
    }

    // 建议
    if (!result.passed) {
      report += `═══════════════════════════════════════════════════════════════════════\n`
      report += `【处理建议】\n`
      report += `  1. Vision 阶段问题 → 请重新分析预览图，确保 AI 真正看到图片内容\n`
      report += `  2. 代码溯源问题 → 代码内容必须全部来自 Vision 分析，禁止外部知识补充\n`
      report += `  3. 交叉验证问题 → 请确保代码实现与 Vision 分析的结构一致\n`
      report += `═══════════════════════════════════════════════════════════════════════\n`
    }

    report += `\n`

    return report
  }

  /**
   * 快速验证（用于集成到生成流程）
   */
  quickValidate(visionAnalysis, generatedCode) {
    const result = this.validateSync(visionAnalysis, generatedCode)
    return {
      pass: result.passed,
      score: result.score,
      issues: result.issues.map(i => i.message),
      warnings: result.warnings.map(w => w.message),
      canProceed: result.passed
    }
  }

  /**
   * 同步验证（快速检查）
   */
  validateSync(visionAnalysis, generatedCode) {
    const l1 = this.visionDetector.detect(visionAnalysis)
    const l2 = this.codeDetector.detect(generatedCode, visionAnalysis)
    const l3 = this.crossValidator.validate(visionAnalysis, generatedCode)

    const overallScore = Math.round((l1.score + l2.score + l3.score) / 3)
    const allIssues = [...l1.issues, ...l2.issues, ...l3.issues]

    return {
      passed: allIssues.length === 0,
      score: overallScore,
      issues: allIssues,
      warnings: [...l1.warnings, ...l2.warnings, ...l3.warnings]
    }
  }
}

export default UnifiedAdversarialValidator

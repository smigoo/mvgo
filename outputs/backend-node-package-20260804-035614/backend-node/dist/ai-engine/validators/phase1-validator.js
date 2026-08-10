/**
 * Phase 1 轻量级验证器
 * 职责：验证 Phase 1 生成结果的基本质量
 * 1. 图片真实加载验证（防幻觉）
 * 2. 微码文件格式验证
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'phase1-validator' })

export class Phase1Validator {
  constructor() {
    logger.info('Phase 1 验证器已初始化')
  }

  /**
   * 验证图片是否被真实读取（反幻觉检查）
   */
  validateImageVerification(visualAnalysis) {
    logger.info('检查图片验证状态')

    const checks = {
      passed: true,
      issues: []
    }

    // 1. 检查是否有 imageVerified 字段
    if (visualAnalysis.imageVerified === undefined) {
      checks.passed = false
      checks.issues.push({
        level: 'error',
        message: '缺少图片验证字段 imageVerified',
        suggestion: '确保 visual-parser 输出包含 imageVerified 字段'
      })
      return checks
    }

    // 2. 检查图片是否被验证
    if (visualAnalysis.imageVerified === false) {
      checks.passed = false
      checks.issues.push({
        level: 'error',
        message: 'AI 未能看到图片内容',
        detail: visualAnalysis.error || visualAnalysis.message || '未提供详细原因',
        suggestion: '检查图片 URL 是否有效，图片是否可访问'
      })
      return checks
    }

    // 3. 检查是否有视觉描述（证明真的看到了）
    if (!visualAnalysis.visualDescription && !visualAnalysis.layoutStructure) {
      checks.passed = false
      checks.issues.push({
        level: 'warning',
        message: '缺少视觉描述或布局结构',
        suggestion: 'AI 可能没有真正分析图片内容'
      })
    }

    // 4. 检查置信度
    if (visualAnalysis.confidence !== undefined && visualAnalysis.confidence < 0.7) {
      checks.issues.push({
        level: 'warning',
        message: `AI 分析置信度较低: ${visualAnalysis.confidence}`,
        suggestion: '图片可能不清晰或内容复杂'
      })
    }

    logger.info('图片验证检查完成', {
      passed: checks.passed,
      issueCount: checks.issues.length
    })

    return checks
  }

  /**
   * 验证微码文件格式
   */
  validateFileFormat(generatedFiles) {
    logger.info('检查文件格式', { fileCount: Object.keys(generatedFiles || {}).length })

    const checks = {
      passed: true,
      issues: []
    }

    if (!generatedFiles || typeof generatedFiles !== 'object') {
      checks.passed = false
      checks.issues.push({
        level: 'error',
        message: 'generatedFiles 不是有效对象'
      })
      return checks
    }

    // 1. 检查必需文件
    const requiredFiles = [
      'declare.json',
      'package/index.vue',
      'component.js'
    ]

    const missingFiles = requiredFiles.filter(file => !generatedFiles[file])

    if (missingFiles.length > 0) {
      checks.passed = false
      checks.issues.push({
        level: 'error',
        message: `缺少必需文件: ${missingFiles.join(', ')}`,
        suggestion: '确保生成了所有必需的微码组件文件'
      })
    }

    // 2. 验证 declare.json 格式
    if (generatedFiles['declare.json']) {
      try {
        const declareData = JSON.parse(generatedFiles['declare.json'])

        // 检查必需字段（使用实际生成的字段名）
        const requiredFields = ['componentId', 'componentName']
        const missingFields = requiredFields.filter(field => !declareData[field])

        if (missingFields.length > 0) {
          checks.issues.push({
            level: 'error',
            message: `declare.json 缺少必需字段: ${missingFields.join(', ')}`,
            suggestion: '补充缺失的配置字段'
          })
          checks.passed = false
        }
      } catch (error) {
        checks.passed = false
        checks.issues.push({
          level: 'error',
          message: 'declare.json 格式错误，无法解析为 JSON',
          detail: error.message
        })
      }
    }

    // 3. 检查 Vue 文件基本结构
    if (generatedFiles['package/index.vue']) {
      const vueContent = generatedFiles['package/index.vue']

      if (!vueContent.includes('<template>')) {
        checks.issues.push({
          level: 'error',
          message: 'package/index.vue 缺少 <template> 标签'
        })
        checks.passed = false
      }

      // 支持 <script> 或 <script setup>（Vue 3 Composition API）
      if (!vueContent.includes('<script>') && !vueContent.includes('<script setup>')) {
        checks.issues.push({
          level: 'error',
          message: 'package/index.vue 缺少 <script> 标签'
        })
        checks.passed = false
      }
    }

    logger.info('文件格式检查完成', {
      passed: checks.passed,
      issueCount: checks.issues.length
    })

    return checks
  }

  /**
   * 执行完整验证
   */
  validate(state) {
    logger.info('开始 Phase 1 验证')

    const result = {
      passed: true,
      checks: {},
      summary: {
        total: 0,
        passed: 0,
        errors: 0,
        warnings: 0
      }
    }

    try {
      // 1. 图片验证
      const imageCheck = this.validateImageVerification(state.visualAnalysis || {})
      result.checks.imageVerification = imageCheck

      if (!imageCheck.passed) {
        result.passed = false
      }

      // 统计
      result.summary.total += 1
      result.summary.passed += imageCheck.passed ? 1 : 0
      result.summary.errors += imageCheck.issues.filter(i => i.level === 'error').length
      result.summary.warnings += imageCheck.issues.filter(i => i.level === 'warning').length

      // 2. 文件格式验证
      const formatCheck = this.validateFileFormat(state.generatedFiles || {})
      result.checks.fileFormat = formatCheck

      if (!formatCheck.passed) {
        result.passed = false
      }

      // 统计
      result.summary.total += 1
      result.summary.passed += formatCheck.passed ? 1 : 0
      result.summary.errors += formatCheck.issues.filter(i => i.level === 'error').length
      result.summary.warnings += formatCheck.issues.filter(i => i.level === 'warning').length

      // 3. 生成验证报告
      const status = result.passed ? '✅ 通过' : '❌ 失败'
      logger.info(`Phase 1 验证完成: ${status}`, result.summary)

      // 如果验证失败，详细记录每个检查的错误
      if (!result.passed) {
        Object.entries(result.checks).forEach(([checkName, checkResult]) => {
          if (!checkResult.passed && checkResult.issues && checkResult.issues.length > 0) {
            logger.error(`验证失败详情 [${checkName}]:`, {
              issues: checkResult.issues
            })
          }
        })
      }

      return result

    } catch (error) {
      logger.error('Phase 1 验证执行失败', { error: error.message })
      return {
        passed: false,
        error: error.message,
        checks: result.checks,
        summary: result.summary
      }
    }
  }
}

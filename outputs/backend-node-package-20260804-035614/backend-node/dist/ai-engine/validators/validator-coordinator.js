/**
 * 验证器协调类
 * 统一管理所有规则验证器，提供统一的验证接口
 */

import { ChartValidator } from './chart-validator.js'
import { FigmaNodeValidator } from './figma-node-validator.js'
import { VueComponentValidator } from './vue-component-validator.js'
import { ResourcePathValidator } from './resource-path-validator.js'
import { ThemeValidator } from './theme-validator.js'

export class ValidatorCoordinator {
  constructor() {
    this.validators = []
    this.initializeValidators()
  }

  /**
   * 初始化所有验证器
   * @private
   */
  initializeValidators() {
    this.validators = [
      new VueComponentValidator(),
      new ChartValidator(),
      new FigmaNodeValidator(),
      new ResourcePathValidator(),
      new ThemeValidator()
    ]
  }

  /**
   * 验证代码
   * @param {Object} context - 验证上下文
   * @param {string} context.code - 要验证的代码
   * @param {string} context.stage - 当前阶段 (preview/figma/req/req-s)
   * @param {string} [context.level] - 最低验证级别 (L1/L2/L3)，默认 L2
   * @param {string[]} [context.categories] - 要验证的分类，为空则验证所有
   * @returns {Object} 验证结果
   */
  validate(context) {
    const {
      code,
      stage,
      level = 'L2',
      categories = []
    } = context

    if (!code || !stage) {
      throw new Error('code 和 stage 是必需的参数')
    }

    // 收集所有违规
    const violations = []

    // 遍历所有验证器
    for (const validator of this.validators) {
      const result = validator.validate({
        code,
        stage,
        level,
        categories
      })

      violations.push(...result.violations)
    }

    // 按严重程度排序（L3 > L2 > L1）
    violations.sort((a, b) => {
      const levelOrder = { L3: 3, L2: 2, L1: 1 }
      return levelOrder[b.level] - levelOrder[a.level]
    })

    return {
      passed: violations.length === 0,
      violations,
      summary: this.generateSummary(violations)
    }
  }

  /**
   * 生成验证摘要
   * @private
   */
  generateSummary(violations) {
    if (violations.length === 0) {
      return '✅ 所有规则检查通过'
    }

    const byLevel = {
      L3: violations.filter(v => v.level === 'L3').length,
      L2: violations.filter(v => v.level === 'L2').length,
      L1: violations.filter(v => v.level === 'L1').length
    }

    const parts = []
    if (byLevel.L3 > 0) parts.push(`L3(严重): ${byLevel.L3}`)
    if (byLevel.L2 > 0) parts.push(`L2(重要): ${byLevel.L2}`)
    if (byLevel.L1 > 0) parts.push(`L1(建议): ${byLevel.L1}`)

    return `❌ 发现 ${violations.length} 个问题 - ${parts.join(', ')}`
  }

  /**
   * 获取所有已注册的规则
   * @returns {Array} 规则列表
   */
  getAllRules() {
    const allRules = []

    for (const validator of this.validators) {
      const rules = validator.getAllRules()
      allRules.push(...rules)
    }

    return allRules
  }

  /**
   * 按分类获取规则
   * @param {string} category - 分类名称
   * @returns {Array} 规则列表
   */
  getRulesByCategory(category) {
    return this.getAllRules().filter(rule => rule.category === category)
  }

  /**
   * 按阶段获取规则
   * @param {string} stage - 阶段名称
   * @returns {Array} 规则列表
   */
  getRulesByStage(stage) {
    return this.getAllRules().filter(rule => rule.stages.includes(stage))
  }

  /**
   * 按级别获取规则
   * @param {string} level - 级别 (L1/L2/L3)
   * @returns {Array} 规则列表
   */
  getRulesByLevel(level) {
    return this.getAllRules().filter(rule => rule.level === level)
  }

  /**
   * 格式化验证结果为 Markdown
   * @param {Object} result - validate() 返回的结果
   * @returns {string} Markdown 格式的报告
   */
  formatAsMarkdown(result) {
    if (result.passed) {
      return '## 验证结果\n\n✅ 所有规则检查通过\n'
    }

    const lines = [
      '## 验证结果\n',
      result.summary + '\n',
      '### 违规详情\n'
    ]

    // 按级别分组
    const byLevel = {
      L3: result.violations.filter(v => v.level === 'L3'),
      L2: result.violations.filter(v => v.level === 'L2'),
      L1: result.violations.filter(v => v.level === 'L1')
    }

    for (const [level, violations] of Object.entries(byLevel)) {
      if (violations.length === 0) continue

      const levelName = {
        L3: '🔴 严重问题',
        L2: '🟡 重要问题',
        L1: '🔵 建议优化'
      }[level]

      lines.push(`#### ${levelName}\n`)

      for (const violation of violations) {
        lines.push(`**${violation.rule}** (${violation.category})`)
        lines.push(`- 问题: ${violation.message}`)
        if (violation.docRef) {
          lines.push(`- 参考: ${violation.docRef}`)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /**
   * 格式化验证结果为纯文本
   * @param {Object} result - validate() 返回的结果
   * @returns {string} 纯文本格式的报告
   */
  formatAsText(result) {
    if (result.passed) {
      return '✅ 所有规则检查通过'
    }

    const lines = [
      '验证结果:',
      result.summary,
      '',
      '违规详情:'
    ]

    for (let i = 0; i < result.violations.length; i++) {
      const v = result.violations[i]
      lines.push(`${i + 1}. [${v.level}] ${v.rule}`)
      lines.push(`   ${v.message}`)
      if (v.docRef) {
        lines.push(`   参考: ${v.docRef}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 格式化验证结果为 JSON
   * @param {Object} result - validate() 返回的结果
   * @returns {string} JSON 格式的报告
   */
  formatAsJson(result) {
    return JSON.stringify(result, null, 2)
  }

  /**
   * 生成规则统计信息
   * @returns {Object} 统计信息
   */
  getStatistics() {
    const allRules = this.getAllRules()

    const byCategory = {}
    const byLevel = { L1: 0, L2: 0, L3: 0 }
    const byStage = {}

    for (const rule of allRules) {
      // 按分类统计
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1

      // 按级别统计
      byLevel[rule.level]++

      // 按阶段统计
      for (const stage of rule.stages) {
        byStage[stage] = (byStage[stage] || 0) + 1
      }
    }

    return {
      total: allRules.length,
      byCategory,
      byLevel,
      byStage,
      validators: this.validators.length
    }
  }
}

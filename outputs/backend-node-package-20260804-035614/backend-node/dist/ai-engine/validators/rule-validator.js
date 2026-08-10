/**
 * 基础规则验证器
 * 检查生成的代码是否符合微码组件规范
 */

export class RuleValidator {
  constructor() {
    this.rules = new Map()
    this.registerDefaultRules()
  }

  /**
   * 注册默认规则
   * @private
   */
  registerDefaultRules() {
    // 将在子类或外部注册具体规则
  }

  /**
   * 注册验证规则
   * @param {string} ruleId - 规则 ID
   * @param {Object} rule - 规则配置
   * @param {string} rule.name - 规则名称
   * @param {Function} rule.check - 检查函数
   * @param {string} rule.message - 错误消息
   * @param {string} rule.level - 错误等级 (L1/L2/L3)
   * @param {string} rule.docRef - 文档引用
   * @param {string[]} [rule.stages] - 适用阶段
   */
  registerRule(ruleId, rule) {
    if (!ruleId || !rule.check || !rule.message) {
      throw new Error('Rule must have id, check function, and message')
    }

    this.rules.set(ruleId, {
      name: rule.name || ruleId,
      check: rule.check,
      message: rule.message,
      level: rule.level || 'L2',
      docRef: rule.docRef || '',
      stages: rule.stages || ['preview', 'figma', 'req', 'req-s'],
      category: rule.category || 'general'
    })
  }

  /**
   * 验证代码
   * @param {Object} context - 验证上下文
   * @param {string} context.code - 生成的代码
   * @param {string} context.stage - 当前阶段
   * @param {string} [context.level] - 最低验证级别 (L1/L2/L3)
   * @param {string[]} [context.categories] - 要验证的分类
   * @returns {Object} 验证结果 { violations: Array }
   */
  validate(context) {
    const { code, stage, level = 'L2', categories = [] } = context
    const violations = []
    const levelOrder = { L1: 1, L2: 2, L3: 3 }
    const minLevel = levelOrder[level] || 2

    for (const [ruleId, rule] of this.rules.entries()) {
      // 检查规则是否适用于当前阶段
      if (!rule.stages.includes(stage)) {
        continue
      }

      // 检查级别过滤
      if (levelOrder[rule.level] < minLevel) {
        continue
      }

      // 检查分类过滤
      if (categories.length > 0 && !categories.includes(rule.category)) {
        continue
      }

      try {
        const result = rule.check(context)

        if (result === false) {
          // 规则未通过
          violations.push({
            rule: ruleId,
            name: rule.name,
            message: rule.message,
            level: rule.level,
            docRef: rule.docRef,
            category: rule.category
          })
        }
      } catch (error) {
        console.error(`Error checking rule ${ruleId}:`, error)
        // 规则检查失败，记录但不阻断
        violations.push({
          rule: ruleId,
          name: rule.name,
          message: `规则检查失败: ${error.message}`,
          level: 'L1',
          docRef: rule.docRef,
          category: 'internal'
        })
      }
    }

    return { violations }
  }

  /**
   * 获取规则信息
   * @param {string} ruleId - 规则 ID
   * @returns {Object|null} 规则配置
   */
  getRule(ruleId) {
    return this.rules.get(ruleId) || null
  }

  /**
   * 获取所有规则
   * @returns {Array} 所有规则数组
   */
  getAllRules() {
    return Array.from(this.rules.entries()).map(([ruleId, rule]) => ({
      id: ruleId,
      ...rule
    }))
  }

  /**
   * 获取分类规则
   * @param {string} category - 分类名
   * @returns {Array} 该分类的规则列表
   */
  getRulesByCategory(category) {
    return Array.from(this.rules.entries())
      .filter(([, rule]) => rule.category === category)
      .map(([ruleId, rule]) => ({ ruleId, ...rule }))
  }

  /**
   * 格式化验证结果
   * @param {Object} result - 验证结果
   * @returns {string} 格式化后的文本
   */
  formatResult(result) {
    const lines = []

    lines.push('# 验证结果')
    lines.push('')
    lines.push(`总计: ${result.summary.total} 条规则`)
    lines.push(`✅ 通过: ${result.summary.passed}`)
    lines.push(`⚠️  警告: ${result.summary.warnings}`)
    lines.push(`❌ 错误: ${result.summary.errors}`)
    lines.push('')

    if (result.errors.length > 0) {
      lines.push('## 🔴 阻断项')
      lines.push('')
      result.errors.forEach((error, index) => {
        lines.push(`${index + 1}. [${error.level}] ${error.message}`)
        if (error.docRef) {
          lines.push(`   📚 参考: ${error.docRef}`)
        }
        lines.push('')
      })
    }

    if (result.warnings.length > 0) {
      lines.push('## ⚠️  警告项')
      lines.push('')
      result.warnings.forEach((warning, index) => {
        lines.push(`${index + 1}. [${warning.level}] ${warning.message}`)
        if (warning.docRef) {
          lines.push(`   📚 参考: ${warning.docRef}`)
        }
        lines.push('')
      })
    }

    if (result.success) {
      lines.push('## ✅ 验证通过')
      lines.push('')
      lines.push('所有规则检查通过，可以进入下一阶段。')
    } else {
      lines.push('## ❌ 验证失败')
      lines.push('')
      lines.push('存在阻断项，请修复后重新验证。')
    }

    return lines.join('\n')
  }
}

/**
 * 验证结果类型定义
 * @typedef {Object} ValidationResult
 * @property {boolean} success - 是否验证通过
 * @property {Object} summary - 验证摘要
 * @property {number} summary.total - 总规则数
 * @property {number} summary.passed - 通过数
 * @property {number} summary.errors - 错误数
 * @property {number} summary.warnings - 警告数
 * @property {Array} errors - 错误列表
 * @property {Array} warnings - 警告列表
 * @property {Array} passed - 通过的规则 ID 列表
 */

/**
 * 验证上下文类型定义
 * @typedef {Object} ValidationContext
 * @property {string} code - 生成的代码（Vue/Less/JSON）
 * @property {string} stage - 当前阶段 (preview/figma/req/req-s)
 * @property {Object} [analysis] - preview-analysis.json 数据
 * @property {Object} [figmaData] - Figma 节点数据
 * @property {Object} [files] - 所有文件内容 { 'path': 'content' }
 */

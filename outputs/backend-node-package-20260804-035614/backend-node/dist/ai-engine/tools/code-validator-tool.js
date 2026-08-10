/**
 * 代码验证工具
 * 将验证器系统封装为工具，供智能体调用
 */

import { BaseTool } from './base-tool.js'
import { validate } from '../validators/index.js'

export class CodeValidatorTool extends BaseTool {
  constructor() {
    super({
      name: 'code_validator',
      description: '验证生成的代码是否符合规范',
      parameters: {
        code: {
          type: 'string',
          description: '要验证的代码',
          required: true
        },
        stage: {
          type: 'string',
          description: '验证阶段: preview, figma, req, req-s',
          required: true,
          enum: ['preview', 'figma', 'req', 'req-s']
        },
        level: {
          type: 'string',
          description: '最低验证级别: L1, L2, L3',
          required: false,
          enum: ['L1', 'L2', 'L3']
        },
        categories: {
          type: 'object',
          description: '要验证的分类数组',
          required: false
        }
      },
      returnType: 'object'
    })
  }

  /**
   * 执行验证
   */
  async execute(params) {
    // 验证参数
    this.validateParams(params)

    const { code, stage, level, categories } = params

    this.logger.info('开始代码验证', { stage, level })

    try {
      // 调用验证器
      const result = validate(code, stage, {
        level,
        categories
      })

      this.logger.info('验证完成', {
        passed: result.passed,
        violations: result.violations.length
      })

      return result
    } catch (error) {
      this.logger.error('验证失败', { error: error.message })
      throw error
    }
  }
}

/**
 * 工具基类
 * 所有工具的基础类，定义统一的接口
 */

import { createLogger } from '../logger/index.js'

export class BaseTool {
  constructor(options = {}) {
    this.name = options.name || 'unnamed-tool'
    this.description = options.description || ''
    this.parameters = options.parameters || {}
    this.returnType = options.returnType || 'any'

    // 日志器
    this.logger = options.logger || createLogger({
      name: `tool:${this.name}`
    })
  }

  /**
   * 执行工具（子类必须实现）
   * @param {Object} params - 工具参数
   * @returns {Promise<any>} 执行结果
   */
  async execute(params) {
    throw new Error('execute() must be implemented by subclass')
  }

  /**
   * 验证参数
   * @param {Object} params - 要验证的参数
   * @returns {boolean} 是否有效
   */
  validateParams(params) {
    if (!this.parameters || Object.keys(this.parameters).length === 0) {
      return true
    }

    for (const [key, schema] of Object.entries(this.parameters)) {
      // 检查必需参数
      if (schema.required && !(key in params)) {
        throw new Error(`Missing required parameter: ${key}`)
      }

      // 检查参数类型
      if (key in params && schema.type) {
        const actualType = typeof params[key]
        if (actualType !== schema.type) {
          throw new Error(
            `Invalid type for parameter ${key}: expected ${schema.type}, got ${actualType}`
          )
        }
      }
    }

    return true
  }

  /**
   * 获取工具信息
   * @returns {Object} 工具元数据
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      returnType: this.returnType
    }
  }

  /**
   * 获取工具的 JSON Schema
   * @returns {Object} JSON Schema
   */
  getSchema() {
    const properties = {}
    const required = []

    for (const [key, schema] of Object.entries(this.parameters)) {
      properties[key] = {
        type: schema.type,
        description: schema.description
      }

      if (schema.enum) {
        properties[key].enum = schema.enum
      }

      if (schema.required) {
        required.push(key)
      }
    }

    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties,
        required
      }
    }
  }
}

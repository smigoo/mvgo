/**
 * 工具系统统一导出
 */

import { FileOperationTool } from './file-operation-tool.js'

export { BaseTool } from './base-tool.js'
export { FileOperationTool }

// 创建工具注册表
export class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  /**
   * 注册工具
   */
  register(tool) {
    this.tools.set(tool.name, tool)
  }

  /**
   * 获取工具
   */
  get(name) {
    return this.tools.get(name)
  }

  /**
   * 获取所有工具
   */
  getAll() {
    return Array.from(this.tools.values())
  }

  /**
   * 获取所有工具的 Schema
   */
  getAllSchemas() {
    return this.getAll().map(tool => tool.getSchema())
  }
}

// 默认工具注册表
let defaultRegistry = null

/**
 * 获取默认工具注册表
 */
export function getDefaultRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry()

    // 注册默认工具
    defaultRegistry.register(new FileOperationTool())
  }
  return defaultRegistry
}

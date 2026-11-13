/**
 * 文件操作工具
 * 提供文件读写、创建、删除等操作
 */

import { BaseTool } from './base-tool.js'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { dirname } from 'path'
import { validateVueSfc } from '../utils/sfc-syntax-validation.js'

export class FileOperationTool extends BaseTool {
  constructor() {
    super({
      name: 'file_operation',
      description: '文件操作工具，支持读写、创建文件',
      parameters: {
        operation: {
          type: 'string',
          description: '操作类型: read, write, create',
          required: true,
          enum: ['read', 'write', 'create']
        },
        filePath: {
          type: 'string',
          description: '文件路径',
          required: true
        },
        content: {
          type: 'string',
          description: '文件内容（write/create时需要）',
          required: false
        },
        encoding: {
          type: 'string',
          description: '文件编码，默认 utf-8',
          required: false
        }
      },
      returnType: 'object'
    })
  }

  /**
   * 执行文件操作
   */
  async execute(params) {
    this.validateParams(params)

    const { operation, filePath, content, encoding = 'utf-8' } = params

    this.logger.info('执行文件操作', { operation, filePath })

    try {
      switch (operation) {
        case 'read':
          return await this.readFile(filePath, encoding)
        case 'write':
          return await this.writeFile(filePath, content, encoding)
        case 'create':
          return await this.createFile(filePath, content, encoding)
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }
    } catch (error) {
      this.logger.error('文件操作失败', {
        operation,
        filePath,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 读取文件
   * @private
   */
  async readFile(filePath, encoding) {
    const content = await readFile(filePath, encoding)
    this.logger.debug('文件读取成功', { filePath, size: content.length })
    return {
      success: true,
      content,
      size: content.length
    }
  }

  /**
   * 写入文件
   * @private
   */
  async writeFile(filePath, content, encoding) {
    if (String(filePath).endsWith('.vue')) {
      const syntaxResult = validateVueSfc(content, filePath)
      if (!syntaxResult.valid) {
        throw new Error(`拒绝写入不可编译 Vue SFC ${filePath}: ${syntaxResult.errors.join('; ')}`)
      }
    }
    await writeFile(filePath, content, encoding)
    this.logger.debug('文件写入成功', { filePath })
    return {
      success: true,
      filePath
    }
  }

  /**
   * 创建文件（包含目录）
   * @private
   */
  async createFile(filePath, content, encoding) {
    // 确保目录存在
    const dir = dirname(filePath)
    await mkdir(dir, { recursive: true })

    // 写入文件
    if (String(filePath).endsWith('.vue')) {
      const syntaxResult = validateVueSfc(content, filePath)
      if (!syntaxResult.valid) {
        throw new Error(`拒绝创建不可编译 Vue SFC ${filePath}: ${syntaxResult.errors.join('; ')}`)
      }
    }
    await writeFile(filePath, content, encoding)
    this.logger.debug('文件创建成功', { filePath })

    return {
      success: true,
      filePath
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }
}

/**
 * 孤儿组件检测器
 * 检测并删除未被引用的子组件文件
 *
 * 问题：AI 为每个 section 生成独立子组件，产生未被引用的"孤儿组件"
 * 解决：在 Preview 和 Figma 阶段结束后自动检测并删除
 */

import { readFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'orphan-component-detector' })

export class OrphanComponentDetector {
  /**
   * 检测并清理孤儿组件
   * @param {string} componentDir - 组件目录路径
   * @returns {object} 检测结果
   */
  static async detect(componentDir) {
    logger.info('开始检测孤儿组件', { componentDir })

    try {
      const result = {
        orphans: [],
        deleted: [],
        kept: [],
        errors: []
      }

      // 1. 读取主组件文件
      const mainComponentPath = join(componentDir, 'package/index.vue')
      if (!existsSync(mainComponentPath)) {
        logger.warn('主组件文件不存在', { mainComponentPath })
        return result
      }

      const mainContent = readFileSync(mainComponentPath, 'utf-8')

      // 2. 查找所有子组件文件
      const packageDir = join(componentDir, 'package')
      if (!existsSync(packageDir)) {
        return result
      }

      const childComponents = this.findChildComponents(packageDir)

      // 3. 检查每个子组件是否被引用
      for (const childPath of childComponents) {
        const childName = basename(childPath, '.vue')
        const isReferenced = this.isComponentReferenced(mainContent, childName, childPath)

        if (!isReferenced) {
          result.orphans.push(childPath)
          logger.info('发现孤儿组件', { childPath, childName })
        } else {
          result.kept.push(childPath)
        }
      }

      // 4. 删除孤儿组件（如果有）
      for (const orphanPath of result.orphans) {
        try {
          unlinkSync(orphanPath)
          result.deleted.push(orphanPath)
          logger.info('已删除孤儿组件', { orphanPath })
        } catch (error) {
          result.errors.push({ path: orphanPath, error: error.message })
          logger.error('删除孤儿组件失败', { orphanPath, error: error.message })
        }
      }

      logger.info('孤儿组件检测完成', {
        orphansFound: result.orphans.length,
        deleted: result.deleted.length,
        kept: result.kept.length,
        errors: result.errors.length
      })

      return result

    } catch (error) {
      logger.error('孤儿组件检测失败', { error: error.message })
      throw error
    }
  }

  /**
   * 查找所有子组件文件
   * @param {string} packageDir - package 目录路径
   * @returns {string[]} 子组件文件路径数组
   */
  static findChildComponents(packageDir) {
    const childComponents = []

    try {
      const files = readdirSync(packageDir)

      for (const file of files) {
        const filePath = join(packageDir, file)
        const stat = statSync(filePath)

        // 跳过主组件 index.vue
        if (file === 'index.vue') {
          continue
        }

        // 只处理 .vue 文件
        if (stat.isFile() && file.endsWith('.vue')) {
          childComponents.push(filePath)
        }
      }
    } catch (error) {
      logger.error('查找子组件失败', { error: error.message })
    }

    return childComponents
  }

  /**
   * 检查组件是否被引用
   * @param {string} mainContent - 主组件内容
   * @param {string} componentName - 组件名称
   * @param {string} componentPath - 组件路径
   * @returns {boolean} 是否被引用
   */
  static isComponentReferenced(mainContent, componentName, componentPath) {
    // 检查多种引用方式

    // 1. import 语句引用（如：import Header from './header.vue'）
    const importPattern = new RegExp(`import\\s+\\w+\\s+from\\s+['"]\\.\\/.*${componentName}\\.vue['"]`, 'i')
    if (importPattern.test(mainContent)) {
      return true
    }

    // 2. 组件使用（如：<Header />、<header>）
    const kebabName = this.toKebabCase(componentName)
    const pascalName = this.toPascalCase(componentName)

    const usagePatterns = [
      new RegExp(`<${kebabName}[\\s/>]`, 'i'),      // <header-component
      new RegExp(`<${pascalName}[\\s/>]`, 'i'),     // <HeaderComponent
      new RegExp(`<${componentName}[\\s/>]`, 'i')   // 原始名称
    ]

    for (const pattern of usagePatterns) {
      if (pattern.test(mainContent)) {
        return true
      }
    }

    return false
  }

  /**
   * 转换为 kebab-case
   */
  static toKebabCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
  }

  /**
   * 转换为 PascalCase
   */
  static toPascalCase(str) {
    return str
      .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
      .replace(/^\w/, c => c.toUpperCase())
  }
}

export default OrphanComponentDetector

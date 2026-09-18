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

      // 1. 定位 package 目录与主组件
      const packageDir = join(componentDir, 'package')
      if (!existsSync(packageDir)) {
        return result
      }

      const mainComponentPath = join(packageDir, 'index.vue')
      if (!existsSync(mainComponentPath)) {
        logger.warn('主组件文件不存在', { mainComponentPath })
        return result
      }

      // 2. 递归查找 package/ 下所有 .vue（真实子组件位于 package/components/**，
      //    只读 package/ 顶层永远扫不到 → 检测器静默失效）
      const allVueFiles = this.findVueFiles(packageDir)

      // 3. 以「除自身外的全部 .vue 源码」为引用语料：
      //    子组件既可能被 index.vue 引用，也可能被兄弟子组件引用，
      //    只看 index.vue 会把「被兄弟引用」的文件误删。
      const contentMap = new Map()
      for (const vuePath of allVueFiles) {
        try {
          contentMap.set(vuePath, readFileSync(vuePath, 'utf-8'))
        } catch (error) {
          logger.error('读取组件源码失败', { vuePath, error: error.message })
          contentMap.set(vuePath, '')
        }
      }

      // 4. 逐个判断（主组件 index.vue 不是候选孤儿）
      const rootIndexPath = join(packageDir, 'index.vue')
      const childComponents = allVueFiles.filter((p) => p !== rootIndexPath)

      for (const childPath of childComponents) {
        const childName = basename(childPath, '.vue')

        let corpus = ''
        for (const [vuePath, content] of contentMap) {
          if (vuePath === childPath) continue
          corpus += content + '\n'
        }

        const isReferenced = this.isComponentReferenced(corpus, childName, childPath)

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
   * 查找子组件文件（递归，含 package/components/**）
   * @param {string} packageDir - package 目录路径
   * @returns {string[]} 子组件文件路径数组（不含主组件 index.vue）
   */
  static findChildComponents(packageDir) {
    const rootIndexPath = join(packageDir, 'index.vue')
    return this.findVueFiles(packageDir).filter((p) => p !== rootIndexPath)
  }

  /**
   * 递归收集目录下所有 .vue 文件
   * 跳过 node_modules 与隐藏目录（.snapshots/.mc-gen/.checkpoint 等）
   * @param {string} dir - 起始目录
   * @returns {string[]} 所有 .vue 文件路径
   */
  static findVueFiles(dir) {
    const collected = []

    const walk = (currentDir) => {
      let entries
      try {
        entries = readdirSync(currentDir)
      } catch (error) {
        logger.error('读取目录失败', { currentDir, error: error.message })
        return
      }

      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue

        const entryPath = join(currentDir, entry)
        let stat
        try {
          stat = statSync(entryPath)
        } catch {
          continue
        }

        if (stat.isDirectory()) {
          walk(entryPath)
        } else if (stat.isFile() && entry.endsWith('.vue')) {
          collected.push(entryPath)
        }
      }
    }

    walk(dir)
    return collected
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

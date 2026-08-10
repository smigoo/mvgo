/**
 * Less 变量完整性检查器
 * 检测并自动添加缺失的 Less 变量到 .common()
 *
 * 问题：AI 生成代码时使用了未定义的 Less 变量，导致编译报错
 * 解决：自动扫描所有 .vue/.less 文件中使用的变量，对比 .common() 定义，自动添加缺失的变量
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'less-variable-checker' })

export class LessVariableChecker {
  /**
   * 检查并修复 Less 变量
   * @param {string} componentDir - 组件目录路径
   * @returns {object} 检查结果
   */
  static async check(componentDir) {
    logger.info('开始检查 Less 变量', { componentDir })

    try {
      const result = {
        usedVariables: new Set(),
        definedVariables: new Set(),
        missingVariables: [],
        fixed: false,
        error: null
      }

      // 1. 扫描所有 .vue 和 .less 文件，收集使用的变量
      this.scanUsedVariables(componentDir, result.usedVariables)

      // 2. 读取 theme-vars.less 中定义的变量
      const themeVarsPath = join(componentDir, 'resources/styles/themes/theme-vars.less')
      if (existsSync(themeVarsPath)) {
        this.scanDefinedVariables(themeVarsPath, result.definedVariables)
      }

      // 3. 找出缺失的变量
      result.missingVariables = Array.from(result.usedVariables)
        .filter(v => !result.definedVariables.has(v))

      logger.info('Less 变量扫描完成', {
        usedCount: result.usedVariables.size,
        definedCount: result.definedVariables.size,
        missingCount: result.missingVariables.length
      })

      // 4. 如果有缺失的变量，自动添加到 .common()
      if (result.missingVariables.length > 0 && existsSync(themeVarsPath)) {
        this.addMissingVariables(themeVarsPath, result.missingVariables)
        result.fixed = true
        logger.info('已自动添加缺失的 Less 变量', {
          count: result.missingVariables.length,
          variables: result.missingVariables
        })
      }

      // 5. 确保 .common() 被调用：如果 .common() 中定义了 Less 变量，
      //    必须在顶层调用 .common(); 才能将变量暴露到全局作用域。
      if (existsSync(themeVarsPath) && this.shouldCallCommonMixin(themeVarsPath) && !this.hasTopLevelCommonCall(themeVarsPath)) {
        this.addCommonMixinCall(themeVarsPath)
        result.fixed = true
        logger.info('已自动在 theme-vars.less 顶层添加 .common() 调用')
      }

      return result

    } catch (error) {
      logger.error('Less 变量检查失败', { error: error.message })
      return {
        usedVariables: new Set(),
        definedVariables: new Set(),
        missingVariables: [],
        fixed: false,
        error: error.message
      }
    }
  }

  /**
   * 扫描目录中所有文件，收集使用的 Less 变量
   */
  static scanUsedVariables(dir, usedVariables) {
    try {
      const files = readdirSync(dir)

      for (const file of files) {
        const filePath = join(dir, file)
        const stat = statSync(filePath)

        if (stat.isDirectory()) {
          // 递归扫描子目录
          this.scanUsedVariables(filePath, usedVariables)
        } else if (stat.isFile()) {
          const ext = extname(file)
          // 只处理 .vue 和 .less 文件
          if (ext === '.vue' || ext === '.less') {
            this.extractVariablesFromFile(filePath, usedVariables)
          }
        }
      }
    } catch (error) {
      logger.error('扫描文件失败', { dir, error: error.message })
    }
  }

  /**
   * 从文件中提取使用的 Less 变量
   */
  static extractVariablesFromFile(filePath, usedVariables) {
    try {
      const content = readFileSync(filePath, 'utf-8')

      // 匹配 Less 变量使用：@variable-name
      const variablePattern = /@([a-zA-Z0-9_-]+)/g
      let match

      while ((match = variablePattern.exec(content)) !== null) {
        const variable = match[1]

        // 过滤掉一些特殊情况
        if (this.isValidLessVariable(variable)) {
          usedVariables.add(variable)
        }
      }
    } catch (error) {
      logger.error('提取变量失败', { filePath, error: error.message })
    }
  }

  /**
   * 验证是否是有效的 Less 变量名
   */
  static isValidLessVariable(variable) {
    // 排除 Less 关键字和特殊指令
    const excludedKeywords = [
      'import', 'media', 'keyframes', 'font-face',
      'charset', 'namespace', 'supports', 'document'
    ]

    if (excludedKeywords.includes(variable)) {
      return false
    }

    // 排除看起来像选择器或属性的
    if (variable.includes(':') || variable.includes('.')) {
      return false
    }

    return true
  }

  /**
   * 扫描 theme-vars.less 中定义的变量
   */
  static scanDefinedVariables(themeVarsPath, definedVariables) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')

      // 匹配 Less 变量定义：@variable-name: value;
      const definePattern = /@([a-zA-Z0-9_-]+)\s*:/g
      let match

      while ((match = definePattern.exec(content)) !== null) {
        definedVariables.add(match[1])
      }
    } catch (error) {
      logger.error('扫描定义变量失败', { themeVarsPath, error: error.message })
    }
  }

  /**
   * 添加缺失的变量到 theme-vars.less 的 .common()
   */
  static addMissingVariables(themeVarsPath, missingVariables) {
    try {
      let content = readFileSync(themeVarsPath, 'utf-8')

      // 查找 .common() 混合宏的位置
      const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/

      if (commonPattern.test(content)) {
        // 如果 .common() 已存在，在其中添加变量
        content = content.replace(commonPattern, (match, innerContent) => {
          const newVariables = missingVariables.map(v => {
            return `  @${v}: inherit; // 自动添加`
          }).join('\n')

          return `.common() {\n${innerContent.trim()}\n${newVariables}\n}`
        })
      } else {
        // 如果 .common() 不存在，创建一个
        const newVariables = missingVariables.map(v => {
          return `  @${v}: inherit; // 自动添加`
        }).join('\n')

        const commonMixin = `\n\n.common() {\n${newVariables}\n}\n`
        content += commonMixin
      }

      writeFileSync(themeVarsPath, content, 'utf-8')
      logger.info('已更新 theme-vars.less')

    } catch (error) {
      logger.error('添加变量失败', { themeVarsPath, error: error.message })
      throw error
    }
  }

  /**
   * 判断 .common() mixin 是否包含 Less 变量定义
   */
  static hasLessVariablesInCommonMixin(themeVarsPath) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')
      const commonMatch = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
      if (!commonMatch) return false
      return /@[a-zA-Z0-9_-]+\s*:/.test(commonMatch[1])
    } catch (error) {
      logger.error('检查 .common() 变量失败', { themeVarsPath, error: error.message })
      return false
    }
  }

  /**
   * 综合判断：是否需要确保 .common() 被调用
   */
  static shouldCallCommonMixin(themeVarsPath) {
    return this.hasLessVariablesInCommonMixin(themeVarsPath)
  }

  /**
   * 检查 theme-vars.less 顶层是否已调用 .common();
   */
  static hasTopLevelCommonCall(themeVarsPath) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')
      // 去除注释后，检查是否有顶层的 .common(); 调用
      const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      return /(?:^|\n)\s*\.common\s*\(\s*\)\s*;\s*(?:\n|$)/.test(noComments)
    } catch (error) {
      logger.error('检查 .common() 调用失败', { themeVarsPath, error: error.message })
      return false
    }
  }

  /**
   * 在 theme-vars.less 末尾添加 .common(); 调用
   */
  static addCommonMixinCall(themeVarsPath) {
    try {
      let content = readFileSync(themeVarsPath, 'utf-8')
      content = content.trimEnd() + '\n\n// 自动添加：将 .common() 中的 Less 变量暴露到全局作用域\n.common();\n'
      writeFileSync(themeVarsPath, content, 'utf-8')
      logger.info('已更新 theme-vars.less，添加 .common() 调用')
    } catch (error) {
      logger.error('添加 .common() 调用失败', { themeVarsPath, error: error.message })
      throw error
    }
  }
}

export default LessVariableChecker

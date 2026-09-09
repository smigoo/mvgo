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
import { safeLessVarValue } from '../roles/microcode/file-writer.js'

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
        uninferredVariables: [],  // 无法推断真值、用了兜底的变量（结构化告警）
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
        const warnings = []
        this.addMissingVariables(themeVarsPath, result.missingVariables, warnings)
        result.fixed = true
        result.uninferredVariables = warnings
        logger.info('已自动添加缺失的 Less 变量', {
          count: result.missingVariables.length,
          variables: result.missingVariables,
          uninferred: warnings.length > 0 ? warnings : undefined
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
        uninferredVariables: [],
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
      const sources = extname(filePath) === '.vue'
        ? Array.from(content.matchAll(/<style\b[^>]*\blang\s*=\s*["']less["'][^>]*>([\s\S]*?)<\/style>/gi), match => match[1] || '')
        : [content]

      // Vue 文件只扫描 <style lang="less">，禁止把模板事件 @click/@change 误判为 LESS 变量。
      const variablePattern = /@([a-zA-Z0-9_-]+)/g
      for (const source of sources) {
        let match
        while ((match = variablePattern.exec(source)) !== null) {
          const variable = match[1]
          if (this.isValidLessVariable(variable)) {
            usedVariables.add(variable)
          }
        }
        variablePattern.lastIndex = 0
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
   * 扫描 theme-vars.less 的 .common() 中定义的变量。
   * ⚠️ 只限 .common() 作用域 —— .theme-light() / .theme-dark() 中的变量在顶层不受
   * .common(); 调用暴露，对 LESS 编译来说不可见（2026-09-08 修复，原为扫全文件导致
   * LLM 忘记写进 .common() 的错误被静默掩盖）。
   */
  static scanDefinedVariables(themeVarsPath, definedVariables) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')

      // 只匹配 .common() { ... } 块内的变量定义
      const commonMatch = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
      if (!commonMatch) return;

      const blockContent = commonMatch[1];
      const definePattern = /@([a-zA-Z0-9_-]+)\s*:/g
      let match

      while ((match = definePattern.exec(blockContent)) !== null) {
        definedVariables.add(match[1])
      }
    } catch (error) {
      logger.error('扫描定义变量失败', { themeVarsPath, error: error.message })
    }
  }

  /**
   * 从 theme-vars.less 的所有 mixin 块中提取已定义的变量值。
   * 覆盖 .common() /.theme-light() /.theme-dark() 等所有 .xxx() { } 块。
   * 优先级：首次出现（即 .common() 优先于 light/dark）
   * @param {string} content theme-vars.less 文件内容
   * @returns {Map<string, string>} variableName → value
   */
  static extractAllMixinVars(content) {
    const vars = new Map();
    const mixinBlockRe = /\.[a-zA-Z0-9_-]+\(\)\s*\{([^}]*)\}/g;
    let match;
    while ((match = mixinBlockRe.exec(content)) !== null) {
      const blockContent = match[1];
      const varRe = /@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
      let vmatch;
      while ((vmatch = varRe.exec(blockContent)) !== null) {
        const name = vmatch[1];
        const value = vmatch[2].trim();
        if (!vars.has(name)) {
          vars.set(name, value);
        }
      }
    }
    return vars;
  }

  /**
   * 添加缺失的变量到 theme-vars.less 的 .common()。
   * 值推断优先级：
   *   1. 从同文件的 .theme-light() / .theme-dark() 等 mixin 复制已有真值
   *   2. 按变量名语义猜测（safeLessVarValue）
   *   3. 以上均不可得时用 'unset'（比 inherit 更安全——inherit 在某些属性上会导致
   *      不可见/崩溃，unset 回退到浏览器默认行为）
   * @param {string} themeVarsPath theme-vars.less 路径
   * @param {string[]} missingVariables 缺失的变量名列表
   * @returns {string[]} 无法推断含义、用了兜底值的变量名清单（用于结构化告警）
   */
  static addMissingVariables(themeVarsPath, missingVariables, warnings = []) {
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      logger.error('读取 theme-vars.less 失败', { themeVarsPath, error: e.message })
      return
    }

    // 提取当前 theme-vars.less 中已有的变量值（包括 light/dark mixin 中的）
    const existingVars = this.extractAllMixinVars(content)

    const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/
    const newVariableLines = missingVariables.map(v => {
      // 优先级 1：从同文件的 sibling mixin（theme-light/theme-dark）复制真值
      if (existingVars.has(v)) {
        const value = existingVars.get(v)
        return `  @${v}: ${value}; // 自动添加（从 theme mixin 复制）`
      }
      // 优先级 2：按变量名语义猜测
      const guess = safeLessVarValue(`@${v}`)
      if (guess !== 'unset') {
        return `  @${v}: ${guess}; // 自动添加（语义推断）`
      }
      // 优先级 3：无法推断——记录结构化告警
      warnings.push(v)
      return `  @${v}: unset; // ⚠️ 自动添加（无真值源，请人工修正）`
    })
    const newVariables = newVariableLines.join('\n')

    try {
      // 查找 .common() 混合宏的位置
      const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/

      if (commonPattern.test(content)) {
        // 如果 .common() 已存在，在其中添加变量
        content = content.replace(commonPattern, (match, innerContent) => {
          return `.common() {\n${innerContent.trim()}\n${newVariables}\n}`
        })
      } else {
        // 如果 .common() 不存在，创建一个
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

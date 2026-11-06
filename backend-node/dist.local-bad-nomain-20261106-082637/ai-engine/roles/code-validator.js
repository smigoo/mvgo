/**
 * Code Validator - 代码验证智能体（对抗式）
 * 职责：检查生成的代码质量，发现问题并提供修复建议
 */

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { filterAvailableResources } from '../utils/resource-import-guard.js'

const logger = createLogger('CodeValidator')

export class CodeValidator {
  /**
   * 验证生成的代码
   */
  async validate(code, context) {
    const { outputPath, resourceDomMapping } = context
    const issues = []

    logger.info('开始验证代码')

    // 验证1：import文件存在性
    const importIssues = this.validateImports(code, outputPath)
    issues.push(...importIssues)

    // 验证2：null资源变量
    const nullIssues = this.validateNullResources(code)
    issues.push(...nullIssues)

    // 验证3：资源使用完整性
    const resourceIssues = this.validateResourceUsage(code, resourceDomMapping)
    issues.push(...resourceIssues)

    // 验证4：CSS语法正确性
    const cssIssues = this.validateCssSyntax(code)
    issues.push(...cssIssues)

    const valid = issues.length === 0
    const highSeverity = issues.filter(i => i.severity === 'high').length

    logger.info(valid ? '✅ 代码验证通过' : `❌ 发现${issues.length}个问题（${highSeverity}个高优先级）`)

    return {
      valid,
      issues,
      canAutoFix: issues.every(i => i.autoFixable)
    }
  }

  /**
   * 验证import语句引用的文件是否存在
   */
  validateImports(code, outputPath) {
    const issues = []
    const importPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
    let match

    while ((match = importPattern.exec(code)) !== null) {
      const varName = match[1]
      const importPath = match[2]

      // 只检查资源文件
      if (!/\.(png|jpg|jpeg|svg|gif)$/i.test(importPath)) {
        continue
      }

      // 构建完整路径
      const fullPath = join(outputPath, 'package', importPath)

      if (!existsSync(fullPath)) {
        issues.push({
          type: 'missing_import',
          severity: 'high',
          line: this.getLineNumber(code, match.index),
          message: `导入的文件不存在: ${importPath}`,
          varName,
          importPath,
          autoFixable: true,
          suggestion: '检查resourceDomMapping获取正确的文件路径'
        })
      }
    }

    return issues
  }

  /**
   * 检测资源变量为null
   */
  validateNullResources(code) {
    const issues = []
    const patterns = [
      /icon:\s*null/g,
      /image:\s*null/g,
      /background:\s*null/g
    ]

    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(code)) !== null) {
        issues.push({
          type: 'null_resource',
          severity: 'high',
          line: this.getLineNumber(code, match.index),
          message: `资源变量不应为null: ${match[0]}`,
          autoFixable: true,
          suggestion: '应该使用icon1, icon2等变量或从data中引用'
        })
      }
    })

    return issues
  }

  /**
   * 验证是否使用了所有可用资源
   */
  validateResourceUsage(code, resourceDomMapping) {
    if (!resourceDomMapping || resourceDomMapping.length === 0) {
      return []
    }

    //仅检查可用资源（下载失败的不应被引用）
    // R0-6（2026-09-01）：统一走 filterAvailableResources 单一过滤帮手
    const available = filterAvailableResources(resourceDomMapping)
    const failed = resourceDomMapping.filter(m => m.downloadStatus !== 'success')

    const issues = []
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    const bgMappings = available.filter(m => m.previewAnalysisRole === 'bg')

    // 检查图标使用
    if (iconMappings.length > 0) {
      const usedIcons = this.extractUsedVariables(code, /\bicon\d+\b/g)
      if (usedIcons.length < iconMappings.length) {
        issues.push({
          type: 'incomplete_resource_usage',
          severity: 'medium',
          message: `有${iconMappings.length}个可用图标，但代码只使用了${usedIcons.length}个`,
          autoFixable: false,
          suggestion: `应该使用所有图标：${iconMappings.map((_, i) => `icon${i + 1}`).join(', ')}`
        })
      }
    }

    // 检查背景图使用
    if (bgMappings.length > 0) {
      const usedBgs = this.extractUsedVariables(code, /\bbg\d+\b/g)
      if (usedBgs.length < bgMappings.length) {
        issues.push({
          type: 'incomplete_resource_usage',
          severity: 'medium',
          message: `有${bgMappings.length}个可用背景图，但代码只使用了${usedBgs.length}个`,
          autoFixable: false,
          suggestion: `应该使用所有背景图：${bgMappings.map((_, i) => `bg${i + 1}`).join(', ')}`
        })
      }
    }

    //检查是否引用了不可用资源（下载失败的）
    if (failed.length > 0) {
      const usedVars = this.extractUsedVariables(code, /\b(?:bg|icon|img)\d+\b/g)
      // 构建可用变量名集合
      const availableVarNames = new Set()
      available.forEach((m, i) => {
        const prefix = m.previewAnalysisRole === 'bg' ? 'bg' :
                       m.previewAnalysisRole === 'icon' ? 'icon' :
                       (m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image') ? 'img' : ''
        if (prefix) {
          const group = available.filter(x => x.previewAnalysisRole === m.previewAnalysisRole)
          const idx = group.indexOf(m) + 1
          availableVarNames.add(`${prefix}${idx}`)
        }
      })

      for (const varName of usedVars) {
        if (!availableVarNames.has(varName)) {
          issues.push({
            type: 'failed_resource_reference',
            severity: 'high',
            message: `代码引用了不可用资源变量 ${varName}（该资源下载失败）`,
            autoFixable: true,
            suggestion: `移除 ${varName} 的引用，改用CSS替代方案`
          })
        }
      }
    }

    return issues
  }

  /**
   * 提取代码中使用的变量
   */
  extractUsedVariables(code, pattern) {
    const vars = new Set()
    let match
    while ((match = pattern.exec(code)) !== null) {
      vars.add(match[0])
    }
    return Array.from(vars)
  }

  /**
   * 获取行号
   */
  getLineNumber(code, index) {
    return code.substring(0, index).split('\n').length
  }

  /**
   * 自动修复问题
   */
  autoFix(code, issues, context) {
    let fixedCode = code
    let fixCount = 0

    for (const issue of issues) {
      if (!issue.autoFixable) continue

      try {
        switch (issue.type) {
          case 'null_resource':
            fixedCode = this.fixNullResources(fixedCode, context)
            fixCount++
            break
          // 其他自动修复逻辑可以后续添加
        }
      } catch (error) {
        logger.warn(`自动修复失败: ${issue.type}`, { error: error.message })
      }
    }

    logger.info(`自动修复了${fixCount}个问题`)
    return fixedCode
  }

  /**
   * 修复null资源变量
   */
  fixNullResources(code, context) {
    const { resourceDomMapping } = context
    if (!resourceDomMapping) return code

    // 简单替换策略：将icon: null替换为对应的iconIndex
    const iconMappings = resourceDomMapping.filter(m => m.previewAnalysisRole === 'icon')

    if (iconMappings.length > 0) {
      // 这里需要更智能的替换逻辑，暂时返回原代码
      // 实际应该根据数据项的位置和iconIndex对应关系来替换
      logger.warn('fixNullResources需要更智能的实现')
    }

    return code
  }

  /**
   *验证CSS语法（特别是keyframes）
   */
  validateCssSyntax(code) {
    const issues = []

    // 检查keyframes错误语法：使用冒号而不是花括号
    const keyframesPattern = /@keyframes\s+\w+\s*\{[^}]*?(\d+%)\s*:/g
    let match

    while ((match = keyframesPattern.exec(code)) !== null) {
      issues.push({
        type: 'invalid_keyframes_syntax',
        severity: 'high',
        line: this.getLineNumber(code, match.index),
        message: `keyframes语法错误: ${match[1]} 后应使用花括号 {} 而不是冒号 :`,
        autoFixable: false,
        suggestion: '修改 @keyframes 内部节点为: 0% { prop: value; } 格式'
      })
    }

    return issues
  }
}

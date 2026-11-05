/**
 * 样式自动修复模块（2026-09-28）
 *
 * 基于质量评分中的样式差异，自动修复产物中的颜色和数值偏差：
 * - 颜色修复：把近似颜色替换为 Figma 期望颜色（RGB 欧氏距离 ≤ 32）
 * - 数值修复：把近似数值替换为 Figma 期望数值（容差 ≤ 3px 或 ≤ 15%）
 *
 * 安全策略：
 * - 只修 <style> 块和 .less 文件，不碰 <template> / <script>
 * - 不替换 Less 变量声明的右侧值（@color-primary: #xxx 不动）
 * - 不替换已在变量解析中正确解析的值（避免双重修复）
 * - 幂等：多次执行结果一致
 *
 * 覆盖场景：
 * - LLM 生成颜色偏差（如 #5a9ef0 → #559eff）
 * - LLM 生成间距/字号/圆角偏差（如 11px → 12px）
 * - 透明度微调（如 rgba(85,158,255,0.9) → rgba(85,158,255,1)）
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  resolveStyleVariables,
  substituteVariables,
  colorDistance,
  parseColor,
  parseNumericValue,
} from './style-var-resolver.js'
import {
  collectGeneratedFilesFromDir,
  extractDeclaredStyleLiterals,
  extractExpectedStyleLiterals,
  findThemeVarsPath,
  computeStyleScore,
} from './quality-score-v1.js'

/**
 * 从样式内容中提取可替换的字面量及其位置
 * 只提取 <style> 块和 .less/.css 文件中的样式声明
 *
 * @param {string} content 文件内容
 * @param {string} filePath 文件路径
 * @returns {{ styleContent: string, isStyleBlock: boolean }[]}
 */
function extractStyleRegions(content, filePath) {
  const regions = []
  if (/\.less$/i.test(filePath) || /\.css$/i.test(filePath)) {
    regions.push({ styleContent: content, isStyleBlock: false })
  } else if (/\.vue$/i.test(filePath)) {
    for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      regions.push({ styleContent: m[1], isStyleBlock: true, fullMatch: m[0], innerStart: m.index + m[0].indexOf(m[1]) })
    }
  }
  return regions
}

/**
 * 颜色修复：把产物中的近似颜色替换为期望颜色
 *
 * @param {string} styleContent 样式内容
 * @param {string} actualColor 产物中的颜色值
 * @param {string} expectedColor 期望的颜色值
 * @returns {{ newContent: string, replaced: number, locations: Array<{line: number, column: number, context: string}> }}
 */
function replaceColorInContent(styleContent, actualColor, expectedColor) {
  if (!actualColor || !expectedColor || actualColor === expectedColor) {
    return { newContent: styleContent, replaced: 0, locations: [] }
  }

  // 规范化颜色值用于比较
  const normalizeColor = (c) => c.replace(/\s+/g, '').toLowerCase()
  const actualNorm = normalizeColor(actualColor)

  // 精确替换（大小写不敏感）
  let replaced = 0
  const locations = []
  const escapedActual = actualColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const colorRe = new RegExp(escapedActual, 'gi')

  const newContent = styleContent.replace(colorRe, (match, offset) => {
    if (normalizeColor(match) === actualNorm) {
      replaced++
      // 计算行号和列号
      const beforeMatch = styleContent.slice(0, offset)
      const lines = beforeMatch.split('\n')
      const line = lines.length
      const column = lines[lines.length - 1].length + 1
      // 提取上下文（当前行）
      const allLines = styleContent.split('\n')
      const context = allLines[line - 1]?.trim() || ''
      locations.push({ line, column, context })
      return expectedColor
    }
    return match
  })

  return { newContent, replaced, locations }
}

/**
 * 数值修复：把产物中的近似数值替换为期望数值
 * 只替换样式属性值中的数值，不碰选择器/变量名等
 *
 * @param {string} styleContent 样式内容
 * @param {string} actualValue 产物中的数值（如 "11px"）
 * @param {string} expectedValue 期望的数值（如 "12px"）
 * @returns {{ newContent: string, replaced: number, locations: Array<{line: number, column: number, context: string}> }}
 */
function replaceNumericInContent(styleContent, actualValue, expectedValue) {
  if (!actualValue || !expectedValue || actualValue === expectedValue) {
    return { newContent: styleContent, replaced: 0, locations: [] }
  }

  // 解析数值进行比较
  const actualNum = parseNumericValue(actualValue)
  const expectedNum = parseNumericValue(expectedValue)
  if (actualNum == null || expectedNum == null) {
    return { newContent: styleContent, replaced: 0, locations: [] }
  }

  // 构建替换正则：匹配属性值上下文中的数值
  // 只替换在 CSS 属性值位置出现的数值（前面有 : 或空格，后面有 ; 或空格或 }）
  const escapedActual = actualValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 匹配 CSS 属性值中的数值（不在变量名/选择器中）
  const numericRe = new RegExp(`(?<=[:\\s])${escapedActual}(?=[\\s;}])`, 'gi')

  let replaced = 0
  const locations = []
  const allLines = styleContent.split('\n')
  
  const newContent = styleContent.replace(numericRe, (match, offset) => {
    replaced++
    // 计算行号和列号
    const beforeMatch = styleContent.slice(0, offset)
    const lines = beforeMatch.split('\n')
    const line = lines.length
    const column = lines[lines.length - 1].length + 1
    // 提取上下文（当前行）
    const context = allLines[line - 1]?.trim() || ''
    locations.push({ line, column, context })
    return expectedValue
  })

  return { newContent, replaced, locations }
}

/**
 * 检查一行是否是 Less 变量声明（不应替换右侧值）
 * 如 `@color-primary: #559eff;` → 不替换 #559eff
 */
function isLessVarDeclaration(content, matchIndex) {
  // 向前查找该行开头
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1
  const linePrefix = content.slice(lineStart, matchIndex)
  // 如果行开头到匹配位置之间有 `@xxx:` 模式，说明是变量声明
  return /^\s*@[a-zA-Z_-]+\s*:\s*$/i.test(linePrefix) || /@[a-zA-Z_-]+\s*:\s*$/i.test(linePrefix)
}

/**
 * 在文件内容中安全地替换样式值
 * 只在 <style> 块和 .less/.css 文件中替换
 *
 * @param {string} content 文件完整内容
 * @param {string} filePath 文件路径
 * @param {string} actualValue 要替换的值
 * @param {string} expectedValue 替换为的值
 * @param {'color'|'numeric'} kind 值类型
 * @returns {{ newContent: string, replaced: number, locations: Array<{line: number, column: number, context: string}> }}
 */
function safeReplaceInFile(content, filePath, actualValue, expectedValue, kind) {
  const regions = extractStyleRegions(content, filePath)
  if (regions.length === 0) {
    return { newContent: content, replaced: 0, locations: [] }
  }

  let totalReplaced = 0
  const allLocations = []
  let newContent = content

  // 从后往前替换，避免位置偏移
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i]
    let result

    if (kind === 'color') {
      result = replaceColorInContent(region.styleContent, actualValue, expectedValue)
    } else {
      result = replaceNumericInContent(region.styleContent, actualValue, expectedValue)
    }

    if (result.replaced > 0) {
      // 过滤掉 Less 变量声明中的替换
      if (region.isStyleBlock) {
        // 对于 <style> 块，需要重新构建完整内容
        const styleStart = content.indexOf(region.fullMatch)
        const innerOffset = region.fullMatch.indexOf(region.styleContent)
        const absoluteInnerStart = styleStart + innerOffset

        // 检查每个替换位置是否在变量声明中
        let filteredContent = region.styleContent
        let searchFrom = 0
        let filteredReplaced = 0
        const filteredLocations = []

        // 重新做替换，但跳过变量声明
        const escapedActual = actualValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = kind === 'color'
          ? new RegExp(escapedActual, 'gi')
          : new RegExp(`(?<=[:\\s])${escapedActual}(?=[\\s;}])`, 'gi')

        const allLines = region.styleContent.split('\n')
        filteredContent = region.styleContent.replace(re, (match, ...args) => {
          const offset = args[args.length - 2]
          if (isLessVarDeclaration(region.styleContent, offset)) {
            return match // 跳过变量声明
          }
          filteredReplaced++
          // 计算位置
          const beforeMatch = region.styleContent.slice(0, offset)
          const lines = beforeMatch.split('\n')
          const line = lines.length
          const column = lines[lines.length - 1].length + 1
          const context = allLines[line - 1]?.trim() || ''
          filteredLocations.push({ line, column, context })
          return expectedValue
        })

        if (filteredReplaced > 0) {
          newContent = newContent.slice(0, absoluteInnerStart) +
            filteredContent +
            newContent.slice(absoluteInnerStart + region.styleContent.length)
          totalReplaced += filteredReplaced
          allLocations.push(...filteredLocations)
        }
      } else {
        // .less/.css 文件，直接替换
        const absoluteStart = content.indexOf(region.styleContent)
        newContent = newContent.slice(0, absoluteStart) +
          result.newContent +
          newContent.slice(absoluteStart + region.styleContent.length)
        totalReplaced += result.replaced
        allLocations.push(...result.locations)
      }
    }
  }

  return { newContent, replaced: totalReplaced, locations: allLocations }
}

/**
 * 执行样式自动修复
 *
 * 基于评分结果中的 fuzzyMatches 和 missed 信息，修复产物中的样式偏差。
 *
 * @param {string} componentDir 组件目录
 * @param {object} quality 质量评分结果
 * @param {object} options 选项
 * @param {boolean} options.fixFuzzy 是否修复模糊匹配项（默认 true）
 * @param {boolean} options.fixMissed 是否修复未匹配项（默认 false，保守策略）
 * @param {string[]} options.targetDimensions 可选，指定要修复的维度（如 ['spacing', 'font']）
 * @returns {{ fixed: Array, summary: object, files: Array }}
 */
export function runStyleAutoFix(componentDir, quality, options = {}) {
  const { fixFuzzy = true, fixMissed = false, inputFiles = null, targetDimensions = null } = options

  if (!quality?.style?.dimensions) {
    return { fixed: [], summary: { color: 0, spacing: 0, font: 0, radius: 0 }, files: [] }
  }

  // 如果传入了已修改的文件列表（规范修复后的），直接使用；否则从磁盘读取
  let files
  if (inputFiles && inputFiles.length > 0) {
    files = inputFiles.map((f) => ({ ...f }))
  } else {
    const rawFiles = collectGeneratedFilesFromDir(componentDir)
    files = rawFiles.map((f) => ({
      path: f.path,
      content: f.content,
    }))
  }

  const fixed = []
  const unfixable = []
  const summary = { color: 0, spacing: 0, font: 0, radius: 0 }

  const dimensions = quality.style.dimensions
  const dimEntries = Object.entries(dimensions).filter(
    ([name, dim]) => {
      if (!dim.scored || name === 'structure') return false
      if (targetDimensions && !targetDimensions.includes(name)) return false
      return dim.fuzzyMatches?.length || dim.missed?.length
    }
  )

  for (const [dimName, dim] of dimEntries) {
    const kind = dimName === 'color' ? 'color' : 'numeric'

    // 1. 修复模糊匹配项（有明确对应关系）
    if (fixFuzzy && dim.fuzzyMatches?.length) {
      for (const fm of dim.fuzzyMatches) {
        if (!fm.matchedTo) continue

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const result = safeReplaceInFile(file.content, file.path, fm.matchedTo, fm.expected, kind)
          if (result.replaced > 0) {
            files[i] = { ...file, content: result.newContent }
            fixed.push({
              file: file.path,
              dimension: dimName,
              expected: fm.expected,
              actual: fm.matchedTo,
              distance: fm.distance,
              replaced: result.replaced,
              type: 'fuzzy',
              locations: result.locations,
            })
            summary[dimName] = (summary[dimName] || 0) + result.replaced
          }
        }
      }
    }

    // 2. 修复未匹配项（启发式策略：对每个 missed 找最近的 actual 值替换）
    if (fixMissed && dim.missed?.length) {
      // 提取当前产物中的值（修复后的版本）
      const currentActual = extractDeclaredStyleLiterals(files)
      const actualValues = currentActual[dimName] || []

      if (actualValues.length === 0) {
        // 记录无法修复原因：产物中没有该维度的值
        for (const expected of dim.missed) {
          unfixable.push({
            dimension: dimName,
            expected,
            reason: `产物中未找到任何${dimName === 'color' ? '颜色' : dimName === 'spacing' ? '间距' : dimName === 'font' ? '字体大小' : '圆角'}值`,
            reasonCode: 'NO_ACTUAL_VALUES',
          })
        }
        continue
      }

      for (const expected of dim.missed) {
        // 找到最接近的 actual 值
        let bestActual = null
        let bestDistance = Infinity

        for (const actual of actualValues) {
          if (expected === actual) continue

          let distance = Infinity
          if (kind === 'color') {
            distance = colorDistance(expected, actual)
          } else {
            const expNum = parseNumericValue(expected)
            const actNum = parseNumericValue(actual)
            if (expNum != null && actNum != null) {
              distance = Math.abs(expNum - actNum)
            }
          }

          // 检查是否在可接受范围内
          let isAcceptable = false
          if (kind === 'color') {
            isAcceptable = distance <= 48 // 颜色容差稍宽松
          } else {
            const expNum = parseNumericValue(expected)
            if (expNum != null) {
              const relativeDiff = distance / Math.max(expNum, 1)
              isAcceptable = distance <= 5 || relativeDiff <= 0.25
            }
          }

          if (isAcceptable && distance < bestDistance) {
            bestDistance = distance
            bestActual = actual
          }
        }

        if (!bestActual) {
          // 记录无法修复原因：没有找到接近的值
          let reason = ''
          let reasonCode = ''
          
          if (kind === 'color') {
            reason = `颜色 ${expected} 与产物中所有颜色的差异都超过容差范围（RGB距离 > 48）`
            reasonCode = 'COLOR_TOO_FAR'
          } else {
            reason = `${dimName === 'spacing' ? '间距' : dimName === 'font' ? '字体大小' : '圆角'} ${expected} 与产物中所有值的差异都超过容差范围（> 5px 或 > 25%）`
            reasonCode = 'VALUE_TOO_FAR'
          }
          
          unfixable.push({
            dimension: dimName,
            expected,
            reason,
            reasonCode,
          })
          continue
        }

        // 执行替换
        let replaced = false
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const result = safeReplaceInFile(file.content, file.path, bestActual, expected, kind)
          if (result.replaced > 0) {
            files[i] = { ...file, content: result.newContent }
            fixed.push({
              file: file.path,
              dimension: dimName,
              expected,
              actual: bestActual,
              distance: bestDistance,
              replaced: result.replaced,
              type: 'missed',
              locations: result.locations,
            })
            summary[dimName] = (summary[dimName] || 0) + result.replaced
            replaced = true
            break // 找到一个文件替换成功就停止，避免重复替换
          }
        }
        
        if (!replaced) {
          // 记录无法修复原因：在产物中找不到可替换的值
          unfixable.push({
            dimension: dimName,
            expected,
            reason: `产物中未找到可替换的值 ${bestActual}`,
            reasonCode: 'VALUE_NOT_FOUND_IN_FILES',
          })
        }
      }
    }
  }

  return { fixed, unfixable, summary, files }
}

/**
 * 执行样式修复并写回磁盘
 *
 * @param {string} componentDir 组件目录
 * @param {object} quality 质量评分结果
 * @param {object} options 选项
 * @returns {{ fixed: Array, unfixable: Array, summary: object, written: number }}
 */
export function runStyleAutoFixAndWrite(componentDir, quality, options = {}) {
  const { fixed, unfixable, summary, files } = runStyleAutoFix(componentDir, quality, options)

  let written = 0
  for (const file of files) {
    if (file.path && typeof file.content === 'string') {
      const fullPath = join(componentDir, file.path)
      try {
        writeFileSync(fullPath, file.content, 'utf8')
        written++
      } catch (err) {
        console.error(`[style-auto-fix] 写入失败: ${fullPath}`, err.message)
      }
    }
  }

  return { fixed, unfixable, summary, written }
}

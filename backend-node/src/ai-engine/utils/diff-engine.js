/**
 *patch 增量修改引擎
 * 支持 LLM 输出 PATCH 块，只修改文件局部，不重写整个文件，节省 token。
 *
 * 格式约定（每个修改块）：
 * ```
 * <<<PATCH filePath
 * --- ORIGINAL
 * [original code snippet，完整的要替换的块，含缩进]
 * ---
 * +++ NEW
 * [new code snippet，替换后的代码]
 * >>>PATCH
 * ```
 *
 * 匹配策略（三级 fallback）：
 * 1. 精确匹配：完全相等（包括缩进、换行）
 * 2. 归一化匹配：两边都去掉首尾空白、折叠连续空行后匹配
 * 3. 边界匹配：只匹配开头N行和结尾N行，中间允许差异
 *
 * 如果全部匹配失败，返回 { success: false }，调用方回退全量生成。
 */

import { hasFakeDataRegression } from './sfc-semantics.js'
import { validateVueSfc } from './sfc-syntax-validation.js'
import { repairScopedThirdPartySelectors, ensureFlexDirection, ensureFlexDirectionInVueSfc } from './css-sanitizer.js'
import { existsSync, readFileSync, writeFileSync } from 'fs'

/**
 * 从 LLM 输出文本中提取所有 PATCH 块
 * @param {string} text - LLM 输出原文
 * @returns {Array<{filePath: string, original: string, new: string}>} 提取到的 patch 列表
 */
export function extractPatches(text) {
  const patches = []
  // 匹配整个 PATCH 块：<<<PATCH ... → ... → >>>PATCH
  const patchRegex = /<<<PATCH\s+([^\n]+)\n([\s\S]*?)>>>\PATCH/g
  let match

  while ((match = patchRegex.exec(text)) !== null) {
    const filePath = match[1].trim()
    const body = match[2].trim()

    // 分割 --- ORIGINAL / --- / +++ NEW
    const originalMatch = body.match(/^---\s*ORIGINAL\s*\n([\s\S]*?)\n---\s*\n[\s\S]*?\+\+\+\s*NEW\s*\n([\s\S]*)$/)
    if (!originalMatch) {
      continue
    }

    const original = originalMatch[1]
    const newContent = originalMatch[2]
    patches.push({
      filePath,
      original: original.trimEnd(),
      new: newContent.trimEnd(),
    })
  }

  return patches
}

/**
 * 检查文本是否包含 PATCH 块
 * @param {string} text
 * @returns {boolean}
 */
export function hasPatchBlocks(text) {
  return /<<<PATCH\s+[^\n]+\n/.test(text)
}

/**
 * 归一化文本用于模糊匹配：
 * - 去掉首尾空白
 * - 折叠连续空行为单个空行
 * - 去掉每行首尾空白？不，保留缩进，缩进对匹配很重要
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
  return text
    .trim()
    .replace(/\n{3,}/g, '\n\n') // 折叠≥3个空行为2个空行
    .trimEnd()
}

/**
 * 提取边界用于宽松匹配：取开头N行 + 结尾N行
 * @param {string} text
 * @param {number} n - 首尾各取几行
 * @returns {string}
 */
function getBoundaryPrefixSuffix(text, n = 3) {
  const lines = text.trim().split('\n')
  if (lines.length <= n * 2) {
    return text
  }
  const prefix = lines.slice(0, n).join('\n')
  const suffix = lines.slice(-n).join('\n')
  return `${prefix}\n...\n${suffix}`
}

/**
 * 在原始文件内容中应用一个 patch
 * @param {string} originalFile - 原始文件完整内容
 * @param {object} patch - {filePath, original, new}
 * @returns {{success: true, content: string} | {success: false, reason: string}}
 */
export function applyPatch(originalFile, patch) {
  const { original, new: newContent } = patch

  // 1. 尝试精确匹配
  if (originalFile.includes(original)) {
    const newFile = originalFile.replace(original, newContent)
    return { success: true, content: newFile }
  }

  // 2. 尝试归一化（模糊）匹配
  const normalizedOriginal = normalizeForMatch(original)
  const normalizedFile = normalizeForMatch(originalFile)
  if (normalizedFile.includes(normalizedOriginal)) {
    // 归一化匹配成功，但不能直接替换，因为归一化丢了空白信息
    // 找原始文件中对应归一化匹配的位置，按行分割做模糊替换
    const originalLines = originalFile.split('\n')
    const targetLines = original.split('\n').map(l => l.trimEnd())
    const normTargetLines = targetLines.map(normalizeForMatch)

    // 滑动窗口找匹配
    let found = false
    let startLine = -1
    for (let i = 0; i <= originalLines.length - targetLines.length; i++) {
      const window = originalLines.slice(i, i + targetLines.length).map(l => normalizeForMatch(l.trimEnd()))
      if (window.join('\n') === normTargetLines.join('\n')) {
        // 找到了，替换这个窗口
        const before = originalLines.slice(0, i)
        const after = originalLines.slice(i + targetLines.length)
        const newLines = newContent.split('\n')
        const newFile = [...before, ...newLines, ...after].join('\n')
        return { success: true, content: newFile }
      }
    }
  }

  // 3. 尝试边界匹配（只匹配首尾）
  const originalLines = original.split('\n')
  const startLines = originalLines.slice(0, 3).map(normalizeForMatch)
  const endLines = originalLines.slice(-3).map(normalizeForMatch)

  const fileLines = originalFile.split('\n')
  // 滑动窗口找首尾匹配
  for (let i = 0; i <= fileLines.length - originalLines.length; i++) {
    const windowStart = fileLines.slice(i, i + 3).map(normalizeForMatch)
    const windowEnd = fileLines.slice(i + originalLines.length - 3, i + originalLines.length).map(normalizeForMatch)
    if (windowStart.join('\n') === startLines.join('\n') &&
        windowEnd.join('\n') === endLines.join('\n')) {
      // 找到了，替换整个窗口
      const before = fileLines.slice(0, i)
      const after = fileLines.slice(i + originalLines.length)
      const newLines = newContent.split('\n')
      const newFile = [...before, ...newLines, ...after].join('\n')
      return { success: true, content: newFile }
    }
  }

  // 全部匹配失败
  return {
    success: false,
    reason: `无法在原始文件中匹配到要替换的代码块\n--- ORIGINAL ---\n${original}\n---`,
  }
}

/**
 * 批量应用多个 patch 到 workspace 文件
 * @param {string|string[]} outputRoot - 输出根目录（字符串）或目标文件绝对路径数组（两者皆可，兼容两种调用方）
 * @param {Array<{filePath: string, original: string, new: string}>} patches - 提取到的 patch 列表（filePath 为相对路径）
 * @param {typeof import('fs')} fs - fs 模块（注入方便测试；ESM 下默认用真实 fs）
 * @param {Object} [opts] - { logger?: {info,warn,error} }
 * @returns {{
 *   success: boolean,
 *   results: Array<{filePath: string, success: boolean, reason?: string}>,
 *   contentMap: Record<string, string>,
 *   modifiedFiles: string[]
 * }}
 */
export async function applyPatchesToWorkspace(outputRoot, patches, fs = { existsSync, readFileSync, writeFileSync }, opts = {}) {
  const logger = opts?.logger || null
  const results = []
  const contentMap = {}
  let allSuccess = true
  // fs 参数容错：历史调用方把 outputPath（字符串）误传为 fs，此时回退到真实 fs
  const fsm = (fs && typeof fs === 'object' && typeof fs.existsSync === 'function') ? fs : { existsSync, readFileSync, writeFileSync }

  // 兼容两种输出形态：字符串根目录 / 绝对路径数组（此前 refiner 传数组，函数当目录用 → 一直异常回退全量）
  const isArrayRoot = Array.isArray(outputRoot)
  const resolveFullPath = (relPath) => {
    if (!isArrayRoot) return `${outputRoot}/${relPath}`
    const hit = outputRoot.find(p => p.endsWith(`/${relPath}`) || p.endsWith(relPath))
    return hit || `${outputRoot[0]}/${relPath}`
  }

  for (const patch of patches) {
    const fullPath = resolveFullPath(patch.filePath)
    if (!fsm.existsSync(fullPath)) {
      results.push({
        filePath: patch.filePath,
        fullPath,
        success: false,
        reason: '文件不存在，无法patch',
      })
      allSuccess = false
      continue
    }

    const originalContent = fsm.readFileSync(fullPath, 'utf-8')
    const applyResult = applyPatch(originalContent, patch)
    if (applyResult.success) {
      // 🛡️ 假数据回归拦截：精修不得引入 Math.random()（图表数据应来自 Figma/原文件）
      if (hasFakeDataRegression(originalContent, applyResult.content)) {
        logger?.warn?.(`🚫 拦截假数据回归: ${patch.filePath} 引入了 Math.random()，跳过该 patch`, {})
        results.push({
          filePath: patch.filePath,
          fullPath,
          success: false,
          reason: '引入随机假数据(Math.random())被拦截',
        })
        allSuccess = false
        continue
      }
      let finalContent = applyResult.content
      if (patch.filePath.endsWith('.vue')) {
        finalContent = repairScopedThirdPartySelectors(finalContent, logger)
        finalContent = ensureFlexDirectionInVueSfc(finalContent, logger, { flexDirectionDefault: 'column' })
        const syntaxResult = validateVueSfc(finalContent, patch.filePath)
        if (!syntaxResult.valid) {
          results.push({
            filePath: patch.filePath,
            fullPath,
            success: false,
            reason: `生成的 Vue SFC 未通过编译校验: ${syntaxResult.errors.join('; ')}`,
          })
          allSuccess = false
          continue
        }
      } else if (patch.filePath.endsWith('.less') || patch.filePath.endsWith('.css')) {
        finalContent = ensureFlexDirection(finalContent, logger, { flexDirectionDefault: 'column' })
      }
      fsm.writeFileSync(fullPath, finalContent, 'utf-8')
      contentMap[patch.filePath] = finalContent
      results.push({
        filePath: patch.filePath,
        fullPath,
        success: true,
      })
    } else {
      results.push({
        filePath: patch.filePath,
        fullPath,
        success: false,
        reason: applyResult.reason,
      })
      allSuccess = false
    }
  }

  return {
    success: allSuccess,
    results,
    contentMap,
    modifiedFiles: results.filter(r => r.success).map(r => r.filePath),
  }
}

export default {
  extractPatches,
  hasPatchBlocks,
  applyPatch,
  applyPatchesToWorkspace,
}

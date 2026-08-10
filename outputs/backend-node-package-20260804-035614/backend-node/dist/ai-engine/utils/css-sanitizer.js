/**
 * CSS/LESS 内容清洗共享工具
 *
 * 从 phase2.service.ts 的 sanitizeLess / aggressiveClean 提取，
 * 供微码管线（.less 文件清洗）和 Vue3 管线（<style scoped> 内联清洗）共用。
 *
 * 清洗内容：
 * 1. <thinking>...</thinking> 推理块
 * 2. 分隔符标记 // === path === （含跨行碎片）
 * 3. 孤立 === 行 / 路径碎片行
 * 4. 跨行 @import 路径修复
 * 5. 非法行跳过（LLM 评论文本），不截断后续合法行
 * 6. aggressiveClean：激进清洗 + 大括号闭合
 *
 * 注意：theme-vars.less 的 :root mixin 包裹是 LESS 专属逻辑，
 *       留在 phase2.service.ts 中作为后处理步骤，不在此工具内。
 */

/**
 * 清洗 CSS/LESS 内容（温和清洗：去除 LLM 污染，保留合法行）
 *
 * @param {string} raw - 原始 CSS/LESS 内容
 * @param {object} [options] - 可选参数
 * @param {boolean} [options.isLessFile=false] - 是否为 .less 文件（启用 @import 修复）
 * @returns {string} 清洗后的内容
 */
export function sanitizeCssContent(raw, options = {}) {
  if (!raw || typeof raw !== 'string') return raw

  const { isLessFile = false } = options

  let cleaned = raw
    // 1. 去除 <thinking>...</thinking> 推理块（含未闭合的残块）
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking>[\s\S]*$/gi, '')

  // 2. 移除分隔符标记 // === path === （可能跨行被拆碎）
  cleaned = cleaned.replace(/\/\/\s*===\s*[\s\S]*?===\s*\n?/g, '')
  // 移除孤立的 === 行
  cleaned = cleaned.replace(/^\s*===\s*$/gm, '')
  // 移除孤立的路径碎片行（如 /styles/themes/light.less 单独成行）
  cleaned = cleaned.replace(/^\s*\/[\w\/.\-]+\.(less|vue|js|json|css|scss)\s*$/gm, '')

  // 3. 修复跨行的 @import（包括 @ 和 import 分两行、路径跨行等）
  if (isLessFile) {
    // 3a. 先合并分行的 @ import → @import（"@\nimport" → "@import"）
    cleaned = cleaned.replace(/@\s*\n\s*import\b/gi, '@import')
    // 3b. 修复跨行路径（如 '../common.\nless' → '../common.less'）
    cleaned = cleaned.replace(
      /(@import\s+[^;]*?['"])([\s\S]*?)(['"];?)/g,
      (match, prefix, middle, suffix) => {
        const fixed = (middle + suffix).replace(/\s*\n\s*/g, '')
        return prefix + fixed
      },
    )
    // 3c. 移除开头残留的 `less` 文本（来自 <style lang="less"> 的歧义残留）
    cleaned = cleaned.replace(/^\s*less\s*\n/i, '')
  }

  // 4. 截断末尾 LLM 评论文本——跳过非法行而非截断后续所有内容
  const lines = cleaned.split('\n')
  let lastValidIdx = -1
  const illegalLineIdxs = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '') continue
    // 注释行合法
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    // 不完整的属性行（如 `color:` 后无值）标记为非法但不截断
    if (/^[\w-]+\s*:\s*$/.test(trimmed)) {
      illegalLineIdxs.push(i)
      continue
    }
    // 🔧 孤儿 CSS 值检测：以函数名/数值开头+分号结尾，但缺少属性前缀
    // 典型 LLM 生成错误：
    //   linear-gradient(180deg, ...);  → 缺少 background:
    //   0 12px 36px rgba(0,0,0,0.28); → 缺少 box-shadow:
    // 这些行以分号结尾迷惑了下面的 /[};{]$/ 检查，必须提前拦截
    if (!/^[\w-]+\s*:/.test(trimmed)) {
      if (/^[a-z-]+\(/i.test(trimmed) || /^[\d.\s-]+(px|em|rem|%|vh|vw)/.test(trimmed)) {
        illegalLineIdxs.push(i)
        continue
      }
    }
    // 合法行：含 CSS/LESS 语法特征的行
    if (
      /[};{]$/.test(trimmed) ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('.') ||
      trimmed.startsWith(':root') ||
      trimmed.startsWith('&') ||
      trimmed.startsWith('}') ||
      trimmed.startsWith(':') ||
      trimmed.startsWith('#') ||
      /^[\w-]+\s*:/.test(trimmed)
    ) {
      lastValidIdx = i
    } else {
      // 非法行（LLM 评论文本、中文说明等）
      illegalLineIdxs.push(i)
    }
  }
  if (lastValidIdx >= 0 && lastValidIdx < lines.length - 1) {
    // 保留到最后一个合法行，剔除之后的非法行
    const validLines = lines.filter((_, idx) =>
      idx <= lastValidIdx && !illegalLineIdxs.includes(idx),
    )
    cleaned = validLines.join('\n')
  } else if (illegalLineIdxs.length > 0) {
    cleaned = lines.filter((_, idx) => !illegalLineIdxs.includes(idx)).join('\n')
  }

  return cleaned
}

/**
 * 激进清洗 CSS/LESS 内容（在温和清洗失败时使用）
 *
 * 只保留合法的 CSS/LESS 行，跳过 LLM 评论文本，确保大括号闭合。
 *
 * @param {string} raw - 原始内容
 * @returns {string} 清洗后的内容
 */
export function aggressiveCleanCss(raw) {
  if (!raw || typeof raw !== 'string') return raw

  const lines = raw.split('\n')
  const kept = []
  let braceDepth = 0

  for (const line of lines) {
    const t = line.trim()
    // 空行和注释行保留
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
      kept.push(line)
      continue
    }
    // 跳过不完整的属性行
    if (/^[\w-]+\s*:\s*$/.test(t)) continue
    // 跳过明显的 LLM 评论文本
    if (/^[✅⚠️🔧📊🔴🟡🟢❌]/.test(t) || /^\*\*/.test(t) || /^#{1,6}\s/.test(t)) continue
    // 跳过纯中文说明行
    if (/^[\u4e00-\u9fa5]/.test(t) && !/[{};:@.]/.test(t)) continue

    kept.push(line)
    braceDepth += (t.match(/{/g) || []).length - (t.match(/}/g) || []).length
  }

  // 确保大括号闭合
  let result = kept.join('\n')
  for (let i = 0; i < braceDepth; i++) result += '\n}'

  return result
}

/**
 * 从 Vue SFC 内容中提取 <style> 段、清洗后放回
 *
 * 用于 Vue3Engineer 的内联 style 清洗：
 * - 提取 <style ...>...</style> 内容
 * - 运行 sanitizeCssContent（isLessFile 根据 lang="less" 判断）
 * - 如果清洗失败（内容明显异常），再尝试 aggressiveCleanCss
 * - 将清洗后的内容放回 SFC
 *
 * @param {string} vueContent - 完整的 Vue SFC 内容
 * @param {object} [logger] - 可选的日志对象
 * @returns {string} 清洗后的 Vue SFC 内容
 */
export function sanitizeVueStyleBlock(vueContent, logger) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent

  // 匹配 <style ...>...</style> 块（含 lang 属性）
  const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi
  let styleCount = 0

  const result = vueContent.replace(styleRegex, (fullMatch, attrs, innerContent) => {
    styleCount++
    const isLess = /lang\s*=\s*["']less["']/i.test(attrs)

    // 温和清洗
    let cleaned = sanitizeCssContent(innerContent, { isLessFile: isLess })

    // 如果清洗后内容明显异常（大量非法行被剔除导致内容急剧缩短），尝试激进清洗
    if (cleaned.trim().length < innerContent.trim().length * 0.3 && innerContent.trim().length > 50) {
      logger?.warn?.(`<style> 清洗后内容骤减（${innerContent.trim().length} → ${cleaned.trim().length}），尝试激进清洗`)
      cleaned = aggressiveCleanCss(innerContent)
    }

    if (cleaned !== innerContent) {
      logger?.warn?.(`已清洗 <style> 块（${isLess ? 'less' : 'css'}）`)
    }

    return `<style${attrs}>${cleaned}</style>`
  })

  if (styleCount === 0 && logger) {
    logger?.debug?.('未在 Vue SFC 中找到 <style> 块，跳过 style 清洗')
  }

  return result
}

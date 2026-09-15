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
 * 7. 无效 CSS 属性修正（LLM 幻觉属性名）
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

  // 2. 移除整行的分隔符标记 // === ... ===（行锚定，完整消费整行，避免懒汉截断）
  cleaned = cleaned.replace(/^[ \t]*\/\/[ \t]*={3,}[^\n]*$/gm, '')
  // Loop 0.C：`}====` / `}//=*{3,}` 粘合行 — 保留 `}`，丢掉等号垃圾并换行
  cleaned = cleaned.replace(/\}[ \t]*\/\/[ \t]*={3,}[^\n]*/g, '}\n')
  cleaned = cleaned.replace(/\}[ \t]*={3,}[^\n]*/g, '}\n')
  // 移除残留的孤立 === 行（包括被截断后剩余的多个等号）
  cleaned = cleaned.replace(/^[ \t]*={3,}[^\n]*$/gm, '')
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
    //孤儿 CSS 值检测：以函数名/数值开头+分号结尾，但缺少属性前缀
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
    if (/^[✅⚠️📊🔴🟡🟢❌]/.test(t) || /^\*\*/.test(t) || /^#{1,6}\s/.test(t)) continue
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

    // 🛡️ flex 方向确定性补全（治上下布局变左右）
    cleaned = ensureFlexDirection(cleaned, logger)

    return `<style${attrs}>${cleaned}</style>`
  })

  if (styleCount === 0 && logger) {
    logger?.debug?.('未在 Vue SFC 中找到 <style> 块，跳过 style 清洗')
  }

  return result
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ANT_TABLE_LAYER_SUFFIXES = [
  '.ant-table',
  '.ant-table-container',
  '.ant-table-content',
  'table',
]

function extractAntTableEntries(vueContent) {
  const entries = []
  const antTableRegex = /<a-table\b((?:"[^"]*"|'[^']*'|[^>])*)>/gi
  let match

  while ((match = antTableRegex.exec(vueContent)) !== null) {
    const attrs = match[1]
    const staticClassMatch = attrs.match(/(?:^|\s)class\s*=\s*(["'])(.*?)\1/i)
    const dynamicClass = /(?:^|\s)(?::class|v-bind:class)\s*=/.test(attrs)
    const classNames = (staticClassMatch?.[2] || '')
      .split(/\s+/)
      .filter((className) => /^[A-Za-z_][\w-]*$/.test(className))

    entries.push({ classNames, dynamicClass })
  }

  return entries
}

function extractVueStyleBlocks(vueContent) {
  const blocks = []
  const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi
  let match

  while ((match = styleRegex.exec(vueContent)) !== null) {
    blocks.push({
      attrs: match[1],
      content: match[2],
      scoped: /\bscoped\b/i.test(match[1]),
    })
  }

  return blocks
}

function splitSelectors(selector) {
  const selectors = []
  let start = 0
  let parenthesisDepth = 0
  let bracketDepth = 0
  let quote = ''

  for (let i = 0; i < selector.length; i++) {
    const current = selector[i]
    if (quote) {
      if (current === quote && selector[i - 1] !== '\\') quote = ''
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      continue
    }
    if (current === '(') parenthesisDepth++
    else if (current === ')') parenthesisDepth--
    else if (current === '[') bracketDepth++
    else if (current === ']') bracketDepth--
    else if (current === ',' && parenthesisDepth === 0 && bracketDepth === 0) {
      selectors.push(selector.slice(start, i).trim())
      start = i + 1
    }
  }

  selectors.push(selector.slice(start).trim())
  return selectors.filter(Boolean)
}

function unwrapDeepSelectors(selector) {
  let unwrapped = selector
  let previous
  do {
    previous = unwrapped
    unwrapped = unwrapped.replace(/:deep\(([^()]*)\)/g, '$1')
  } while (unwrapped !== previous)
  return unwrapped.replace(/::v-deep|\/deep\//g, ' ')
}

function normalizeSelector(selector) {
  return unwrapDeepSelectors(selector)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .trim()
}

function parseCssRules(content) {
  const rules = []
  const stack = []
  let inComment = false
  let quote = ''

  for (let i = 0; i < content.length; i++) {
    const current = content[i]
    const next = content[i + 1]

    if (inComment) {
      if (current === '*' && next === '/') {
        inComment = false
        i++
      }
      continue
    }
    if (!quote && current === '/' && next === '*') {
      inComment = true
      i++
      continue
    }
    if (quote) {
      if (current === quote && content[i - 1] !== '\\') quote = ''
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      continue
    }

    if (current === '{') {
      const parent = stack[stack.length - 1]
      const searchStart = parent?.segmentStart || 0
      const semicolonBoundary = content.lastIndexOf(';', i - 1)
      const braceBoundary = Math.max(content.lastIndexOf('{', i - 1), content.lastIndexOf('}', i - 1))
      const selectorStart = Math.max(searchStart, semicolonBoundary + 1, braceBoundary + 1)
      const selector = content.slice(selectorStart, i).trim()

      if (parent) parent.declarationChunks.push(content.slice(parent.segmentStart, selectorStart))
      const rule = { selector, parent: parent?.rule || null, declarations: '', effectiveSelectors: [] }
      stack.push({ rule, segmentStart: i + 1, declarationChunks: [] })
    } else if (current === '}' && stack.length > 0) {
      const frame = stack.pop()
      frame.declarationChunks.push(content.slice(frame.segmentStart, i))
      frame.rule.declarations = frame.declarationChunks.join(' ')
      rules.push(frame.rule)
      if (stack.length > 0) stack[stack.length - 1].segmentStart = i + 1
    }
  }

  const resolveEffectiveSelectors = (rule) => {
    if (rule.effectiveSelectors.length > 0) return rule.effectiveSelectors
    const parentSelectors = rule.parent ? resolveEffectiveSelectors(rule.parent) : ['']
    if (rule.selector.trim().startsWith('@')) {
      rule.effectiveSelectors = parentSelectors
      return rule.effectiveSelectors
    }

    const ownSelectors = splitSelectors(unwrapDeepSelectors(rule.selector)).flatMap((selector) =>
      splitSelectors(selector),
    )
    rule.effectiveSelectors = parentSelectors.flatMap((parentSelector) =>
      ownSelectors.map((ownSelector) => {
        if (!parentSelector) return normalizeSelector(ownSelector)
        if (ownSelector.includes('&')) {
          return normalizeSelector(ownSelector.replace(/&/g, parentSelector))
        }
        return normalizeSelector(`${parentSelector} ${ownSelector}`)
      }),
    ).filter(Boolean)
    return rule.effectiveSelectors
  }

  for (const rule of rules) resolveEffectiveSelectors(rule)
  return rules
}

function findBackgroundDeclaration(declarations, transparentOnly = false) {
  const declarationRegex = /\b(background(?:-color)?)\s*:\s*([^;{}]+)\s*;?/gi
  let match
  while ((match = declarationRegex.exec(declarations)) !== null) {
    const value = match[2].trim()
    if (!transparentOnly || /^transparent(?:\s*!important)?$/i.test(value)) {
      return `${match[1]}: ${value};`
    }
  }
  return null
}

function selectorTargets(selector, target) {
  const normalizedSelector = normalizeSelector(selector)
  const normalizedTarget = normalizeSelector(target)
  return normalizedSelector === normalizedTarget || normalizedSelector.endsWith(` ${normalizedTarget}`)
}

function classAppearsInSelector(selector, className) {
  return new RegExp(`(^|[^\\w-])\\.${escapeRegExp(className)}(?![\\w-])`).test(selector)
}

function inspectTableClass(className, styleAnalyses) {
  const requiredLayers = ANT_TABLE_LAYER_SUFFIXES.map((suffix) => `.${className} ${suffix}`)
  const scopedAnalyses = styleAnalyses.filter((style) => style.scoped)
  const scopedRules = scopedAnalyses.flatMap((style) => style.rules)
  const allRules = styleAnalyses.flatMap((style) => style.rules)
  const transparentRule = scopedRules.find((rule) =>
    rule.effectiveSelectors.some((selector) => classAppearsInSelector(selector, className)) &&
    findBackgroundDeclaration(rule.declarations, true),
  )
  const anyTransparentRule = allRules.find((rule) =>
    rule.effectiveSelectors.some((selector) => classAppearsInSelector(selector, className)) &&
    findBackgroundDeclaration(rule.declarations, true),
  )
  const missingLayers = requiredLayers.filter((requiredSelector) =>
    !scopedRules.some((rule) =>
      rule.effectiveSelectors.some((selector) => selectorTargets(selector, requiredSelector)) &&
      findBackgroundDeclaration(rule.declarations),
    ),
  )
  const hoverSelector = `.${className} .ant-table-tbody>tr:hover>td`
  const hoverStateSelector = `.${className} .ant-table-tbody>tr>td.ant-table-cell-row-hover`
  const hoverRule = scopedRules.find((rule) =>
    rule.effectiveSelectors.some((selector) => selectorTargets(selector, hoverSelector)) &&
    findBackgroundDeclaration(rule.declarations),
  )
  const hasHoverState = scopedRules.some((rule) =>
    rule.effectiveSelectors.some((selector) => selectorTargets(selector, hoverStateSelector)) &&
    findBackgroundDeclaration(rule.declarations),
  )
  const transparentStyleIndex = transparentRule
    ? styleAnalyses.findIndex((style) => style.rules.includes(transparentRule))
    : -1

  return {
    className,
    scoped: scopedAnalyses.length > 0,
    transparentIntent: Boolean(transparentRule || (scopedAnalyses.length === 0 && anyTransparentRule)),
    missingLayers,
    missingHoverState: !hasHoverState,
    hoverDeclaration: hoverRule ? findBackgroundDeclaration(hoverRule.declarations) : null,
    styleIndex: transparentStyleIndex,
  }
}

/**
 * 分析 Vue SFC 中 Ant Design Vue Table 的 scoped 透明背景覆盖情况。
 *
 * @param {string} vueContent - 完整 Vue SFC 内容
 * @returns {{tables: object[], summary: object}} 分析结果
 */
export function analyzeScopedAntTableStyles(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') {
    return { tables: [], summary: { total: 0, ok: 0, needsRepair: 0, skipped: 0, warn: 0 } }
  }

  const styleAnalyses = extractVueStyleBlocks(vueContent).map((style) => ({
    ...style,
    rules: parseCssRules(style.content),
  }))
  const hasScopedStyle = styleAnalyses.some((style) => style.scoped)
  const tables = extractAntTableEntries(vueContent).map((entry) => {
    if (entry.classNames.length === 0) {
      const dynamicWarning = entry.dynamicClass
      return {
        className: null,
        scoped: hasScopedStyle,
        transparentIntent: false,
        missingLayers: [],
        missingHoverState: false,
        status: dynamicWarning ? 'warn' : 'skipped',
        ...(dynamicWarning ? { warning: 'a-table 仅使用动态 class，无法进行静态 scoped 样式修复' } : {}),
      }
    }

    const inspections = entry.classNames.map((className) => inspectTableClass(className, styleAnalyses))
    const table = inspections.find((inspection) => inspection.transparentIntent && inspection.scoped) ||
      inspections.find((inspection) => inspection.transparentIntent) ||
      inspections[0]
    const needsRepair = table.scoped && table.transparentIntent &&
      (table.missingLayers.length > 0 || table.missingHoverState)
    const status = needsRepair
      ? 'needs-repair'
      : table.scoped && table.transparentIntent
        ? 'ok'
        : 'skipped'

    return { ...table, status }
  })

  return {
    tables,
    summary: {
      total: tables.length,
      ok: tables.filter((table) => table.status === 'ok').length,
      needsRepair: tables.filter((table) => table.status === 'needs-repair').length,
      skipped: tables.filter((table) => table.status === 'skipped').length,
      warn: tables.filter((table) => table.status === 'warn').length,
    },
  }
}

/**
 * 按分析结果补齐 scoped 透明 Ant Table 的内部背景层与真实 hover 状态。
 * 修复只追加缺失规则，并复用已有 tr:hover > td 的背景声明，因此可重复执行。
 *
 * @param {string} vueContent - 完整 Vue SFC 内容
 * @param {object} [logger] - 可选日志对象
 * @returns {string} 修复后的 Vue SFC 内容
 */
export function repairScopedAntTableStyles(vueContent, logger) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent

  const analysis = analyzeScopedAntTableStyles(vueContent)
  for (const table of analysis.tables.filter((item) => item.status === 'warn')) {
    logger?.warn?.(table.warning)
  }

  const plans = new Map()
  for (const table of analysis.tables.filter((item) => item.status === 'needs-repair')) {
    const key = `${table.styleIndex}:${table.className}`
    if (!plans.has(key)) {
      plans.set(key, {
        ...table,
        missingLayers: new Set(table.missingLayers),
      })
    } else {
      const plan = plans.get(key)
      for (const layer of table.missingLayers) plan.missingLayers.add(layer)
      plan.missingHoverState ||= table.missingHoverState
      plan.hoverDeclaration ||= table.hoverDeclaration
    }
  }
  if (plans.size === 0) return vueContent

  const plansByStyle = new Map()
  for (const plan of plans.values()) {
    if (!plansByStyle.has(plan.styleIndex)) plansByStyle.set(plan.styleIndex, [])
    plansByStyle.get(plan.styleIndex).push(plan)
  }

  let styleIndex = -1
  let repairedCount = 0
  const result = vueContent.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (fullMatch, attrs, innerContent) => {
    styleIndex++
    const stylePlans = plansByStyle.get(styleIndex)
    if (!stylePlans || !/\bscoped\b/i.test(attrs)) return fullMatch

    const additions = []
    for (const plan of stylePlans) {
      const missingLayers = [...plan.missingLayers]
      if (missingLayers.length > 0) {
        additions.push(`/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
${missingLayers.map((selector) => `:deep(${selector})`).join(',\n')} {
  background: transparent;
  color: inherit;
}`)
        repairedCount += missingLayers.length
      }
      if (plan.missingHoverState) {
        additions.push(`/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.${plan.className} .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  ${plan.hoverDeclaration || 'background: transparent;'}
}`)
        repairedCount++
      }
    }

    if (additions.length === 0) return fullMatch
    const trailingWhitespace = innerContent.match(/\s*$/)?.[0] || ''
    const contentWithoutTrailing = innerContent.slice(0, innerContent.length - trailingWhitespace.length)
    const separator = contentWithoutTrailing.endsWith('\n') ? '' : '\n'
    return `<style${attrs}>${contentWithoutTrailing}${separator}${additions.join('\n\n')}\n${trailingWhitespace}</style>`
  })

  if (repairedCount > 0) {
    logger?.warn?.(`已补齐 Ant Design Vue Table 的 ${repairedCount} 个内部背景/状态样式`)
  }
  return result
}

/**
 * 修复 scoped 样式中无法穿透第三方 Vue 组件 DOM 的选择器。
 *
 * 当前确定性处理 Ant Design Vue 的 `.ant-*` 选择器：
 * - 只处理 `<style scoped>`，非 scoped 样式无需 deep。
 * - 已包含 `:deep()` / `::v-deep` / `/deep/` 的选择器保持不变。
 * - 保留 iframe/组件的原始选择器语义，将完整选择器包进 `:deep(...)`。
 * - 支持同一行或跨行选择器，以及 LESS 嵌套块。
 *
 * @param {string} vueContent - 完整 Vue SFC 内容
 * @param {object} [logger] - 可选日志对象
 * @returns {string} 修复后的 Vue SFC 内容
 */
export function repairScopedThirdPartySelectors(vueContent, logger) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent

  const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi
  let repairedCount = 0

  const result = vueContent.replace(styleRegex, (fullMatch, attrs, innerContent) => {
    if (!/\bscoped\b/i.test(attrs)) return fullMatch

    const chars = [...innerContent]
    const replacements = []
    let segmentStart = 0
    let inComment = false
    let quote = ''

    for (let i = 0; i < chars.length; i++) {
      const current = chars[i]
      const next = chars[i + 1]

      if (inComment) {
        if (current === '*' && next === '/') {
          inComment = false
          i++
        }
        continue
      }
      if (!quote && current === '/' && next === '*') {
        inComment = true
        i++
        continue
      }
      if (quote) {
        if (current === quote && chars[i - 1] !== '\\') quote = ''
        continue
      }
      if (current === '"' || current === "'") {
        quote = current
        continue
      }

      if (current === '{') {
        const rawSegment = innerContent.slice(segmentStart, i)
        const declarationBoundary = Math.max(rawSegment.lastIndexOf(';'), rawSegment.lastIndexOf('}'))
        const prefixLength = declarationBoundary + 1
        const selectorPart = rawSegment.slice(prefixLength)
        const leadingLength = selectorPart.length - selectorPart.trimStart().length
        const trailingLength = selectorPart.length - selectorPart.trimEnd().length
        const selector = selectorPart.trim()

        const needsDeep = selector.includes('.ant-') &&
          !selector.startsWith('@') &&
          !/:deep\(|::v-deep|\/deep\//.test(selector)

        if (needsDeep) {
          const selectorStart = segmentStart + prefixLength + leadingLength
          const selectorEnd = i - trailingLength
          replacements.push({ start: selectorStart, end: selectorEnd, value: `:deep(${selector})` })
          repairedCount++
        }
        segmentStart = i + 1
      } else if (current === '}') {
        segmentStart = i + 1
      }
    }

    if (replacements.length === 0) return fullMatch

    let repaired = innerContent
    for (const replacement of replacements.reverse()) {
      repaired = repaired.slice(0, replacement.start) + replacement.value + repaired.slice(replacement.end)
    }
    return `<style${attrs}>${repaired}</style>`
  })

  if (repairedCount > 0) {
    logger?.warn?.(`已为 scoped 样式中的 ${repairedCount} 个 Ant Design Vue 选择器补充 :deep()`)
  }
  return repairScopedAntTableStyles(result, logger)
}

/**
 * 解析单条 CSS 规则的声明文本，提取 flex 相关信息。
 * 返回 { hasFlexDisplay, flexDirection }。
 */
function _extractFlexInfo(declarations) {
  let hasFlexDisplay = false
  let flexDirection = null
  // display: flex / display:inline-flex（容忍 flex 前有多余空格）
  const displayRe = /display\s*:\s*(inline-)?flex\b/i
  const directionRe = /flex-direction\s*:\s*([a-z-]+)\b/i
  const dMatch = declarations.match(displayRe)
  if (dMatch) hasFlexDisplay = true
  const dirMatch = declarations.match(directionRe)
  if (dirMatch) flexDirection = dirMatch[1].toLowerCase()
  return { hasFlexDisplay, flexDirection }
}

/**
 * 🛡️ 样式文本「叶子声明块」扫描器（**单一事实源**）。
 *
 * 逐字符扫描定位每个 `{` 与其匹配的 `}`，产出**块内不再含 `{`** 的叶子块。
 * 正确处理 `/* *\/` 注释与引号（避免把注释 / `url(...)` 里的花括号当结构）。
 * 外层含嵌套子块的规则**不产出**（无法可靠判定声明归属），但会继续向内扫描，
 * 使嵌套子块各自作为叶子块被产出（与 ensureFlexDirection 原有语义一致）。
 *
 * 两个消费方共用，不各自造一套：`ensureFlexDirection` / `ensureGridDisplay`。
 *
 * @param {string} text CSS/LESS 文本
 * @returns {Array<{start:number,end:number,inner:string}>} end 为匹配 `}` 的索引
 */
function scanLeafDeclarationBlocks(text) {
  const out = []
  const src = String(text || '')
  const chars = [...src]
  const n = chars.length
  let i = 0
  let inComment = false
  let quote = ''

  while (i < n) {
    const c = chars[i]
    const next = chars[i + 1]

    if (inComment) {
      if (c === '*' && next === '/') { inComment = false; i += 2; continue }
      i++; continue
    }
    if (quote) {
      if (c === quote && chars[i - 1] !== '\\') quote = ''
      i++; continue
    }
    if (c === '/' && next === '*') { inComment = true; i += 2; continue }
    if (c === '"' || c === "'") { quote = c; i++; continue }

    if (c === '{') {
      let depth = 1
      let j = i + 1
      let innerComment = false
      let innerQuote = ''
      while (j < n && depth > 0) {
        const cc = chars[j]
        const nn = chars[j + 1]
        if (innerComment) {
          if (cc === '*' && nn === '/') { innerComment = false; j += 2; continue }
          j++; continue
        }
        if (innerQuote) {
          if (cc === innerQuote && chars[j - 1] !== '\\') innerQuote = ''
          j++; continue
        }
        if (cc === '/' && nn === '*') { innerComment = true; j += 2; continue }
        if (cc === '"' || cc === "'") { innerQuote = cc; j++; continue }
        if (cc === '{') depth++
        else if (cc === '}') { depth--; if (depth === 0) break }
        j++
      }
      if (depth === 0) {
        const inner = src.slice(i + 1, j)
        if (!inner.includes('{')) out.push({ start: i, end: j, inner })
      }
      // 无论是外层嵌套块还是叶子块，都继续向内/向后扫描（保证子块也被产出）
      i++
      continue
    }
    i++
  }
  return out
}

/**
 * 🛡️ flex 方向确定性补全（治「上下布局变左右」）。
 *
 * 背景：LLM 生成的 CSS 中大量 `display: flex` 漏写 `flex-direction`，CSS 默认值是
 * `row`（横向），导致设计稿中本应上下堆叠的容器（如 traffic trend / vehicle
 * distribution）被渲染成左右并排。
 *
 * 策略（确定性兜底，但必须有证据，绝不臆测方向）：
 * - 只处理「display: flex / inline-flex」且「无 flex-direction」的规则。
 * - 必须有明确方向证据才补全：`options.flexDirectionDefault` 显式指定 'row' | 'column'。
 *   证据来源：Figma layoutMode（HORIZONTAL→row / VERTICAL→column）或视觉分析明确朝向。
 * - 无证据（flexDirectionDefault 为 'none' 或未传）时【不改 CSS】，保留浏览器默认 row，
 *   由生成提示词要求模型显式书写 flex-direction，避免把 icon+text / Tab 等横向块误改成纵向。
 * - 已含 flex-direction 的规则、display: grid 的规则一律不动。
 * - 幂等：补全后再跑一次不会重复插入。
 *
 * 挂载点：所有写盘路径（microcode sanitize 链 / diff-engine / vue3-engineer /
 * layout-responsive-graph），与 repairScopedThirdPartySelectors 同模式。
 *
 * @param {string} cssContent CSS/LESS 文本（纯样式内容，非 Vue SFC）
 * @param {object} [logger] 可选日志对象
 * @param {object} [options] 方向证据
 * @param {('row'|'column'|'none')} [options.flexDirectionDefault] 证据方向；'none'/未传则不改动
 * @returns {string} 补全后的样式内容
 */
export function ensureFlexDirection(cssContent, logger, options = {}) {
  if (!cssContent || typeof cssContent !== 'string') return cssContent
  // 必须显式给定方向证据才补全；无证据一律不改 CSS，避免把横向 flex 误改成纵向
  const flexDefault = options?.flexDirectionDefault === 'row' || options?.flexDirectionDefault === 'column'
    ? options.flexDirectionDefault
    : 'none'
  if (flexDefault === 'none') return cssContent

  let fixedCount = 0
  let result = cssContent

  const edits = [] // 待插入位置（从后往前应用，避免索引漂移）

  for (const b of scanLeafDeclarationBlocks(result)) {
    const { hasFlexDisplay, flexDirection } = _extractFlexInfo(b.inner)
    if (hasFlexDisplay && !flexDirection) {
      // 插到匹配 } 之前
      edits.push({ pos: b.end, text: `\n  flex-direction: ${flexDefault};` })
      fixedCount++
    }
  }

  if (edits.length === 0) return result

  // 从后往前应用插入，避免索引漂移
  for (const e of edits.sort((a, b) => b.pos - a.pos)) {
    result = result.slice(0, e.pos) + e.text + result.slice(e.pos)
  }

  if (fixedCount > 0) {
    logger?.warn?.(`已为 ${fixedCount} 个 display:flex 规则补全 flex-direction: ${flexDefault}（证据驱动）`)
  }
  return result
}

/**
 * 对 Vue SFC 内容中的所有 <style> 块执行 flex 方向补全。
 * 幂等，可重复执行。
 *
 * @param {string} vueContent 完整 Vue SFC 内容
 * @param {object} [logger] 可选日志对象
 * @returns {string} 补全后的 Vue SFC 内容
 */
export function ensureFlexDirectionInVueSfc(vueContent, logger, options = {}) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent
  return vueContent.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (fullMatch, attrs, innerContent) => {
    const repaired = ensureFlexDirection(innerContent, logger, options)
    return `<style${attrs}>${repaired}</style>`
  })
}

/**
 * 只有这些属性出现、而规则里**没有** `display`，才能确定作者意图是 grid。
 * 刻意**不含** `gap` / `row-gap` / `column-gap`：它们在 flex 布局里同样合法，
 * 单凭 gap 无法区分意图（宁可不改，不可误改）。
 */
const GRID_INTENT_PROP_RX =
  /\b(?:grid-template-columns|grid-template-rows|grid-template-areas|grid-auto-flow|grid-auto-columns|grid-auto-rows)\s*:/

/** 规则里是否已显式声明 display */
const DISPLAY_PROP_RX = /\bdisplay\s*:/

/**
 * 🛡️ grid 布局确定性补全（治「多列网格塌成一列 / 内容溢出被裁」）。
 *
 * 背景（2026-09-14 实锤，`c-device-monitor-021848cc`）：LLM 常写出
 * `.c-x-device-grid { grid-template-columns: repeat(3, 1fr) }` 却**漏写 `display: grid`**。
 * 没有 `display: grid` 时 `grid-template-columns` 完全无效 —— 元素退回 `display: block`，
 * 12 个设备卡被渲染成 12 行纵向堆叠 → 高度远超容器 → 被宿主外壳 `overflow: hidden` 裁掉，
 * 视觉上表现为「整块内容凭空消失」，而所有代码门禁（L0-B）都**看不到**（CSS 合法、DOM 存在）。
 *
 * 存量扫描：8 个产物 / 18 条规则命中；且**零**「display 存在但不是 grid」的冲突案例
 * → 保守规则「仅当完全没有 display 时才补」即可覆盖 100% 观测场景，绝不覆盖作者显式意图。
 *
 * 策略：
 * - 只处理「含 grid-template-* / grid-auto-*」且「完全没有 display」的叶子声明块。
 * - 插到匹配 `}` 之前；若前一条声明缺少结尾 `;` 自动补上（LESS/CSS 语法要求）。
 * - 幂等：补全后规则里已有 display，再跑一次不再插入。
 *
 * 挂载点：microcode 写盘 sanitize 链（SFC `<style>` 块 + 独立 .less/.css）。
 *
 * @param {string} cssContent CSS/LESS 文本（纯样式内容，非 Vue SFC）
 * @param {object} [logger] 可选日志对象
 * @returns {string} 补全后的样式内容
 */
export function ensureGridDisplay(cssContent, logger) {
  if (!cssContent || typeof cssContent !== 'string') return cssContent
  if (!GRID_INTENT_PROP_RX.test(cssContent)) return cssContent

  const positions = []
  for (const b of scanLeafDeclarationBlocks(cssContent)) {
    if (!GRID_INTENT_PROP_RX.test(b.inner)) continue
    if (DISPLAY_PROP_RX.test(b.inner)) continue // 已有显式 display：不覆盖作者意图
    positions.push(b.end)
  }
  if (positions.length === 0) return cssContent

  let result = cssContent
  // 从后往前应用，避免索引漂移
  for (const pos of positions.sort((a, b) => b - a)) {
    const before = result.slice(0, pos)
    // 吃掉 `}` 前原有的空白/换行，统一只留一个换行，避免插入后多出空行
    const trimmed = before.replace(/\s+$/, '')
    // 前一条声明没有结尾 `;`（单行压缩写法）时必须先补 `;`，否则两条声明会粘在一起
    const needSemi = trimmed && !/[;{}]$/.test(trimmed) ? ';' : ''
    result = `${trimmed}${needSemi}\n  display: grid;` + result.slice(pos)
  }

  logger?.warn?.(
    `🛡️ 已为 ${positions.length} 个含 grid-template-* 但缺 display 的规则补全 display: grid（防多列网格塌成一列被裁）`,
  )
  return result
}

/**
 * 对 Vue SFC 内容中的所有 <style> 块执行 grid 布局补全。
 * 幂等，可重复执行。
 *
 * @param {string} vueContent 完整 Vue SFC 内容
 * @param {object} [logger] 可选日志对象
 * @returns {string} 补全后的 Vue SFC 内容
 */
export function ensureGridDisplayInVueSfc(vueContent, logger) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent
  return vueContent.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (fullMatch, attrs, innerContent) => {
    const repaired = ensureGridDisplay(innerContent, logger)
    return `<style${attrs}>${repaired}</style>`
  })
}

/**
 * 🛡️ 刀 20（2026-09-14）：按 class 给「缺 display 的 flex 容器」补 `display: flex`。
 *
 * 背景（`mc-1789319878658-485d724d`）：LLM 写出 `.c-x-slot-con`（无 display），
 * 其子组件根却带 `flex: 1 1 0` 之类 —— **子项 flex 值在非 flex 容器下全部失效**，
 * 容器退回 block → 本应「左 Tab 窄列 + 右内容区」的骨架塌成纵向堆叠，
 * 设备网格被挤出视口 → 用户看到「与设计稿差距巨大」，而 CSS 合法、L0-B 全绿。
 *
 * 与 ensureGridDisplay 同族（「CSS 合法但视觉坏」），但定位方式不同：
 * 那是「规则自带 grid 意图属性」可自含检测；本刀的意图证据在**模板结构**
 * （≥2 个子项带 flex 值，见 flex-sibling-guard#healMissingFlexContainers），
 * 这里只负责「给定 class，找到它的规则块补 display:flex」。
 *
 * 保守边界：
 * - 规则体内已有任何 `display:` → 不动（不覆盖作者显式意图）；
 * - 只补第一个命中的规则块；方向取 flex 默认 row（纵向意图的容器通常连子项
 *   flex 值都不会写，命中不了本刀的检测条件）；
 * - 幂等（补完再跑，DISPLAY_PROP_RX 命中即跳过）。
 *
 * @param {string} cssContent 纯样式内容（非 SFC）
 * @param {string} className 不带点的 class 名
 * @param {object} [logger]
 * @returns {string}
 */
export function ensureDisplayFlexForClass(cssContent, className, logger) {
  if (!cssContent || typeof cssContent !== 'string' || !className) return cssContent
  const clsEsc = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`\\.${clsEsc}(?![\\w-])`, 'g')
  let m
  while ((m = rx.exec(cssContent)) !== null) {
    const dot = m.index
    // .cls 必须处在「选择器位置」：本段（上一个 } ; { 之后）到下一个 { 之间
    const segStart = Math.max(
      cssContent.lastIndexOf('}', dot),
      cssContent.lastIndexOf(';', dot),
      cssContent.lastIndexOf('{', dot),
    ) + 1
    const open = cssContent.indexOf('{', dot)
    if (open < 0) continue
    const nextClose = cssContent.indexOf('}', dot)
    if (nextClose >= 0 && nextClose < open) continue // 在声明值/更深结构里，不是选择器
    const selector = cssContent.slice(segStart, open)
    if (!new RegExp(`\\.${clsEsc}(?![\\w-])`).test(selector)) continue
    // 配对闭合 }（嵌套 LESS 父块也适用：display 属于父元素）
    let depth = 1
    let k = open + 1
    for (; k < cssContent.length; k++) {
      const c = cssContent[k]
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) break }
    }
    if (depth !== 0) continue
    const body = cssContent.slice(open + 1, k)
    if (DISPLAY_PROP_RX.test(body)) return cssContent
    const trimmed = cssContent.slice(0, k).replace(/\s+$/, '')
    const needSemi = trimmed && !/[;{}]$/.test(trimmed) ? ';' : ''
    const out = `${trimmed}${needSemi}\n  display: flex;` + cssContent.slice(k)
    logger?.warn?.(`🛡️ 已为 .${className} 补 display: flex（子项 flex 值在非 flex 容器下全部失效，布局塌方）`)
    return out
  }
  return cssContent
}

/**
 * ensureDisplayFlexForClass 的 SFC 版：只处理 <style> 块。
 * @param {string} vueContent 完整 Vue SFC 内容
 * @param {string} className 不带点的 class 名
 * @param {object} [logger]
 * @returns {string}
 */
export function ensureDisplayFlexForClassInVue(vueContent, className, logger) {
  if (!vueContent || typeof vueContent !== 'string' || !className) return vueContent
  let changed = false
  const out = vueContent.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (whole, attrs, body) => {
    const healed = ensureDisplayFlexForClass(body, className, null)
    if (healed === body) return whole
    changed = true
    const at = whole.indexOf(body)
    return whole.slice(0, at) + healed + whole.slice(at + body.length)
  })
  if (changed) logger?.warn?.(`🛡️ 已为 .${className} 补 display: flex（SFC scoped 样式）`)
  return changed ? out : vueContent
}

/**
 * 🛡️ 无效 CSS 属性名修正（2026-09-15）：LLM 幻觉出合法 CSS 属性名格式但实际不存在的属性。
 *
 * 背景（`c-device-monitor-ed4d4b73`）：LLM 生成 `line-min-height: 16px`，
 * 浏览器完全不识别这个属性 → 行高失效 → 文字重叠/挤压。
 * CSS 语法检查器（如 stylelint）也不会报错，因为属性名格式合法（`[\w-]+`）。
 *
 * 策略：维护已知无效属性名 → 正确属性名的映射表，写盘前确定性替换。
 * 保守边界：只替换明确已知的幻觉属性，不猜测不确定的。
 *
 * @param {string} cssContent CSS/LESS 文本
 * @param {object} [logger]
 * @returns {string} 修正后的内容
 */
const INVALID_CSS_PROPERTY_MAP = {
  'line-min-height': 'min-height',  // LLM 常把 line-height 和 min-height 混淆
}

const INVALID_CSS_PROPERTY_RX = new RegExp(
  `\\b(${Object.keys(INVALID_CSS_PROPERTY_MAP).join('|')})\\s*:`,
  'g'
)

export function fixInvalidCssProperties(cssContent, logger) {
  if (!cssContent || typeof cssContent !== 'string') return cssContent
  if (!INVALID_CSS_PROPERTY_RX.test(cssContent)) return cssContent

  let fixedCount = 0
  const result = cssContent.replace(INVALID_CSS_PROPERTY_RX, (match, propName) => {
    const correct = INVALID_CSS_PROPERTY_MAP[propName]
    if (correct) {
      fixedCount++
      return `${correct}:`
    }
    return match
  })

  if (fixedCount > 0) {
    logger?.warn?.(`🛡️ 已修正 ${fixedCount} 个无效 CSS 属性名（LLM 幻觉属性 → 正确属性）`)
  }
  return result
}

/**
 * fixInvalidCssProperties 的 SFC 版：处理所有 <style> 块。
 * @param {string} vueContent 完整 Vue SFC 内容
 * @param {object} [logger]
 * @returns {string}
 */
export function fixInvalidCssPropertiesInVue(vueContent, logger) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent
  return vueContent.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (fullMatch, attrs, innerContent) => {
    const repaired = fixInvalidCssProperties(innerContent, logger)
    return `<style${attrs}>${repaired}</style>`
  })
}

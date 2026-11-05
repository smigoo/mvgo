/**
 * robustJSONParse — 统一的鲁棒 JSON 解析工具
 *
 * 解决 LLM 输出 JSON 不稳定的问题：格式混乱、嵌套 markdown、
 * 未转义字符、多余逗号、非法转义序列等。
 *
 * 解析链路：
 *   1. 类型规整（coerceLLMText + 对象直接返回）
 *   2. 信封/签名检测（API 中间层异常响应）
 *   3. JSON 提取（code block → raw object → fallback）
 *   4. 直接解析
 *   5. 修复链（注释、换行、逗号、转义、引号、BOM）
 *   6. 部分提取（正则逐字段提取，构造最小可用结果）
 *   7. 兜底返回（options.fallback 或抛异常）
 */

import { coerceLLMText, diagnoseEmptyCoercion } from './model-config.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'json-parser' })

// ──────────────────────────────────────────
// 默认选项
// ──────────────────────────────────────────

const DEFAULT_OPTIONS = {
  /** 解析失败时返回的兜底对象；设为 null 则抛异常 */
  fallback: null,
  /** 最大修复尝试轮数 */
  maxRepairAttempts: 1,
  /** 是否启用部分提取（正则逐字段提取） */
  enablePartialExtract: true,
  /** 需要部分提取的关键字段名列表 */
  criticalFields: ['checkResult', 'qualityScore'],
  /** 是否记录详细修复日志 */
  verbose: true
}

// ──────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────

/**
 * 鲁棒 JSON 解析
 * @param {*} rawOutput - LLM 返回的原始输出（string / object / array）
 * @param {Object} [options] - 解析选项
 * @returns {Object} 解析后的 JSON 对象
 * @throws {Error} 如果所有解析策略都失败且未提供 fallback
 */
export function robustJSONParse(rawOutput, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const context = opts._context || 'unknown'  // 调用来源标识，用于日志

  // ── Step 1: 类型规整 ──

  // 如果已经是对象（非数组），直接返回
  if (typeof rawOutput === 'object' && rawOutput !== null && !Array.isArray(rawOutput)) {
    logger.debug(`[${context}] 输入已是对象，直接返回`, { keys: Object.keys(rawOutput).join(',') })
    return rawOutput
  }

  // 规整为纯文本字符串
  let text = coerceLLMText(rawOutput)
  if (!text || text.trim().length === 0) {
    // 🔧 结构化诊断：调用 diagnoseEmptyCoercion 获取精确原因
    const diagnosis = diagnoseEmptyCoercion(rawOutput)
    logger.warn(`[${context}] 规整后文本为空`, {
      reason: diagnosis.reason,
      details: diagnosis.details,
      rawType: typeof rawOutput,
      rawLength: rawOutput ? String(rawOutput).length : 0,
      rawPreview: rawOutput ? String(rawOutput).substring(0, 300) : '',
      isArray: Array.isArray(rawOutput)
    })
    return _handleFailure(`empty_input:${diagnosis.reason}`, null, opts, context)
  }

  // ── Step 2: 信封/签名检测 ──

  // 检查是否是 API 中间层返回的签名信封（非预期结构）
  if (text.includes('"signature"') && !text.includes('"checkResult"') && !text.includes('"qualityScore"')) {
    logger.error(`[${context}] 检测到签名信封而非业务数据`, {
      preview: text.substring(0, 500)
    })
    return _handleFailure('signature_envelope', null, opts, context)
  }

  // ── Step 3: JSON 提取 ──

  const jsonStr = _extractJSON(text, context)
  if (!jsonStr) {
    logger.warn(`[${context}] 无法从文本中提取 JSON 片段`)
    return _handleFailure('no_json_found', null, opts, context)
  }

  // ── Step 4: 直接解析 ──

  try {
    const parsed = JSON.parse(jsonStr)
    logger.debug(`[${context}] 直接解析成功`)
    return parsed
  } catch (directError) {
    logger.warn(`[${context}] 直接解析失败: ${directError.message}`, {
      position: directError.message.match(/position (\d+)/)?.[1],
      jsonPreview: jsonStr.substring(0, 200)
    })
  }

  // ── Step 5: 修复链 ──

  for (let attempt = 1; attempt <= opts.maxRepairAttempts; attempt++) {
    logger.info(`[${context}] 开始修复链 (attempt ${attempt})`)

    try {
      const repaired = _repairJSON(jsonStr)
      const parsed = JSON.parse(repaired)
      logger.info(`[${context}] ✅ 修复后解析成功 (attempt ${attempt})`)
      return parsed
    } catch (repairError) {
      logger.warn(`[${context}] 修复后仍解析失败 (attempt ${attempt}): ${repairError.message}`)
    }
  }

  // ── Step 6: 部分提取 ──

  if (opts.enablePartialExtract && opts.criticalFields.length > 0) {
    logger.info(`[${context}] 尝试部分提取关键字段`)
    const partial = _partialExtract(text, opts.criticalFields)
    if (partial) {
      logger.info(`[${context}] ✅ 部分提取成功`, { extractedFields: Object.keys(partial).filter(k => partial[k] !== null) })
      return partial
    }
  }

  // ── Step 7: 兜底 ──

  return _handleFailure('all_strategies_failed', null, opts, context)
}

// ──────────────────────────────────────────
// JSON 提取：从文本中提取最可能的 JSON 片段
// ──────────────────────────────────────────

function _extractJSON(text, context) {
  // 优先级 1: ```json ... ``` 代码块
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/)
  if (jsonBlockMatch) {
    logger.debug(`[${context}] 提取方式: json code block`)
    return jsonBlockMatch[1].trim()
  }

  // 优先级 2: ``` ... ``` 无语言标注的代码块（且内容以 { 开头）
  const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n\s*```/)
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim()
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      logger.debug(`[${context}] 提取方式: plain code block`)
      return candidate
    }
  }

  // 优先级 2.5: 去除残留的 markdown 代码块标记后直接解析
  // 应对模型输出 ```json\n{...}\n``` 但正则未匹配到的情况（如换行符差异）
  const stripped = text
    .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim()
  if (stripped && (stripped.startsWith('{') || stripped.startsWith('['))) {
    logger.debug(`[${context}] 提取方式: stripped markdown markers`)
    return stripped
  }

  // 优先级 3: 查找最长的 {...} 平衡括号片段
  const balancedMatch = _findBalancedBraces(text)
  if (balancedMatch) {
    logger.debug(`[${context}] 提取方式: balanced braces`)
    return balancedMatch
  }

  // 优先级 4: 整段文本（如果以 { 或 [ 开头）
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    logger.debug(`[${context}] 提取方式: full text`)
    return trimmed
  }

  return null
}

/**
 * 查找文本中最长的平衡大括号片段
 * 遏制贪婪匹配导致的过长提取
 */
function _findBalancedBraces(text) {
  let best = null
  let bestLen = 0
  let depth = 0
  let start = -1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const len = i - start + 1
        // 选择最长的平衡片段，但不超过总文本的 90%（避免匹配到无关内容）
        if (len > bestLen && len < text.length * 0.9) {
          best = text.substring(start, i + 1)
          bestLen = len
        }
        start = -1
      }
    }
  }

  // 如果没找到合适的，兜底用简单正则
  if (!best) {
    const simpleMatch = text.match(/\{[\s\S]*\}/)
    if (simpleMatch) best = simpleMatch[0]
  }

  return best
}

// ──────────────────────────────────────────
// JSON 修复链
// ──────────────────────────────────────────

function _repairJSON(jsonStr) {
  let repaired = jsonStr

  // ── 修复 1: 去除 BOM ──
  if (repaired.charCodeAt(0) === 0xFEFF) {
    repaired = repaired.substring(1)
    logger.debug('修复: 去除 BOM')
  }

  // ── 修复 2: 去除前后空白 ──
  repaired = repaired.trim()

  // ── 修复 3: 去除 JavaScript 风格注释 ──
  // 单行注释 // ...（不在字符串内的）
  repaired = _removeComments(repaired)

  // ── 修复 4: 修复字符串值内未转义的换行/制表符 ──
  // 使用字符级扫描代替正则，避免正则误匹配
  repaired = _fixUnescapedCharsInStrings(repaired)

  // ── 修复 5: 去除数组/对象末尾多余逗号 ──
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')
  logger.debug('修复: 去除末尾逗号')

  // ── 修复 6: 修复非法转义序列 ──
  // JSON 只允许 \" \\ \/ \b \f \n \r \t \uXXXX
  // 其他如 \x \a \c 等需转为 \\x \\a
  repaired = repaired.replace(/\\([^\"\\\/bfnrtu])/g, '\\\\$1')
  logger.debug('修复: 非法转义序列')

  // ── 修复 7: Unicode 截断修复 ──
  // \u 后面不足4位十六进制的，补齐或移除
  repaired = repaired.replace(/\\u([0-9a-fA-F]{0,3})(?![0-9a-fA-F])/g, (match, hex) => {
    if (hex.length === 0) return '\\u0000'  // 完全缺失
    const padded = hex.padEnd(4, '0')
    return `\\u${padded}`
  })
  logger.debug('修复: Unicode 截断')

  // ── 修复 8: 清除字符串值内的非法控制字符（0x00-0x1F，不含 \n\r\t） ──
  // LLM 有时在 JSON 字符串中输出原始控制字符（\x00、\x01、\x08 回退等）
  // JSON 规范只允许 \\uXXXX 转义形式，原始控制字符会导致 "Bad control character" 错误
  // 注意：_fixUnescapedCharsInStrings 已处理了 \n\r\t，这里处理其余控制字符
  repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, (ch) => {
    return '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4)
  })
  logger.debug('修复: 非法控制字符')

  // ── 修复 9: 修复字符串值内未转义的双引号 ──
  // LLM 常在 JSON 字符串值内输出裸双引号（如 "当日总流量右侧"24小时"控件"）
  // 这些内部引号破坏 JSON 结构。用状态机扫描：
  // 在字符串内遇到 " 时，向前看后续字符是否符合 JSON 语法（, : } ] 或空白）
  // 不符合则视为字符串内的裸引号，转义为 \"
  repaired = _fixUnescapedQuotesInStrings(repaired)
  logger.debug('修复: 字符串内未转义双引号')

  // ── 修复 10: 括号配平（截断 JSON 补全闭合括号）──
  // LLM 输出被 max_tokens 截断时，JSON 末尾缺少闭合的 } 或 ]。
  // 用状态机扫描追踪括号栈，在末尾补全缺失的闭合括号。
  // 同时处理：截断在字符串内（补 "）、截断在 key: 后（移除不完整键值对）、截断在逗号后（移除尾逗号）。
  repaired = _balanceBraces(repaired)
  logger.debug('修复: 括号配平')

  return repaired
}

/**
 * 括号配平：修复截断 JSON 的未闭合括号
 *
 * 处理场景：
 * - max_tokens 截断导致 JSON 末尾缺少 } 或 ]
 * - 截断在字符串内（补全闭合引号）
 * - 截断在 key: 后（补 null 值）
 * - 截断在 key 后（补 : null）
 * - 截断在逗号后（移除尾逗号再闭合）
 *
 * 算法：状态机扫描追踪括号栈 + 字符串状态，末尾补全缺失结构。
 */
function _balanceBraces(jsonStr) {
  let result = ''
  let inString = false
  const stack = []  // 括号栈：'{' 和 '['
  let pendingStructuralChar = null  // 最近一个结构性字符（{ } [ ] : ,）
  let structuralCharBeforeLastString = null  // 最后一个字符串之前的结构性字符

  let i = 0
  while (i < jsonStr.length) {
    const ch = jsonStr[i]
    result += ch

    if (inString) {
      if (ch === '\\') {
        // 转义序列，跳过下一个字符
        i++
        if (i < jsonStr.length) result += jsonStr[i]
        i++
        continue
      }
      if (ch === '"') {
        inString = false
      }
      i++
      continue
    }

    // 非字符串状态
    if (ch === '"') {
      structuralCharBeforeLastString = pendingStructuralChar
      inString = true
      i++
      continue
    }
    if (ch === '{') { stack.push('{'); pendingStructuralChar = '{'; i++; continue }
    if (ch === '[') { stack.push('['); pendingStructuralChar = '['; i++; continue }
    if (ch === '}') { stack.pop(); pendingStructuralChar = '}'; i++; continue }
    if (ch === ']') { stack.pop(); pendingStructuralChar = ']'; i++; continue }
    if (ch === ':') { pendingStructuralChar = ':'; i++; continue }
    if (ch === ',') { pendingStructuralChar = ','; i++; continue }

    i++
  }

  // ── 补全阶段 ──

  // 1. 如果仍在字符串内，闭合引号
  if (inString) {
    result += '"'
  }

  // 2. 去除尾部空白
  result = result.replace(/\s+$/, '')

  // 3. 去除尾逗号（截断在逗号后的情况）
  result = result.replace(/,\s*$/, '')

  // 4. 处理不完整的键值对
  if (result.endsWith(':')) {
    // 截断在 key: 后，补 null 值
    result += ' null'
  } else if (result.endsWith('"') && stack.length > 0 && stack[stack.length - 1] === '{') {
    // 最后一个字符串可能是 key（前面是 { 或 ,），需补 : null
    if (structuralCharBeforeLastString === '{' || structuralCharBeforeLastString === ',') {
      result += ': null'
    }
  }

  // 5. 闭合所有未关闭的括号
  while (stack.length > 0) {
    const open = stack.pop()
    result += open === '{' ? '}' : ']'
  }

  return result
}

/**
 * 去除 JSON 文本中的 JS 风格注释
 * 只去除不在字符串值内部的注释
 */
function _removeComments(text) {
  let result = ''
  let inString = false
  let stringChar = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    // 处理字符串状态
    if (inString) {
      result += ch
      if (ch === '\\') {
        // 转义字符，跳过下一个字符
        i++
        if (i < text.length) result += text[i]
      } else if (ch === stringChar) {
        inString = false
      }
      i++
      continue
    }

    // 检查字符串开始
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      result += ch
      i++
      continue
    }

    // 检查单行注释 //
    if (ch === '/' && i + 1 < text.length && text[i + 1] === '/') {
      // 跳过到行尾
      while (i < text.length && text[i] !== '\n') i++
      // 保留换行（避免合并行导致结构错位）
      continue
    }

    // 检查多行注释 /* ... */
    if (ch === '/' && i + 1 < text.length && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/')) i++
      i += 2  // 跳过 */
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * 修复 JSON 字符串值内的未转义字符（换行/制表符/回车）
 * 使用字符级扫描，精确识别字符串边界
 */
function _fixUnescapedCharsInStrings(text) {
  let result = ''
  let inString = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        // 已经是转义序列，原样保留
        result += ch
        i++
        if (i < text.length) result += text[i]
        i++
        continue
      }

      if (ch === '"') {
        // 字符串结束
        inString = false
        result += ch
        i++
        continue
      }

      // 未转义的特殊字符 → 转义
      if (ch === '\n') {
        result += '\\n'
        i++
        continue
      }
      if (ch === '\r') {
        result += '\\r'
        i++
        continue
      }
      if (ch === '\t') {
        result += '\\t'
        i++
        continue
      }

      // 普通字符
      result += ch
      i++
      continue
    }

    // 非字符串状态
    if (ch === '"') {
      inString = true
      result += ch
      i++
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * 修复 JSON 字符串值内未转义的双引号
 *
 * LLM 经常在字符串值内部输出裸双引号，例如：
 *   {"checkResult": "当日总流量右侧"24小时"控件需调整"}
 * 这会导致 JSON 解析失败。
 *
 * 策略：状态机扫描，在字符串内遇到 `"` 时向前看（lookahead）判断它是否
 * 是合法的字符串结束符——即该引号后面的下一个非空白字符必须是 JSON
 * 语法中允许跟在字符串值之后的字符：`, } ] :` 或者到达文本末尾。
 * 如果不是，则该引号属于字符串内容，转义为 `\"`。
 *
 * 同时处理连续裸引号的情况（如 `"foo""bar"`），逐引号判断。
 */
function _fixUnescapedQuotesInStrings(text) {
  let result = ''
  let inString = false
  let i = 0

  /**
   * 判断当前位置的引号是否是合法的字符串结束引号
   * 即：跳过该引号后，下一个非空白字符是 JSON 语法允许的分隔符
   */
  function isLikelyClosingQuote(pos) {
    let j = pos + 1
    // 跳过空白（空格、制表符、换行、回车）
    while (j < text.length && /[\s]/.test(text[j])) j++
    if (j >= text.length) return true  // 引号后到文本末尾 → 合法结束
    const next = text[j]
    // JSON 中字符串结束后只可能是这些字符
    return next === ',' || next === '}' || next === ']' || next === ':'
  }

  while (i < text.length) {
    const ch = text[i]

    if (inString) {
      // ── 字符串内部 ──

      if (ch === '\\') {
        // 已有转义序列，原样保留两个字符
        result += ch
        i++
        if (i < text.length) {
          result += text[i]
          i++
        }
        continue
      }

      if (ch === '"') {
        // 遇到引号：判断是字符串结束还是字符串内的裸引号
        if (isLikelyClosingQuote(i)) {
          // 合法结束
          inString = false
          result += ch
          i++
          continue
        }
        // 字符串内的裸引号 → 转义
        result += '\\"'
        i++
        continue
      }

      // 普通字符
      result += ch
      i++
      continue
    }

    // ── 非字符串状态 ──
    if (ch === '"') {
      inString = true
      result += ch
      i++
      continue
    }

    result += ch
    i++
  }

  return result
}

// ──────────────────────────────────────────
// 部分提取：正则逐字段提取关键值
// ──────────────────────────────────────────

/**
 * 用正则从文本中逐字段提取关键值，构造最小可用结果对象
 * @param {string} text - 原始文本
 * @param {string[]} fields - 需要提取的字段名列表
 * @returns {Object|null} 提取到的对象，或 null（如果没有任何字段可提取）
 */
function _partialExtract(text, fields) {
  const result = {}

  for (const field of fields) {
    // 匹配 "field": value  的多种格式
    // 字符串值: "checkResult": "needs_revision"
    const strMatch = text.match(new RegExp('"' + field + '"\\s*:\\s*"([^"]*)"'))
    if (strMatch) {
      result[field] = strMatch[1]
      continue
    }

    // 数值值: "qualityScore": 85
    const numMatch = text.match(new RegExp('"' + field + '"\\s*:\\s*(\\d+(?:\\.\\d+)?)'))
    if (numMatch) {
      result[field] = parseFloat(numMatch[1])
      continue
    }

    // 布尔值: "pass": true
    const boolMatch = text.match(new RegExp('"' + field + '"\\s*:\\s*(true|false)'))
    if (boolMatch) {
      result[field] = boolMatch[1] === 'true'
      continue
    }

    // 未找到 → 标记为 null
    result[field] = null
  }

  // 至少有一个字段提取成功才算有效
  const extractedCount = Object.values(result).filter(v => v !== null).length
  if (extractedCount === 0) return null

  return result
}

// ──────────────────────────────────────────
// 失败处理
// ──────────────────────────────────────────

function _handleFailure(reason, detail, opts, context) {
  // 🛡️ P0-2: 守卫 detail 为 undefined/null/非对象的情况
  const safeDetail = (detail && typeof detail === 'object') ? detail : null
  const detailStr = safeDetail
    ? JSON.stringify(safeDetail).substring(0, 300)
    : (typeof detail === 'string' ? detail.substring(0, 300) : null)

  logger.error(`[${context}] 所有解析策略失败: ${reason}`, safeDetail || {})

  if (opts.fallback !== null && opts.fallback !== undefined) {
    const fallbackStr = typeof opts.fallback === 'object'
      ? JSON.stringify(opts.fallback).substring(0, 200)
      : String(opts.fallback).substring(0, 200)
    logger.info(`[${context}] 使用兜底结果`, { fallback: fallbackStr })
    return opts.fallback
  }

  throw new Error(
    `robustJSONParse failed: ${reason}` +
    (detailStr ? ` (${detailStr})` : '') +
    ` [context: ${context}]`
  )
}

// ──────────────────────────────────────────
// 导出
// ──────────────────────────────────────────

export default robustJSONParse

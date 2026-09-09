/**
 * 模型配置工具
 * 根据不同模型提供合适的参数配置
 */

import { createLogger } from '../logger/index.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { dataDir } from '../../config/backend-root.js'
const logger = createLogger({ name: 'model-config' })

/**
 * 根据模型名称动态获取max_tokens
 * @param {string} modelName - 模型名称
 * @param {number} defaultValue - 默认值
 * @returns {number} 适合该模型的max_tokens值
 */
/**
 * 常见模型「单次输出」token 上限表 —— 「模型能力自感知」数据源。
 * 不同用户挂不同模型时，按真实上限给 maxTokens，避免：
 *   - 8k 上限的模型被喂 16k 请求 → 直接崩
 *   - 32k 上限的模型被 16k 卡住 → 白浪费能力、更易截断
 * 未收录的模型走 fallback 兜底；可用 env `MC_MAX_OUTPUT_TOKENS_<模型大写>` 按需覆盖。
 */
const MODEL_MAX_OUTPUT_TOKENS = {
  // 视觉模型（输出受限）
  'qwen-vl-plus': 8192,
  'qwen-vl-max': 8192,
  // 通义千问
  'qwen-plus': 8192,
  'qwen-turbo': 8192,
  'qwen-long': 8192,
  'qwen-max': 32768,
  'qwen3-plus': 16384,
  'qwen3-max': 32768,
  'qwen3-turbo': 8192,
  // DeepSeek
  'deepseek-chat': 8192,
  'deepseek-v3': 8192,
  'deepseek-reasoner': 8192,
  // OpenAI
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4.1': 32768,
  'gpt-4.1-mini': 32768,
  'gpt-4.1-nano': 32768,
  // Anthropic
  'claude-3-5-sonnet': 8192,
  'claude-3-7-sonnet': 32768,
  'claude-sonnet-4': 32768,
  'claude-sonnet-4-6': 32768,
  'claude-opus-4': 32768,
  'claude-opus-4-8': 32768,
  'claude-haiku-4': 8192,
  // Kimi
  'kimi-k3': 16384,
  // GLM
  'glm-4': 8192,
  'glm-4-plus': 8192,
}

/**
 * 获取某模型的真实「单次输出」token 上限。
 * 优先顺序：env 覆盖（MC_MAX_OUTPUT_TOKENS_<模型大写>）> 内置能力表 > fallback。
 * @param {string} modelName
 * @param {number} fallback
 * @returns {number}
 */
export function getModelMaxOutputTokens(modelName, fallback = 16000) {
  const m = String(modelName || '').trim().toLowerCase()
  if (!m) return fallback
  // env 覆盖：模型名转大写、非字母数字转下划线（如 qwen3.7-plus → QWEN3_7_PLUS）
  const envKey = 'MC_MAX_OUTPUT_TOKENS_' + m.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const envVal = parseInt(process.env[envKey] || '', 10)
  if (Number.isFinite(envVal) && envVal > 0) return envVal
  if (MODEL_MAX_OUTPUT_TOKENS[m] != null) return MODEL_MAX_OUTPUT_TOKENS[m]
  return fallback
}

/**
 * 模型输出能力分档：low(≤8k) / mid(≤16k) / high(>16k)。
 * 供拆分深度 / maxTokens 决策使用（模型无关）。不同用户挂不同模型时，
 * 低能力模型走更细拆分，高能力模型走更大单段，天然适配。
 * @param {string} modelName
 * @param {number} fallback
 * @returns {'low'|'mid'|'high'}
 */
export function getModelCapabilityTier(modelName, fallback = 16000) {
  const cap = getModelMaxOutputTokens(modelName, fallback)
  if (cap <= 8192) return 'low'
  if (cap <= 16384) return 'mid'
  return 'high'
}

export function getMaxTokens(modelName, defaultValue = 16000) {
  if (!modelName) {
    return defaultValue
  }

  const modelLower = modelName.toLowerCase()

  // qwen-vl系列模型限制为8192（输出受限的视觉模型，含 qwen-vl-* 变体）
  if (modelLower.includes('qwen-vl')) {
    return 8192
  }

  // 模型能力自感知：按真实上限返回（env 覆盖 > 内置表 > 兜底）
  return getModelMaxOutputTokens(modelName, defaultValue)
}

/**
 * 判断是否为推理类（reasoning）模型。
 * 推理类模型（如 kimi-k3、kimi-thinking、deepseek-reasoner、qwq、OpenAI o1/o3 等）
 * 服务端硬性要求 temperature=1，传其他值会返回 400 invalid temperature。
 * @param {string} model - 模型名称
 * @returns {boolean}
 */
export function isReasoningModel(model = '') {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return false
  return (
    /^kimi-k\d/.test(m) ||            // kimi-k2.x / kimi-k3 系列（含 -xxx 变体；k2.6/k2.7-code/k3 均推理模型，服务端 temperature=1）
    /thinking/.test(m) ||             // kimi-thinking / kimi-k2-thinking 等
    /reasoner/.test(m) ||             // deepseek-reasoner 等
    /^qwq/.test(m) ||                 // qwq / qwq-plus / qwq-max
    /^o1/.test(m) ||                  // o1 / o1-mini
    /^o3/.test(m) ||                  // o3 / o3-mini
    /reasoning/.test(m)               // 通用 reasoning 标记
  )
}

/**
 * 归一化请求 temperature。
 * - 推理类模型：服务端硬性 temperature=1，强制返回 1（忽略用户配置，避免 400 invalid temperature）。
 * - 非推理模型：尊重显式配置；未配置（undefined）时保持原样，交由下层兜底默认。
 * @param {string} model - 模型名称
 * @param {number|undefined} requestedTemp - 调用方请求的 temperature
 * @returns {number|undefined}
 */
export function normalizeRequestTemperature(model = '', requestedTemp) {
  if (isReasoningModel(model)) {
    return 1
  }
  return requestedTemp
}

/**
 * 检查模型是否支持视觉输入
 * @param {string} modelName - 模型名称
 * @returns {boolean}
 */
export function isVisionModel(modelName) {
  if (!modelName) {
    return false
  }

  const modelLower = modelName.toLowerCase()

  return modelLower.includes('vision') ||
         modelLower.includes('qwen-vl') ||
         modelLower.includes('claude-3')
}

/**
 * 将 LLM 返回值规整为纯文本字符串
 * 兼容不同 provider 的响应形态：
 *   - string                         → 原样返回
 *   - [{type:'text', text:'...'}]    → 拼接文本块（Anthropic 格式）
 *   - {content: ...}                 → 递归取 content
 *   - 其他                           → String() 兜底
 * @param {*} raw - llm.invoke() 的返回值或其 content 字段
 * @returns {string}
 */
export function coerceLLMText(raw) {
  // 🔧 P3-1: null/undefined 诊断
  if (raw === null || raw === undefined) {
    logger.warn('[coerceLLMText] 返回空串: null_or_undefined', {
      hint: 'LLM 返回 null/undefined，可能是请求失败、网络异常或 API 未返回内容'
    })
    return ''
  }
  if (typeof raw === 'string') {
    //检测字符串化的 JSON 内容块数组（某些 API 将 [{thinking}, {text}] 作为字符串返回）
    const trimmed = raw.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) && parsed.some(b => b?.type === 'thinking' || b?.type === 'text' || b?.type === 'reasoning')) {
          return coerceLLMText(parsed)
        }
      } catch (e) {
        // 非合法 JSON 数组，原样返回
      }
    }
    // 🔧 P3-2: 空字符串输入诊断
    if (trimmed.length === 0) {
      logger.warn('[coerceLLMText] 返回空串: empty_string_input', {
        hint: 'LLM 返回空字符串，可能是模型未生成内容或 max_tokens=0'
      })
    }
    return raw
  }
  if (Array.isArray(raw)) {
    // 🔧 P3-fix: filter 同时排除 thinking 和 reasoning（与 map 逻辑对齐）
    const result = raw
      .filter((block) => !block || (block.type !== 'thinking' && block.type !== 'reasoning'))
      .map((block) => {
        if (!block) return ''
        if (typeof block === 'string') return block
        if (typeof block === 'object') {
          // 跳过 thinking / reasoning 内容块
          if (block.type === 'thinking' || block.type === 'reasoning') return ''
          return block.text || block.content || coerceLLMText(block)
        }
        return String(block)
      })
      .join('\n')
    
    // 🔧 P3-3: 如果过滤后为空，记录 warning 并返回空字符串
    if (!result || result.trim().length === 0) {
      const thinkingCount = raw.filter(b => b?.type === 'thinking' || b?.type === 'reasoning').length
      logger.warn(`[coerceLLMText] 返回空串: empty_after_array_filter`, {
        arrayLength: raw.length,
        thinkingCount,
        hint: thinkingCount > 0
          ? `数组含 ${thinkingCount}/${raw.length} 个 thinking/reasoning 块，过滤后无 text 内容。原因：推理模型 max_tokens 耗尽，未生成实际 text 块`
          : `数组长度 ${raw.length}，但所有元素的 text/content 字段均为空`
      })
      return ''
    }
    
    return result
  }
  if (typeof raw === 'object') {
    // 🔧 P3-4: 如果是单个 thinking 对象，记录诊断后返回空字符串
    if (raw.type === 'thinking' || raw.type === 'reasoning') {
      logger.warn('[coerceLLMText] 返回空串: thinking_object', {
        type: raw.type,
        hint: 'LLM 返回单个 thinking/reasoning 对象，无实际文本内容。推理模型可能未产出 text 块'
      })
      return ''
    }
    
    // 🔧 P3-5: 优先尝试已知的文本字段（避免触发 JSON.stringify 兜底的 warning）
    if (raw.content !== undefined) return coerceLLMText(raw.content)
    if (raw.text !== undefined) return coerceLLMText(raw.text)
    if (Array.isArray(raw)) return coerceLLMText(raw)
    
    // 兜底：尝试提取第一个看起来像文本的字段
    for (const key of ['output', 'result', 'response', 'message']) {
      if (raw[key] !== undefined) {
        return coerceLLMText(raw[key])
      }
    }
    
    // 🔧 P3-6: 最后兜底：JSON.stringify，记录警告
    logger.warn('[coerceLLMText] JSON.stringify 兜底', {
      keys: Object.keys(raw).join(','),
      preview: JSON.stringify(raw).substring(0, 200)
    })
    return JSON.stringify(raw)
  }
  return String(raw)
}

/**
 * 诊断 coerceLLMText 返回空的原因
 * 用于排查 LLM 返回空响应的问题
 * @param {*} raw - 原始 LLM 返回值
 * @returns {{reason: string, details: Object}} 诊断结果
 */
export function diagnoseEmptyCoercion(raw) {
  // 空输入
  if (raw === null || raw === undefined) {
    return { reason: 'null_or_undefined', details: { raw } }
  }
  
  // 空字符串
  if (typeof raw === 'string' && raw.trim() === '') {
    return { reason: 'empty_string', details: { length: 0 } }
  }
  
  // 字符串化的空数组
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '[]') {
      return { reason: 'stringified_empty_array', details: {} }
    }
  }
  
  // 空数组
  if (Array.isArray(raw) && raw.length === 0) {
    return { reason: 'empty_array', details: {} }
  }
  
  // 纯 thinking 数组
  if (Array.isArray(raw)) {
    const thinkingBlocks = raw.filter(b => b?.type === 'thinking' || b?.type === 'reasoning')
    const textBlocks = raw.filter(b => b?.type === 'text')
    
    if (thinkingBlocks.length > 0 && textBlocks.length === 0) {
      return {
        reason: 'thinking_only_array',
        details: {
          totalBlocks: raw.length,
          thinkingBlocks: thinkingBlocks.length,
          textBlocks: textBlocks.length,
          hint: 'LLM 只返回了 thinking 块，没有 text 内容块，可能是 max_tokens 不足或推理异常'
        }
      }
    }
    
    // 数组中有内容但提取后为空
    if (raw.length > 0 && thinkingBlocks.length === 0) {
      const extractedContent = raw.map(b => b?.text || b?.content || '').join('')
      if (extractedContent.trim() === '') {
        return {
          reason: 'array_with_empty_blocks',
          details: {
            totalBlocks: raw.length,
            hint: '数组中存在非 thinking 块，但提取的文本内容为空'
          }
        }
      }
    }
  }
  
  // 纯 thinking 对象
  if (typeof raw === 'object' && raw !== null) {
    if (raw.type === 'thinking' || raw.type === 'reasoning') {
      return {
        reason: 'thinking_object',
        details: {
          type: raw.type,
          hint: 'LLM 返回了单个 thinking 对象，没有实际文本内容'
        }
      }
    }
    
    // 对象有 content/text 但为空
    if (typeof raw.content !== 'undefined' && String(raw.content).trim() === '') {
      return {
        reason: 'object_with_empty_content',
        details: { keys: Object.keys(raw) }
      }
    }
    if (typeof raw.text !== 'undefined' && String(raw.text).trim() === '') {
      return {
        reason: 'object_with_empty_text',
        details: { keys: Object.keys(raw) }
      }
    }
  }
  
  // 其他未知原因
  return { reason: 'unknown', details: { rawType: typeof raw, rawPreview: String(raw).substring(0, 200) } }
}

/**
 * 将 LLM 返回的 token usage 规整为统一格式
 * 兼容不同 provider 的 usage 字段名：
 *   - Anthropic (Claude):  response.usage.input_tokens / output_tokens
 *   - OpenAI 兼容 (Qwen):  response.usage.prompt_tokens / completion_tokens
 *   - 原始 axios 响应:      response.data.usage.prompt_tokens / completion_tokens
 *   - LangChain AIMessage: response.usage_metadata.input_tokens / output_tokens
 * @param {*} response - llm.invoke() 的返回值，或 axios response
 * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number }}
 */
export function coerceLLMUsage(response) {
  // 统一定位 usage 对象
  const usage = response?.usage || response?.data?.usage || response?.usage_metadata || {}

  // Anthropic: input_tokens / output_tokens
  // OpenAI: prompt_tokens / completion_tokens
  // usage_metadata (LangChain): input_tokens / output_tokens
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

/**
 * 预估一次请求消耗的 token 数（用于 TPM 令牌桶主动控速）
 *
 * 输入侧：中文按 ~1.5 字/token，其余按 ~4 字符/token 粗估。
 * 输出侧：预留 min(maxTokens, 4096)（输出额度通常远小于 maxTokens 上限，封顶避免过度保守）。
 *
 * @param {string|object} prompt 提示词（字符串或可序列化对象）
 * @param {number} [maxTokens] 输出 token 上限
 * @returns {number} 预估总 token 数
 */
export function estimateTokens(prompt, maxTokens = 0) {
  const s = typeof prompt === 'string' ? prompt : JSON.stringify(prompt ?? '')
  const str = s || ''
  const cjk = (str.match(/[\u4e00-\u9fa5]/g) || []).length
  const inputTokens = Math.ceil(cjk / 1.5 + (str.length - cjk) / 4)
  const outputReserve = Math.min(Math.max(0, Number(maxTokens) || 0), 4096)
  return inputTokens + outputReserve
}

/**
 * 🆕 模型能力「识别」状态：生成链路容量门禁（MODEL_CAPACITY_EXCEEDED）的前置条件。
 *
 * 现状问题：容量判断只查静态表 MODEL_MAX_OUTPUT_TOKENS，未知自定义模型一律按
 * fallback=16000 估算 → 可能误报「超出能力」并直接硬报错，而用户从未有机会验证模型真实能力。
 *
 * 设计：把「能力是否已识别」与「真实上限是否可知」拆成两维：
 *  - identified：模型是否在内置表（权威）/ 或被用户实测过（运行过「模型能力测试」）
 *  - limitKnown：是否有具体输出上限数值（表内已知 或 实测时用户确认了上限）
 * 只有 identified && limitKnown 时，容量门禁才允许硬报错；否则改为「提示用户去测试」。
 */

const MODEL_CAPABILITY_CACHE_FILE = join(dataDir, 'model-capability-cache.json')
let _capabilityCache = null
let _capPersistTimer = null

function _loadCapabilityCache() {
  if (_capabilityCache) return _capabilityCache
  try {
    if (existsSync(MODEL_CAPABILITY_CACHE_FILE)) {
      _capabilityCache = JSON.parse(readFileSync(MODEL_CAPABILITY_CACHE_FILE, 'utf-8')) || {}
    } else {
      _capabilityCache = {}
    }
  } catch {
    _capabilityCache = {}
  }
  return _capabilityCache
}

function _persistCapabilityCache(cache) {
  try {
    mkdirSync(dataDir, { recursive: true })
    _capabilityCache = cache
    clearTimeout(_capPersistTimer)
    _capPersistTimer = setTimeout(() => {
      try {
        writeFileSync(MODEL_CAPABILITY_CACHE_FILE, JSON.stringify(cache, null, 2))
      } catch (e) {
        logger.warn('持久化模型能力缓存失败（非阻断）', { error: e.message })
      }
    }, 500)
  } catch (e) {
    logger.warn('持久化模型能力缓存失败（非阻断）', { error: e.message })
  }
}

/**
 * 标记某模型能力已被识别（通常在「模型能力测试」成功连通后调用）。
 * @param {string} model
 * @param {{outputTokens?:number, source?:string}} [opts]
 *   outputTokens — 用户在设置中确认/实测到的模型单次输出上限；传入后 limitKnown=true，容量判断可基于真实上限。
 */
export function markModelCapabilityIdentified(model, opts = {}) {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return
  const cache = _loadCapabilityCache()
  const prev = cache[m] || {}
  cache[m] = {
    ...prev,
    identified: true,
    identifiedAt: Date.now(),
    source: opts.source || 'test',
    ...(Number.isFinite(opts.outputTokens) && opts.outputTokens > 0 ? { outputTokens: opts.outputTokens } : {}),
  }
  _persistCapabilityCache(cache)
}

/**
 * 解析模型能力「识别状态 + 真实输出上限」。
 * @returns {{tokens:number, identified:boolean, limitKnown:boolean, source:string}}
 *   source: 'table' | 'env' | 'test' | 'test-unknown-limit' | 'fallback'
 */
export function resolveModelCapability(model, fallback = 16000) {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return { tokens: fallback, identified: false, limitKnown: false, source: 'fallback' }
  // 1) env 覆盖（用户显式指定）→ 权威，已识别且上限可知
  const envKey = 'MC_MAX_OUTPUT_TOKENS_' + m.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const envVal = parseInt(process.env[envKey] || '', 10)
  if (Number.isFinite(envVal) && envVal > 0) {
    return { tokens: envVal, identified: true, limitKnown: true, source: 'env' }
  }
  // 2) 内置能力表 → 权威，已识别且上限可知
  if (MODEL_MAX_OUTPUT_TOKENS[m] != null) {
    return { tokens: MODEL_MAX_OUTPUT_TOKENS[m], identified: true, limitKnown: true, source: 'table' }
  }
  // 3) 不在表内：查持久化的实测记录
  const cache = _loadCapabilityCache()
  const entry = cache[m]
  if (entry && entry.identified) {
    if (Number.isFinite(entry.outputTokens) && entry.outputTokens > 0) {
      return { tokens: entry.outputTokens, identified: true, limitKnown: true, source: 'test' }
    }
    // 实测过连通但未知具体上限 → 已识别、上限未知
    return { tokens: fallback, identified: true, limitKnown: false, source: 'test-unknown-limit' }
  }
  // 4) 完全未知且未实测 → 未识别
  return { tokens: fallback, identified: false, limitKnown: false, source: 'fallback' }
}

export default {
  getMaxTokens,
  getModelMaxOutputTokens,
  getModelCapabilityTier,
  isVisionModel,
  coerceLLMText,
  coerceLLMUsage,
  estimateTokens,
  resolveModelCapability,
  markModelCapabilityIdentified,
}

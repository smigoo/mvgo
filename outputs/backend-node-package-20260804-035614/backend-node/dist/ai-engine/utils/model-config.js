/**
 * 模型配置工具
 * 根据不同模型提供合适的参数配置
 */

/**
 * 根据模型名称动态获取max_tokens
 * @param {string} modelName - 模型名称
 * @param {number} defaultValue - 默认值
 * @returns {number} 适合该模型的max_tokens值
 */
export function getMaxTokens(modelName, defaultValue = 16000) {
  if (!modelName) {
    return defaultValue
  }

  const modelLower = modelName.toLowerCase()

  // qwen-vl系列模型限制为8192
  if (modelLower.includes('qwen-vl')) {
    return 8192
  }

  // 其他已知限制的模型可以在这里添加
  // 例如：某些模型可能有4096的限制

  return defaultValue
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
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') {
    // 🆕 检测字符串化的 JSON 内容块数组（某些 API 将 [{thinking}, {text}] 作为字符串返回）
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
    return raw
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((block) => !block || block.type !== 'thinking')   // 过滤 thinking 块
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
  }
  if (typeof raw === 'object') {
    // 跳过 thinking / reasoning 对象本身
    if (raw.type === 'thinking' || raw.type === 'reasoning') return ''
    if (typeof raw.content !== 'undefined') return coerceLLMText(raw.content)
    if (typeof raw.text !== 'undefined') return coerceLLMText(raw.text)
    try { return JSON.stringify(raw) } catch { return String(raw) }
  }
  return String(raw)
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

export default {
  getMaxTokens,
  isVisionModel,
  coerceLLMText,
  coerceLLMUsage
}

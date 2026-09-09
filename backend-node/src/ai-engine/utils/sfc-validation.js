/**
 * Vue SFC 完整性校验工具
 * 用于检测 LLM 输出是否被 maxTokens 截断
 * 2026-08-06 新增，防护 layout-refiner / style-refiner 写入截断文件
 */

/**
 * 检测 Vue SFC 内容是否完整（未被 maxTokens 截断）
 * 规则：
 *  - 如果内容包含 <template 开标签，则必须有 </template> 闭标签
 *  - 如果内容包含 <script 开标签，则必须有 </script> 闭标签
 *  - 如果内容包含 <style 开标签，则必须有 </style> 闭标签
 *  - 对于 .vue 文件，三个块都必须完整
 *
 * @param {string} content - 待校验的文件内容
 * @param {string} [filePath=''] - 文件路径（用于日志）
 * @returns {{ complete: boolean, missing: string[], detail: string }}
 */
export function validateVueSFCCompleteness(content, filePath = '') {
  if (!content || typeof content !== 'string') {
    return { complete: false, missing: ['empty'], detail: '内容为空' }
  }

  const hasTemplateOpen = /<template[\s>]/.test(content)
  const hasScriptOpen = /<script[\s>]/.test(content)
  const hasStyleOpen = /<style[\s>]/.test(content)

  // 如果没有任何 SFC 块标记，跳过校验（可能是纯 .less / .json 文件）
  if (!hasTemplateOpen && !hasScriptOpen && !hasStyleOpen) {
    return { complete: true, missing: [], detail: '非 Vue SFC 文件，跳过校验' }
  }

  const missing = []

  if (hasTemplateOpen && !/<\/template>/.test(content)) {
    missing.push('</template>')
  }
  if (hasScriptOpen && !/<\/script>/.test(content)) {
    missing.push('</script>')
  }
  if (hasStyleOpen && !/<\/style>/.test(content)) {
    missing.push('</style>')
  }

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      detail: `Vue SFC 不完整，缺少闭合标签: ${missing.join(', ')}（文件: ${filePath || 'unknown'}）`,
    }
  }

  return { complete: true, missing: [], detail: 'Vue SFC 完整' }
}

/**
 * 根据输入内容长度动态计算 maxTokens
 * 规则：
 *  - 基础值 = 输入字符数 * 1.5 / 3（粗略 token 估算）* 1.5 倍余量
 *  - 下限 8192
 *  - 上限 32000
 *
 * @param {number} inputChars - 输入 prompt 的字符数
 * @param {number} [retryAttempt=0] - 重试次数（每次翻倍）
 * @returns {number}
 */
export function computeDynamicMaxTokens(inputChars, retryAttempt = 0) {
  const MIN = 8192
  const MAX = 32000
  // 粗略估算：1 token ≈ 3 字符（中英混合平均）
  const estimatedTokens = Math.ceil(inputChars / 3)
  // 输出余量 1.5 倍
  let dynamic = Math.ceil(estimatedTokens * 1.5)
  // 每次重试翻倍
  dynamic *= Math.pow(2, retryAttempt)
  // 限制范围
  return Math.min(Math.max(dynamic, MIN), MAX)
}

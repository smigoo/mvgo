/**
 * 分块超时计算（S1 治理单元）
 *
 * 根据分块预估 tokens 和类型动态计算超时时间，替代静态 180s 默认值。
 * 解决大分块（estTokens > 4000）在 180s 边界超时的问题。
 */

/**
 * 计算分块超时时间（毫秒）
 *
 * @param {Object} chunk - 分块信息
 * @param {number} [chunk.estTokens] - 预估输出 tokens
 * @param {string} [chunk.segmentType] - 分块类型（'script' | 'template' | 'style' | 'component'）
 * @returns {number} 超时时间（毫秒）
 *
 * 分级规则：
 * - estTokens < 1500 → 90s（小分块）
 * - 1500 ≤ estTokens < 4000 → 180s（中分块，默认）
 * - estTokens ≥ 4000 → 300s（大分块）
 * - style/component 类型 → 300s（无论 estTokens）
 * - 无 estTokens 或 estTokens = 0 → 180s（回退默认）
 */
export function computeChunkTimeoutMs(chunk = {}) {
  const { estTokens, segmentType = '' } = chunk

  // 环境变量覆盖（用于测试和调试）
  const envDefault = parseInt(process.env.ENGINEER_CHUNK_TIMEOUT_MS || '180000', 10)
  const envStyle = parseInt(process.env.STYLE_CHUNK_TIMEOUT_MS || '300000', 10)
  const envComponent = parseInt(process.env.SUBCOMPONENT_CHUNK_TIMEOUT_MS || '300000', 10)

  // 特殊分块类型：style/component 始终使用专属超时
  if (segmentType === 'style') {
    return Math.max(60000, envStyle)
  }
  if (segmentType === 'component') {
    return Math.max(60000, envComponent)
  }

  // 无 estTokens 或 estTokens = 0 → 使用默认超时
  if (!estTokens || estTokens <= 0) {
    return Math.max(60000, envDefault)
  }

  // 按 estTokens 分级
  if (estTokens < 1500) {
    return 90000
  }
  if (estTokens < 4000) {
    return Math.max(60000, envDefault)
  }
  return 300000
}

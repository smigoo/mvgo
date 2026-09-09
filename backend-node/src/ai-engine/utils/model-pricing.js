/**
 * 模型定价表 (CNY per 1M tokens)
 * 供 LangGraph 层（src/）使用，与 NestJS 层的 token-tracker.service.ts 保持同步
 */

export const MODEL_PRICING = [
  { model: 'claude-opus-4-8', modelType: 'text', inputPricePerMillion: 108, outputPricePerMillion: 540 },
  { model: 'claude-opus-4', modelType: 'text', inputPricePerMillion: 108, outputPricePerMillion: 540 },
  { model: 'claude-sonnet-4-6', modelType: 'text', inputPricePerMillion: 22, outputPricePerMillion: 110 },
  { model: 'claude-sonnet-4', modelType: 'text', inputPricePerMillion: 22, outputPricePerMillion: 110 },
  { model: 'claude-haiku-4', modelType: 'text', inputPricePerMillion: 5, outputPricePerMillion: 25 },
  { model: 'gpt-4o', modelType: 'text', inputPricePerMillion: 18, outputPricePerMillion: 72 },
  { model: 'gpt-4o-mini', modelType: 'text', inputPricePerMillion: 1, outputPricePerMillion: 4 },
  { model: 'qwen3.7-plus', modelType: 'vision', inputPricePerMillion: 0.8, outputPricePerMillion: 2.0 },
  { model: 'qwen-vl-plus', modelType: 'vision', inputPricePerMillion: 0.8, outputPricePerMillion: 2.0 },
  { model: 'deepseek-v3', modelType: 'text', inputPricePerMillion: 2, outputPricePerMillion: 8 },
  { model: 'gemini-2.5-pro', modelType: 'text', inputPricePerMillion: 10, outputPricePerMillion: 40 },
]

const DEFAULT_PRICING = { inputPricePerMillion: 10, outputPricePerMillion: 40 }

/**
 * 估算单次调用的成本 (CNY)
 * @param {string} model - 模型名
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} 成本（元）
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING.find(p => model?.toLowerCase().includes(p.model.toLowerCase())) || DEFAULT_PRICING
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion
  return inputCost + outputCost
}

export default { MODEL_PRICING, estimateCost }

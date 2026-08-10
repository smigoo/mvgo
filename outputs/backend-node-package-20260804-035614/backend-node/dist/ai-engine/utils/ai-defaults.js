/**
 * AI Provider 硬编码默认配置
 *
 * 设计目的：当 .env / 环境变量 / 前端传入均缺失时，提供开箱即用的兜底配置，
 *           避免因配置缺失导致服务无法启动。
 *
 * 架构：视觉任务用 Qwen (DashScope)，文本任务用 Claude (自有端点)
 */

// 视觉任务默认配置（Preview 阶段 - 图像分析/VisualParser）
// 使用通义千问视觉模型
// ⚠️ A4 安全整改：apiKey 不再明文硬编码，改为运行时从 .env / 环境变量注入
//    （MC_GEN_AI_API_KEY / VISION_API_KEY / ANTHROPIC_API_KEY）。此处仅留非密钥兜底默认。
export const VISION_DEFAULTS = {
  apiKey: process.env.MC_GEN_AI_API_KEY || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  baseURL: '',
  model: 'qwen3.7-plus'
}

// 文本任务默认配置（Figma/req 阶段 - 代码生成/审查/布局分析）
// 使用 Claude Opus 最强模型
// ⚠️ A4 安全整改：apiKey 不再明文硬编码，改为运行时从 .env / 环境变量注入
//    （MC_GEN_TEXT_API_KEY / TEXT_API_KEY / ANTHROPIC_API_KEY）。此处仅留非密钥兜底默认。
export const TEXT_DEFAULTS = {
  apiKey: process.env.MC_GEN_TEXT_API_KEY || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  baseURL: '',
  model: 'claude-opus-4-8'
}

/**
 * 取第一个非空值（去空白）
 */
function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim()) {
      return String(v).trim()
    }
  }
  return ''
}

/**
 * 解析视觉任务配置
 * 优先级：前端传入 → MC_GEN_* 环境变量 → VISION_* 环境变量 → ANTHROPIC_* 兼容环境变量 → 硬编码默认
 * @param {object} config - 前端请求传入的配置
 * @returns {{apiKey:string, baseURL:string, model:string}}
 */
export function resolveVisionConfig(config = {}) {
  return {
    apiKey: pick(
      config.visionApiKey,
      process.env.MC_GEN_AI_API_KEY,
      process.env.VISION_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      VISION_DEFAULTS.apiKey
    ),
    baseURL: pick(
      config.visionBaseURL,
      process.env.MC_GEN_AI_ENDPOINT,
      process.env.VISION_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
      VISION_DEFAULTS.baseURL
    ),
    model: pick(
      config.visionModel,
      process.env.MC_GEN_VISION_MODEL,
      process.env.VISION_MODEL,
      process.env.ANTHROPIC_MODEL,
      VISION_DEFAULTS.model
    )
  }
}

/**
 * 解析文本任务配置
 * 优先级：前端传入 → MC_GEN_TEXT_* 环境变量 → TEXT_* 环境变量 → ANTHROPIC_* 兼容环境变量 → 硬编码默认
 * @param {object} config - 前端请求传入的配置
 * @returns {{apiKey:string, baseURL:string, model:string}}
 */
export function resolveTextConfig(config = {}) {
  return {
    apiKey: pick(
      config.textApiKey,
      process.env.MC_GEN_TEXT_API_KEY,
      process.env.TEXT_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      TEXT_DEFAULTS.apiKey
    ),
    baseURL: pick(
      config.textBaseURL,
      process.env.MC_GEN_TEXT_ENDPOINT,
      process.env.TEXT_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
      TEXT_DEFAULTS.baseURL
    ),
    model: pick(
      config.textModel,
      process.env.MC_GEN_TEXT_MODEL,
      process.env.TEXT_MODEL,
      process.env.ANTHROPIC_MODEL,
      TEXT_DEFAULTS.model
    )
  }
}

export default {
  VISION_DEFAULTS,
  TEXT_DEFAULTS,
  resolveVisionConfig,
  resolveTextConfig
}

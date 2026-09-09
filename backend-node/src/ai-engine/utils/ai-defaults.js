/**
 * AI Provider 硬编码默认配置
 *
 * 设计目的：当 .env / 环境变量 / 前端传入均缺失时，提供开箱即用的兜底配置，
 *           避免因配置缺失导致服务无法启动。
 *
 * 架构：视觉任务用 Qwen (DashScope)，文本任务用 Claude (自有端点)
 */

import { getProviderPool } from './provider-pool.js'
import { isReasoningModel } from './model-config.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'ai-defaults' })

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
 * 从供应商池择优 pick 一个 provider（多 key 负载分散 + 故障转移）。
 *
 * 向下兼容：主配置（primary）始终并入池作为 `__primary__` 候选 —— 配置 providers[] 后
 * 主大模型配置不会被顶掉，而是与额外 Key 一起参与加权轮询。
 *
 * 未配置 providers 时返回 null（调用方回退主配置，不触碰池，行为与旧版一致）。
 *
 * @param {object} config
 * @param {{apiKey:string, baseURL:string, model:string, providerType:string}|null} primary 已解析的主配置
 * @param {'text'|'vision'} [role] 目标角色槽（文本 / 视觉），决定入哪个槽、按 provider.role 过滤
 * @returns {{apiKey:string, baseURL:string, model:string, providerType:string, providerId:string}|null}
 */
function resolveProvider(config = {}, primary = null, role = 'text') {
  const providers = config.providers
  const pool = getProviderPool()

  if (!Array.isArray(providers) || !providers.length) {
    // 未配置池：返回 null 走主配置（不触碰池，避免覆盖其他请求配置的池）
    return null
  }

  // 🛡️ 全局默认关推理（2026-09-04 改进）：
  // 生产管线不适合推理模型（烧输出预算、延迟高、成本高）。
  // 复用 model-config.js 的 isReasoningModel() 判断，避免硬编码正则。
  // 全局开关：config.disableReasoning !== false 时启用（默认 true）。
  // 显式配置优先（保留用户开推理的自由）。
  const disableReasoning = config.disableReasoning !== false

  // 🛡️ 2026-09-04 模型名级兜底（方案 B，mc-max-1788504554318 实锤）：
  // deepseek-v4-flash/v4-pro 不在 isReasoningModel 名单（只认 deepseek-reasoner），
  // 服务端却默认开推理 → 大 prompt 请求把输出预算全烧在 reasoning（reasoningTokens=16000,
  // finishReason=length）→ 空内容熔断，每次失败浪费 126~192s。
  // deepseek v4 系支持 thinking:{type:'disabled'} 关闭 → 注入 'disabled' 保留使用；
  // 其它推理模型（kimi-k*/qwq/o1/o3/deepseek-reasoner）无法关闭 → 'skip'（pool 过滤弃用）。
  const thinkingDefaultFor = (model) => {
    const m = String(model || '').trim().toLowerCase()
    if (!m) return undefined
    if (/^deepseek-v4/.test(m)) return 'disabled'
    if (isReasoningModel(m)) return 'skip'
    return undefined
  }

  const withThinkingDefault = (p) => {
    if (!p || typeof p !== 'object') return p
    if (p.thinkingType) return p  // 已有配置则保留
    if (!disableReasoning) return p  // 全局开关关闭时不处理
    const model = String(p.model || '')
    const tt = thinkingDefaultFor(model)
    if (tt === 'skip') {
      // 无法关闭推理 → 标记为 skip（pool 选择时过滤掉）
      logger.warn('🚫 推理模型已禁用，管线不支持推理模式', {
        model: p.model,
        providerId: p.id,
        hint: '推理模型会烧光输出预算导致空内容，生产管线请使用非推理模型'
      })
      return { ...p, thinkingType: 'skip' }
    }
    if (tt === 'disabled') {
      // deepseek v4 系可关推理 → 注入 disabled（保留使用，避免默认推理烧光预算）
      logger.warn('🔧 deepseek v4 系默认关推理（thinking disabled），避免烧光输出预算', {
        model: p.model,
        providerId: p.id,
      })
      return { ...p, thinkingType: 'disabled' }
    }
    return p
  }

  // 🛡️ 2026-09-04 治本（vision 请求错路由）：主配置 ID 按角色区分
  // `__primary_text__` / `__primary_vision__`。
  // 根因：text/vision 两槽主配置曾共用固定 ID '__primary__'，而 provider-pool.get(id)
  // 恒先查 text 槽 → vision-agent 拿 text 槽主模型（deepseek-v4-flash）执行图片分析，
  // 输出不满足视觉契约 → 任务「视觉识别未完成」中止（mc-max-1788451635574 实锤）。
  // ID 角色化后全局唯一，get() 查找顺序不再敏感；slot.primaryId 按槽存取，无需改 pool。
  const primaryId = `__primary_${role}__`
  const primaryEntry = primary && primary.apiKey
    ? {
        id: primaryId,
        name: role === 'vision' ? '主视觉模型' : '主模型',
        apiKey: primary.apiKey,
        baseURL: primary.baseURL || '',
        model: primary.model || '',
        providerType: primary.providerType || 'auto',
        role,
        rpm: 0,
        tpm: 0,
        // 🐛 2026-09-04 修复：主模型权重设为 1000，确保始终高于池内模型（用户配置的 weight 默认 10）
        // 即使池内模型被配置了更高的 weight（如 100），主模型仍有绝对优先级
        weight: 1000,
        ...(primary.temperature !== undefined ? { temperature: primary.temperature } : {}),
        // 🔧 per-provider 思考开关透传：推理模型默认关（deepseek v4 系注入 disabled 保留使用；
        // 无法关闭的推理模型标记 skip，pool 选择时过滤）
        // 复用 thinkingDefaultFor() 判断（含 deepseek-v4* 模型名级兜底，2026-09-04）
        ...(primary.thinkingType
          ? { thinkingType: primary.thinkingType }
          : (disableReasoning && thinkingDefaultFor(primary.model))
            ? { thinkingType: thinkingDefaultFor(primary.model) }
            : {}),
      }
    : null

  // 配置了池：主配置并入池（向下兼容，避免配池后主配置失效）。
  // 🔀 角色分流：provider 带 role 字段时只进匹配槽；缺省 role 视为 'both'（参与所有槽，向后兼容）。
  const list = []
  const roleMatched = providers
    .filter((p) => {
      const pr = (p && p.role) || 'both'
      return pr === role || pr === 'both'
    })
    .map(withThinkingDefault)
  // 主配置并入池：如果池中已有相同 apiKey+model 的 provider，
  // 将其标记为 __primary__（确保 primary-first 策略能识别主模型）；
  // 否则额外注入 primaryEntry。
  const primaryInPool = roleMatched.find((p) => p && p.apiKey && p.apiKey === primaryEntry?.apiKey && p.model === primaryEntry?.model)
  if (primaryInPool) {
    primaryInPool.id = primaryId
  } else if (primaryEntry) {
    list.push(primaryEntry)
  }
  list.push(...roleMatched)
  // 主模型优先：把 '__primary__' 标记为主 provider，pick() 时主健康则直接返回主，
  // 仅当主熔断/超限时才降级到资源池（而不是等权随机抢流量）
  // 熔断默认开启：连续 2 次失败/超时 → 熔断 120s → pick() 自动降级备用。
  // ⚠️ 2026-08-27 #271 修复：cooldownMs 30s → 120s。原 30s 冷却在 290s 级慢请求面前形同虚设——
  //    熔断 open 后 30s 恢复，坏 provider 又参与 pick，导致反复撞同一面墙（日志实证连续 3 次超时/空串）。
  //    此前未配置 circuitBreaker 时 failureThreshold=0 完全禁用，主 provider 挂起后永不降级（超时白等 10 分钟）。
  const breakerCfg = config.circuitBreaker ?? { failureThreshold: 2, cooldownMs: 120000 }
  
  // 调度策略：weighted-spread 让主模型也参与加权随机，避免单模型独占；primary-first 主模型独占（默认）
  const pickStrategy = config.pickStrategy === 'weighted-spread' ? 'weighted-spread' : 'primary-first'
  
  pool.setProviders(list, breakerCfg, { primaryId, role, pickStrategy })

  const p = pool.pick(role)
  if (!p || !p.apiKey) return null
  return {
    apiKey: p.apiKey,
    baseURL: p.baseURL || '',
    model: p.model || '',
    providerType: p.providerType || 'auto',
    providerId: p.id,
    ...(p.temperature !== undefined && p.temperature !== null && p.temperature !== '' ? { temperature: Number(p.temperature) } : {}),
    // 🔧 per-provider 思考开关透传（base-agent 构造兜底 this.thinkingType）
    ...(p.thinkingType ? { thinkingType: p.thinkingType } : {}),
  }
}

/**
 * 解析视觉任务配置
 * 优先级：前端传入 → MC_GEN_* 环境变量 → VISION_* 环境变量 → ANTHROPIC_* 兼容环境变量 → 硬编码默认
 * @param {object} config - 前端请求传入的配置
 * @returns {{apiKey:string, baseURL:string, model:string}}
 */
export function resolveVisionConfig(config = {}) {
  // 统一模式：vision/text 角色均改用 unified* 配置
  const prefix = config.modelMode === 'unified' ? 'unified' : 'vision'
  const primary = {
    apiKey: pick(
      config[`${prefix}ApiKey`],
      process.env.MC_GEN_AI_API_KEY,
      process.env.VISION_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      VISION_DEFAULTS.apiKey
    ),
    baseURL: pick(
      config[`${prefix}BaseURL`],
      process.env.MC_GEN_AI_ENDPOINT,
      process.env.VISION_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
      VISION_DEFAULTS.baseURL
    ),
    model: pick(
      config[`${prefix}Model`],
      process.env.MC_GEN_VISION_MODEL,
      process.env.VISION_MODEL,
      process.env.ANTHROPIC_MODEL,
      VISION_DEFAULTS.model
    ),
    //显式 provider 类型：优先用用户选择，否则自动识别
    providerType: pick(
      config[`${prefix}ProviderType`],
      process.env.VISION_PROVIDER_TYPE,
      'auto'
    )
  }

  // 主配置的 temperature 跟随当前模式：统一模式读取 unifiedTemperature，分别模式读取 visionTemperature。
  // 仅显式配置时透传，否则保留 VisionAgent 默认值。
  const temperature = config[`${prefix}Temperature`]
  if (temperature !== undefined && temperature !== null && temperature !== '') {
    primary.temperature = Number(temperature)
  }

  // 供应商池：主配置并入池后择优 pick（向下兼容，主配置不失效）
  const pooled = resolveProvider(config, primary, 'vision')
  return pooled || primary
}

/**
 * 解析文本任务配置
 * 优先级：前端传入 → MC_GEN_TEXT_* 环境变量 → TEXT_* 环境变量 → ANTHROPIC_* 兼容环境变量 → 硬编码默认
 * @param {object} config - 前端请求传入的配置
 * @returns {{apiKey:string, baseURL:string, model:string}}
 */
export function resolveTextConfig(config = {}) {
  // 统一模式：vision/text 角色均改用 unified* 配置
  const prefix = config.modelMode === 'unified' ? 'unified' : 'text'
  const primary = {
    apiKey: pick(
      config[`${prefix}ApiKey`],
      process.env.MC_GEN_TEXT_API_KEY,
      process.env.TEXT_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      TEXT_DEFAULTS.apiKey
    ),
    baseURL: pick(
      config[`${prefix}BaseURL`],
      process.env.MC_GEN_TEXT_ENDPOINT,
      process.env.TEXT_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
      TEXT_DEFAULTS.baseURL
    ),
    model: pick(
      config[`${prefix}Model`],
      process.env.MC_GEN_TEXT_MODEL,
      process.env.TEXT_MODEL,
      process.env.ANTHROPIC_MODEL,
      TEXT_DEFAULTS.model
    ),
    //透传显式 provider 类型：前端 textProviderType > 环境变量 > 默认 auto
    providerType: pick(
      config[`${prefix}ProviderType`],
      process.env.TEXT_PROVIDER_TYPE,
      'auto'
    )
  }

  // 文本温度同样跟随当前模式，并透传给供应商池/文本 Agent。
  const temperature = config[`${prefix}Temperature`]
  if (temperature !== undefined && temperature !== null && temperature !== '') {
    primary.temperature = Number(temperature)
  }

  // 供应商池：主配置并入池后择优 pick（向下兼容，主配置不失效）
  const pooled = resolveProvider(config, primary, 'text')
  return pooled || primary
}

export default {
  VISION_DEFAULTS,
  TEXT_DEFAULTS,
  resolveVisionConfig,
  resolveTextConfig
}

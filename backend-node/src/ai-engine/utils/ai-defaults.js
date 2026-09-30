/**
 * AI Provider 配置
 *
 * 设计目的：所有模型名称和密钥必须来自用户配置（数据库/data/ai-config.json/环境变量）。
 *           用户未配置时静默使用兜底默认值，会掩盖「用户忘配模型」的致命错误。
 *           ⚠️ 零硬编码回退原则：model 为空时必须抛出清晰错误，引导用户去配置面板。
 */

import { getProviderPool } from './provider-pool.js'
import { isReasoningModel } from './model-config.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'ai-defaults' })

// 进程生命周期内同模型只打一次「thinking disabled」日志，避免每次任务重复刷 WARN
const _loggedThinkingDisabled = new Set()

/**
 * 取「当前生效配置」的某个角色槽（text / vision）的完整参数。
 *
 * 🛡️ 2026-09-16 全局模型配置清理：不再从 data/ai-config.json 读模型字段。
 * 背景：此前 Playground / 规范检查修复等无入参入口用 ai-config.json 里的模型兜底，
 * 但全局兜底会「掩盖用户忘配模型」+「用户配 deepseek 却因 providers 回退全局池而
 * 降级到 z-ai/glm」。模型必须由用户级配置（getMergedAiConfig）或 process.env 提供。
 *
 * @param {'text'|'vision'} role
 * @returns {{apiKey:string, baseURL:string, model:string, providerType:string, temperature?:number, thinkingType?:string, providers:Array, pickStrategy?:string, modelMode?:string}}
 */
function resolveSavedSlot(role = 'text') {
  // 🛡️ 2026-09-16 全局模型配置清理（用户需求：不需要全局模型兜底）：
  // 此前从 data/ai-config.json 读 text/vision 槽的模型名/密钥/池，供无入参入口
  // （Playground / 规范检查修复）兜底。但全局兜底会「掩盖用户忘配模型」+ 造成
  // 「用户配 deepseek 却因 providers 回退到全局池而降级到 z-ai/glm」。
  // 现改为：不再读 ai-config.json 的模型字段——apiKey/baseURL/model 仅由
  // process.env（部署级）或调用方 config 提供；providers 恒 []（不回退全局池），
  // modelMode 默认 'separate'，temperature/thinkingType 不读全局。
  // 注：figmaToken/apifoxToken/gitlabToken 等非模型凭证仍由 config.service 的
  // getMergedAiConfig 单独处理，不在此函数范围。
  return {
    apiKey: '',
    baseURL: '',
    model: '',
    providerType: 'auto',
    temperature: undefined,
    thinkingType: undefined,
    providers: [],
    pickStrategy: undefined,
    modelMode: 'separate',
  }
}


// 视觉任务默认配置（Preview 阶段 - 图像分析/VisualParser）
// 🔒 2026-09-29 彻底拔掉部署级 env 兜底（用户红线：每用户模型独有，不允许任何全局兜底）：
//    此前从 MC_GEN_AI_API_KEY / VISION_API_KEY / ANTHROPIC_API_KEY 等 env 回退，
//    会让未配置模型的新用户静默使用部署共享凭证。现恒为空——模型/密钥只能来自
//    用户级配置（getMergedAiConfig(userId)），未配置即在 resolve* 处直接报错引导。
const _savedVision = resolveSavedSlot('vision')
export const VISION_DEFAULTS = {
  apiKey: _savedVision.apiKey || '',
  baseURL: _savedVision.baseURL || '',
  model: _savedVision.model || '',
}

// 文本任务默认配置（Figma/req 阶段 - 代码生成/审查/布局分析）
// 🔒 2026-09-29 同上：env 回退链（MC_GEN_TEXT_* / TEXT_* / ANTHROPIC_*）已全部拔除，
//    保留导出仅为兼容旧引用（base-agent 等），值恒为空。
const _savedText = resolveSavedSlot('text')
export const TEXT_DEFAULTS = {
  apiKey: _savedText.apiKey || '',
  baseURL: _savedText.baseURL || '',
  model: _savedText.model || '',
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
/**
 * 🛡️ 模型默认思考开关判定（单一事实源，2026-09-30 提取）。
 * - 推理模型（kimi-k 系列、qwq、o1、o3、thinking、reasoner、reasoning 关键词）→ 'skip'（关不掉，provider 池过滤弃用）
 * - 默认思考但可关（deepseek-v4* / qwen* / glm* / 混元 hunyuan/hy4 / 豆包 doubao）→ 'disabled'（平台自动注入关推理参数）
 * - 其余（gpt 普通 / claude 等默认不思考）→ undefined（无需处理）
 * 供 resolveProvider（池内 provider）+ resolveTextConfig/resolveVisionConfig（单模型 primary）+ base-agent 发起前兜底共用，
 * 避免「有池关推理、无池漏关」的口径漂移（生产慢根因：单模型 primary 漏关推理）。
 */
export function resolveThinkingType(model = '') {
  let m = String(model || '').trim().toLowerCase()
  if (!m) return undefined
  // 推理模型优先（doubao-seed-*-thinking 等含 thinking 的变体应归 skip，而非 disabled）
  if (isReasoningModel(m)) return 'skip'
  // 🛡️ 厂商前缀归一（2026-09-30 · mc-max TabsSection 烧光实锤）：中转/OpenRouter 形态 id
  //   带 `vendor/` 前缀（如 deepseek/deepseek-v4.1-flash），原 `/^deepseek-v4/` 锚定
  //   **匹配不到** ⇒ thinkingType 整个漏发 ⇒ 推理烧光输出预算 → 空内容熔断 ×3。
  //   取最后一个 `/` 之后的模型名做族匹配（与 buildThinkingOffParams 的 includes 口径对齐）。
  const bare = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m
  if (/^deepseek-v4/.test(bare)) return 'disabled'
  if (bare.includes('qwen')) return 'disabled'
  if (bare.includes('glm')) return 'disabled'
  if (bare.includes('hunyuan') || bare.includes('hy4')) return 'disabled'
  if (bare.includes('doubao')) return 'disabled'
  if (bare.includes('gemini')) return 'disabled'
  return undefined
}

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
  // 🛡️ 2026-09-30 委托模块级 resolveThinkingType（单一事实源，与单模型 primary 同口径）
  const thinkingDefaultFor = resolveThinkingType

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
      // 同模型进程内只 WARN 一次，避免每次任务重复刷日志
      const logKey = `${p.model}|${p.id}`
      if (!_loggedThinkingDisabled.has(logKey)) {
        _loggedThinkingDisabled.add(logKey)
      logger.warn('🔧 模型默认开推理，已注入 disabled 关推理（避免烧光输出预算）', {
        model: p.model,
        providerId: p.id,
      })
      }
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
  // 主配置并入池：如果池中已有相同 apiKey+model 的 provider，将其标记为主（__primary_<role>__）。
  // 🛡️ 2026-09-24 治本（mc-max-1790208267564 重试 401 实锤）：顶层主模型不在池中时不注入，
  // 避免旧的文本模型（如 qwen3.7-plus）被当视觉主模型抢占首调用——它挂起/401 会阻断整次生成，
  // 而池中真正的视觉 provider 反而没机会被选中。改为把池中真实 provider 提升为主：
  //   优先用 binding.<role>.primaryId 指向的（若存在池中），否则用池中第一个匹配角色 provider。
  //   仅当池完全为空（roleMatched=0）才回退顶层主配置（向后兼容单模型用法）。
  const primaryInPool = roleMatched.find((p) => p && p.apiKey && p.apiKey === primaryEntry?.apiKey && p.model === primaryEntry?.model)
  if (primaryInPool) {
    primaryInPool.id = primaryId
  } else {
    const bid = config?.binding?.[role]?.primaryId
    const boundTarget = bid ? roleMatched.find((p) => p.id === bid) : null
    const promoted = boundTarget || roleMatched[0]
    if (promoted) {
      promoted.id = primaryId
    } else if (primaryEntry) {
      list.push(primaryEntry)
    }
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
  const saved = resolveSavedSlot('vision')
  const hasAnyInput = Object.keys(config || {}).length > 0
  const merged = hasAnyInput ? config : { ...config, modelMode: saved.modelMode }
  // 统一模式：vision/text 角色均改用 unified* 配置
  const prefix = merged.modelMode === 'unified' ? 'unified' : 'vision'
  const primary = {
    apiKey: pick(
      config[`${prefix}ApiKey`]
      // 🔒 2026-09-29：env 兜底链已拔除（每用户模型独有），未配置直接报错引导
    ),
    baseURL: pick(
      config[`${prefix}BaseURL`]
    ),
    model: pick(
      config[`${prefix}Model`]
    ),
    //显式 provider 类型：优先用用户选择，否则自动识别
    providerType: pick(
      config[`${prefix}ProviderType`],
      'auto'
    )
  }

  // 主配置的 temperature 跟随当前模式：统一模式读取 unifiedTemperature，分别模式读取 visionTemperature。
  // 仅显式配置时透传，否则保留 VisionAgent 默认值。
  const temperature = merged[`${prefix}Temperature`] ?? saved.temperature
  if (temperature !== undefined && temperature !== null && temperature !== '') {
    primary.temperature = Number(temperature)
  }
  if (saved.thinkingType) primary.thinkingType = saved.thinkingType
  // 🛡️ 2026-09-30 修复（生产慢根因）：单模型（无池）时 primary 也必须关推理。
  // resolveProvider 的 withThinkingDefault 只对「池内 provider」生效；无池时 resolveProvider
  // 返回 null 走裸 primary，而 primary 原本无 thinkingType → 关推理参数未下发 → deepseek-v4*/qwen
  // 开推理烧预算 → 慢。这里对 primary 补 thinkingType（口径与 resolveThinkingType 一致）。
  const _tt = merged.disableReasoning !== false ? resolveThinkingType(primary.model) : undefined
  if (!primary.thinkingType && _tt) primary.thinkingType = _tt

  // 供应商池：主配置并入池后择优 pick（向下兼容，主配置不失效）
  // 🔒 用户配置隔离（2026-09-16 强化）：merged.providers 非数组时不再回退 saved.providers
  // （全局 ai-config.json 池），改为 providers: [] —— 空池走主配置，绝不降级到全局模型。
  const poolConfig =
    Array.isArray(merged.providers)
      ? merged
      : { ...merged, providers: [], pickStrategy: merged.pickStrategy }
  const pooled = resolveProvider(poolConfig, primary, 'vision')
  const result = pooled || primary

  // 🛡️ 2026-09-19 空凭证拦截：model 有值但 apiKey 为空时，明确报错引导用户配置，
  // 而非直接发起空凭证请求导致 401（401 错误信息晦涩，用户无从判断是凭证缺失还是配额耗尽）。
  // 背景：resolveBindingToLegacy 降维可能产出 visionModel 有值但 visionApiKey 为空（用户只删了 key 没清 model），
  // 或用户尚未在 Settings 保存过个人模型配置，providers 为空 + 主配置为空 → 空凭证。
  if (result && result.model && !result.apiKey) {
    throw new Error(
      `视觉模型「${result.model}」未配置 API Key。` +
      `请到「设置 - 模型配置」中添加视觉模型并保存（apiKey 不能为空），否则无法进行视觉分析（截图 / Figma 识别需要有效凭证）。`
    )
  }

  return result
}

/**
 * 解析文本任务配置
 * 优先级（🔒 2026-09-29 env 兜底已拔除）：前端传入（用户级 getMergedAiConfig）→ 无则报错引导配置。
 * 不再有任何部署级/全局级模型回退——每用户模型独有。
 * @param {object} config - 前端请求传入的配置
 * @returns {{apiKey:string, baseURL:string, model:string}}
 */
export function resolveTextConfig(config = {}) {
  // 🆕 2026-09-10：无任何入参时（Playground / AI 修复 / 规范检查修复等入口），
  // 用 data/ai-config.json 里当前生效的 text 槽补全 modelMode/temperature/providers，
  // 否则会退化成「硬编码 model + 空 baseURL」的错配组合。
  const saved = resolveSavedSlot('text')
  const hasAnyInput = Object.keys(config || {}).length > 0
  const merged = hasAnyInput ? config : { ...config, modelMode: saved.modelMode }

  // 统一模式：vision/text 角色均改用 unified* 配置
  const prefix = merged.modelMode === 'unified' ? 'unified' : 'text'
  const primary = {
    apiKey: pick(
      config[`${prefix}ApiKey`]
      // 🔒 2026-09-29：env 兜底链已拔除（每用户模型独有），未配置直接报错引导
    ),
    baseURL: pick(
      config[`${prefix}BaseURL`]
    ),
    model: pick(
      config[`${prefix}Model`]
    ),
    //透传显式 provider 类型：前端 textProviderType > 默认 auto
    providerType: pick(
      config[`${prefix}ProviderType`],
      'auto'
    )
  }

  // 文本温度同样跟随当前模式，并透传给供应商池/文本 Agent。
  // 未显式配置时回退到已保存配置里的温度（与配置页一致）。
  const temperature = merged[`${prefix}Temperature`] ?? saved.temperature
  if (temperature !== undefined && temperature !== null && temperature !== '') {
    primary.temperature = Number(temperature)
  }
  if (saved.thinkingType) primary.thinkingType = saved.thinkingType
  // 🛡️ 2026-09-30 修复（生产慢根因）：单模型（无池）时 primary 也必须关推理。
  // resolveProvider 的 withThinkingDefault 只对「池内 provider」生效；无池时 resolveProvider
  // 返回 null 走裸 primary，而 primary 原本无 thinkingType → 关推理参数未下发 → deepseek-v4*/qwen
  // 开推理烧预算 → 慢。这里对 primary 补 thinkingType（口径与 resolveThinkingType 一致）。
  const _tt = merged.disableReasoning !== false ? resolveThinkingType(primary.model) : undefined
  if (!primary.thinkingType && _tt) primary.thinkingType = _tt

  // 供应商池：主配置并入池后择优 pick（向下兼容，主配置不失效）
  // 🔒 用户配置隔离（2026-09-16 强化）：merged.providers 非数组时不再回退 saved.providers
  // （全局 ai-config.json 池），改为 providers: [] —— 空池走主配置，绝不降级到全局模型。
  const poolConfig =
    Array.isArray(merged.providers)
      ? merged
      : { ...merged, providers: [], pickStrategy: merged.pickStrategy }
  const pooled = resolveProvider(poolConfig, primary, 'text')
  const result = pooled || primary

  // 🛡️ 2026-09-19 空凭证拦截：model 有值但 apiKey 为空时，明确报错引导用户配置。
  if (result && result.model && !result.apiKey) {
    throw new Error(
      `文本模型「${result.model}」未配置 API Key。` +
      `请到「设置 - 模型配置」中添加模型并保存（apiKey 不能为空）。`
    )
  }

  return result
}

export default {
  VISION_DEFAULTS,
  TEXT_DEFAULTS,
  resolveVisionConfig,
  resolveTextConfig
}

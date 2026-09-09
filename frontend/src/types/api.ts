/**
 * AI 配置相关类型定义
 */

/**
 * Provider 协议类型
 * - openai-compatible：OpenAI 兼容协议（/v1/chat/completions），包括 OpenAI、阿里云百炼、各类代理网关
 * - anthropic：Anthropic 原生协议
 * - auto：兼容旧配置，由后端根据 baseURL 自动识别（不推荐长期使用）
 */
export type ProviderType = 'openai-compatible' | 'anthropic' | 'auto'

/**
 * 模型配置模式
 * - unified：统一大模型（一组密钥同时处理视觉+文本）
 * - separate：分别配置（视觉和文本使用不同模型）
 */
export type ModelMode = 'unified' | 'separate' | 'text' | 'vision'

/**
 * 供应商池 provider 的角色（能力标签）
 * - text：仅参与文本任务池
 * - vision：仅参与视觉任务池
 * - both：文本 + 视觉通用（缺省值，向后兼容）
 */
export type ProviderRole = 'text' | 'vision' | 'both'

/**
 * 供应商池中的单个 provider（多 Key 负载分散 + 故障转移）
 */
export interface ProviderConfig {
  /** 唯一标识（前端生成） */
  id: string
  /** 展示名称 */
  name?: string
  apiKey?: string
  baseURL?: string
  model?: string
  providerType?: ProviderType
  /** 每分钟请求上限，0 = 不限 */
  rpm?: number
  /** 每分钟 Token 上限，0 = 不限 */
  tpm?: number
  /** 负载权重（越大分到的请求越多） */
  weight?: number
  /** 采样温度（留空或 undefined = 自动，部分推理模型如 kimi-k3 必须为 1） */
  temperature?: number
  /** 能力角色：text=文本池 / vision=视觉池 / both=通用（缺省 both） */
  role?: ProviderRole
}

/**
 * 🆕 模型库条目（一等公民）：一次可添加 N 个模型，槽位从库中引用。
 * capability 为模型固有能力标记，驱动槽位候选过滤；降维成 providers 时映射为 role。
 */
export interface ModelEntry {
  /** 唯一标识（前端生成，稳定性依赖此 id 做槽位引用） */
  id: string
  /** 展示名称（如 "kimi-k2 主" / "glm-5V 备"） */
  name?: string
  apiKey?: string
  baseURL?: string
  model?: string
  providerType?: ProviderType
  /** 能力标记：both=通用（文本+视觉）/ text=仅文本 / vision=仅视觉 */
  capability?: ProviderRole
  /** 每分钟请求上限，0 = 不限 */
  rpm?: number
  /** 每分钟 Token 上限，0 = 不限 */
  tpm?: number
  /** 池内权重（越大越优先） */
  weight?: number
  /** 采样温度（留空 = 自动） */
  temperature?: number
}

/** 🆕 槽位绑定：primaryId 指向模型库主模型（必选），poolIds 为额外池成员 id（可空=只用主模型） */
export interface SlotBinding {
  primaryId?: string
  poolIds?: string[]
}

/**
 * AI 配置接口
 */
export interface ApiConfig {
  figmaToken?: string
  apifoxToken?: string

  // 视觉任务配置
  visionApiKey?: string
  visionBaseURL?: string
  visionModel?: string
  visionProviderType?: ProviderType
  visionTemperature?: number

  // 文本任务配置
  textApiKey?: string
  textBaseURL?: string
  textModel?: string
  textProviderType?: ProviderType
  textTemperature?: number

  // 统一大模型配置
  unifiedApiKey?: string
  unifiedBaseURL?: string
  unifiedModel?: string
  unifiedProviderType?: ProviderType
  unifiedTemperature?: number

  // 模式选择
  modelMode?: ModelMode

  // 输出路径
  outputPath?: string

  // 请求并发与超时配置
  requestConcurrency?: number
  requestQueueTimeoutMs?: number
  requestTimeoutMs?: number
  requestMaxRetries?: number

  // 供应商池（多 Key 负载分散 + 故障转移）
  providers?: ProviderConfig[]
  // 🆕 模型库（一等公民）：N 个模型条目，槽位从库中引用
  models?: ModelEntry[]
  // 🆕 槽位绑定：unified/text/vision 各含 primaryId + poolIds
  binding?: {
    unified?: SlotBinding
    text?: SlotBinding
    vision?: SlotBinding
  }
  // 熔断器参数
  circuitBreaker?: {
    failureThreshold?: number
    cooldownMs?: number
  }
}

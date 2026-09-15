/**
 * ModelResolver —— 节点级模型路由
 *
 * 解决的问题：旧管线的模型只能全局配（textCfg.model / visionCfg.model 一刀切），
 * 无法做到「视觉分析用便宜模型、代码生成用强模型、对抗校验用推理模型」。
 *
 * 优先级（从高到低）：
 *   1. 请求级   config.modelOverrides[nodeId]     —— 配置页逐节点下拉选择
 *   2. 档位级   tierProfile.defaultModels[nodeId] —— 如 lite 档统一降级
 *   3. 规范级   spec.defaultModels[nodeId]        —— 如微码 code-engineer 需强模型
 *   4. 通道级   env TEXT_MODEL / VISION_MODEL     —— 沿用旧管线全局配置
 *   ⚠️ 无第五层系统兜底：用户必须显式配置至少一条有效路径，
 *      resolveNodeModel 在全部 4 级皆空时会抛出清晰错误。
 *
 * 凭证（apiKey/baseURL）只按通道解析，不做节点级覆盖 —— 密钥属于部署配置，
 * 不应由前端请求携带（P1 迁 Java 后由服务端托管下发）。
 */

import { VISION_NODES, DETERMINISTIC_NODES, willCallLlm } from './tier-profile.js'

/** 系统兜底模型（已删除）—— 零硬编码回退原则，所有模型必须来自用户配置或环境变量 */

/** 节点所属通道 */
export function getChannel(nodeId) {
  return VISION_NODES.has(nodeId) ? 'vision' : 'text'
}

/**
 * 解析通道凭证，完全对齐旧管线的 env 回退链
 * （见 mc-component-graph-phase2.js:60-62 / :437-439）
 */
export function resolveChannelCredentials(channel, aiConfig = {}) {
  const cfg =
    (channel === 'vision' ? aiConfig.visionAIConfig : aiConfig.textAIConfig) ||
    aiConfig.aiConfig ||
    {}

  if (channel === 'vision') {
    return {
      apiKey: cfg.apiKey || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: cfg.baseURL || process.env.VISION_BASE_URL || process.env.ANTHROPIC_BASE_URL,
      envModel: cfg.model || process.env.VISION_MODEL || process.env.ANTHROPIC_MODEL
    }
  }
  return {
    apiKey: cfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: cfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
    envModel: cfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL
  }
}

/**
 * 解析单个节点的模型
 * @returns {{ model:string, channel:string, source:string }} source 标明命中的优先级层，便于配置页展示与排障
 */
export function resolveNodeModel(nodeId, { spec, tierProfile, modelOverrides, aiConfig } = {}) {
  const channel = getChannel(nodeId)
  const { apiKey, baseURL, envModel } = resolveChannelCredentials(channel, aiConfig)

  let model
  let source

  if (modelOverrides?.[nodeId]) {
    model = modelOverrides[nodeId]
    source = 'request'
  } else if (tierProfile?.defaultModels?.[nodeId]) {
    model = tierProfile.defaultModels[nodeId]
    source = 'tier'
  } else if (spec?.defaultModels?.[nodeId]) {
    model = spec.defaultModels[nodeId]
    source = 'spec'
  } else if (envModel) {
    model = envModel
    source = 'env'
  } else {
    throw new Error(
      `[model-resolver] 节点 "${nodeId}"（通道: ${channel}）未配置模型。` +
      `请在 配置面板 > AI 配置 中设置 ${channel === 'vision' ? '视觉' : '文本'}模型。` +
      `支持通过环境变量 ${channel === 'vision' ? 'VISION_MODEL' : 'TEXT_MODEL'} 或 ANTHROPIC_MODEL 配置。`
    )
  }
}

/**
 * 一次性解析整个档位下所有节点的模型
 * 用于：① pipeline 启动前构建注入表 ② 配置页预览「本次会用哪些模型、几次 LLM 调用」
 */
export function resolvePipelineModels({ spec, tierProfile, modelOverrides, aiConfig } = {}) {
  const table = {}
  const llmNodes = []

  for (const nodeId of tierProfile.nodes) {
    const resolved = resolveNodeModel(nodeId, { spec, tierProfile, modelOverrides, aiConfig })
    resolved.callsLlm = willCallLlm(tierProfile, nodeId)
    resolved.deterministic = DETERMINISTIC_NODES.has(nodeId)
    table[nodeId] = resolved
    if (resolved.callsLlm) llmNodes.push(nodeId)
  }

  return {
    table,
    llmNodes,
    llmCallCount: llmNodes.length,
    /** 与档位声明值比对，配置漂移时能第一时间发现 */
    matchesExpected: llmNodes.length === tierProfile.expectedLlmCalls
  }
}

/**
 * 凭证完整性自检 —— 只检查真正会调 LLM 的通道，避免 lite 档误报缺少 vision 密钥
 * @returns {{ ok:boolean, missing:Array }}
 */
export function auditCredentials(modelTable) {
  const missing = []
  const checked = new Set()

  for (const entry of Object.values(modelTable)) {
    if (!entry.callsLlm) continue
    if (checked.has(entry.channel)) continue
    checked.add(entry.channel)

    if (!entry.apiKey) {
      missing.push({
        channel: entry.channel,
        field: 'apiKey',
        hint:
          entry.channel === 'vision'
            ? '设置 VISION_API_KEY 或 ANTHROPIC_API_KEY'
            : '设置 TEXT_API_KEY 或 ANTHROPIC_API_KEY'
      })
    }
  }

  return { ok: missing.length === 0, missing }
}

/**
 * 配置页用：列出可覆盖模型的节点（确定性节点不出现在下拉里）
 */
export function listConfigurableNodes(tierProfile) {
  return tierProfile.nodes
    .filter(n => willCallLlm(tierProfile, n))
    .map(n => ({
      nodeId: n,
      channel: getChannel(n),
      mode: tierProfile.nodeModes?.[n] || 'default'
    }))
}

export default {
  // 零硬编码回退 —— FALLBACK_MODELS 已删除
  getChannel,
  resolveChannelCredentials,
  resolveNodeModel,
  resolvePipelineModels,
  auditCredentials,
  listConfigurableNodes
}

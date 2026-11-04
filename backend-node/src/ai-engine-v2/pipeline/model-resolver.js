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
 *   4. 通道级   aiConfig.textAIConfig/visionAIConfig —— 用户级配置（getMergedAiConfig）
 *   ⚠️ 无第五层系统兜底（🔒 2026-09-29 env 兜底已拔除，每用户模型独有）：
 *      resolveNodeModel 在全部层级皆空时抛出清晰错误；仅对 willCallLlm=true 的节点强制。
 *      确定性节点 / programmatic·rules 模式节点不调 LLM，无模型合法（source='none'），
 *      避免把「未配置模型」抛在永不调模型的节点上误导用户。
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
 * 解析通道凭证 —— 🔒 2026-09-29 env 回退链已拔除（每用户模型独有），
 * 只认用户级配置（aiConfig.textAIConfig / visionAIConfig，来自 getMergedAiConfig）。
 */
export function resolveChannelCredentials(channel, aiConfig = {}) {
  const cfg =
    (channel === 'vision' ? aiConfig.visionAIConfig : aiConfig.textAIConfig) ||
    aiConfig.aiConfig ||
    {}

  return {
    apiKey: cfg.apiKey || '',
    baseURL: cfg.baseURL || '',
    envModel: cfg.model || ''
  }
}

/**
 * 解析单个节点的模型
 * @returns {{ model:string, channel:string, source:string }} source 标明命中的优先级层，便于配置页展示与排障
 */
export function resolveNodeModel(nodeId, { spec, tierProfile, modelOverrides, aiConfig, required = true } = {}) {
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
  } else if (!required) {
    // 🔴 2026-11-04 非 LLM 节点豁免：确定性节点（input-adapter / screenshot-renderer /
    // code-structure-validator / revision-decision / emit）与 programmatic·rules 模式节点
    // 永不参与 LLM 调用，缺模型不构成错误。required 由调用方按 willCallLlm() 传入，
    // 本函数不自判 willCallLlm —— 它需要 tierProfile（模式相关），避免出现第二套判据。
    model = ''
    source = 'none'
  } else {
    throw new Error(
      `[model-resolver] 节点 "${nodeId}"（通道: ${channel}）未配置模型。` +
      `请到「设置 - 模型配置」中设置${channel === 'vision' ? '视觉' : '文本'}模型并保存。`
    )
  }

  // 🔴 2026-11-04 恢复被误删的返回契约（2c09603 拔除 FALLBACK_MODELS 时整行连带删除，无替代）：
  // 该行缺失导致 ①auditCredentials 读不到 entry.apiKey ⇒ 所有人恒报「两通道凭证缺失」
  // ②instantiateNode 注入 role 的 apiKey/baseURL 为 undefined ⇒ 真跑空凭证 ③配置页模型表 nodeId 空白。
  // apiKey/baseURL 由 resolveChannelCredentials 提供，是这里唯一的事实源，禁止在此二次推导。
  return { nodeId, channel, model, source, apiKey, baseURL }
}

/**
 * 一次性解析整个档位下所有节点的模型
 * 用于：① pipeline 启动前构建注入表 ② 配置页预览「本次会用哪些模型、几次 LLM 调用」
 */
export function resolvePipelineModels({ spec, tierProfile, modelOverrides, aiConfig } = {}) {
  const table = {}
  const llmNodes = []

  for (const nodeId of tierProfile.nodes) {
    // callsLlm 必须先于模型解析算出：非 LLM 节点缺模型不抛错（见 resolveNodeModel.required），
    // 否则配置为空时首条报错会落在 input-adapter 这类永不调模型的节点上。
    const callsLlm = willCallLlm(tierProfile, nodeId)
    const resolved = resolveNodeModel(nodeId, { spec, tierProfile, modelOverrides, aiConfig, required: callsLlm })
    resolved.callsLlm = callsLlm
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
          ? '到「设置 - 模型配置」中设置视觉模型并保存'
          : '到「设置 - 模型配置」中设置文本模型并保存'
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

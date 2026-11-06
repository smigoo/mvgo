/**
 * 会话级「当前使用模型」注册表。
 *
 * 解耦设计：ai-request-gateway（统一 invoke 入口）在每次 LLM 调用后登记
 * `sessionId → model`；progress.service.sendLog 在广播日志时自动读取并附加到
 * meta.model，前端即可在每条日志前渲染 `[model]` 标签。
 *
 * 用模块级 Map 而非 NestJS DI，避免 ai-request-gateway ↔ progress.service 循环依赖。
 */

const sessionModelRegistry = new Map()

/**
 * 登记某会话最近一次 LLM 调用使用的模型。
 * @param {string} sessionId
 * @param {string} model
 */
export function setSessionModel(sessionId, model) {
  if (sessionId && model && typeof model === 'string' && model !== 'unknown') {
    sessionModelRegistry.set(sessionId, model)
  }
}

/**
 * 读取某会话最近一次 LLM 调用使用的模型。
 * @param {string} sessionId
 * @returns {string|undefined}
 */
export function getSessionModel(sessionId) {
  return sessionModelRegistry.get(sessionId)
}

/**
 * 任务结束后清理，避免 Map 无限增长。
 * @param {string} sessionId
 */
export function clearSessionModel(sessionId) {
  if (sessionId) sessionModelRegistry.delete(sessionId)
}

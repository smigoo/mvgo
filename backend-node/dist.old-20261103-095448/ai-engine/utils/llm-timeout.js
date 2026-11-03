/**
 * LLM invoke 超时保护工具 (v3 - 心跳推 SSE)
 * 为所有 this.llm.invoke(prompt) 调用添加超时保护
 * 防止网络断开或模型超载时流程永远挂着
 * 新增：心跳每30秒输出日志 + 可选推送 SSE progress，前端可感知"仍在处理"
 */

import { createLogger } from '../logger/index.js'
import { invokeLangChainModel } from './ai-request-gateway.js'
const logger = createLogger({ name: 'llm-timeout' })

/**
 * 为 LLM invoke 添加超时保护（支持心跳日志 + SSE 推送）
 * @param {Object} llm - LangChain ChatModel 实例
 * @param {string|Array} prompt - 输入 prompt
 * @param {number} timeoutMs - 超时毫秒数（默认 300000 = 5分钟）
 * @param {string} context - 调用来源标识
 * @param {Function} [onProgress] - 可选，SSE 进度回调 ({ stage, status, message }) => void
 * @returns {Promise<string>} LLM 响应
 * @throws {Error} 超时或调用失败
 */
export async function invokeWithTimeout(
  llm,
  prompt,
  timeoutMs = 300000,
  context = 'unknown',
  onProgress = null,
  options = {},
) {
  const startTime = Date.now()
  try {
    const response = await invokeLangChainModel({
      llm,
      prompt,
      context,
      requestQueueTimeoutMs: options.requestQueueTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs ?? timeoutMs,
      requestConcurrency: options.requestConcurrency,
      requestMaxRetries: options.requestMaxRetries,
      treatEmptyAsFailure: options.treatEmptyAsFailure,
      signal: options.signal,
      onProgress,
      provider: options.provider || llm?.constructor?.name || 'langchain',
      model: options.model || llm?.modelName || llm?.model || 'unknown',
      callOptions: options.callOptions || {},
    })

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    logger.info(`✅ [${context}] LLM 调用完成（耗时 ${totalTime}秒）`)
    return response
  } catch (error) {
    if (String(error?.message || '').includes('timeout')) {
      logger.error(`❌ [${context}] LLM 调用超时 (${timeoutMs}ms)`)
      if (onProgress) {
        onProgress({
          stage: context,
          status: 'error',
          message: `⏰ LLM 调用超时（${timeoutMs / 1000}s），正在重试...`,
        })
      }
    }
    throw error
  }
}


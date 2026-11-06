/**
 * Orchestrator 调度智能体
 *
 * 职责：作为工作流的"调度大脑"，提供节点级容错与资源治理能力，
 *       而非作为图节点本身存在（保持 task-manager 旁路存储的解耦）。
 *
 * 能力：
 *   1. 节点级重试    —— 捕获节点异常，按策略重试 N 次
 *   2. 降级策略      —— 主模型不可用时，回退到备用配置（如文本模型挂→视觉模型兜底）
 *   3. 僵尸任务回收  —— 启动时扫描 taskManager，把超时未推进的 running 任务标记失败
 *   4. 超时控制      —— 单节点执行限时
 */

import { taskManager } from '../utils/task-manager.js'
import { resolveVisionConfig, resolveTextConfig } from '../utils/ai-defaults.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'orchestrator' })

// 僵尸任务判定阈值：running 且 2h 无进度更新
const ZOMBIE_PROGRESS_TIMEOUT = 2 * 60 * 60 * 1000

/**
 *检测错误是否为 429 限流错误
 * @param {Error|any} err
 * @returns {{ is429: boolean, retryAfterSec?: number }}
 */
function detectRateLimit(err) {
  const msg = (err?.message || err?.toString?.() || '').toLowerCase()
  const patterns = [
    /429/,
    /rate.?limit/i,
    /额度已用完/,
    /too many requests/i,
    /quota exceeded/i,
    /model_rate_limit/i,
    /insufficient_quota/i,
    /速率限制/,
    /请求过于频繁/,
  ]

  const is429 = patterns.some(p => p.test(msg))

  // 尝试从错误对象中提取 Retry-After（Axios / LangChain 可能带在 response headers 里）
  let retryAfterSec = null
  const headers = err?.response?.headers
  if (headers) {
    const ra = headers['retry-after'] || headers['Retry-After']
    if (ra) {
      retryAfterSec = parseInt(ra, 10)
      if (isNaN(retryAfterSec)) {
        // Retry-After 可能是 HTTP-date 格式
        const date = new Date(ra)
        if (!isNaN(date.getTime())) {
          retryAfterSec = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000))
        }
      }
    }
  }

  // 兜底：从错误消息中提取等待时间（如 "Please retry after 32 seconds"）
  if (!retryAfterSec) {
    const waitMatch = msg.match(/retry after (\d+)\s*(seconds?|s)/i)
      || msg.match(/try again in (\d+)\s*(seconds?|s)/i)
      || msg.match(/请 (\d+) 秒后重试/)
    if (waitMatch) {
      retryAfterSec = parseInt(waitMatch[1], 10)
    }
  }

  return { is429, retryAfterSec }
}

/**
 * 节点级重试包装器（增强版：429 智能退避）
 *
 *  识别 429 限流错误，使用 Retry-After 头或阶梯式长退避（30s/60s/120s），
 *        而非对所有错误使用相同的小延迟退避。
 *
 * @param {Function} fn        节点执行函数 (state) => result
 * @param {object}   options   { maxRetries, retryDelay, nodeName, onProgress }
 * @returns {Function} 包装后的执行函数
 */
export function withRetry(fn, options = {}) {
  const {
    maxRetries = 2,
    retryDelay = 1000,
    nodeName = 'node',
    onProgress
  } = options

  return async function retried(state) {
    let lastError
    let consecutive429 = 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(state)
      } catch (err) {
        lastError = err
        const isLast = attempt === maxRetries
        const { is429, retryAfterSec } = detectRateLimit(err)

        logger.warn(`节点 ${nodeName} 第 ${attempt + 1} 次执行失败`, {
          error: err.message?.slice(0, 200),
          is429,
          willRetry: !isLast
        })

        if (isLast) {
          onProgress?.({
            stage: nodeName,
            status: 'failed',
            message: is429
              ? `❌ ${nodeName} 因 API 额度耗尽(429)重试 ${maxRetries} 次后仍失败，请更换 API Key 后使用「重新配置并重试」`
              : `❌ ${nodeName} 重试 ${maxRetries} 次后仍失败：${err.message}`
          })
          break
        }

        //429 智能退避：使用 Retry-After 或阶梯式长退避
        if (is429) {
          consecutive429++
          const waitSec = retryAfterSec
            || Math.min(30 * Math.pow(2, consecutive429 - 1), 120)  // 30s → 60s → 120s
          const waitMs = waitSec * 1000

          onProgress?.({
            stage: nodeName,
            status: 'warning',
            message: `⚠️ ${nodeName} 遇到 API 限流(429)，等待 ${waitSec}s 后重试 (第 ${attempt + 1}/${maxRetries} 次)...`
          })

          logger.info(`节点 ${nodeName} 429 退避: 等待 ${waitSec}s (consecutive429=${consecutive429})`)
          await sleep(waitMs)
        } else {
          consecutive429 = 0  // 非 429 错误重置计数器
          onProgress?.({
            stage: nodeName,
            status: 'running',
            message: `⚠️ ${nodeName} 第 ${attempt + 1} 次失败，正在重试...`
          })
          await sleep(retryDelay * (attempt + 1)) // 标准指数退避
        }
      }
    }
    throw lastError
  }
}

/**
 * 降级策略包装器
 * 主配置执行失败时，尝试用备用配置重试一次。
 *
 * 典型场景：文本任务(Claude)调用失败 → 降级为视觉模型(Qwen)做文本兜底
 *
 * @param {Function} fn           (config, state) => result
 * @param {object}   primaryCfg   主配置
 * @param {object}   fallbackCfg  备用配置
 * @param {object}   options      { nodeName, onProgress }
 */
export function withFallback(fn, primaryCfg, fallbackCfg, options = {}) {
  const { nodeName = 'node', onProgress } = options

  return async function fallback(state) {
    try {
      return await fn(primaryCfg, state)
    } catch (err) {
      if (!fallbackCfg) throw err
      
      // 🔍 P2-2: 记录 fallback 观测字段（与 retry 分账）
      state._requestStats = state._requestStats || { fallbackCount: 0, fallbackProviders: [] }
      state._requestStats.fallbackCount++
      state._requestStats.fallbackProviders.push({
        from: primaryCfg?.model || primaryCfg?.provider,
        to: fallbackCfg?.model || fallbackCfg?.provider,
        node: nodeName,
        timestamp: Date.now()
      })
      
      logger.warn(`节点 ${nodeName} 主配置失败，触发降级`, {
        error: err.message,
        primaryModel: primaryCfg?.model,
        fallbackModel: fallbackCfg?.model
      })
      onProgress?.({
        stage: nodeName,
        status: 'running',
        message: `⚠️ ${nodeName} 主模型 ${primaryCfg?.model} 不可用，降级到 ${fallbackCfg?.model}`
      })
      return await fn(fallbackCfg, state)
    }
  }
}

/**
 * 超时控制包装器
 * @param {Function} fn    节点执行函数
 * @param {number}   ms    超时毫秒
 */
export function withTimeout(fn, ms = 5 * 60 * 1000, options = {}) {
  const { nodeName = 'node', onProgress } = options

  return async function timed(state) {
    const parentSignal = state?.signal || state?.__abortSignal || null
    const controller = new AbortController()
    let timedOut = false
    let timer = null

    const abortFromParent = () => {
      if (controller.signal.aborted) return
      controller.abort(parentSignal?.reason || new Error(`节点执行已取消 [${nodeName}]`))
    }

    if (parentSignal) {
      if (parentSignal.aborted) {
        abortFromParent()
      } else {
        parentSignal.addEventListener('abort', abortFromParent, { once: true })
      }
    }

    const abortPromise = new Promise((_, reject) => {
      const onAbort = () => {
        controller.signal.removeEventListener('abort', onAbort)
        reject(controller.signal.reason || new Error(`节点执行已取消 [${nodeName}]`))
      }

      if (controller.signal.aborted) {
        onAbort()
        return
      }

      controller.signal.addEventListener('abort', onAbort, { once: true })
    })

    timer = setTimeout(() => {
      if (controller.signal.aborted) return
      timedOut = true
      controller.abort(new Error(`节点执行超时 (${ms}ms) [${nodeName}]`))
    }, ms)

    const nextState = state && typeof state === 'object'
      ? {
          ...state,
          signal: controller.signal,
          __abortSignal: controller.signal,
        }
      : state

    try {
      return await Promise.race([
        fn(nextState),
        abortPromise,
      ])
    } catch (error) {
      if (timedOut) {
        onProgress?.({
          stage: nodeName,
          status: 'error',
          message: `⏰ ${nodeName} 执行超时，已中断当前请求`,
        })
        const timeoutError = new Error(`节点执行超时 (${ms}ms) [${nodeName}]`)
        timeoutError.code = 'NODE_EXEC_TIMEOUT'
        timeoutError.cause = error
        throw timeoutError
      }
      throw error
    } finally {
      clearTimeout(timer)
      if (parentSignal) {
        parentSignal.removeEventListener('abort', abortFromParent)
      }
    }
  }
}

/**
 * 统一的节点执行入口：集成重试 + 超时
 * 供动态图构建器使用，包装每个 agent 节点的执行逻辑。
 *
 * @param {string}   nodeName
 * @param {Function} fn         (state) => result
 * @param {object}   options    { maxRetries, timeout, onProgress }
 */
export function executeNode(nodeName, fn, options = {}) {
  const {
    maxRetries = 0,
    timeout = 5 * 60 * 1000,
    onProgress
  } = options

  const wrapped = withTimeout(fn, timeout, { nodeName, onProgress })
  const retried = withRetry(wrapped, { maxRetries, nodeName, onProgress })
  return retried
}

/**
 * 僵尸任务回收
 * 扫描 taskManager 中所有 running 任务，将超时未推进的标记为 failed。
 * 建议在服务启动时调用一次，之后由 taskManager 内部 gc 定时处理。
 *
 * @returns {number} 回收的僵尸任务数
 */
export function reapZombieTasks() {
  const tasks = taskManager.getAllTasks()
  const now = Date.now()
  let reaped = 0

  for (const task of tasks) {
    if (task.status !== 'running') continue
    const age = now - task.startTime
    if (age > ZOMBIE_PROGRESS_TIMEOUT) {
      // 直接操作底层任务对象标记失败
      const full = taskManager.getTask(task.sessionId)
      if (full) {
        taskManager.failTask(task.sessionId, new Error('僵尸任务回收：服务可能已重启'))
        reaped++
        logger.info(`回收僵尸任务`, {
          sessionId: task.sessionId,
          componentName: task.componentName,
          ageMin: Math.round(age / 60000)
        })
      }
    }
  }

  if (reaped > 0) {
    logger.info(`僵尸任务回收完成，共回收 ${reaped} 个`)
  }
  return reaped
}

/**
 * 为文本任务构建降级配置链
 * 主：TEXT 配置（Claude）
 * 备：VISION 配置（Qwen）——当 Claude 端点完全不可用时兜底
 *
 * @param {object} config 前端传入配置
 */
export function buildFallbackChain(config = {}) {
  const primary = resolveTextConfig(config)
  const fallback = resolveVisionConfig(config)
  return { primary, fallback }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default {
  withRetry,
  withFallback,
  withTimeout,
  executeNode,
  reapZombieTasks,
  buildFallbackChain
}

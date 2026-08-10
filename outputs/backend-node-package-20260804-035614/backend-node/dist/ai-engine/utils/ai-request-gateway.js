import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMUsage } from './model-config.js'

const logger = createLogger({ name: 'ai-request-gateway' })

const DEFAULT_REQUEST_POLICY = {
  requestConcurrency: 2,
  requestQueueTimeoutMs: 120000,
  requestTimeoutMs: 300000,
  requestMaxRetries: 1,
}

const CONFIG_FILE = join(process.cwd(), 'data', 'ai-config.json')
const POLICY_CACHE_TTL = 5000
const HEARTBEAT_INTERVAL_MS = 30000
const HEARTBEAT_PROGRESS_INTERVAL_MS = 60000

let policyCache = {
  at: 0,
  value: DEFAULT_REQUEST_POLICY,
}

function clampInt(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const normalized = Math.trunc(num)
  if (normalized < min || normalized > max) return fallback
  return normalized
}

function readPersistedPolicy() {
  const now = Date.now()
  if (now - policyCache.at < POLICY_CACHE_TTL) {
    return policyCache.value
  }

  let persisted = {}
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8')
      if (raw?.trim()) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          persisted = parsed
        }
      }
    }
  } catch (error) {
    logger.warn('读取服务端请求策略配置失败，回退默认值', {
      error: error?.message,
    })
  }

  const value = {
    requestConcurrency: clampInt(
      persisted.requestConcurrency,
      1,
      10,
      DEFAULT_REQUEST_POLICY.requestConcurrency,
    ),
    requestQueueTimeoutMs: clampInt(
      persisted.requestQueueTimeoutMs,
      1000,
      300000,
      DEFAULT_REQUEST_POLICY.requestQueueTimeoutMs,
    ),
    requestTimeoutMs: clampInt(
      persisted.requestTimeoutMs,
      10000,
      900000,
      DEFAULT_REQUEST_POLICY.requestTimeoutMs,
    ),
    requestMaxRetries: clampInt(
      persisted.requestMaxRetries,
      0,
      5,
      DEFAULT_REQUEST_POLICY.requestMaxRetries,
    ),
  }

  policyCache = { at: now, value }
  return value
}

export function resolveRequestPolicy(overrides = {}) {
  const persisted = readPersistedPolicy()
  return {
    requestConcurrency: clampInt(
      overrides.requestConcurrency,
      1,
      10,
      persisted.requestConcurrency,
    ),
    requestQueueTimeoutMs: clampInt(
      overrides.requestQueueTimeoutMs,
      1000,
      300000,
      persisted.requestQueueTimeoutMs,
    ),
    requestTimeoutMs: clampInt(
      overrides.requestTimeoutMs,
      10000,
      900000,
      persisted.requestTimeoutMs,
    ),
    requestMaxRetries: clampInt(
      overrides.requestMaxRetries,
      0,
      5,
      persisted.requestMaxRetries,
    ),
  }
}

class RequestScheduler {
  constructor() {
    this.activeCount = 0
    this.queue = []
    this.stats = {
      totalStarted: 0,
      totalCompleted: 0,
      totalRetried: 0,
      totalTimedOut: 0,
      totalAborted: 0,
      totalFailed: 0,
      totalWaitMs: 0,
      maxActive: 0,
      maxQueue: 0,
    }
  }

  async acquire(limit, meta = {}, options = {}) {
    const normalizedLimit = clampInt(
      limit,
      1,
      10,
      DEFAULT_REQUEST_POLICY.requestConcurrency,
    )
    const { signal } = options
    const queueTimeoutMs = clampInt(
      options.queueTimeoutMs,
      1000,
      300000,
      DEFAULT_REQUEST_POLICY.requestQueueTimeoutMs,
    )

    return new Promise((resolve, reject) => {
      const queuedAt = Date.now()
      let settled = false
      let timer = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
      }

      const rejectQueued = (error) => {
        if (settled) return
        settled = true
        const index = this.queue.indexOf(entry)
        if (index >= 0) this.queue.splice(index, 1)
        cleanup()
        reject(error)
        this.drain()
      }

      const onAbort = () => {
        const error = signal?.reason instanceof Error
          ? signal.reason
          : new Error(`模型请求排队已取消 [${meta.context || 'unknown'}]`)
        error.code = error.code || 'MODEL_REQUEST_QUEUE_ABORTED'
        rejectQueued(error)
      }

      const entry = {
        limit: normalizedLimit,
        meta,
        queuedAt,
        grant: () => {
          if (settled) return false
          settled = true
          cleanup()
          const queueWaitMs = Date.now() - queuedAt
          this.activeCount += 1
          this.stats.totalStarted += 1
          this.stats.maxActive = Math.max(this.stats.maxActive, this.activeCount)
          this.stats.totalWaitMs += queueWaitMs

          let released = false
          resolve({
            queueWaitMs,
            release: () => {
              if (released) return
              released = true
              this.activeCount = Math.max(0, this.activeCount - 1)
              this.stats.totalCompleted += 1
              this.drain()
            },
          })
          return true
        },
      }

      if (signal?.aborted) {
        onAbort()
        return
      }

      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        const error = new Error(
          `模型请求排队超时 after ${queueTimeoutMs}ms [${meta.context || 'unknown'}]`,
        )
        error.code = 'MODEL_REQUEST_QUEUE_TIMEOUT'
        rejectQueued(error)
      }, queueTimeoutMs)

      this.queue.push(entry)
      this.stats.maxQueue = Math.max(this.stats.maxQueue, this.queue.length)
      this.drain()
    })
  }

  drain() {
    for (let index = 0; index < this.queue.length; ) {
      const entry = this.queue[index]
      if (this.activeCount >= entry.limit) {
        index += 1
        continue
      }

      this.queue.splice(index, 1)
      if (!entry.grant()) continue
    }
  }

  snapshot() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      ...this.stats,
    }
  }
}

export const requestScheduler = new RequestScheduler()

export function getModelRequestStats() {
  return requestScheduler.snapshot()
}

function isAbortLikeError(error) {
  const message = String(error?.message || '')
  return error?.name === 'AbortError' || /aborted|canceled|cancelled/i.test(message)
}

function detectRateLimit(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const is429 =
    /(^|\D)429(\D|$)/.test(message) ||
    /rate.?limit|too many requests|insufficient_quota|quota exceeded|额度已用尽|请求过于频繁/.test(message)

  let retryAfterSec = null
  const headers = error?.response?.headers || error?.headers || {}
  const retryAfter = headers['retry-after'] || headers['Retry-After']
  if (retryAfter) {
    const parsed = Number.parseInt(retryAfter, 10)
    if (Number.isFinite(parsed)) {
      retryAfterSec = parsed
    } else {
      const target = new Date(retryAfter)
      if (!Number.isNaN(target.getTime())) {
        retryAfterSec = Math.max(1, Math.ceil((target.getTime() - Date.now()) / 1000))
      }
    }
  }

  return { is429, retryAfterSec }
}

function isRetryableError(error, timedOut) {
  if (timedOut) return true
  if (isAbortLikeError(error)) return false
  const { is429 } = detectRateLimit(error)
  if (is429) return true

  const status = error?.response?.status || error?.status
  if (typeof status === 'number' && status >= 500) return true

  const code = String(error?.code || '')
  if (/ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN/.test(code)) {
    return true
  }

  const message = String(error?.message || '').toLowerCase()
  return /timeout|socket hang up|network error|temporarily unavailable/.test(message)
}

function getRetryDelayMs(error, attemptIndex) {
  const { is429, retryAfterSec } = detectRateLimit(error)
  if (is429) {
    return (retryAfterSec || Math.min(30 * Math.pow(2, attemptIndex), 120)) * 1000
  }
  return Math.min(1000 * Math.pow(2, attemptIndex), 10000)
}

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      cleanup()
      reject(signal?.reason || new Error('sleep aborted'))
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    if (signal) {
      if (signal.aborted) {
        cleanup()
        reject(signal.reason || new Error('sleep aborted'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function createManagedSignal(parentSignal, timeoutMs, context) {
  const controller = new AbortController()
  let timedOut = false
  let parentAborted = false
  let timer = null

  const abortFromParent = () => {
    if (controller.signal.aborted) return
    parentAborted = true
    controller.abort(parentSignal?.reason || new Error(`请求已取消 [${context}]`))
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent()
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true })
    }
  }

  timer = setTimeout(() => {
    if (controller.signal.aborted) return
    timedOut = true
    controller.abort(new Error(`LLM invoke timeout after ${timeoutMs}ms [${context}]`))
  }, timeoutMs)

  return {
    signal: controller.signal,
    isTimedOut: () => timedOut,
    isParentAborted: () => parentAborted,
    cleanup: () => {
      clearTimeout(timer)
      if (parentSignal) {
        parentSignal.removeEventListener('abort', abortFromParent)
      }
    },
  }
}

function startHeartbeat({ context, timeoutMs, onProgress }) {
  const startAt = Date.now()
  let lastProgressPush = 0

  const timer = setInterval(() => {
    const elapsedMs = Date.now() - startAt
    const elapsedSec = (elapsedMs / 1000).toFixed(1)
    logger.info(`⏱️ [${context}] 模型请求仍在处理中`, {
      elapsedMs,
      timeoutMs,
      scheduler: requestScheduler.snapshot(),
    })

    if (onProgress && Date.now() - lastProgressPush >= HEARTBEAT_PROGRESS_INTERVAL_MS) {
      lastProgressPush = Date.now()
      onProgress({
        stage: context,
        status: 'running',
        message: `⏳ 模型处理中...（已等待 ${elapsedSec}s）`,
      })
    }
  }, HEARTBEAT_INTERVAL_MS)

  return () => clearInterval(timer)
}

function normalizeError(error, { context, timeoutMs, managedSignal }) {
  if (managedSignal?.isTimedOut()) {
    const timeoutError = new Error(`LLM invoke timeout after ${timeoutMs}ms [${context}]`)
    timeoutError.code = 'MODEL_REQUEST_TIMEOUT'
    timeoutError.cause = error
    return timeoutError
  }

  if (managedSignal?.isParentAborted() || isAbortLikeError(error)) {
    const abortError = error instanceof Error ? error : new Error(String(error || '请求已取消'))
    abortError.code = abortError.code || 'MODEL_REQUEST_ABORTED'
    return abortError
  }

  return error instanceof Error ? error : new Error(String(error || '未知模型请求错误'))
}

export async function executeModelRequest(options = {}) {
  const {
    context = 'unknown',
    provider = 'unknown',
    model = 'unknown',
    signal,
    onProgress,
    operation,
  } = options

  if (typeof operation !== 'function') {
    throw new Error('executeModelRequest 缺少 operation 函数')
  }

  const policy = resolveRequestPolicy(options)
  const totalStartedAt = Date.now()
  let queueWaitMs = 0
  let executionStartedAt = null
  let release = null

  try {
    const grant = await requestScheduler.acquire(
      policy.requestConcurrency,
      { context, provider, model },
      { signal, queueTimeoutMs: policy.requestQueueTimeoutMs },
    )
    queueWaitMs = grant.queueWaitMs
    release = grant.release
    executionStartedAt = Date.now()

    logger.info(`📥 [${context}] 模型请求获得执行槽位`, {
      queueWaitMs,
      requestQueueTimeoutMs: policy.requestQueueTimeoutMs,
      scheduler: requestScheduler.snapshot(),
    })

    let lastError = null

    for (let attempt = 0; attempt <= policy.requestMaxRetries; attempt += 1) {
      const heartbeatStop = startHeartbeat({
        context,
        timeoutMs: policy.requestTimeoutMs,
        onProgress,
      })
      const managedSignal = createManagedSignal(signal, policy.requestTimeoutMs, context)
      const startedAt = Date.now()

      try {
        logger.info(`🚀 [${context}] 发起模型请求`, {
          attempt: attempt + 1,
          maxRetries: policy.requestMaxRetries,
          provider,
          model,
          policy,
          scheduler: requestScheduler.snapshot(),
        })

        const response = await operation({
          signal: managedSignal.signal,
          attempt: attempt + 1,
          requestPolicy: policy,
        })

        const usage = coerceLLMUsage(response)
        const attemptExecutionMs = Date.now() - startedAt
        logger.info(`✅ [${context}] 模型请求完成`, {
          attempt: attempt + 1,
          queueWaitMs,
          attemptExecutionMs,
          executionMs: Date.now() - executionStartedAt,
          totalMs: Date.now() - totalStartedAt,
          provider,
          model,
          usage,
        })

        heartbeatStop()
        managedSignal.cleanup()
        return response
      } catch (error) {
        heartbeatStop()
        managedSignal.cleanup()

        const normalizedError = normalizeError(error, {
          context,
          timeoutMs: policy.requestTimeoutMs,
          managedSignal,
        })
        const timedOut = managedSignal.isTimedOut()
        const aborted = managedSignal.isParentAborted() || isAbortLikeError(normalizedError)
        const isLastAttempt = attempt >= policy.requestMaxRetries
        const retryable = isRetryableError(normalizedError, timedOut)

        if (timedOut) requestScheduler.stats.totalTimedOut += 1
        if (aborted) requestScheduler.stats.totalAborted += 1

        logger.warn(`⚠️ [${context}] 模型请求失败`, {
          attempt: attempt + 1,
          queueWaitMs,
          attemptExecutionMs: Date.now() - startedAt,
          executionMs: Date.now() - executionStartedAt,
          totalMs: Date.now() - totalStartedAt,
          timedOut,
          aborted,
          retryable,
          isLastAttempt,
          error: normalizedError?.message,
        })

        if (aborted || !retryable || isLastAttempt) {
          requestScheduler.stats.totalFailed += 1
          throw normalizedError
        }

        requestScheduler.stats.totalRetried += 1
        lastError = normalizedError
        const waitMs = getRetryDelayMs(normalizedError, attempt)
        const waitSec = Math.max(1, Math.round(waitMs / 1000))

        onProgress?.({
          stage: context,
          status: 'warning',
          message: `⚠️ ${context} 请求失败，${waitSec}s 后进行第 ${attempt + 2} 次重试`,
        })

        await sleep(waitMs, signal)
      }
    }

    throw lastError || new Error(`模型请求失败 [${context}]`)
  } catch (error) {
    if (error?.code === 'MODEL_REQUEST_QUEUE_TIMEOUT') {
      requestScheduler.stats.totalTimedOut += 1
      requestScheduler.stats.totalFailed += 1
    } else if (error?.code === 'MODEL_REQUEST_QUEUE_ABORTED') {
      requestScheduler.stats.totalAborted += 1
      requestScheduler.stats.totalFailed += 1
    }

    if (error?.code === 'MODEL_REQUEST_QUEUE_TIMEOUT' || error?.code === 'MODEL_REQUEST_QUEUE_ABORTED') {
      logger.warn(`⚠️ [${context}] 模型请求未获得执行槽位`, {
        queueWaitMs: Date.now() - totalStartedAt,
        executionMs: 0,
        totalMs: Date.now() - totalStartedAt,
        error: error.message,
        code: error.code,
        scheduler: requestScheduler.snapshot(),
      })
    }
    throw error
  } finally {
    release?.()
  }
}

export async function invokeLangChainModel({
  llm,
  prompt,
  callOptions = {},
  ...options
}) {
  if (!llm || typeof llm.invoke !== 'function') {
    throw new Error('invokeLangChainModel 缺少可调用的 llm.invoke')
  }

  if (llm.__mvgoUnifiedInvokePatched) {
    return llm.invoke(prompt, {
      ...callOptions,
      __mvgoRequestOptions: {
        ...(callOptions.__mvgoRequestOptions || {}),
        ...options,
      },
    })
  }

  return executeModelRequest({
    ...options,
    operation: ({ signal }) => llm.invoke(prompt, { ...callOptions, signal }),
  })
}

export function attachUnifiedInvoke(llm, defaults = {}) {
  if (!llm || typeof llm.invoke !== 'function' || llm.__mvgoUnifiedInvokePatched) {
    return llm
  }

  const rawInvoke = llm.invoke.bind(llm)
  Object.defineProperty(llm, '__mvgoUnifiedInvokePatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  llm.invoke = async (prompt, callOptions = {}) => {
    const requestOptions = callOptions?.__mvgoRequestOptions || {}
    const langChainOptions = { ...(callOptions || {}) }
    delete langChainOptions.__mvgoRequestOptions

    return executeModelRequest({
      context: requestOptions.context || defaults.context || 'langchain-invoke',
      provider: requestOptions.provider || defaults.provider || 'langchain',
      model: requestOptions.model || defaults.model || llm.modelName || llm.model || 'unknown',
      requestConcurrency:
        requestOptions.requestConcurrency ?? defaults.requestConcurrency,
      requestQueueTimeoutMs:
        requestOptions.requestQueueTimeoutMs ?? defaults.requestQueueTimeoutMs,
      requestTimeoutMs:
        requestOptions.requestTimeoutMs ?? defaults.requestTimeoutMs,
      requestMaxRetries:
        requestOptions.requestMaxRetries ?? defaults.requestMaxRetries,
      signal: requestOptions.signal,
      onProgress: requestOptions.onProgress || defaults.onProgress,
      operation: ({ signal }) => rawInvoke(prompt, { ...langChainOptions, signal }),
    })
  }

  return llm
}

export default {
  attachUnifiedInvoke,
  executeModelRequest,
  getModelRequestStats,
  invokeLangChainModel,
  requestScheduler,
  resolveRequestPolicy,
}

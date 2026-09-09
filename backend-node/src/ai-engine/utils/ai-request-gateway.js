import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMUsage, estimateTokens } from './model-config.js'
import { getProviderPool } from './provider-pool.js'
import { dataDir } from '../../config/backend-root.js'
import { setSessionModel } from './session-model.js'

const logger = createLogger({ name: 'ai-request-gateway' })

const DEFAULT_REQUEST_POLICY = {
  requestConcurrency: 4,
  requestQueueTimeoutMs: 120000,
  requestTimeoutMs: 300000,
  requestMaxRetries: 1,
}

// 🆕 provider 特异故障状态码（2026-09-02 实锤 401 中途失效）：可重试 + 冷却换 provider。
// 401 鉴权失效 / 403 权限或内容策略 / 404 模型或端点不存在 —— 均可能「换一家就好」。
// 刻意排除 400/422/413（请求内容契约错误：任何 provider 都报同样错，应表面化真 bug）。
const AUTH_AVAILABILITY_STATUSES = new Set([401, 403, 404])

// Phase 7 #213：供应商限流重试参数
const RATE_LIMIT_MAX_WAIT_MS = 10 * 60 * 1000  // 最大等待 10 分钟
const RATE_LIMIT_JITTER_RATIO = 0.2            // ±20% 随机抖动

const CONFIG_FILE = join(dataDir, 'ai-config.json')
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

/**
 * 📊 从 LLM response 中提取模型信息（供业务日志使用）
 * @param {Object} response - LLM 响应对象
 * @returns {{ providerId: string, model: string, provider: string } | null}
 */
export function extractModelInfo(response) {
  if (!response || typeof response !== 'object') return null
  return response.__mvgoModelInfo || null
}

function isAbortLikeError(error) {
  const message = String(error?.message || '')
  return error?.name === 'AbortError' || /aborted|canceled|cancelled/i.test(message)
}

/**
 * 提取 LLM 响应的文本内容（兼容 string / {content:string} / {content:Array<{text}>} / AIMessage）。
 * 用于网关层空内容检测（treatEmptyAsFailure）。
 * @param {*} response
 * @returns {string}
 */
function extractLLMContentText(response) {
  if (response == null) return ''
  if (typeof response === 'string') return response
  if (typeof response.content === 'string') return response.content
  if (Array.isArray(response.content)) {
    return response.content
      .map((it) => {
        if (it && typeof it === 'object' && 'text' in it) return it.text || ''
        return typeof it === 'string' ? it : ''
      })
      .join('')
  }
  return ''
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
  // 🆕 provider 特异鉴权/存在性错误也按可重试处理（2026-09-02，mc-max-1788286853327-4a5afe85 实锤）：
  // OpenAI 兼容中转（code.newcli.com 等）在「账号额度受限 / token 中途失效 / 权限不足 /
  // 模型或端点不存在」时返回 401/403/404（正文如「用户信息验证失败」）。同一 token 任务内
  // 前 17 分钟全部成功、最后一个分块突 401 → 旧逻辑按致命错误直接 throw → 整任务失败、
  // 已生成的子组件全部浪费。401/403/404 是 **provider 特异故障**（换池内其他 provider 可能就好），
  // 纳入可重试后 catch 侧 recordTimeout 冷却该 provider（pick 排除 + 同 baseURL 域一并排除），
  // 下一次 attempt 走 qwen/deepseek/kimi，请求内容与 provider 无关，故障转移语义正确。
  // ⚠️ 刻意不含 400/422/413（请求内容契约错误：换任何 provider 都报同样错，
  // 应让真 bug 表面化而非靠切换掩盖）。
  if (typeof status === 'number' && AUTH_AVAILABILITY_STATUSES.has(status)) return true

  const code = String(error?.code || '')
  // 🆕 空内容也算可重试失败（treatEmptyAsFailure 场景）：网关层空串检测抛 MODEL_EMPTY_OUTPUT，
  // 走熔断 + 冷却 + 换 provider 重试（否则"成功空串 → 上层 empty_output 再重试"会双请求并发）。
  if (code === 'MODEL_EMPTY_OUTPUT') return true
  if (/ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN/.test(code)) {
    return true
  }

  const message = String(error?.message || '').toLowerCase()
  return /timeout|socket hang up|network error|temporarily unavailable/.test(message)
}

function getRetryDelayMs(error, attemptIndex) {
  const { is429, retryAfterSec } = detectRateLimit(error)
  let baseMs = 0
  if (is429) {
    // 优先使用 Retry-After header，兜底指数退避（最大 120s）
    baseMs = (retryAfterSec || Math.min(30 * Math.pow(2, attemptIndex), 120)) * 1000
  } else {
    // 普通 5xx/网络错误：指数退避（最大 10s）
    baseMs = Math.min(1000 * Math.pow(2, attemptIndex), 10000)
  }

  // Phase 7 #213：±20% 随机抖动，避免雷群效应
  const jitter = (Math.random() * 2 - 1) * RATE_LIMIT_JITTER_RATIO * baseMs
  const delayMs = Math.max(1000, Math.min(baseMs + jitter, RATE_LIMIT_MAX_WAIT_MS))

  return Math.round(delayMs)
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
      // 🔧 只发日志，不生成独立 stage：网关的子调用上下文（如 vision-agent.analyzeImage）
      // 不是用户级阶段，交由 sendProgress 内的 level:'log' 路由到日志通道，
      // 避免前端 timeline 出现僵尸 running 步骤与步骤膨胀。
      onProgress({
        level: 'log',
        logLevel: 'info',
        stage: context,
        context,
        status: 'running',
        elapsedSec,
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
    onRateLimited,
    operation,
    providerId = null,
    tokenEstimate = 0,
    // 🔀 每次 attempt 动态解析 provider（返回 { providerId, model, provider }）。
    // 用于「超时/失败 → 切换大模型」故障转移：第一次 provider 挂起后，下一次 attempt
    // 可解析出不同 provider，而不是复用同一 provider 连续撞墙。
    resolveAttempt = null,
  } = options

  if (typeof operation !== 'function') {
    throw new Error('executeModelRequest 缺少 operation 函数')
  }

  const policy = resolveRequestPolicy(options)
  const totalStartedAt = Date.now()
  let queueWaitMs = 0
  let executionStartedAt = null
  let release = null

  // Phase 7 #213：在重试循环中持有 release 引用，支持 429 时释放再重新获取
  let activeRelease = null

  // 上一次 attempt 实际使用的 providerId（供 resolveAttempt 排除刚失败的 provider）
  let previousProviderId = null

  // 🔀 解析本次 attempt 的 provider 上下文（含熔断/令牌桶对应的 providerEntry）。
  // 熔断记账、令牌桶控速、日志全部绑定「本次 attempt 实际使用的 provider」，
  // 不再绑定 Agent 构造时的初始 providerId（避免 provider 切换后记账错位到 __primary__）。
  const resolveProviderContext = async (attempt) => {
    let pid = providerId
    let mdl = model
    let pvd = provider
    if (typeof resolveAttempt === 'function') {
      // 🔧 修复：传入 context 给 resolveAttempt，避免闭包内的 defaults.context 继承式泄露
      // （子类 vue3-engineer 继承父类 llm 时，defaults.context 仍是 'microcode-engineer'）
      const resolved = await resolveAttempt({ attempt, previousProviderId, context })
      if (resolved) {
        pid = resolved.providerId ?? providerId
        mdl = resolved.model || model
        pvd = resolved.provider || provider
      }
    }
    const entry = pid
      ? getProviderPool().get(pid)
      : getProviderPool().pick()
    return { providerId: pid, model: mdl, provider: pvd, entry }
  }

  try {
    const grant = await requestScheduler.acquire(
      policy.requestConcurrency,
      { context, provider, model },
      { signal, queueTimeoutMs: policy.requestQueueTimeoutMs },
    )
    queueWaitMs = grant.queueWaitMs
    release = grant.release
    activeRelease = grant.release
    executionStartedAt = Date.now()

    logger.info(`📥 [${context}] 模型请求获得执行槽位`, {
      queueWaitMs,
      requestQueueTimeoutMs: policy.requestQueueTimeoutMs,
      scheduler: requestScheduler.snapshot(),
    })

    let lastError = null

    for (let attempt = 0; attempt <= policy.requestMaxRetries; attempt += 1) {
      const ctx = await resolveProviderContext(attempt)
      const providerEntry = ctx.entry

      // 主动控速：熔断检查 + 令牌桶（绑定当次实际 provider）。
      // 熔断(beforeCall)会等待 cooldown；切换 provider 后此处自然落到新 provider 的桶/熔断器。
      if (providerEntry) {
        await providerEntry.breaker.beforeCall({ signal })
        await providerEntry.rpmBucket.acquire(1, { signal })
        await providerEntry.tpmBucket.acquire(tokenEstimate, { signal })
      }

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
          provider: ctx.provider,
          model: ctx.model,
          providerId: ctx.providerId,
          policy,
          scheduler: requestScheduler.snapshot(),
        })

        const response = await operation({
          signal: managedSignal.signal,
          attempt: attempt + 1,
          requestPolicy: policy,
          providerId: ctx.providerId,
          model: ctx.model,
        })

        // 🔀 空内容当失败（2026-08-27 #273 模型优先级加固）：
        // LLM「成功返回但内容为空」= 服务端故障/限流（日志实证：deepseek 域 292s 后返回空串被当成功，
        // 上层再触发 empty_output 重试 → 同一块超时重试 + 空串重试双请求并发）。
        // 在网关层直接判失败：熔断 + 冷却 + attempt 循环内换 provider（排除同故障域），
        // 上层不再需要"成功空串 → empty_output 重试"这条双重路径。
        if (options.treatEmptyAsFailure === true) {
          const text = extractLLMContentText(response)
          if (typeof text === 'string' && text.trim() === '') {
            const emptyErr = new Error(`LLM 返回空内容 [${context}]`)
            emptyErr.code = 'MODEL_EMPTY_OUTPUT'
            if (ctx.providerId) getProviderPool().recordTimeout(ctx.providerId)
            // 📊 空输出根因遥测（2026-09-04）：finish_reason + reasoning_tokens 直接区分两类根因——
            //   ① finish_reason='length' + reasoning_tokens 高 = 推理模型烧光输出预算
            //     （deepseek 系未配 thinkingType:'disabled' 的典型症状，治本=配置关推理）；
            //   ② finish_reason='stop' + 全零 = 服务端故障/限流静默。
            const finishReason =
              response?.response_metadata?.finish_reason ||
              response?.response_metadata?.finishReason ||
              ''
            const reasoningTokens =
              response?.usage_metadata?.output_token_details?.reasoning ??
              response?.response_metadata?.usage?.completion_tokens_details?.reasoning_tokens ??
              null
            const outputTokens =
              response?.usage_metadata?.output_tokens ??
              response?.response_metadata?.usage?.completion_tokens ??
              null
            // 🛡️ 空输出快速失败：finish_reason='length'（预算耗尽截断）是确定性故障——
            // 该 provider 对同类请求必复现，立即多记 1 次熔断（连同 catch 侧共 2 次 =
            // failureThreshold → 立即 open 120s），后续 chunk 不再逐块踩同一颗雷
            // （mc-max-1788454414712 实证：同 provider 空输出逐块复现，整任务拖慢 28+ 分钟）。
            const budgetExhausted = finishReason === 'length'
            if (budgetExhausted && providerEntry) {
              providerEntry.breaker.recordFailure()
            }
            // 判读三分支（2026-09-04 按实测遥测修正）：
            //  ① length + reasoningTokens>0：推理烧预算（deepseek 系 → thinkingType:disabled）
            //  ② length + reasoningTokens=0/null 但 outputTokens 大：minimax 系推理占 output
            //     预算但不单独上报（或内容落 reasoning_content 字段）——thinking 参数对
            //     lkeap/minimax 网关会 400，不能同款修，靠熔断换 provider
            //  ③ 其他：服务端故障/限流静默
            const hint = budgetExhausted
              ? (reasoningTokens ?? 0) > 0
                ? '推理烧光输出预算：deepseek 系请配 thinkingType:disabled；已立即熔断该 provider'
                : '输出预算耗尽但 reasoning 未上报：minimax 系推理占 output 预算（thinking 参数不兼容，靠熔断换 provider），或内容落 reasoning_content 字段'
              : '空内容根因未知：若为 deepseek 系请检查 thinkingType 配置'
            logger.warn('🔀 网关层检测到空内容，按失败处理（熔断+换provider重试）', {
              context,
              providerId: ctx.providerId,
              model: ctx.model,
              attempt: attempt + 1,
              finishReason: finishReason || 'unknown',
              reasoningTokens,
              outputTokens,
              budgetExhausted,
              hint,
            })
            throw emptyErr
          }
        }

        const usage = coerceLLMUsage(response)
        const attemptExecutionMs = Date.now() - startedAt
        logger.info(`✅ [${context}] 模型请求完成`, {
          attempt: attempt + 1,
          queueWaitMs,
          attemptExecutionMs,
          executionMs: Date.now() - executionStartedAt,
          totalMs: Date.now() - totalStartedAt,
          provider: ctx.provider,
          model: ctx.model,
          providerId: ctx.providerId,
          usage,
        })

        // 熔断器：请求成功即闭合（绑定实际 provider）
        if (providerEntry) providerEntry.breaker.recordSuccess()

        // 🆕 S2 耗时画像：成功耗时样本（供动态超时）
        if (ctx.providerId) getProviderPool().recordLatency(ctx.providerId, attemptExecutionMs, true)

        // 🔀 把本次实际 providerId 挂到 response（非枚举），供上层"空串换 provider"读取。
        // 空串不是异常（不会走 catch 换 provider），需上层拿到 providerId 后记入冷却名单。
        // 📊 同时附加完整模型信息（providerId + model + provider），供业务模块日志使用。
        if (response && typeof response === 'object' && ctx.providerId) {
          try {
            Object.defineProperty(response, '__mvgoProviderId', {
              value: ctx.providerId, enumerable: false, writable: true, configurable: true,
            })
            // 📊 扩展：携带完整模型信息，业务日志可直接读取
            Object.defineProperty(response, '__mvgoModelInfo', {
              value: {
                providerId: ctx.providerId,
                model: ctx.model,
                provider: ctx.provider,
              },
              enumerable: false,
              writable: true,
              configurable: true,
            })
            // 📊 登记「会话 → 当前模型」，供日志渲染 [model] 标签
            if (options.sessionId) setSessionModel(options.sessionId, ctx.model)
          } catch { /* response 可能 frozen，忽略，不影响主流程 */ }
        }

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
        // 🛡️ 超时 ≠ 主动取消（2026-09-02，claude-opus-4-8 挂起实锤）：managedSignal 超时靠
        // AbortController.abort() 触发，operation 抛 AbortError，被 isAbortLikeError 误判为
        // 「用户主动取消」→ aborted=true → 直接 throw，绕过「超时→重试→resolveAttempt 切换备用
        // 模型」路径（Layout Reviewer/Style Mapper 挂起 150s 直接失败、不切 deepseek 的根因）。
        // 修复：timedOut 时排除 abort 判定，让超时按「可重试超时」走重试切换，而非按取消直接抛。
        // 仅「父 signal 真正取消」（用户中止任务）才仍判 aborted 直接 throw。
        const aborted = managedSignal.isParentAborted() || (isAbortLikeError(normalizedError) && !timedOut)
        const isLastAttempt = attempt >= policy.requestMaxRetries
        const retryable = isRetryableError(normalizedError, timedOut)
        const { is429, retryAfterSec } = detectRateLimit(normalizedError)

        // 熔断计数：非 429、非取消的可重试失败（5xx/网络错误/超时）记入。
        // 429 是限流不是 provider 故障，交给令牌桶 + 退避处理，不触发熔断。
        // 超时同样计入：模型/网关长时间挂起 = 该 provider 当前不可用，
        // 连续超时应触发熔断并降级备用（否则主 provider 挂起时重试永远撞同一面墙）。
        // 🔀 绑定「本次 attempt 实际使用的 provider」而非构造时初始 providerId。
        if (providerEntry && retryable && !is429 && !aborted) {
          providerEntry.breaker.recordFailure()
        }

        // 🔀 跨 chunk 超时记忆：记录超时 provider，后续 pick 时排除（60s 内不再选择）
        // 解决：resolveAttempt 只在单次调用重试链中生效，新 chunk 重置 excludeIds 的问题
        if (timedOut && ctx.providerId) {
          getProviderPool().recordTimeout(ctx.providerId)
        }

        // 🔀 401/403/404 故障域冷却（2026-09-02）：死密钥/额度受限/权限/模型缺失的 provider
        // 记入冷却集，下一次 attempt 的 pool pick（含同 baseURL 域排除）将避开它，换池内其他
        // provider。对应状态码已纳入 isRetryableError，这里必须在 throw 前完成记账，
        // 否则重试会再撞同一面墙。
        const errStatus = normalizedError?.response?.status || normalizedError?.status
        if (AUTH_AVAILABILITY_STATUSES.has(errStatus) && ctx.providerId) {
          getProviderPool().recordTimeout(ctx.providerId)
        }

        // 🆕 S2 耗时画像：失败/超时耗时样本（供动态超时 + 成功率统计）
        if (ctx.providerId) {
          getProviderPool().recordLatency(ctx.providerId, Date.now() - startedAt, false)
        }

        if (timedOut) requestScheduler.stats.totalTimedOut += 1
        if (aborted) requestScheduler.stats.totalAborted += 1

        // 🔀 记录本次失败的 providerId，供下一次 attempt 的 resolveAttempt 排除
        if (ctx.providerId) previousProviderId = ctx.providerId

        logger.warn(`⚠️ [${context}] 模型请求失败`, {
          attempt: attempt + 1,
          queueWaitMs,
          attemptExecutionMs: Date.now() - startedAt,
          executionMs: Date.now() - executionStartedAt,
          totalMs: Date.now() - totalStartedAt,
          providerId: ctx.providerId,
          provider: ctx.provider,
          model: ctx.model,
          timedOut,
          aborted,
          retryable,
          is429,
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
        const nextRetryAt = Date.now() + waitMs

        // Phase 7 #213：429 限流时释放并发槽位，让其他任务顶上
        if (is429 && activeRelease) {
          logger.info(`🔄 [${context}] 供应商限流，释放槽位等待 ${waitSec}s 后重试`, {
            provider: ctx.provider,
            model: ctx.model,
            providerId: ctx.providerId,
            attempt: attempt + 1,
            retryAfterSec: retryAfterSec || 'none',
            retryAfterMs: waitMs,
            nextRetryAt: new Date(nextRetryAt).toISOString(),
            scheduler: requestScheduler.snapshot(),
          })
          activeRelease()
          activeRelease = null
        } else {
          logger.info(`⏳ [${context}] 等待 ${waitSec}s 后进行第 ${attempt + 2} 次重试`, {
            provider: ctx.provider,
            model: ctx.model,
            providerId: ctx.providerId,
            attempt: attempt + 1,
            retryAfterMs: waitMs,
            nextRetryAt: new Date(nextRetryAt).toISOString(),
          })
        }

        // 🔧 子调用级瞬时通知（重试预警）：走日志通道，不生成独立 timeline 步骤
        onProgress?.({
          level: 'log',
          logLevel: 'warn',
          stage: context,
          context,
          status: 'warning',
          message: `⚠️ ${context} 请求失败，${waitSec}s 后进行第 ${attempt + 2} 次重试`,
        })

        // Phase 7 #213：通知上层（更新 Task 状态为 retry_scheduled）
        if (is429 && onRateLimited) {
          try {
            onRateLimited({
              provider: ctx.provider,
              model: ctx.model,
              providerId: ctx.providerId,
              attempt: attempt + 1,
              retryAfterSec: retryAfterSec || waitSec,
              retryAfterMs: waitMs,
              nextRetryAt,
              error: normalizedError?.message,
            })
          } catch (cbErr) {
            logger.warn(`onRateLimited 回调异常: ${cbErr?.message}`)
          }
        }

        // 等待（429 期间已释放槽位，不阻塞并发）
        await sleep(waitMs, signal)

        // Phase 7 #213：429 限流等待后重新获取槽位
        if (is429 && !activeRelease) {
          logger.info(`🔄 [${context}] 限流等待结束，重新获取执行槽位`, {
            provider: ctx.provider,
            model: ctx.model,
            providerId: ctx.providerId,
            attempt: attempt + 2,
            scheduler: requestScheduler.snapshot(),
          })

          const reGrant = await requestScheduler.acquire(
            policy.requestConcurrency,
            { context, provider: ctx.provider, model: ctx.model },
            { signal, queueTimeoutMs: policy.requestQueueTimeoutMs },
          )
          activeRelease = reGrant.release
          queueWaitMs += reGrant.queueWaitMs
          executionStartedAt = Date.now()

          // 🔧 子调用级瞬时通知（限流恢复）：走日志通道，不生成独立 timeline 步骤
          onProgress?.({
            level: 'log',
            logLevel: 'info',
            stage: context,
            context,
            status: 'info',
            message: `🔄 ${context} 限流等待结束，已重新获取执行槽位，开始第 ${attempt + 2} 次尝试`,
          })
        }
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
    // Phase 7 #213：确保最终释放槽位（activeRelease 或 release 至少有一个）
    release?.()
    if (activeRelease && activeRelease !== release) {
      activeRelease()
    }
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
    providerId: options.providerId ?? null,
    tokenEstimate:
      options.tokenEstimate ??
      estimateTokens(prompt, llm?.maxTokens ?? llm?.max_tokens ?? 0),
    operation: ({ signal }) => llm.invoke(prompt, { ...callOptions, signal }),
  })
}

export function attachUnifiedInvoke(llm, defaults = {}) {
  if (!llm || typeof llm.invoke !== 'function' || llm.__mvgoUnifiedInvokePatched) {
    return llm
  }

  let rawInvoke = llm.invoke.bind(llm)
  let boundSnapshot = null

  // 🔀 每次 attempt 动态解析 provider：pick 供应商池 → 重建 llm → 返回实际 provider 上下文。
  // 与 executeModelRequest 的 resolveAttempt 契约对接：
  //   首次超时后，下一次 attempt 会带上 previousProviderId，pick 时排除该 provider，实现故障转移。
  // 这修复了「weighted-spread 只在顶层 invoke 前选一次、网关内部 retry 不重新 pick」的问题：
  //   同一请求超时后，第二次尝试会切到备用大模型，而不是再等同一个 provider 180 秒。
  // 🔧 修复日志前缀继承式泄露：resolveAttempt 接受 context 参数，优先使用调用方传入的 context，
  //   避免子类（如 vue3-engineer）继承父类 llm 实例时日志误显示父类名 [microcode-engineer]。
  const resolveAttempt = async ({ previousProviderId, context: currentContext } = {}) => {
    if (typeof defaults.refreshProvider !== 'function' || typeof defaults.createLLM !== 'function') {
      return null // 未启用动态切换（向后兼容）
    }
    const fresh = defaults.refreshProvider(
      previousProviderId ? { excludeIds: [previousProviderId] } : {},
    )
    if (!fresh || !fresh.apiKey) return null

    // provider 未变化时复用已绑定的 rawInvoke，避免无谓重建
    const sameProvider = boundSnapshot && boundSnapshot.providerId === fresh.providerId
    if (!sameProvider) {
      const rebuilt = defaults.createLLM(fresh)
      if (!rebuilt || typeof rebuilt.invoke !== 'function') return null
      boundSnapshot = { providerId: fresh.providerId, baseURL: fresh.baseURL, model: fresh.model }
      rawInvoke = rebuilt.invoke.bind(rebuilt)
    }

    // 🔧 优先使用调用方传入的 context，避免闭包 defaults.context 的继承式泄露
    const agentName = currentContext || defaults.context || 'langchain-invoke'
    const modelName = fresh.model || defaults.model
    logger.info(`🔀 [${agentName}] provider 已就绪`, {
      to: fresh.providerId,
      model: modelName,
      baseURL: fresh.baseURL,
      excludeIds: previousProviderId ? [previousProviderId] : [],
    })
    // 推送模型使用信息到前端（每次切换时）
    if (typeof defaults.onProgress === 'function') {
      defaults.onProgress({
        stage: agentName,
        message: `🤖 模型: ${modelName}`,
        status: 'running',
        meta: {
          type: 'agent-model',
          agent: agentName,
          model: modelName,
          providerId: fresh.providerId,
        },
      })
    }

    const providerLabel =
      fresh.providerType === 'anthropic'
        ? 'anthropic'
        : fresh.providerType === 'openai-compatible'
          ? 'openai-compatible'
          : defaults.provider || 'langchain'

    return {
      providerId: fresh.providerId,
      model: modelName,
      provider: providerLabel,
    }
  }

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
      providerId: requestOptions.providerId ?? defaults.providerId ?? null,
      tokenEstimate:
        requestOptions.tokenEstimate ??
        estimateTokens(prompt, llm?.maxTokens ?? llm?.max_tokens ?? defaults.maxTokens ?? 0),
      signal: requestOptions.signal,
      onProgress: requestOptions.onProgress || defaults.onProgress,
      onRateLimited: requestOptions.onRateLimited || defaults.onRateLimited,
      // 🔀 空内容当失败（分块生成等场景）：网关层检测空串并换 provider 重试，避免上层 empty_output 双路径
      treatEmptyAsFailure: requestOptions.treatEmptyAsFailure ?? defaults.treatEmptyAsFailure,
      // 🔀 每次 attempt 动态 pick provider（超时/失败后切换到备用大模型）
      resolveAttempt,
      operation: ({ signal }) => rawInvoke(prompt, { ...langChainOptions, signal }),
    }).then((response) => {
      // 📊 登记「会话 → 当前模型」：供 progress.service.sendLog 自动附加到 meta.model，
      // 前端日志即可渲染 [model] 标签。defaults.sessionId 由 BaseAgent 透传。
      try {
        const info = response?.__mvgoModelInfo
        if (info?.model) {
          setSessionModel(defaults.sessionId || requestOptions.sessionId, info.model)
        }
      } catch { /* 不影响主流程 */ }
      return response
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

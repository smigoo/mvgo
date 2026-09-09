/**
 * 通用令牌桶限流器（RPM / TPM 双维复用）
 *
 * 解决痛点：单一大模型 API 请求频繁时，仅限「并发数」无法约束「每分钟请求数(RPM)」
 * 与「每分钟 Token 数(TPM)」，导致反复撞 429。令牌桶在请求发出前主动控速，
 * 让请求排队等待令牌，而不是打出去再被限流。
 *
 * 设计：
 *  - capacity=0 或 refillPerSec=0 时视为「未启用」，acquire 直接放行（不配置即零影响）。
 *  - acquire 循环内先 refill 再检查，采用 250ms 轮询 + 随机抖动，避免长 sleep 阻塞事件循环，
 *    同时抖动避免多个等待者同步醒来形成雷群。
 *  - 支持 AbortSignal，任务取消时立即中断等待。
 *
 * 用法：
 *   const rpm = new TokenBucket({ capacity: 60, refillPerSec: 1 })      // 60 RPM
 *   const tpm = new TokenBucket({ capacity: 100000, refillPerSec: 1666 }) // 100k TPM
 *   await rpm.acquire(1, { signal })
 *   await tpm.acquire(estTokens, { signal })
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'rate-limit-bucket' })

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      cleanup()
      reject(signal?.reason || new Error('令牌桶等待已取消'))
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (signal) {
      if (signal.aborted) {
        cleanup()
        reject(signal.reason || new Error('令牌桶等待已取消'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export class TokenBucket {
  constructor({ capacity = 0, refillPerSec = 0, name = 'bucket' } = {}) {
    this.capacity = Number(capacity) || 0
    this.tokens = this.capacity
    this.refillPerSec = Number(refillPerSec) || 0
    this.name = name
    this._lastRefill = Date.now()
    this._waiters = 0
    this._stats = { total: 0, throttled: 0 }
  }

  /** 是否启用限流：capacity 与 refillPerSec 均 > 0 才生效 */
  get enabled() {
    return this.capacity > 0 && this.refillPerSec > 0
  }

  _refill() {
    if (!this.enabled) return
    const now = Date.now()
    const elapsedSec = (now - this._lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec)
    this._lastRefill = now
  }

  /**
   * 获取 tokens 个令牌，不足则等待补充。
   * @param {number} tokens 需要的令牌数
   * @param {{signal?: AbortSignal}} [options]
   */
  async acquire(tokens = 1, { signal } = {}) {
    const need = Math.max(0, Number(tokens) || 0)
    if (!this.enabled || need <= 0) return
    this._stats.total++

    while (true) {
      this._refill()
      if (this.tokens >= need) {
        this.tokens -= need
        return
      }
      this._stats.throttled++
      this._waiters++
      const waitMs = Math.ceil(((need - this.tokens) / this.refillPerSec) * 1000)
      const sleepMs = Math.min(Math.max(waitMs, 10), 250) + Math.floor(Math.random() * 50)
      await sleep(sleepMs, signal)
      this._waiters = Math.max(0, this._waiters - 1)
    }
  }

  /**
   * 非阻塞查询：当前是否有足够令牌（不扣减，仅试探）。
   * 未启用限流（capacity 或 refillPerSec 为 0）时恒返回 true（不限制）。
   * 供供应商池 pick() 做「主 provider 是否超限」的降级判断。
   */
  canAcquire(tokens = 1) {
    if (!this.enabled) return true
    this._refill()
    return this.tokens >= tokens
  }

  snapshot() {
    this._refill()
    return {
      name: this.name,
      enabled: this.enabled,
      capacity: this.capacity,
      tokens: Math.round(this.tokens),
      waiters: this._waiters,
      ...this._stats,
    }
  }
}

export default { TokenBucket }

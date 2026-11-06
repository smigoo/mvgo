/**
 * 三态熔断器（closed → open → halfOpen）
 *
 * 解决痛点：单一 provider 连续 5xx / 网络错误时，若每个请求仍各自重试，
 * 会把失败放大、拖垮整个生成链路。熔断器在连续失败达到阈值后「打开」，
 * 冷却期内不再发请求，冷却结束放一个「试探请求」验证 provider 是否恢复。
 *
 * 语义约定（重要）：
 *  - 429 限流不记入熔断计数（provider 活着，只是被限流，走令牌桶 + 退避）。
 *  - 只有 5xx / 网络错误等「provider 可能挂了」的失败才 recordFailure。
 *
 * 参数：
 *  - failureThreshold：连续失败 N 次进入 open（=0 时禁用熔断，零影响）
 *  - cooldownMs：open 冷却时长，到期转 halfOpen
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'circuit-breaker' })

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      cleanup()
      reject(signal?.reason || new Error('熔断冷却等待已取消'))
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (signal) {
      if (signal.aborted) {
        cleanup()
        reject(signal.reason || new Error('熔断冷却等待已取消'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export class CircuitBreaker {
  constructor({ failureThreshold = 0, cooldownMs = 30000, name = 'breaker' } = {}) {
    this.failureThreshold = Number(failureThreshold) || 0
    this.cooldownMs = Number(cooldownMs) || 30000
    this.name = name
    this.state = 'closed' // closed | open | halfOpen
    this._failCount = 0
    this._openedAt = 0
  }

  /** 是否启用熔断：failureThreshold > 0 */
  get enabled() {
    return this.failureThreshold > 0
  }

  /**
   * 调用前：若 open 且仍在冷却期则等待冷却；冷却到期转 halfOpen（放行一个试探请求）。
   */
  async beforeCall({ signal } = {}) {
    if (!this.enabled) return
    if (this.state === 'open') {
      const remainMs = this.cooldownMs - (Date.now() - this._openedAt)
      if (remainMs > 0) {
        logger.warn(`⛔ 熔断器[${this.name}]已打开，等待冷却 ${Math.ceil(remainMs / 1000)}s`)
        await sleep(remainMs, signal)
      }
      this.state = 'halfOpen'
    }
  }

  /** 请求成功：闭合熔断器，清零失败计数 */
  recordSuccess() {
    if (!this.enabled) return
    if (this.state !== 'closed') {
      logger.info(`✅ 熔断器[${this.name}]恢复闭合`)
    }
    this.state = 'closed'
    this._failCount = 0
  }

  /** 请求失败（仅 5xx/网络错误调用，429 勿调）：累加失败，达阈值则打开 */
  recordFailure() {
    if (!this.enabled) return
    this._failCount += 1
    if (this._failCount >= this.failureThreshold || this.state === 'halfOpen') {
      this.state = 'open'
      this._openedAt = Date.now()
      logger.warn(`🔴 熔断器[${this.name}]连续失败 ${this._failCount} 次，进入熔断冷却 ${this.cooldownMs / 1000}s`)
    }
  }

  snapshot() {
    return {
      name: this.name,
      enabled: this.enabled,
      state: this.state,
      failCount: this._failCount,
      cooldownRemainingMs: this.state === 'open'
        ? Math.max(0, this.cooldownMs - (Date.now() - this._openedAt))
        : 0,
    }
  }
}

export default { CircuitBreaker }

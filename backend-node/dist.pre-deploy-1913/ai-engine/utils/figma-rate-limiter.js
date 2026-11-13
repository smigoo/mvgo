/**
 * Figma API 全局速率限制器（令牌桶 + 429 全局冷却）
 *
 * 解决痛点：生成组件时 Figma API 频繁 429，且并行生成多个组件会各自独立重试，
 * 重试放大请求量 → token 被持续限流甚至封禁。
 *
 * 设计：
 *  - 进程级单例（跨所有 FigmaConnector / FigmaClient 实例共享），才能真正限制「全局」频率。
 *  - 最小请求间隔（minIntervalMs）：两次 Figma 请求之间至少间隔 N ms。
 *  - 最大并发（maxConcurrency）：同时进行中的 Figma 请求数上限。
 *  - 429 全局冷却（cooldown）：一旦任意请求撞 429，整个进程进入冷却期
 *    （cooldownUntil = now + max(Retry-After, base) 封顶 max），冷却期内所有请求排队等待。
 *    避免「一个 429、其他请求继续打、token 越封越死」的雪崩。
 *
 * 参数可用环境变量覆盖（无需改代码即可调强度）：
 *  - FIGMA_MIN_INTERVAL_MS    默认 7000（≈8.5/min，留余量于 Figma Tier1 的 10/min 硬限）
 *  - FIGMA_MAX_CONCURRENCY    默认 2（与任务并发 MAX_CONCURRENT=2 对齐，允许 2 个 Figma 任务并行）
 *  - FIGMA_COOLDOWN_BASE_SEC  默认 60（429 冷却基础秒数，足够让桶回血）
 *  - FIGMA_COOLDOWN_MAX_SEC   默认 120（429 冷却封顶秒数）
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'figma-rate-limiter' })

class FigmaRateLimiter {
  constructor(opts = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? Number(process.env.FIGMA_MIN_INTERVAL_MS ?? 7000)
    this.maxConcurrency = opts.maxConcurrency ?? Number(process.env.FIGMA_MAX_CONCURRENCY ?? 2)
    this.cooldownBaseSec = opts.cooldownBaseSec ?? Number(process.env.FIGMA_COOLDOWN_BASE_SEC ?? 60)
    this.cooldownMaxSec = opts.cooldownMaxSec ?? Number(process.env.FIGMA_COOLDOWN_MAX_SEC ?? 120)

    this._lastRequestTime = 0
    this._active = 0
    this._cooldownUntil = 0
    this._waiters = 0
    this._lastGrantAt = 0
    this._stats = { total: 0, throttled: 0, cooled: 0, rateLimited: 0 }

    logger.info('Figma 速率限制器已初始化', {
      minIntervalMs: this.minIntervalMs,
      maxConcurrency: this.maxConcurrency,
      cooldownBaseSec: this.cooldownBaseSec,
      cooldownMaxSec: this.cooldownMaxSec
    })
  }

  _now() {
    return Date.now()
  }

  get cooldownRemainingMs() {
    return Math.max(0, this._cooldownUntil - this._now())
  }

  /**
   * 通知遭遇 429，进入全局冷却。所有后续请求会排队到冷却结束。
   * @param {number|null} retryAfterSec - Figma 响应头 Retry-After（秒），可为空
   */
  noteRateLimited(retryAfterSec = null) {
    let cooldownSec = this.cooldownBaseSec
    if (retryAfterSec && !isNaN(retryAfterSec)) {
      cooldownSec = Math.max(this.cooldownBaseSec, Math.min(retryAfterSec, this.cooldownMaxSec))
    }
    const until = this._now() + cooldownSec * 1000
    if (until > this._cooldownUntil) {
      this._cooldownUntil = until
    }
    this._stats.cooled++
    this._stats.rateLimited++
    const remainSec = Math.ceil(this.cooldownRemainingMs / 1000)
    logger.warn(`🔴 Figma 触发限流冷却：${cooldownSec}s（全局暂停请求，剩余 ${remainSec}s）`)
  }

  /**
   * 获取一个发送许可。内部循环等待，直到满足：
   *   - 全局冷却已结束
   *   - 距上次请求已超过 minIntervalMs
   *   - 当前并发未超 maxConcurrency
   * 返回 release() 函数，调用方在请求完成后必须调用以释放并发槽。
   *
   * @param {number} [timeoutMs=20000] 总等待上限（含冷却+间隔+并发槽）。
   *   默认 20s，避免上游 nginx 60s 超时先把请求砍成 504。超时抛错，调用方应捕获并给用户友好提示。
   */
  async acquire(timeoutMs = 20000) {
    this._stats.total++
    const startedAt = this._now()
    // 循环评估，直到可放行。使用 250ms 轮询 + 抖动，避免长 sleep 阻塞事件循环。
    while (true) {
      const elapsed = this._now() - startedAt
      if (elapsed >= timeoutMs) {
        this._stats.throttled++
        const remainSec = Math.ceil(this.cooldownRemainingMs / 1000)
        throw new Error(
          `Figma 限流器等待超时（已等 ${Math.round(elapsed / 1000)}s，` +
          `冷却剩余 ${remainSec}s，活跃 ${this._active}/${this.maxConcurrency}）`
        )
      }
      const now = this._now()
      // 🛑 泄漏自愈：持槽超过 5 分钟必为泄漏（单请求 timeout 远小于此），
      // 强制清零避免并发槽永久占死拖垮所有后续请求。
      if (this._active > 0 && this._lastGrantAt > 0 && now - this._lastGrantAt > 5 * 60 * 1000) {
        logger.warn(`🔴 检测到限流器并发槽泄漏（活跃 ${this._active} 持续超过 5 分钟），强制重置`)
        this._active = 0
      }
      const cooldownWait = this._cooldownUntil - now
      const intervalWait = (this._lastRequestTime + this.minIntervalMs) - now
      const canRun = cooldownWait <= 0 && intervalWait <= 0 && this._active < this.maxConcurrency
      if (canRun) {
        this._lastRequestTime = now
        this._lastGrantAt = now
        this._active++
        return () => this._release()
      }
      this._stats.throttled++
      this._waiters++
      const waitMs = Math.max(cooldownWait, intervalWait, 0)
      const sleepMs = Math.min(waitMs, 250) + Math.floor(Math.random() * 50)
      await new Promise(resolve => setTimeout(resolve, sleepMs))
      this._waiters = Math.max(0, this._waiters - 1)
    }
  }

  _release() {
    this._active = Math.max(0, this._active - 1)
  }

  getStats() {
    return {
      ...this._stats,
      active: this._active,
      waiters: this._waiters,
      cooldownRemainingSec: Math.ceil(this.cooldownRemainingMs / 1000)
    }
  }
}

// 进程级单例
let _singleton = null

export function getFigmaRateLimiter() {
  if (!_singleton) {
    _singleton = new FigmaRateLimiter()
  }
  return _singleton
}

// 预览专用单例：figma-preview 接口只需 1~2 次请求，用宽松参数（500ms 间隔 + 并发 2），
// 避免被「生成管线批量拉节点」的 7s 硬间隔拖慢。可用环境变量覆盖。
let _previewSingleton = null

export function getFigmaPreviewRateLimiter() {
  if (!_previewSingleton) {
    _previewSingleton = new FigmaRateLimiter({
      minIntervalMs: Number(process.env.FIGMA_PREVIEW_MIN_INTERVAL_MS ?? 500),
      maxConcurrency: Number(process.env.FIGMA_PREVIEW_MAX_CONCURRENCY ?? 2),
      cooldownBaseSec: Number(process.env.FIGMA_PREVIEW_COOLDOWN_BASE_SEC ?? 30),
      cooldownMaxSec: Number(process.env.FIGMA_PREVIEW_COOLDOWN_MAX_SEC ?? 60),
    })
  }
  return _previewSingleton
}

export { FigmaRateLimiter }

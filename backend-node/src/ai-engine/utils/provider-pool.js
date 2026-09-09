/**
 * 供应商池（多 key / 多 provider 负载分散 + 故障转移）
 *
 * 解决痛点：单一大模型 API 的 key 有 RPM/TPM/并发配额天花板，且单家故障即全线不可用。
 * 供应商池管理多个 provider，每个 provider 携带独立的 RPM/TPM 令牌桶 + 熔断器，
 * pick() 按「健康状态 + 权重」择优返回，熔断的 provider 被自动跳过，实现故障转移。
 *
 * 设计：
 *  - 进程级单例（跨所有 agent 共享），熔断/桶状态按 provider.id 跨 setProviders 保留。
 *  - setProviders 每次用最新配置重建池，但复用同 id 的桶与熔断器状态（避免配置热更新丢状态）。
 *  - 单一配置场景（providers 为空）不启用池，resolveConfig 会回退原逻辑。
 *
 * 🔀 角色分槽（2026-08-16）：文本 / 视觉各自独立槽位，互不覆盖。
 *  - setProviders(providers, cfg, { role }) 只更新对应角色槽（text / vision）。
 *  - pick(role) 只从对应槽择优；请求的槽为空时回退另一槽兜底（保底仍能发请求）。
 *  - 熔断器 / 令牌桶按 provider.id 跨槽共享（同一 provider 既做文本又做视觉时状态一致）。
 */

import { TokenBucket } from './rate-limit-bucket.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { createLogger } from '../logger/index.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { dataDir } from '../../config/backend-root.js'

const logger = createLogger({ name: 'provider-pool' })

const ROLES = ['text', 'vision']

/** 🆕 延迟画像持久化文件（2026-08-27 #275-3）：进程重启后冷启动即有模型优先级 */
const LATENCY_STATS_FILE = join(dataDir, 'ai-provider-stats.json')

class ProviderPool {
  constructor() {
    /** @type {{text: {providers: Map, primaryId: string|null}, vision: {providers: Map, primaryId: string|null}}} */
    this._slots = {
      text: { providers: new Map(), primaryId: null },
      vision: { providers: new Map(), primaryId: null },
    }
    /** @type {Map<string, {rpmBucket:any, tpmBucket:any, breaker:any}>} 跨槽共享的桶/熔断器状态 */
    this._shared = new Map()
    this.circuitBreakerCfg = { failureThreshold: 0, cooldownMs: 30000 }
    /** @type {'primary-first'|'weighted-spread'} 调度策略：
     *  primary-first — 主模型健康时独占，不健康才走加权池（默认，向后兼容）
     *  weighted-spread — 主模型也参与加权随机，按比例分散到全部健康 provider（防单模型触达上限）
     */
    this.pickStrategy = 'primary-first'
    /** @type {Map<string, number>} 跨 chunk 超时记忆：providerId -> 最后一次超时时间戳
     * 用于在 pick 时排除最近超时的 provider，避免新 chunk 又选到刚超时的 provider
     */
    this._recentTimeouts = new Map()
    /** 超时记忆有效期（ms），超过此时间的超时记录不再影响 pick
     * ⚠️ 2026-08-27 修复（模型优先级）：原 60s 冷却在 290s 级慢请求面前形同虚设——
     *    请求超时后底层仍在挂起，60s 一到坏 provider 重新入选 → 反复撞同一面墙。
     *    提升到 180s（匹配 CHUNK_TIMEOUT_MS），确保「空串/超时重试」发生时坏 provider 仍在冷却期。
     */
    this.timeoutMemoryMs = 180000
    /** 🆕 S2 耗时画像：providerId -> { samples, successCount, failCount }
     * 用于动态超时：快模型短超时（挂起快速切换）、慢模型长超时（不误杀）。
     * 样本保留最近 50 次。
     * 🆕 2026-08-27 #275-3：画像持久化到 data/ai-provider-stats.json，进程重启后恢复——
     *   否则冷启动期间所有 provider 无样本 → _weightOf 全部退回 baseWeight（10/10/10 均匀随机），
     *   模型优先级要等样本积累才有意义（用户实测「重启后优先级像没生效」的根因）。
     */
    this._latency = new Map()
    /** 降权日志节流：providerId -> 上次打降权日志的时间戳（同一 provider 60s 内最多打一次） */
    this._lastDowngradeLogAt = new Map()
    /** 持久化防抖定时器 */
    this._persistTimer = null
    // 恢复跨重启画像（冷启动即有优先级）
    this._loadPersistedStats()
  }

  /**
   * 用最新配置重建指定角色的槽。
   * @param {Array<{id:string,name?:string,apiKey:string,baseURL:string,model:string,providerType?:string,role?:string,rpm?:number,tpm?:number,weight?:number}>} providers
   * @param {{failureThreshold?:number,cooldownMs?:number}} [circuitBreakerCfg]
   * @param {{primaryId?:string, role?:'text'|'vision'}} [opts] 主 provider id + 目标角色槽
   */
  setProviders(providers, circuitBreakerCfg = {}, opts = {}) {
    const role = ROLES.includes(opts.role) ? opts.role : 'text'
    const slot = this._slots[role]

    const list = Array.isArray(providers)
      ? providers.filter((p) => p && typeof p.id === 'string' && p.id && p.apiKey)
      : []

    if (circuitBreakerCfg && typeof circuitBreakerCfg === 'object') {
      const threshold = Number(circuitBreakerCfg.failureThreshold)
      const cooldown = Number(circuitBreakerCfg.cooldownMs)
      if (Number.isFinite(threshold) && threshold > 0) {
        this.circuitBreakerCfg.failureThreshold = threshold
      }
      if (Number.isFinite(cooldown) && cooldown > 0) {
        this.circuitBreakerCfg.cooldownMs = cooldown
      }
    }

    if (!list.length) {
      slot.providers.clear()
      slot.primaryId = null
      logger.info(`供应商池[${role}]未配置，回退单 provider 逻辑`)
      return
    }

    const next = new Map()
    for (const p of list) {
      const prevShared = this._shared.get(p.id)
      const rpm = Number(p.rpm) || 0
      const tpm = Number(p.tpm) || 0
      const weight = Number(p.weight) || 1

      const rpmBucket = prevShared?.rpmBucket ?? new TokenBucket({ name: `rpm:${p.id}` })
      const tpmBucket = prevShared?.tpmBucket ?? new TokenBucket({ name: `tpm:${p.id}` })
      const breaker = prevShared?.breaker ?? new CircuitBreaker({ ...this.circuitBreakerCfg, name: p.id })

      // 配置热更新：同步容量与补充速率（保留桶内已有令牌）
      rpmBucket.capacity = rpm
      rpmBucket.refillPerSec = rpm / 60
      tpmBucket.capacity = tpm
      tpmBucket.refillPerSec = tpm / 60
      breaker.failureThreshold = this.circuitBreakerCfg.failureThreshold
      breaker.cooldownMs = this.circuitBreakerCfg.cooldownMs

      // 桶/熔断器跨槽共享：同一 provider 无论用于文本还是视觉，状态一致
      this._shared.set(p.id, { rpmBucket, tpmBucket, breaker })

      next.set(p.id, {
        ...p,
        role,
        weight: weight > 0 ? weight : 1,
        rpmBucket,
        tpmBucket,
        breaker,
      })
    }

    slot.providers = next
    // 主 provider id：仅当对应 id 真实存在时生效，避免悬空引用
    slot.primaryId = opts.primaryId && next.has(opts.primaryId) ? opts.primaryId : null

    // 调度策略：weighted-spread 让主模型也参与加权随机；primary-first 主模型独占（默认）
    if (opts.pickStrategy === 'weighted-spread' || opts.pickStrategy === 'primary-first') {
      this.pickStrategy = opts.pickStrategy
    }

    logger.info(`供应商池[${role}]已更新，共 ${next.size} 个 provider${slot.primaryId ? `（主: ${slot.primaryId}）` : ''}，策略: ${this.pickStrategy}`)
  }

  get configured() {
    return this._slots.text.providers.size > 0 || this._slots.vision.providers.size > 0
  }

  get size() {
    return this._slots.text.providers.size + this._slots.vision.providers.size
  }

  /**
   * 按「健康状态 + 权重」择优返回一个 provider。
   * 主 provider 优先：设置了 primaryId 且主健康时直接返回主（资源池仅作降级兜底）。
   * 熔断(open)或 RPM 超限的 provider 被跳过；全部不可用时退回全量（保底仍能发请求）。
   * @param {'text'|'vision'} [role] 目标角色槽；请求的槽为空时回退另一槽兜底。
   * @param {{excludeIds?: string[], requirements?: object}} [options]
   *   excludeIds — 本次 retry 已失败/需避开的 provider id（超时后切换时排除刚超时的那个）
   *   requirements — 能力要求过滤（如 { supportsVision: true }、{ minInputTokens: 64000 }）
   * @returns {any|null}
   */
  pick(role = 'text', options = {}) {
    const { excludeIds = [], requirements = {} } = options || {}
    const r = ROLES.includes(role) ? role : 'text'
    const slot = this._slots[r]
    const all = [...slot.providers.values()]

    if (!all.length) {
      // 兜底：请求的槽为空，回退另一槽（兼容旧配置未分角色 / 单一池场景）
      const other = this._slots[r === 'text' ? 'vision' : 'text']
      const otherAll = [...other.providers.values()]
      if (!otherAll.length) return null
      logger.warn(`供应商池[${r}]为空，回退到[${r === 'text' ? 'vision' : 'text'}]槽`, {})
      return this._pickFrom(otherAll, other.primaryId, r === 'text' ? 'vision' : 'text', { excludeIds, requirements })
    }
    return this._pickFrom(all, slot.primaryId, r, { excludeIds, requirements })
  }

  /** provider 是否满足能力要求（支持视觉 / 上下文 / 输出上限等） */
  _matchesRequirements(p, requirements = {}) {
    if (!requirements || typeof requirements !== 'object') return true
    if (requirements.supportsVision === true && p.supportsVision !== true) return false
    if (requirements.minInputTokens != null) {
      const cap = Number(p.maxInputTokens || 0)
      if (cap > 0 && cap < Number(requirements.minInputTokens)) return false
    }
    if (requirements.minOutputTokens != null) {
      const cap = Number(p.maxOutputTokens || 0)
      if (cap > 0 && cap < Number(requirements.minOutputTokens)) return false
    }
    return true
  }

  _pickFrom(all, primaryId, role, opts = {}) {
    if (!all.length) return null

    const { excludeIds = [], requirements = {} } = opts || {}
    const excluded = new Set(excludeIds)
    const matchReq = (p) => this._matchesRequirements(p, requirements)
    // 跨 chunk 超时记忆：排除最近超时的 provider（冷却期内）
    const notTimedOut = (p) => !this._isRecentlyTimedOut(p.id)

    // 🔀 同故障域排除（2026-08-27 #271 模型优先级）：excludeIds 命中的 provider 若与
    // 其他 provider 共用同一 baseURL host（如 deepseek-v4-pro 与 deepseek-v4-flash 同一 key/域名），
    // 故障转移时一起排除 —— 否则「切换 provider」只是换了个模型名、仍撞同一后端（日志实证：
    // p1786895670427_b5a4 超时后切 legacy-text，还是 deepseek 域名，双双 290s 空串）。
    const excludedHosts = new Set(
      all.filter((p) => excluded.has(p.id)).map((p) => this._hostOf(p.baseURL)).filter(Boolean),
    )
    const notExcluded = (p) => {
      if (excluded.has(p.id)) return false
      if (excludedHosts.size && excludedHosts.has(this._hostOf(p.baseURL))) return false
      return true
    }

    // 逐级过滤：
    //   1. 排除本次 retry 已失败的 provider（含同故障域）+ 不满足能力要求的 provider
    //   2. 排除最近超时的 provider（跨 chunk 记忆）
    //   3. 过滤后为空则逐步回退（保底仍能发请求）
    const candidates = all.filter((p) => notExcluded(p) && matchReq(p) && notTimedOut(p))
    // 回退层1：不考虑超时记忆，但仍排除本次 retry 已失败的 + 满足能力要求
    const fallbackIgnoreTimeout = all.filter((p) => notExcluded(p) && matchReq(p))
    // 回退层2：只满足能力要求
    const fallbackReq = all.filter(matchReq)
    // 回退层3：全量
    const effective = candidates.length
      ? candidates
      : fallbackIgnoreTimeout.length
        ? fallbackIgnoreTimeout
        : fallbackReq.length
          ? fallbackReq
          : all
    if (!effective.length) return null

    // 如果最终选中的 effective 包含最近超时的 provider（即 candidates 为空才回退到它们），记录日志
    if (!candidates.length && fallbackIgnoreTimeout.some((p) => this._isRecentlyTimedOut(p.id))) {
      const timedOutIds = all.filter((p) => this._isRecentlyTimedOut(p.id)).map((p) => p.id)
      logger.info(`⚠️ 所有候选 provider 均在超时冷却期，回退使用: ${timedOutIds.join(', ')}`)
    }

    const strategy = this.pickStrategy || 'primary-first'

    // 🛡️ 2026-09-04 全局关闭推理模型：过滤掉 thinkingType='skip' 的强制推理模型
    // （如 kimi-k3 这类无法关闭推理的模型，生产管线不适合使用）
    const nonReasoning = effective.filter((p) => p.thinkingType !== 'skip')
    const candidatesForStrategy = nonReasoning.length ? nonReasoning : effective

    // weighted-spread 策略：所有健康 provider 参与加权随机（含主模型）
    if (strategy === 'weighted-spread') {
      const healthy = candidatesForStrategy.filter((p) => this._isHealthy(p))
      const pool = healthy.length ? healthy : candidatesForStrategy
      if (!pool.length) return null
      return this._weightedPick(pool, role)
    }

    // primary-first 策略（默认，向后兼容）：主模型健康时独占
    if (primaryId && !excluded.has(primaryId)) {
      const primary = candidatesForStrategy.find((p) => p.id === primaryId)
      if (primary && this._isHealthy(primary) && notTimedOut(primary)) {
        return primary
      }
      // 主不可用或最近超时：记录降级
      if (primary && !this._isHealthy(primary)) {
        logger.warn(`🔀 主 provider 不可用，降级到资源池[${role}]`, {
          primaryId,
          reason: this._unhealthyReason(primary),
        })
      } else if (primary && !notTimedOut(primary)) {
        const elapsed = Math.round((Date.now() - (this._recentTimeouts.get(primaryId) || 0)) / 1000)
        logger.warn(`⏱️ 主 provider 最近超时（${elapsed}s 前），降级到资源池[${role}]`, { primaryId })
      }
    }

    // 降级池：过滤熔断/超限 + 最近超时的 provider；全挂时退回全量（保底仍能发请求）
    const healthy = candidatesForStrategy.filter((p) => this._isHealthy(p) && notTimedOut(p))
    const pool = healthy.length ? healthy : candidatesForStrategy
    if (!pool.length) return null
    return this._weightedPick(pool, role)
  }

  /**
   * 从候选池按「动态权重」加权随机选取（weighted-spread 与降级池共用）。
   * 🆕 2026-08-27 #271 模型优先级：权重 = baseWeight × 健康系数 × 延迟系数。
   *    - 成功率系数：样本中成功占比越高权重越大（failCount 高 → 大幅降权）
   *    - 延迟系数：p90 耗时越长权重越小（≤15s 满分；30s→0.4；60s→0.15；120s+→0.05）
   *    效果：快/稳 provider 优先（真正的"优先级"），慢/挂 provider 边缘化，不再 10/10/10 均匀撞墙。
   * @param {Array} pool 候选 provider 列表
   * @param {string} role 角色槽（仅用于日志）
   */
  _weightedPick(pool, role) {
    if (!pool || !pool.length) return null
    const weighted = pool.map((p) => ({ p, w: this._weightOf(p) }))
    // 低权重 provider（被健康/延迟压到 0.2 以下）打一条降权日志，便于观测优先级生效；
    // 60s 节流避免高频率 pick（如 300 次/秒测试或并发 chunk）刷屏。
    const heavilyReduced = weighted.filter(({ p, w }) => this._isHealthy(p) && w < 0.2 * (Number(p.weight) || 1))
    if (heavilyReduced.length) {
      const now = Date.now()
      const fresh = heavilyReduced.filter(({ p }) => {
        const last = this._lastDowngradeLogAt.get(p.id)
        if (last && now - last < 60000) return false
        this._lastDowngradeLogAt.set(p.id, now)
        return true
      })
      if (fresh.length) {
        logger.info(`🔀 动态权重降权[${role}]`, fresh.map(({ p, w }) => ({
          id: p.id,
          model: p.model,
          baseWeight: p.weight,
          effectiveWeight: Math.round(w * 100) / 100,
        })))
      }
    }
    const total = weighted.reduce((s, { w }) => s + w, 0)
    let r = Math.random() * total
    for (const { p, w } of weighted) {
      r -= w
      if (r <= 0) return p
    }
    return weighted[weighted.length - 1].p
  }

  /** baseURL 的 host（用于同故障域判定）；解析失败返回 null */
  _hostOf(baseURL) {
    if (!baseURL) return null
    try {
      const u = new URL(String(baseURL))
      return u.host
    } catch {
      return null
    }
  }

  /**
   * 🆕 动态权重计算（2026-08-27 #271）：baseWeight × 健康系数 × 延迟系数
   * 无样本时保持 baseWeight（冷启动公平竞争）；有样本后逐步收敛到「快/稳优先」。
   * @param {Object} p provider 条目
   * @returns {number} 有效权重（下限 0.05，避免归零后永不恢复）
   */
  _weightOf(p) {
    let w = Number(p.weight) || 1
    const prof = this._latency.get(p.id)
    if (!prof || !prof.samples.length) return Math.max(0.05, w)
    const total = prof.successCount + prof.failCount
    const successRate = total > 0 ? prof.successCount / total : 1
    // 健康系数：成功率 100% → 1.0；50% → 0.65；0% → 0.3（保留基本盘，非一票否决）
    w *= 0.3 + 0.7 * successRate
    // 延迟系数：p90 分位越慢权重越低
    const sorted = [...prof.samples].sort((a, b) => a - b)
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
    if (p90 > 120000) w *= 0.05
    else if (p90 > 60000) w *= 0.15
    else if (p90 > 30000) w *= 0.4
    else if (p90 > 15000) w *= 0.7
    // p90 <= 15s：权重保持不变（快模型 = 满分优先级）
    return Math.max(0.05, w)
  }

  /**
   * provider 是否健康：熔断非 open 且 RPM 桶（若启用）仍有额度。
   * TPM 超限不在 pick 阶段判断（此时尚无 tokenEstimate），由 acquire 阻塞兜底。
   */
  _isHealthy(p) {
    if (!p) return false
    if (p.breaker.state === 'open') return false
    if (p.rpmBucket?.enabled && !p.rpmBucket.canAcquire(1)) return false
    return true
  }

  _unhealthyReason(p) {
    if (!p) return 'missing'
    if (p.breaker.state === 'open') return 'breaker-open'
    if (p.rpmBucket?.enabled && !p.rpmBucket.canAcquire(1)) return 'rpm-exhausted'
    return 'unknown'
  }

  /** 按 id 取 provider 条目（含桶与熔断器），跨槽查找 */
  get(id) {
    return this._slots.text.providers.get(id) || this._slots.vision.providers.get(id) || null
  }

  /**
   * 记录 provider 超时（跨 chunk 记忆）
   * 用于在后续 pick 时排除最近超时的 provider，避免新 chunk 又选到刚超时的 provider
   * @param {string} providerId
   */
  recordTimeout(providerId) {
    if (!providerId) return
    this._recentTimeouts.set(providerId, Date.now())
    logger.warn(`⏱️ 记录 provider 超时: ${providerId}，${this.timeoutMemoryMs / 1000}s 内不再选择`)
  }

  /**
   * 🆕 S2 记录 provider 耗时样本（成功/失败各记一次），形成「耗时画像」供动态超时。
   * @param {string} providerId
   * @param {number} durationMs 单次 attempt 实际耗时
   * @param {boolean} [success] 是否成功（失败也记，用于成功率与失败耗时统计）
   */
  recordLatency(providerId, durationMs, success = true) {
    if (!providerId || !Number.isFinite(durationMs) || durationMs < 0) return
    let prof = this._latency.get(providerId)
    if (!prof) {
      prof = { samples: [], successCount: 0, failCount: 0 }
      this._latency.set(providerId, prof)
    }
    prof.samples.push(Math.round(durationMs))
    if (prof.samples.length > 50) prof.samples.shift()
    if (success) prof.successCount += 1
    else prof.failCount += 1
    // 🆕 防抖持久化（800ms），重启后冷启动即有优先级
    this._schedulePersist()
  }

  /** 🆕 恢复跨重启的延迟画像（data/ai-provider-stats.json） */
  _loadPersistedStats() {
    try {
      if (!existsSync(LATENCY_STATS_FILE)) return
      const raw = JSON.parse(readFileSync(LATENCY_STATS_FILE, 'utf-8'))
      if (raw && raw.latency && typeof raw.latency === 'object') {
        let restored = 0
        for (const [id, prof] of Object.entries(raw.latency)) {
          if (!prof || !Array.isArray(prof.samples) || !prof.samples.length) continue
          this._latency.set(id, {
            samples: prof.samples.slice(0, 50).map(Number).filter((n) => Number.isFinite(n)),
            successCount: Number(prof.successCount) || 0,
            failCount: Number(prof.failCount) || 0,
          })
          restored++
        }
        if (restored > 0) {
          logger.info('🔄 已恢复 provider 延迟画像（跨重启，冷启动即有模型优先级）', {
            providers: restored,
            file: LATENCY_STATS_FILE,
          })
        }
      }
    } catch (e) {
      logger.warn('加载 provider 延迟画像失败（冷启动无优先级，本次运行内重新积累）', { error: e.message })
    }
  }

  /** 🆕 防抖调度持久化 */
  _schedulePersist() {
    clearTimeout(this._persistTimer)
    this._persistTimer = setTimeout(() => this._persistStats(), 800)
  }

  /** 🆕 持久化延迟画像到磁盘（只存画像，不存冷却/熔断等易失状态） */
  _persistStats() {
    try {
      if (!this._latency.size) return
      mkdirSync(dataDir, { recursive: true })
      const latency = {}
      for (const [id, prof] of this._latency.entries()) {
        latency[id] = {
          samples: prof.samples,
          successCount: prof.successCount,
          failCount: prof.failCount,
        }
      }
      writeFileSync(LATENCY_STATS_FILE, JSON.stringify({ latency, updatedAt: Date.now() }, null, 2))
    } catch (e) {
      logger.warn('持久化 provider 延迟画像失败（非阻断）', { error: e.message })
    }
  }

  /**
   * 🆕 S2 读取 provider 耗时画像（无样本返回 null）。
   * @returns {{avgMs:number, p90Ms:number, samples:number, successCount:number, failCount:number}|null}
   */
  getLatencyProfile(providerId) {
    const prof = this._latency.get(providerId)
    if (!prof || !prof.samples.length) return null
    const sorted = [...prof.samples].sort((a, b) => a - b)
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
    return {
      avgMs: Math.round(avg),
      p90Ms: Math.round(p90),
      samples: sorted.length,
      successCount: prof.successCount,
      failCount: prof.failCount,
    }
  }

  /**
   * 🆕 S2 按耗时画像计算建议超时阈值（快模型短超时、慢模型长超时）。
   * 无画像样本时回退 fallbackMs；有样本则 p90 × safetyFactor，夹在 [minMs, maxMs]。
   * @returns {number}
   */
  getSuggestedTimeoutMs(providerId, fallbackMs, { minMs = 60000, maxMs = 600000, safetyFactor = 1.5 } = {}) {
    const prof = this.getLatencyProfile(providerId)
    if (!prof) return fallbackMs
    return Math.min(maxMs, Math.max(minMs, Math.round(prof.p90Ms * safetyFactor)))
  }

  /**
   * 检查 provider 是否最近超时（在 timeoutMemoryMs 内）
   * @param {string} providerId
   * @returns {boolean}
   */
  _isRecentlyTimedOut(providerId) {
    if (!providerId) return false
    const lastTimeout = this._recentTimeouts.get(providerId)
    if (!lastTimeout) return false
    const elapsed = Date.now() - lastTimeout
    if (elapsed > this.timeoutMemoryMs) {
      // 超时记录已过期，清理
      this._recentTimeouts.delete(providerId)
      return false
    }
    return true
  }

  /**
   * 清理过期的超时记录（可在定期任务中调用，或让 _isRecentlyTimedOut 自动清理）
   */
  cleanupExpiredTimeouts() {
    const now = Date.now()
    for (const [id, ts] of this._recentTimeouts.entries()) {
      if (now - ts > this.timeoutMemoryMs) {
        this._recentTimeouts.delete(id)
      }
    }
  }

  snapshot() {
    const rows = []
    const now = Date.now()
    for (const role of ROLES) {
      for (const p of this._slots[role].providers.values()) {
        const lastTimeoutAt = this._recentTimeouts.get(p.id) || null
        rows.push({
          id: p.id,
          name: p.name || p.id,
          role,
          model: p.model,
          weight: p.weight,
          breaker: p.breaker.snapshot(),
          rpm: p.rpmBucket.snapshot(),
          tpm: p.tpmBucket.snapshot(),
          // 跨 chunk 超时记忆状态
          recentlyTimedOut: lastTimeoutAt ? {
            at: lastTimeoutAt,
            elapsedMs: now - lastTimeoutAt,
            remainingMs: Math.max(0, this.timeoutMemoryMs - (now - lastTimeoutAt)),
          } : null,
        })
      }
    }
    return rows
  }
}

let _singleton = null

/** 进程级单例 */
export function getProviderPool() {
  if (!_singleton) _singleton = new ProviderPool()
  return _singleton
}

export default { ProviderPool, getProviderPool }

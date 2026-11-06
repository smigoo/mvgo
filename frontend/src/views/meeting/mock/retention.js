// FR-14 权限与数据生命周期（SEC-07）/ E-03 超期清理
//
// 硬约束（勿放宽）：
// 1. 留存期限由管理员配置，**默认 90 天**（PRD Q-04 未确认，v1 取估算值，页面须标注「待确认」）；
// 2. 到期自动删除音频、中间产物与内存态 embedding，只保留脱敏统计与审计记录；
// 3. 删除动作必须写审计，且审计本身不可被清理掩盖；
// 4. 导出数据不含原始音频（由 assertNoRawAudio 在导出链路上拦截）。
//
// 边界：dev 态「音频」根本不落盘（录音只在内存 + 手动下载的 WAV），因此本模块删除的是
// 浏览器本地存储里的纪要草稿与中间产物元数据；不谎称删除了从未存在的服务端对象。
// 真实删除的实现位置在服务端，契约未落地前此处只做本地可验证的部分。

import { STORAGE_PREFIX, draftIndexKey } from './draft-store.js'
import { currentMeetingOwnerId, sanitizeOwnerId } from './owner-scope.js'

// 留存策略是**全局单例配置**（契约 ownership: 'global'）：改的是「所有会议留多少天」，
// 不是某人的私有设置，所以**刻意不加 owner 分区**。但读写它仍必须已登录（服务端 E-15/E-16 挂身份守卫）。
export const RETENTION_POLICY_KEY = 'mvgo.meeting.retention.policy'
// 删除审计的 ownership 是 'retention.actor'（E-17 只清自己名下，E-18 只看自己记录）⇒ 按 actor 分区。
// 若审计全局共享，A 用户能读到 B 用户删掉了哪些会议（即便只有脱敏计数，也是越权信息）。
export function retentionAuditKey(ownerId = currentMeetingOwnerId()) {
  return `mvgo.meeting.retention.audit.${sanitizeOwnerId(ownerId)}`
}
export const RETENTION_AUDIT_LIMIT = 200

// Q-04 待产品 / 法务确认，v1 取 90 天为估算上限而非承诺值
export const DEFAULT_RETENTION_DAYS = 90
export const RETENTION_DAYS_MIN = 1
export const RETENTION_DAYS_MAX = 3650
// 进入「临期」提醒的剩余天数
export const EXPIRING_SOON_DAYS = 7

export const RETENTION_DAY_MS = 24 * 60 * 60 * 1000

// 到期必须删除的产物类别
export const PURGE_ARTIFACTS = ['audio', 'transcript', 'intermediate', 'embedding']
// 到期后保留的类别：脱敏统计 + 审计（证明「确实删过」）
export const PURGE_KEEPS = ['redacted_stats', 'audit']

// 导出 payload 里绝不允许出现的原始音频键（按 key 精确判定，不扫正文，避免「音频」二字误报）
export const FORBIDDEN_EXPORT_KEYS = [
  'audio',
  'rawAudio',
  'wav',
  'pcm',
  'samples',
  'waveform',
  'audioBase64',
  'audioBlob',
  'audioBuffer',
  'audioData'
]

function resolveStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 隐私模式 / 沙箱下降级
  }
  return null
}

/**
 * `now` 归一化。
 * 本模块内不同函数对「当前时间」的形态需求不同（policy 记录要函数取时、分级比较要 ISO 字符串），
 * 早期版本各自约定，导致 purgeExpired 把字符串当函数调用抛 TypeError。
 * 统一改为：导出的函数一律接受 string | function | 空，内部按需取形。
 */
function nowIso(now) {
  if (typeof now === 'function') {
    const value = now()
    return typeof value === 'string' && value ? value : new Date().toISOString()
  }
  if (typeof now === 'string' && now) return now
  return new Date().toISOString()
}

function readJson(storage, key, fallback) {
  if (!storage) return fallback
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null')
    return parsed === null ? fallback : parsed
  } catch {
    return fallback
  }
}

/**
 * 期限解析。注意 JS 隐式转换陷阱：Number(null) === 0 且 Number.isFinite(0) === true，
 * 所以必须先显式排除 null / '' / undefined，否则「没配置」会被当成 0 天（等于立刻全删）。
 */
export function resolveRetentionDays(policy) {
  const raw = policy?.days
  if (raw === null || raw === undefined || raw === '') return DEFAULT_RETENTION_DAYS
  const num = Number(raw)
  if (!Number.isFinite(num)) return DEFAULT_RETENTION_DAYS
  // 越界不静默放大留存：夹紧到合法区间
  return Math.min(RETENTION_DAYS_MAX, Math.max(RETENTION_DAYS_MIN, Math.floor(num)))
}

export function createRetentionPolicy(input = {}, now = () => new Date().toISOString()) {
  const days = resolveRetentionDays(input)
  return {
    days,
    configuredBy: String(input.configuredBy || 'admin'),
    configuredAt: input.configuredAt || nowIso(now),
    // default = 尚未被管理员配置过，页面据此提示「默认值，待 Q-04 确认」
    source: input.source || (input.days === undefined || input.days === null ? 'default' : 'admin')
  }
}

export function readRetentionPolicy(storage = resolveStorage(), now = () => new Date().toISOString()) {
  const saved = readJson(storage, RETENTION_POLICY_KEY, null)
  if (!saved) return createRetentionPolicy({}, now)
  return createRetentionPolicy({ ...saved, source: 'admin' }, now)
}

export function writeRetentionPolicy(days, storage = resolveStorage(), options = {}) {
  const policy = createRetentionPolicy(
    { days, configuredBy: options.configuredBy || 'admin', source: 'admin' },
    options.now
  )
  if (storage) storage.setItem(RETENTION_POLICY_KEY, JSON.stringify(policy))
  return policy
}

function toTime(iso) {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function computeExpiry(createdAt, days = DEFAULT_RETENTION_DAYS) {
  const start = toTime(createdAt)
  if (start === null) return null
  const span = resolveRetentionDays({ days }) * RETENTION_DAY_MS
  return new Date(start + span).toISOString()
}

export function remainingDays(expiry, now = new Date().toISOString()) {
  const end = toTime(expiry)
  const at = toTime(nowIso(now)) ?? Date.now()
  if (end === null) return null
  return Math.ceil((end - at) / RETENTION_DAY_MS)
}

/**
 * 单条数据分级。
 * createdAt 取 savedAt → updatedAt → createdAt（草稿索引里三者含义不同，按可靠性排序）。
 * 时间完全不可解析时返回 unknown：**不自动删**（宁可留一条人工确认，也不误删用户数据）。
 */
export function classifyItem(item, options = {}) {
  const now = nowIso(options.now)
  const days = resolveRetentionDays({ days: options.days })
  const createdAt = item?.createdAt || item?.savedAt || item?.updatedAt || null
  const expiry = computeExpiry(createdAt, days)
  const left = remainingDays(expiry, now)
  let status = 'unknown'
  if (left !== null) {
    if (left <= 0) status = 'expired'
    else if (left <= EXPIRING_SOON_DAYS) status = 'expiring'
    else status = 'active'
  }
  return {
    key: item?.runVersion || item?.key || null,
    runVersion: item?.runVersion || null,
    storageKey: item?.key || null,
    createdAt,
    expiry,
    remainingDays: left,
    retentionDays: days,
    status
  }
}

export function buildPurgePlan(items = [], options = {}) {
  const now = nowIso(options.now)
  const days = resolveRetentionDays({ days: options.days })
  const buckets = { expired: [], expiring: [], active: [], unknown: [] }
  items.forEach((item) => {
    const row = classifyItem(item, { now, days })
    buckets[row.status].push(row)
  })
  return {
    ...buckets,
    days,
    now,
    counts: {
      total: items.length,
      expired: buckets.expired.length,
      expiring: buckets.expiring.length,
      active: buckets.active.length,
      unknown: buckets.unknown.length
    }
  }
}

// 删除前的脱敏统计：只留计数，不留任何正文，用于「删了但可审计」
function redactedStatsOf(raw) {
  if (!raw || typeof raw !== 'object') return { fields: 0, overlay: 0, audit: 0, published: false }
  const fields = Array.isArray(raw.fields) ? raw.fields : []
  return {
    fields: fields.length,
    overlay: raw.overlay && typeof raw.overlay === 'object' ? Object.keys(raw.overlay).length : 0,
    audit: Array.isArray(raw.audit) ? raw.audit.length : 0,
    published: Boolean(raw.publishedAt)
  }
}

function appendAudit(storage, entry, ownerId = currentMeetingOwnerId()) {
  const key = retentionAuditKey(ownerId)
  const list = readJson(storage, key, [])
  const rows = Array.isArray(list) ? list : []
  const next = [entry, ...rows].slice(0, RETENTION_AUDIT_LIMIT)
  if (storage) storage.setItem(key, JSON.stringify(next))
  return next
}

/**
 * 删除一条草稿并写审计。expired 与用户主动删除共用，只有 reason 不同。
 * 返回 { deleted, storageKey, stats, auditEntry }；不存在时 deleted=false（不伪造删除成功）。
 */
export function deleteDraftByVersion(runVersion, options = {}) {
  const storage = options.storage ?? resolveStorage()
  const at = nowIso(options.now)
  const reason = options.reason || 'user_delete'
  const ownerId = sanitizeOwnerId(options.ownerId ?? currentMeetingOwnerId())
  if (!storage || !runVersion) {
    return { deleted: false, reason: 'NO_STORAGE_OR_VERSION', runVersion: runVersion || null }
  }

  const indexKey = draftIndexKey(ownerId)
  const index = readJson(storage, indexKey, [])
  const rows = Array.isArray(index) ? index : []
  const entry = rows.find((r) => r.runVersion === runVersion) || null
  const storageKey = entry?.key || `${STORAGE_PREFIX}${ownerId}.${runVersion}`
  const rawText = storage.getItem(storageKey)

  if (rawText === null && !entry) {
    return { deleted: false, reason: 'NOT_FOUND', runVersion, storageKey }
  }

  let raw = null
  try {
    raw = rawText ? JSON.parse(rawText) : null
  } catch {
    raw = null
  }

  storage.removeItem(storageKey)
  if (entry) {
    storage.setItem(indexKey, JSON.stringify(rows.filter((r) => r.runVersion !== runVersion)))
  }

  const auditEntry = {
    seq: null,
    at,
    action: reason === 'expired' ? 'expire_purge' : 'user_delete',
    reason,
    runVersion,
    // 归属留痕：E-18「只看自己记录」依赖这一列，缺了就只能靠 key 分区，审计本身失去归属证据
    actor: ownerId,
    artifacts: [...PURGE_ARTIFACTS],
    keeps: [...PURGE_KEEPS],
    // 只有计数，没有任何正文
    redactedStats: redactedStatsOf(raw)
  }
  const list = appendAudit(storage, auditEntry, ownerId)
  auditEntry.seq = list.length

  return { deleted: true, runVersion, storageKey, stats: auditEntry.redactedStats, auditEntry }
}

/**
 * 到期清理：扫描草稿索引，删除 status==='expired' 的条目。
 * dryRun=true 只出计划不动数据（页面「查看待清理」用）。
 */
export function purgeExpired(options = {}) {
  const storage = options.storage ?? resolveStorage()
  // 统一取一次「当前时刻」再分发：readRetentionPolicy / buildPurgePlan / deleteDraftByVersion
  // 三者都接受 string | function，这里固定成 ISO 字符串，避免同一次清理跨秒不一致。
  const now = nowIso(options.now)
  const ownerId = sanitizeOwnerId(options.ownerId ?? currentMeetingOwnerId())
  // 策略是全局的（不分区），草稿索引是分区的一一 两者取 key 的方式不同，勿套用同一前缀。
  const policy = readRetentionPolicy(storage, now)
  const days = resolveRetentionDays({ days: options.days ?? policy.days })
  const index = readJson(storage, draftIndexKey(ownerId), [])
  const rows = Array.isArray(index) ? index : []
  const plan = buildPurgePlan(rows, { now, days })

  if (options.dryRun) {
    return { dryRun: true, plan, purged: [], days }
  }

  const purged = []
  plan.expired.forEach((row) => {
    const result = deleteDraftByVersion(row.runVersion, { storage, now, ownerId, reason: 'expired' })
    if (result.deleted) purged.push(result)
  })

  return {
    dryRun: false,
    plan,
    purged,
    days,
    policy,
    summary: {
      scanned: plan.counts.total,
      purged: purged.length,
      expiredButMissing: plan.counts.expired - purged.length
    }
  }
}

export function listRetentionAudit(storage = resolveStorage(), ownerId = currentMeetingOwnerId()) {
  const list = readJson(storage, retentionAuditKey(ownerId), [])
  return Array.isArray(list) ? list : []
}

function collectKeys(node, depth = 0) {
  if (depth > 6 || !node || typeof node !== 'object') return []
  const keys = []
  Object.keys(node).forEach((key) => {
    keys.push(key)
    keys.push(...collectKeys(node[key], depth + 1))
  })
  return keys
}

/** 导出 payload 是否夹带原始音频。按 key 精确匹配，不看值的文本内容。 */
export function findRawAudioKeys(payload) {
  const keys = new Set(collectKeys(payload))
  return FORBIDDEN_EXPORT_KEYS.filter((k) => keys.has(k))
}

export function assertNoRawAudio(payload) {
  const hits = findRawAudioKeys(payload)
  if (hits.length) {
    const error = new Error(`导出内容包含原始音频字段：${hits.join(', ')}（SEC-07 禁止）`)
    error.code = 'EXPORT_CONTAINS_AUDIO'
    error.fields = hits
    throw error
  }
  return true
}

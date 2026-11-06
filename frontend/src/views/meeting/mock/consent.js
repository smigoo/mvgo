// FR-03 告知同意（SEC-01）/ E-03 拒绝录制 / E-04 撤回同意
//
// 硬约束（勿放宽）：
// 1. 采集或处理会议音频之前，必须向「全体参会人」展示告知，并取得每人的明示同意；
// 2. 任一参会人拒绝 → 本场会议禁止录制与处理；**没有管理员绕过口子**（见 canRecord 注释）；
// 3. 同意 / 拒绝 / 撤回全部留痕，可审计；
// 4. 撤回后立即停止处理，并给出待删除产物清单（实际删除由 retention.js 执行，避免两处各删一遍）。
//
// 边界：本文件只管「能不能采」，不碰媒体流、不改 DOM；纯函数 + 可注入 storage / now，
// Node 冒烟脚本用内存 storage 做确定性验证（不依赖浏览器）。
// dev 态持久化到 localStorage；生产应由服务端记录并绑定会议 ID（契约未落地，此处不伪造）。

import { currentMeetingOwnerId, sanitizeOwnerId, scopedStorageKey } from './owner-scope.js'

export const CONSENT_PREFIX = 'mvgo.meeting.consent.'
// 同意记录含参会人姓名与逐人表态，属敏感数据：一律按 owner 分区，避免换账号后读到他人会议。
// 三个 key 由「常量」改为「函数」的原因同 draft-store：owner 运行时可变，常量会锁死分区。
export function consentIndexKey(ownerId = currentMeetingOwnerId()) {
  return scopedStorageKey(CONSENT_PREFIX, 'index', ownerId)
}
// 当前进行中会议的 ID：刷新页面要能接着用同一份同意记录，不能每次刷新都变成「新会议」，
// 但也不能把上一个账号的进行中会议「接着用」—— 所以同样按 owner 分区。
export function consentCurrentKey(ownerId = currentMeetingOwnerId()) {
  return scopedStorageKey(CONSENT_PREFIX, 'current', ownerId)
}

// 告知版本：告知内容一旦实质变化必须升版，旧版同意不可复位成新版同意
export const DISCLOSURE_VERSION = 'v1'

// 告知条目：与页面展示一一对应。改文案要同步升 DISCLOSURE_VERSION。
export const DISCLOSURE_ITEMS = [
  {
    id: 'capture',
    text: '本场会议将采集麦克风音频（或你选择的本地录音文件），用于生成会议纪要草稿。'
  },
  {
    id: 'local',
    text: '音频仅在本机浏览器内存中处理，不上传、不调用云端识别；当前版本不产生云端音频副本。'
  },
  {
    id: 'derive',
    text: '系统会据此生成逐句文字、字段化纪要草稿与变更记录；AI 产出为内部草稿，需人工确认后才定稿。'
  },
  {
    id: 'retention',
    text: '纪要草稿默认留存 90 天后自动清理（期限由管理员配置），参会人可随时要求提前删除。'
  },
  {
    id: 'decline',
    text: '任何一位参会人拒绝，本场会议即不采集、不处理；拒绝或撤回不影响其正常参会。'
  }
]

export const CONSENT_DECISIONS = ['pending', 'accepted', 'declined', 'withdrawn']

export const CONSENT_DECISION_LABELS = {
  pending: '未表态',
  accepted: '已同意',
  declined: '已拒绝',
  withdrawn: '已撤回'
}

// 阻断原因：页面直接取 label 展示，冒烟脚本断言 code
export const CONSENT_BLOCK_REASONS = {
  NO_PARTICIPANTS: '尚未登记参会人',
  PENDING: '有参会人未表态',
  DECLINED: '有参会人拒绝，本场会议禁止录制与处理',
  WITHDRAWN: '有参会人撤回同意，已停止处理'
}

// 撤回后需要删除的产物。embedding 只在内存态（NFR-11），这里列出是为了删除清单完整，
// 不代表已落盘；实际删除动作与审计由 retention.js 统一执行。
export const CONSENT_PURGE_ARTIFACTS = ['audio', 'transcript', 'intermediate', 'embedding']

// 撤回后仍然允许保留的：脱敏统计与审计记录（用于证明「确实删了」）
export const CONSENT_PURGE_KEEPS = ['redacted_stats', 'audit']

function resolveStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 隐私模式 / 沙箱下 localStorage 可能抛错，降级为内存
  }
  return null
}

function defaultIdFactory() {
  return `mtg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function currentMeetingId(storage = resolveStorage(), ownerId = currentMeetingOwnerId()) {
  if (!storage) return null
  try {
    return storage.getItem(consentCurrentKey(ownerId)) || null
  } catch {
    return null
  }
}

export function createConsentLedger(meetingId, options = {}) {
  const storage = options.storage ?? resolveStorage()
  const now = options.now || (() => new Date().toISOString())
  const idFactory = options.idFactory || defaultIdFactory
  const id = meetingId || idFactory()
  const ownerId = sanitizeOwnerId(options.ownerId ?? currentMeetingOwnerId())

  const state = {
    meetingId: id,
    disclosureVersion: DISCLOSURE_VERSION,
    createdAt: now(),
    // 参会人：姓名是用户填的，不是生成内容，不做美化也不编造
    participants: [],
    audit: [],
    // 首次撤回时间：页面据此提示「已停止处理」，删除动作由 retention 层完成并回填 purgedAt
    purgeRequestedAt: null,
    purgedAt: null
  }

  const storageKey = scopedStorageKey(CONSENT_PREFIX, state.meetingId, ownerId)
  const indexKey = consentIndexKey(ownerId)
  const currentKey = consentCurrentKey(ownerId)

  function record(action, participantId, before, after) {
    state.audit.push({
      seq: state.audit.length + 1,
      action,
      participantId: participantId || null,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      at: now(),
      disclosureVersion: state.disclosureVersion,
      meetingId: state.meetingId
    })
  }

  function find(participantId) {
    return state.participants.find((p) => p.id === participantId) || null
  }

  function counts() {
    const base = { total: state.participants.length, pending: 0, accepted: 0, declined: 0, withdrawn: 0 }
    state.participants.forEach((p) => {
      if (base[p.decision] === undefined) return
      base[p.decision] += 1
    })
    return base
  }

  // 登记参会人。姓名必填但不做任何伪造；同名允许（同一场会议可能真有同名）。
  function addParticipant(name) {
    const label = String(name ?? '').trim()
    if (!label) {
      const error = new Error('参会人姓名不能为空')
      error.code = 'PARTICIPANT_NAME_REQUIRED'
      throw error
    }
    const participant = {
      id: `p${state.participants.length + 1}`,
      name: label,
      decision: 'pending',
      decidedAt: null,
      withdrewAt: null,
      channel: null
    }
    state.participants.push(participant)
    record('declare', participant.id, null, { name: label, decision: 'pending' })
    return participant
  }

  function removeParticipant(participantId) {
    const target = find(participantId)
    if (!target) {
      const error = new Error('参会人不存在')
      error.code = 'PARTICIPANT_NOT_FOUND'
      throw error
    }
    // 已表态的人不能被悄悄删除来「凑」通过 —— 只有未表态的登记可以撤销
    if (target.decision !== 'pending') {
      const error = new Error(`该参会人已${CONSENT_DECISION_LABELS[target.decision]}，不可移除`)
      error.code = 'PARTICIPANT_DECIDED'
      throw error
    }
    state.participants = state.participants.filter((p) => p.id !== participantId)
    record('undeclare', participantId, { name: target.name }, null)
  }

  function decide(participantId, decision, channel = 'in_person') {
    if (!['accepted', 'declined'].includes(decision)) {
      const error = new Error(`未知同意状态：${decision}`)
      error.code = 'DECISION_INVALID'
      throw error
    }
    const target = find(participantId)
    if (!target) {
      const error = new Error('参会人不存在')
      error.code = 'PARTICIPANT_NOT_FOUND'
      throw error
    }
    // 撤回后不可再改回同意：要求重新走一次告知（清场重来），避免「撤回→点同意」把撤回抹掉
    if (target.decision === 'withdrawn') {
      const error = new Error('该参会人已撤回同意，需重新发起本场告知后才可表态')
      error.code = 'CONSENT_WITHDRAWN_LOCKED'
      throw error
    }
    const before = target.decision
    target.decision = decision
    target.decidedAt = now()
    target.channel = channel
    record(decision, participantId, before, { decision, channel })
    return target
  }

  const accept = (participantId, channel) => decide(participantId, 'accepted', channel)
  const decline = (participantId, channel) => decide(participantId, 'declined', channel)

  // 撤回：只能从「已同意」撤回。撤回即触发停止处理 + 删除清单（E-04）。
  function withdraw(participantId, reason = '') {
    const target = find(participantId)
    if (!target) {
      const error = new Error('参会人不存在')
      error.code = 'PARTICIPANT_NOT_FOUND'
      throw error
    }
    if (target.decision !== 'accepted') {
      const error = new Error('只有已同意的参会人可以撤回')
      error.code = 'WITHDRAW_NOT_ACCEPTED'
      throw error
    }
    const before = target.decision
    target.decision = 'withdrawn'
    target.withdrewAt = now()
    if (!state.purgeRequestedAt) state.purgeRequestedAt = target.withdrewAt
    record('withdraw', participantId, before, {
      decision: 'withdrawn',
      reason: String(reason || '').trim() || null,
      artifacts: CONSENT_PURGE_ARTIFACTS,
      keeps: CONSENT_PURGE_KEEPS
    })
    return {
      ok: true,
      purgeRequired: true,
      stopProcessing: true,
      artifacts: [...CONSENT_PURGE_ARTIFACTS],
      keeps: [...CONSENT_PURGE_KEEPS]
    }
  }

  /**
   * FR-03 门禁：能不能开始采集/处理本场音频。
   *
   * 硬约束：本函数**不接收任何覆盖参数**，也不读任何「管理员」开关。
   * 调用方即使写成 canRecord({ force: true }) / canRecord(true)，参数会被忽略，
   * 判定结果与无参调用完全一致 —— 拒绝不可被绕过（PRD 验收项）。
   */
  function canRecord() {
    const CODE_TO_DECISION = {
      PENDING: 'pending',
      DECLINED: 'declined',
      WITHDRAWN: 'withdrawn'
    }
    const blocked = (code) => {
      const decision = CODE_TO_DECISION[code]
      return {
        ok: false,
        code,
        label: CONSENT_BLOCK_REASONS[code],
        blockers: [CONSENT_BLOCK_REASONS[code]],
        blocking: decision
          ? state.participants
              .filter((p) => p.decision === decision)
              .map((p) => ({ id: p.id, name: p.name, decision: p.decision }))
          : [],
        counts: counts(),
        purgeRequired: code === 'WITHDRAWN',
        stopProcessing: code === 'WITHDRAWN' || code === 'DECLINED'
      }
    }

    if (!state.participants.length) return blocked('NO_PARTICIPANTS')
    // 判定优先级：拒绝 > 撤回 > 未表态。拒绝最硬，先判。
    if (state.participants.some((p) => p.decision === 'declined')) return blocked('DECLINED')
    if (state.participants.some((p) => p.decision === 'withdrawn')) return blocked('WITHDRAWN')
    if (state.participants.some((p) => p.decision === 'pending')) return blocked('PENDING')
    return { ok: true, code: 'OK', label: '已取得全体同意', blockers: [], blocking: [], counts: counts(), purgeRequired: false, stopProcessing: false }
  }

  // 采集入口统一调用：不 ok 就抛错，避免调用方「忘了判」直接开麦
  function assertRecordable() {
    const gate = canRecord()
    if (!gate.ok) {
      const error = new Error(`告知同意未通过：${gate.label}`)
      error.code = 'CONSENT_BLOCKED'
      error.gate = gate
      throw error
    }
    return gate
  }

  function markPurged(at) {
    state.purgedAt = at || now()
    record('purge_done', null, null, { purgedAt: state.purgedAt, artifacts: CONSENT_PURGE_ARTIFACTS })
    return state.purgedAt
  }

  function save() {
    if (!storage) return { key: storageKey, at: null, persisted: false }
    storage.setItem(storageKey, JSON.stringify(state))
    let index = []
    try {
      index = JSON.parse(storage.getItem(indexKey) || '[]')
    } catch {
      index = []
    }
    if (!Array.isArray(index)) index = []
    const entry = {
      meetingId: state.meetingId,
      key: storageKey,
      createdAt: state.createdAt,
      disclosureVersion: state.disclosureVersion,
      counts: counts(),
      purgeRequestedAt: state.purgeRequestedAt,
      purgedAt: state.purgedAt
    }
    index = [entry, ...index.filter((i) => i.meetingId !== state.meetingId)]
    storage.setItem(indexKey, JSON.stringify(index))
    storage.setItem(currentKey, state.meetingId)
    return { key: storageKey, at: now(), persisted: true }
  }

  function load() {
    if (!storage) return false
    const raw = storage.getItem(storageKey)
    if (!raw) return false
    try {
      const saved = JSON.parse(raw)
      if (saved.meetingId !== state.meetingId) return false
      state.createdAt = saved.createdAt || state.createdAt
      state.disclosureVersion = saved.disclosureVersion || state.disclosureVersion
      state.participants = Array.isArray(saved.participants) ? saved.participants : []
      state.audit = Array.isArray(saved.audit) ? saved.audit : []
      state.purgeRequestedAt = saved.purgeRequestedAt || null
      state.purgedAt = saved.purgedAt || null
      return true
    } catch {
      return false
    }
  }

  function reset() {
    state.participants = []
    state.audit = []
    state.purgeRequestedAt = null
    state.purgedAt = null
    state.createdAt = now()
    record('reset', null, null, null)
    return state
  }

  return {
    state,
    storageKey,
    ownerId,
    counts,
    addParticipant,
    removeParticipant,
    accept,
    decline,
    withdraw,
    canRecord,
    assertRecordable,
    markPurged,
    save,
    load,
    reset
  }
}

export function listConsentRecords(storage = resolveStorage(), ownerId = currentMeetingOwnerId()) {
  if (!storage) return []
  try {
    const index = JSON.parse(storage.getItem(consentIndexKey(ownerId)) || '[]')
    return Array.isArray(index) ? index : []
  } catch {
    return []
  }
}

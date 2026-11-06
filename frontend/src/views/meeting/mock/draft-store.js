// T-050 / T-051 / T-052：field_overlay、人工确认、发布冻结
// 硬约束：AI 草稿不可变；人工修改只写 overlay；重跑新建版本不覆盖人工作业（FR-12）。
// dev 态保存位置为浏览器 localStorage（不上传、不落库）；生产应为服务端 DB + 对象存储。
// 本文件纯 JS，storage 可注入，Node 冒烟脚本用内存 storage 做确定性验证。

import { currentMeetingOwnerId, sanitizeOwnerId, scopedStorageKey } from './owner-scope.js'

export const STORAGE_PREFIX = 'mvgo.meeting.draft.'
// 索引里只放 key / 时间戳 / RunVersion，**不含正文**，但仍是「某个用户存过哪些版本」的清单，
// 所以与草稿同 owner 分区：`mvgo.meeting.draft.<ownerId>.index`（对齐 api-contract.js OUTPUT_TARGETS.dev）。
// 注意它已从常量改为函数：owner 在运行时可变（同浏览器换账号），常量会锁死成导入那一刻的分区。
export function draftIndexKey(ownerId = currentMeetingOwnerId()) {
  return scopedStorageKey(STORAGE_PREFIX, 'index', ownerId)
}

// P5 整合输出稿件：与 Markdown / CSV / JSON 同受 FR-11 发布门禁
export const ARTICLE_EXPORT_NOTICE =
  '仅已定稿版本可导出整合稿件（FR-11）；本文件为内部定稿件，仅供内部参考，不得作为正式纪要对外流转。'

export function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    }
  }
}

function resolveStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 隐私模式 / 沙箱下 localStorage 可能抛错，降级为内存
  }
  return createMemoryStorage()
}

function assertEditable(state) {
  if (state.publishedAt) {
    throw new Error('已定稿冻结，不可回草稿态；需重跑生成新版本')
  }
}

// FR-11 / T-055：仅「已发布」（内部确认定稿）版本可导出，草稿态一律拒绝
function assertPublished(state) {
  if (!state.publishedAt) {
    const error = new Error('草稿态禁止导出：请先确认定稿后再导出')
    error.code = 'EXPORT_NOT_PUBLISHED'
    throw error
  }
}

export function createDraftStore(draft, options = {}) {
  if (!draft || !Array.isArray(draft.fields)) {
    throw new Error('createDraftStore 需要 draft_schema_v1 草稿')
  }
  const storage = options.storage || resolveStorage()
  const now = options.now || (() => new Date().toISOString())
  // 归属在建店时定一次并整店沿用：save/load/clear 必须与 storageKey 用同一个 owner，
  // 否则「存进 A 区、索引写进 B 区」会让历史版本列表与服务端归属口径（run.ownerId）分叉。
  const ownerId = sanitizeOwnerId(options.ownerId ?? currentMeetingOwnerId())
  const storageKey = scopedStorageKey(STORAGE_PREFIX, draft.runVersion, ownerId)
  const indexKey = draftIndexKey(ownerId)
  const state = {
    runVersion: draft.runVersion,
    templateId: draft.template?.id || 'unknown',
    createdAt: now(),
    updatedAt: null,
    overlay: {},
    publishedAt: null,
    snapshot: null,
    audit: []
  }

  // FR-13：字段级反馈采集，记录改前值 / 改后值 / 操作 / 时间 / RunVersion
  function record(action, fieldId, before, after) {
    state.audit.push({
      seq: state.audit.length + 1,
      action,
      fieldId: fieldId || null,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      at: now(),
      runVersion: state.runVersion
    })
  }

  const snapshotOf = (field) => ({
    value: field?.value ?? null,
    confirmState: field?.confirmState ?? null
  })

  function getMerged() {
    return draft.fields.map((field) => {
      const over = state.overlay[field.fieldId]
      return {
        ...field,
        aiValue: field.value,
        value: over ? over.value : field.value,
        confirmState: over ? over.confirmState : field.confirmState,
        humanEdited: Boolean(over),
        editedAt: over?.editedAt || null,
        rejectReason: over?.reason || null
      }
    })
  }

  function canPublish(requiredFields) {
    const required = requiredFields || draft.fields.map((f) => f.key)
    const merged = getMerged()
    const blockers = []
    if (state.publishedAt) blockers.push('已定稿，不可重复发布')
    required.forEach((key) => {
      const field = merged.find((f) => f.key === key)
      if (!field) {
        blockers.push(`缺少必填字段 ${key}`)
        return
      }
      if (field.value === null || String(field.value).trim() === '') {
        blockers.push(`${field.label} 值为空`)
      }
      if (field.confirmState !== '已确认') {
        blockers.push(`${field.label} 未确认`)
      }
    })
    return { ok: blockers.length === 0, blockers }
  }

  function publish(requiredFields) {
    assertEditable(state)
    const check = canPublish(requiredFields)
    if (!check.ok) throw new Error(`不可定稿：${check.blockers.join('、')}`)
    state.publishedAt = now()
    state.snapshot = {
      runVersion: state.runVersion,
      templateId: state.templateId,
      publishedAt: state.publishedAt,
      frozen: true,
      fields: getMerged()
    }
    state.updatedAt = state.publishedAt
    record('publish', null, { status: '草稿' }, { status: '已定稿冻结' })
    return state.snapshot
  }

  function edit(fieldId, value) {
    assertEditable(state)
    const before = snapshotOf(getMerged().find((f) => f.fieldId === fieldId))
    state.overlay[fieldId] = {
      value,
      confirmState: '编辑中',
      editedAt: now(),
      reason: null
    }
    state.updatedAt = state.overlay[fieldId].editedAt
    record('edit', fieldId, before, { value, confirmState: '编辑中' })
  }

  function confirm(fieldId, value) {
    assertEditable(state)
    const before = snapshotOf(getMerged().find((f) => f.fieldId === fieldId))
    const current = state.overlay[fieldId]
    const nextValue = value === undefined ? (current?.value ?? null) : value
    state.overlay[fieldId] = {
      value: nextValue,
      confirmState: '已确认',
      editedAt: now(),
      reason: null
    }
    state.updatedAt = state.overlay[fieldId].editedAt
    record('confirm', fieldId, before, { value: nextValue, confirmState: '已确认' })
  }

  function reject(fieldId, reason) {
    assertEditable(state)
    if (!reason || !String(reason).trim()) throw new Error('驳回原因必填')
    const before = snapshotOf(getMerged().find((f) => f.fieldId === fieldId))
    state.overlay[fieldId] = {
      value: null,
      confirmState: '已驳回',
      editedAt: now(),
      reason: String(reason).trim()
    }
    state.updatedAt = state.overlay[fieldId].editedAt
    record('reject', fieldId, before, {
      value: null,
      confirmState: '已驳回',
      reason: String(reason).trim()
    })
  }

  function resetField(fieldId) {
    assertEditable(state)
    const before = snapshotOf(getMerged().find((f) => f.fieldId === fieldId))
    delete state.overlay[fieldId]
    state.updatedAt = now()
    record('reset', fieldId, before, snapshotOf(getMerged().find((f) => f.fieldId === fieldId)))
  }

  function save() {
    record('save', null, null, { key: storageKey })
    storage.setItem(storageKey, JSON.stringify(state))
    let index = []
    try {
      index = JSON.parse(storage.getItem(indexKey) || '[]')
    } catch {
      index = []
    }
    if (!Array.isArray(index)) index = []
    index = [
      { runVersion: state.runVersion, key: storageKey, updatedAt: state.updatedAt, savedAt: now() },
      ...index.filter((i) => i.runVersion !== state.runVersion)
    ]
    storage.setItem(indexKey, JSON.stringify(index))
    return { key: storageKey, at: state.updatedAt }
  }

  function load() {
    const raw = storage.getItem(storageKey)
    if (!raw) return false
    try {
      const saved = JSON.parse(raw)
      if (saved.runVersion !== state.runVersion) return false
      state.overlay = saved.overlay || {}
      state.publishedAt = saved.publishedAt || null
      state.snapshot = saved.snapshot || null
      state.createdAt = saved.createdAt || state.createdAt
      state.updatedAt = saved.updatedAt || null
      state.audit = Array.isArray(saved.audit) ? saved.audit : []
      return true
    } catch {
      return false
    }
  }

  function clear() {
    storage.removeItem(storageKey)
    let index = []
    try {
      index = JSON.parse(storage.getItem(indexKey) || '[]')
    } catch {
      index = []
    }
    if (Array.isArray(index)) {
      storage.setItem(
        indexKey,
        JSON.stringify(index.filter((i) => i.runVersion !== state.runVersion))
      )
    }
    return true
  }

  function exportJson() {
    assertPublished(state)
    return JSON.stringify(
      {
        notice: '仅已定稿版本可导出（FR-11）；AI 产出为内部草稿，本文件为内部定稿件，仅供内部参考，不得作为正式纪要对外流转',
        runVersion: state.runVersion,
        templateId: state.templateId,
        outputLanguage: draft.outputLanguage,
        status: state.publishedAt ? '已定稿冻结' : '未定稿',
        savedAt: state.updatedAt,
        storage: { type: 'browser-localStorage', key: storageKey },
        aiDraftImmutable: true,
        fields: getMerged(),
        audit: state.audit
      },
      null,
      2
    )
  }

  function exportMarkdown() {
    assertPublished(state)
    const lines = [
      '# 会议纪要草稿（内部使用）',
      '',
      '> AI 产出为内部草稿，需人工确认后定稿。本文为内部定稿件，保留三态来源标注与证据引用；仅供内部参考，不得对外流转（FR-11）。',
      '',
      `- 模板：${state.templateId}`,
      `- RunVersion：${state.runVersion}`,
      `- 产出语言：${draft.outputLanguage}`,
      `- 状态：${state.publishedAt ? `已定稿冻结（${state.publishedAt}）` : '未定稿'}`,
      `- 保存位置：localStorage · \`${storageKey}\``,
      ''
    ]
    getMerged().forEach((field) => {
      lines.push(`## ${field.label}`)
      lines.push('')
      lines.push(field.value === null ? '（待确认 / 值保持 null）' : String(field.value))
      lines.push('')
      lines.push(
        `- 来源：${field.sourceState} ｜ 确认：${field.confirmState} ｜ 置信度：${field.confidence}`
      )
      if (field.evidenceRefs?.length) lines.push(`- 证据：${field.evidenceRefs.join(', ')}`)
      if (field.candidates?.length) {
        lines.push(`- 冲突候选：${field.candidates.map((c) => c.text).join(' / ')}`)
      }
      if (field.humanEdited) {
        lines.push(`- 人工编辑：是（${field.editedAt}）｜ AI 原值：${field.aiValue ?? 'null'}`)
      }
      if (field.rejectReason) lines.push(`- 驳回原因：${field.rejectReason}`)
      if (field.note) lines.push(`- 备注：${field.note}`)
      lines.push('')
    })
    lines.push('## 变更记录（FR-13）')
    lines.push('')
    lines.push(`- 共 ${state.audit.length} 条 · RunVersion \`${state.runVersion}\``)
    state.audit.forEach((e) => {
      lines.push(
        `- #${e.seq} ${e.at} · ${e.action} · ${e.fieldId || '-'} · ` +
          `${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`
      )
    })
    lines.push('')
    return lines.join('\n')
  }

  // FR-11：CSV 与 Markdown 同为要求的导出格式；含来源标注与证据引用，且带内部使用声明列
  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  function exportCsv() {
    assertPublished(state)
    const notice = '内部定稿件·仅供内部参考·不得作为正式纪要对外流转'
    const header = [
      'fieldId', 'key', 'label', 'value', 'sourceState', 'confirmState',
      'confidence', 'evidenceRefs', 'humanEdited', 'aiValue', 'notice'
    ]
    const rows = getMerged().map((f) => [
      f.fieldId,
      f.key,
      f.label,
      f.value,
      f.sourceState,
      f.confirmState,
      f.confidence,
      (f.evidenceRefs || []).join('|'),
      f.humanEdited ? 'true' : 'false',
      f.aiValue,
      notice
    ])
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  }

  // P5：整合稿件导出。稿件是草稿字段 + 证据的成文版本，仍属于「内部草稿」，
  // 因此草稿态一律拒绝；页面还会额外校验稿件指纹是否与当前人工编辑一致（防止导出过期稿件）。
  function exportArticle(article) {
    assertPublished(state)
    if (!article || typeof article.markdown !== 'string' || !article.markdown.trim()) {
      const error = new Error('整合稿件为空：请先在草稿预览后合成输出稿件')
      error.code = 'ARTICLE_EMPTY'
      throw error
    }
    return [
      `> ${ARTICLE_EXPORT_NOTICE}`,
      '',
      `- RunVersion：\`${state.runVersion}\``,
      `- 稿件指纹：\`${article.fingerprint || 'unknown'}\``,
      `- 合成方式：${article.adapterId || 'unknown'} / ${article.adapterMode || 'unknown'}`,
      `- 定稿时间：${state.publishedAt}`,
      '',
      article.markdown.trim(),
      ''
    ].join('\n')
  }

  // Q-13：统一导出内容模型。所有格式（md / html / word / pdf）只能走这里取数据，
  // 发布门禁与「人工作业优先」的 merged 结果因此不可被绕过；渲染交给 export-formats.js。
  function getExportPayload(article = null, scope = 'both') {
    assertPublished(state)
    if (!['both', 'article', 'fields'].includes(scope)) {
      const error = new Error(`未知导出内容范围：${scope}`)
      error.code = 'EXPORT_SCOPE_INVALID'
      throw error
    }
    if (scope !== 'fields' && !article?.markdown) {
      const error = new Error('该内容范围需要整合稿件：请先合成输出稿件')
      error.code = 'ARTICLE_EMPTY'
      throw error
    }
    return {
      notice: ARTICLE_EXPORT_NOTICE,
      runVersion: state.runVersion,
      templateId: state.templateId,
      outputLanguage: draft.outputLanguage,
      publishedAt: state.publishedAt,
      frozen: true,
      storageKey,
      scope,
      fields: getMerged(),
      article: article
        ? {
            markdown: article.markdown,
            adapterId: article.adapterId,
            adapterMode: article.adapterMode,
            fingerprint: article.fingerprint,
            stats: article.stats
          }
        : null,
      audit: state.audit.map((e) => ({ ...e }))
    }
  }

  return {
    state,
    storageKey,
    ownerId,
    indexKey,
    getMerged,
    canPublish,
    publish,
    edit,
    confirm,
    reject,
    resetField,
    save,
    load,
    clear,
    exportJson,
    exportMarkdown,
    exportCsv,
    exportArticle,
    getExportPayload
  }
}

// ownerId 默认取当前分区；history 面板只该看到自己的版本，不跨用户串。
export function listSaved(storage = resolveStorage(), ownerId = currentMeetingOwnerId()) {
  try {
    const index = JSON.parse(storage.getItem(draftIndexKey(ownerId)) || '[]')
    return Array.isArray(index) ? index : []
  } catch {
    return []
  }
}

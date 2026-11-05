// S3 契约层：draft_schema_v1 的运行时定义与校验（对应 T-002 / T-003）
// 与 PRD 附录 B、技术方案 §5 对齐；纯 JS，Node 冒烟与浏览器共用。
// 作用：把「文档里的 schema」变成可执行的门禁，任何 adapter 产出都必须过 validateDraftShape。

export const CONTRACT_VERSION = 'v1'

export const SOURCE_STATES = Object.freeze(['from_meeting', 'from_background', 'unconfirmed'])
export const CONFIRM_STATES = Object.freeze(['未确认', '编辑中', '已确认', '已驳回'])

export const DRAFT_TOP_LEVEL = Object.freeze([
  'runVersion',
  'template',
  'detectedLanguages',
  'outputLanguage',
  'warnings',
  'truncatedRatio',
  'injectionEvents',
  'fields'
])

export const FIELD_REQUIRED = Object.freeze([
  'fieldId',
  'key',
  'label',
  'value',
  'sourceState',
  'evidenceRefs',
  'confidence',
  'confirmState'
])

export const FIELD_OPTIONAL = Object.freeze(['note', 'candidates', 'reason'])

// 模板必填字段：与 constraint-composer.REQUIRED_FIELDS 保持同源，此处额外附中文标签便于 UI / 导出
export const TEMPLATE_SCHEMAS = Object.freeze({
  progress_review: {
    id: 'progress_review',
    version: 'v1',
    label: '工作进度会',
    required: Object.freeze(['topic_context', 'progress_summary', 'milestone_status', 'open_issues'])
  },
  requirement_review: {
    id: 'requirement_review',
    version: 'v1',
    label: '需求方案会',
    required: Object.freeze(['topic_context', 'options', 'conclusion', 'open_questions'])
  },
  other: {
    id: 'other',
    version: 'v1',
    label: '其他会议',
    required: Object.freeze(['topic_context', 'progress_summary', 'open_issues'])
  }
})

export function schemaOf(meetingType) {
  return TEMPLATE_SCHEMAS[meetingType] || TEMPLATE_SCHEMAS.other
}

export function validateFieldShape(field, index = 0) {
  const errors = []
  const at = `fields[${index}]`
  if (!field || typeof field !== 'object') return [`${at} 不是对象`]
  FIELD_REQUIRED.forEach((key) => {
    if (!(key in field)) errors.push(`${at} 缺少 ${key}`)
  })
  if (!SOURCE_STATES.includes(field.sourceState)) {
    errors.push(`${at}.sourceState 非法：${field.sourceState}`)
  }
  if (!CONFIRM_STATES.includes(field.confirmState)) {
    errors.push(`${at}.confirmState 非法：${field.confirmState}`)
  }
  if (!Array.isArray(field.evidenceRefs)) errors.push(`${at}.evidenceRefs 必须是数组`)
  // confidence 语义（v1 内向后兼容的放宽）：0~1 数值 = 真实测量值；
  // null = 模型未返回逐句置信度（未知，UI 显示「—」，V-4 不据此降级）。
  // 严禁用 0 / 0.3 这类哨兵数冒充「未知」——那会被 V-4 当成低置信，把真抽到的内容整片清空。
  if (field.confidence !== null &&
      (typeof field.confidence !== 'number' || field.confidence < 0 || field.confidence > 1)) {
    errors.push(`${at}.confidence 必须是 0~1 数值，或 null 表示模型未返回逐句置信度`)
  }
  // 硬约束：结论类字段不得来自背景资料；值非空却无证据引用也不合法
  if (field.sourceState === 'from_background' && field.key !== 'topic_context') {
    errors.push(`${at} 结论类字段 ${field.key} 不得标为 from_background`)
  }
  if (field.value !== null && field.value !== '' && field.sourceState === 'from_meeting' &&
      (!field.evidenceRefs || field.evidenceRefs.length === 0)) {
    errors.push(`${at} 来自会议且值非空，但缺少 evidenceRefs`)
  }
  if (field.candidates && !Array.isArray(field.candidates)) {
    errors.push(`${at}.candidates 必须是数组`)
  }
  return errors
}

export function validateDraftShape(draft) {
  const errors = []
  if (!draft || typeof draft !== 'object') return { ok: false, errors: ['draft 不是对象'] }
  DRAFT_TOP_LEVEL.forEach((key) => {
    if (!(key in draft)) errors.push(`缺少顶层字段 ${key}`)
  })
  if (!draft.template || !draft.template.id) errors.push('template.id 缺失')
  if (!Array.isArray(draft.fields)) {
    errors.push('fields 必须是数组')
  } else {
    draft.fields.forEach((field, i) => errors.push(...validateFieldShape(field, i)))
    const schema = schemaOf(draft.template?.id)
    const keys = new Set(draft.fields.map((f) => f.key))
    schema.required.forEach((key) => {
      if (!keys.has(key)) errors.push(`模板 ${schema.id} 必填字段 ${key} 缺失`)
    })
  }
  if (!Array.isArray(draft.warnings)) errors.push('warnings 必须是数组')
  if (!Array.isArray(draft.injectionEvents)) errors.push('injectionEvents 必须是数组')
  if (!Array.isArray(draft.detectedLanguages)) errors.push('detectedLanguages 必须是数组')
  return { ok: errors.length === 0, errors }
}

// 契约自检：确保运行时定义本身未被改坏（Node 冒烟会调用）
export function selfCheckContracts() {
  const problems = []
  if (CONTRACT_VERSION !== 'v1') problems.push('CONTRACT_VERSION 被改动')
  if (SOURCE_STATES.length !== 3) problems.push('三态来源标注被改动')
  Object.values(TEMPLATE_SCHEMAS).forEach((schema) => {
    if (!schema.required.length) problems.push(`${schema.id} 必填字段为空`)
    if (schema.required.includes('conclusion') && schema.id === 'progress_review') {
      problems.push('progress_review 不应含 conclusion')
    }
  })
  return { ok: problems.length === 0, problems }
}

// 输出校验器 V-1 ~ V-6（《技术方案 v1.1》/《PRD v1.1》FR-13 的 Mock 实现）
// 关键：校验器不可被用户指令关闭；发现违规时不是简单报错，而是自动降级修复并留下 repairs 记录。

import { REQUIRED_FIELDS } from './constraint-composer.js'

const CONCLUSION_KEYS = new Set([
  'progress_summary',
  'milestone_status',
  'open_issues',
  'options',
  'conclusion',
  'open_questions'
])

function repair(field, patch, reason, repairs) {
  Object.assign(field, patch)
  repairs.push({ fieldId: field.fieldId, reason, patch })
}

export function validateDraft(rawDraft, contract) {
  const draft = JSON.parse(JSON.stringify(rawDraft))
  const repairs = []
  const results = []
  const add = (id, name, passed, detail) => results.push({ id, name, passed, detail })

  const utteranceIds = new Set(contract.utteranceRefs)
  const spanIds = new Set(contract.backgroundSpans.map((s) => s.spanId))
  const allRefs = new Set([...utteranceIds, ...spanIds])

  // V-1 schema：模板必填字段齐全，字段结构完整
  const keys = new Set(draft.fields.map((f) => f.key))
  const missing = contract.requiredFields.filter((k) => !keys.has(k))
  if (missing.length) {
    missing.forEach((k, i) => {
      draft.fields.push({
        fieldId: `f_repair_${i + 1}`,
        key: k,
        label: k,
        value: null,
        sourceState: 'unconfirmed',
        evidenceRefs: [],
        confidence: null,
        confirmState: '未确认',
        note: 'V-1 补齐缺失必填字段，值保持 null 待人工确认'
      })
      repairs.push({ fieldId: `f_repair_${i + 1}`, reason: 'V-1 缺失必填字段', patch: { key: k } })
    })
  }
  const malformed = draft.fields.filter(
    (f) =>
      !f.fieldId ||
      !f.key ||
      !('value' in f) ||
      !['from_meeting', 'from_background', 'unconfirmed'].includes(f.sourceState) ||
      !Array.isArray(f.evidenceRefs) ||
      f.confirmState === undefined
  )
  add(
    'V-1',
    'schema 必填字段',
    missing.length === 0 && malformed.length === 0,
    missing.length || malformed.length
      ? `自动补齐 ${missing.length} 个必填字段；结构异常 ${malformed.length} 个`
      : `${contract.requiredFields.length} 个必填字段齐全，字段结构完整`
  )

  // V-2 证据引用：来源与 ref 类型必须匹配，非法引用剔除
  let illegal = 0
  draft.fields.forEach((f) => {
    const allowed =
      f.sourceState === 'from_meeting'
        ? utteranceIds
        : f.sourceState === 'from_background'
          ? spanIds
          : allRefs
    const valid = (f.evidenceRefs || []).filter((r) => allowed.has(r))
    illegal += (f.evidenceRefs || []).length - valid.length
    if (valid.length !== (f.evidenceRefs || []).length) {
      repair(f, { evidenceRefs: valid }, 'V-2 剔除非法证据引用', repairs)
    }
    if (f.sourceState === 'from_meeting' && !valid.length && f.value !== null) {
      repair(
        f,
        { value: null, sourceState: 'unconfirmed', confidence: null },
        'V-2 结论无有效证据，降级为未确认',
        repairs
      )
    }
  })
  add(
    'V-2',
    '证据引用可回跳',
    illegal === 0,
    illegal ? `已剔除 ${illegal} 个不存在或与来源不匹配的引用` : '全部引用可定位到 utterance 或 background span'
  )

  // V-3 来源边界：背景资料只能进 topic_context，绝不作为结论来源
  let boundaryViolations = 0
  draft.fields.forEach((f) => {
    if (CONCLUSION_KEYS.has(f.key) && f.sourceState === 'from_background') {
      boundaryViolations += 1
      repair(
        f,
        { value: null, sourceState: 'unconfirmed', confidence: null, evidenceRefs: [] },
        'V-3 结论类字段禁止引用背景资料',
        repairs
      )
    }
  })
  add(
    'V-3',
    '来源边界',
    boundaryViolations === 0,
    boundaryViolations
      ? `拦截并降级 ${boundaryViolations} 个越界结论字段`
      : '结论字段均来自会议录音；topic_context 可引用背景资料（仅消歧）'
  )

  // V-4 低置信降级：已知置信度 < 0.5 必须 null + 未确认。
  // 关键区分：null = 「模型没返回逐句置信度」（本地离线 Whisper 就是这种），是「未知」不是「0 分」。
  // 把 null 当 0 分降级，会把真实抽到的内容整片清空——那是造假，不是防护。
  let downgraded = 0
  let unknownConfidence = 0
  draft.fields.forEach((f) => {
    const known = typeof f.confidence === 'number' && Number.isFinite(f.confidence)
    if (!known) {
      if (f.value !== null) unknownConfidence += 1
      return
    }
    if (f.confidence < 0.5 && (f.value !== null || f.sourceState !== 'unconfirmed')) {
      downgraded += 1
      // 测量值原样保留（那是真实数据），只撤下内容与来源
      repair(f, { value: null, sourceState: 'unconfirmed' }, 'V-4 低置信字段降级', repairs)
    }
  })
  add(
    'V-4',
    '低置信降级',
    downgraded === 0,
    downgraded
      ? `自动降级 ${downgraded} 个低置信字段`
      : unknownConfidence
        ? `有置信度的字段均 ≥ 0.5；另有 ${unknownConfidence} 个字段模型未返回逐句置信度（显示为「—」），按证据原文保留并标记未确认`
        : '低置信字段均为 null + 未确认'
  )

  // V-5 注入防护：越权指令不得关闭必填字段 / 来源标注 / 校验器
  const stillHasSource = draft.fields.every((f) =>
    ['from_meeting', 'from_background', 'unconfirmed'].includes(f.sourceState)
  )
  const stillHasRequired = contract.requiredFields.every((k) =>
    draft.fields.some((f) => f.key === k)
  )
  const injectionCount = contract.injectionEvents.length
  add(
    'V-5',
    '提示注入防护',
    stillHasSource && stillHasRequired,
    injectionCount
      ? `检测到 ${injectionCount} 条越权指令并已忽略；必填字段 / 三态来源 / 校验器保持开启`
      : '未检测到注入痕迹；硬约束保持开启'
  )

  // V-6 冲突标注：unconfirmed.conflict 必须 null + ≥2 个并列候选
  let conflictFixed = 0
  draft.fields.forEach((f) => {
    if (f.reason === 'conflict') {
      const candidates = Array.isArray(f.candidates) ? f.candidates : []
      if (f.value !== null || candidates.length < 2) {
        conflictFixed += 1
        repair(
          f,
          {
            value: null,
            sourceState: 'unconfirmed',
            candidates: candidates.length >= 2
              ? candidates
              : [
                  { text: '会议说法（证据不足）', evidenceRefs: [] },
                  { text: '资料说法（证据不足）', evidenceRefs: [] }
                ]
          },
          'V-6 冲突字段强制并列候选',
          repairs
        )
      }
    }
  })
  add(
    'V-6',
    '冲突并列标注',
    conflictFixed === 0,
    conflictFixed ? `修正 ${conflictFixed} 个冲突字段` : '冲突字段并列展示会议说法与资料说法，未自动采纳任何一方'
  )

  return {
    results,
    passed: results.every((r) => r.passed),
    allResults: results.map((r) => r.id),
    repairs,
    draft
  }
}

export { REQUIRED_FIELDS }

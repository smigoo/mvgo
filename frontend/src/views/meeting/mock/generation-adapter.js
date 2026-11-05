// T-022 MockGenerationAdapter —— 规则式抽取，不调用任何 LLM / 云密钥
// 目的：让「全链路」真的能根据选中 fixture 算出草稿，而不是展示一份写死的样例。
// 铁律：结论类字段只取 utterances 且必须带 evidenceRefs；背景资料只允许进入 topic_context。

const PROGRESS_FIELDS = [
  { key: 'topic_context', label: '议题背景', kind: 'context' },
  {
    key: 'progress_summary',
    label: '项目进展',
    kind: 'primary',
    pattern: /(联调|压测|灰度|pipeline|deploy|进度|已完成|做完)/i
  },
  {
    key: 'milestone_status',
    label: '里程碑',
    kind: 'milestone',
    pattern: /(改到|上线时间|里程碑|\d{1,2}\s*月)/
  },
  {
    key: 'open_issues',
    label: '遗留问题',
    kind: 'issues',
    primary: /(遗留问题|算遗留|就一条)/,
    supporting: /(还没|待确认|待批|没批下来|回滚)/
  }
]

const REQUIREMENT_FIELDS = [
  { key: 'topic_context', label: '议题背景', kind: 'context' },
  { key: 'options', label: '方案对比', kind: 'primary', pattern: /方案\s*[A-Za-z]/ },
  {
    key: 'conclusion',
    label: '讨论结论',
    kind: 'conclusion',
    pattern: /(先不定|未定|定了|决定|采用|达成|暂缓)/
  },
  { key: 'open_questions', label: '待决问题', kind: 'primary', pattern: /(再说|等压测|顾虑|待定)/ }
]

const TEMPLATES = {
  progress_review: PROGRESS_FIELDS,
  requirement_review: REQUIREMENT_FIELDS,
  other: PROGRESS_FIELDS
}

// 平均只对「真的带置信度」的句子生效；本地 Whisper 不返回逐句置信度（null），
// 此时必须返回 null 表示「未知」，不能求和成 0 —— 0 会被 V-4 当成低置信，把真抽到的内容整片清空。
const avg = (list) => {
  const nums = list.filter((n) => typeof n === 'number' && Number.isFinite(n))
  if (!nums.length) return null
  return Number((nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(2))
}

const matched = (utterances, pattern) => utterances.filter((u) => pattern.test(u.text))

// 置信度语义（全文件统一）：有测量值 = 0~1 的有限数；模型不返回 / 未抽取到 = null（未知）。
// 不允许用 0.3 / 0.42 / 0.95 这类哨兵数冒充分数——下游会把它们当真实置信度写进稿件。
function emptyField(spec, index) {
  return {
    fieldId: `f_${String(index + 1).padStart(3, '0')}`,
    key: spec.key,
    label: spec.label,
    value: null,
    sourceState: 'unconfirmed',
    evidenceRefs: [],
    confidence: null,
    confirmState: '未确认'
  }
}

function buildField(spec, index, utterances, contract, fixture) {
  const field = emptyField(spec, index)
  const spans = contract.backgroundSpans

  if (spec.kind === 'context') {
    if (spans.length) {
      const span = spans[0]
      field.value = span.text
      field.sourceState = 'from_background'
      field.evidenceRefs = [span.spanId]
      // 背景资料是文档不是录音，本来就没有 ASR 置信度可言，保持 null
      field.confidence = null
      field.note = '背景引用字段，仅用于实体消歧；结论类字段禁止 from_background'
    } else {
      const first = utterances[0]
      field.value = first ? first.text : null
      field.sourceState = first ? 'from_meeting' : 'unconfirmed'
      field.evidenceRefs = first ? [first.utteranceId] : []
      field.confidence = first ? first.asrConfidence : null
      field.note = `未传入背景资料，取会议开场陈述（${fixture.label}）作为议题背景`
    }
    return field
  }

  if (spec.kind === 'primary') {
    const hits = matched(utterances, spec.pattern)
    field.matchedCount = hits.length
    if (!hits.length) {
      field.note = '转写稿中未抽取到该字段，值保持 null，需人工确认'
      return field
    }
    field.value = hits.map((u) => u.text).join('；')
    field.sourceState = 'from_meeting'
    field.evidenceRefs = hits.map((u) => u.utteranceId)
    field.confidence = avg(hits.map((u) => u.asrConfidence))
    return field
  }

  if (spec.kind === 'conclusion') {
    const hits = matched(utterances, spec.pattern)
    field.matchedCount = hits.length
    if (!hits.length) {
      field.confidence = null
      field.note = '会议中未形成明确结论，禁止臆造'
      return field
    }
    const hit = hits[0]
    const deferred = /(先不定|未定|暂缓|再说)/.test(hit.text)
    field.value = deferred
      ? `未达成决议：${hit.text}`
      : hit.text
    field.sourceState = 'from_meeting'
    field.evidenceRefs = hits.map((u) => u.utteranceId)
    field.confidence = avg(hits.map((u) => u.asrConfidence))
    return field
  }

  if (spec.kind === 'milestone') {
    const hits = matched(utterances, spec.pattern)
    field.matchedCount = hits.length
    const hit = hits.find((u) => /\d{1,2}\s*月/.test(u.text))
    if (!hit) {
      field.confidence = null
      field.note = '未抽取到里程碑时间，值保持 null，需人工确认'
      return field
    }
    const months = hit.text.match(/\d{1,2}\s*月/g) || []
    const newValue = months[0] || null
    const oldValue = months[1] || null
    // 冲突：背景资料里出现旧计划 → 决议仍取录音，但字段降级为 unconfirmed 并列两种说法
    const conflictSpan =
      oldValue && spans.find((s) => s.text.includes(oldValue))
    if (conflictSpan) {
      field.value = null
      field.sourceState = 'unconfirmed'
      field.reason = 'conflict'
      field.confidence = null
      field.evidenceRefs = [hit.utteranceId, conflictSpan.spanId]
      field.candidates = [
        { text: `会上改到 ${newValue}`, evidenceRefs: [hit.utteranceId] },
        { text: `资料写 ${oldValue}`, evidenceRefs: [conflictSpan.spanId] }
      ]
      field.note = '录音决议优先，但检测到与背景资料冲突，并列展示待人工确认（不自动采纳旧计划）'
    } else {
      field.value = `上线时间 ${newValue ?? ''}`.trim()
      field.sourceState = 'from_meeting'
      field.evidenceRefs = [hit.utteranceId]
      field.confidence = hit.asrConfidence
    }
    return field
  }

  if (spec.kind === 'issues') {
    const primaryHits = matched(utterances, spec.primary)
    const primaryIds = new Set(primaryHits.map((u) => u.utteranceId))
    const supportingHits = matched(utterances, spec.supporting).filter(
      (u) => !primaryIds.has(u.utteranceId)
    )
    const main = primaryHits.length ? primaryHits : supportingHits.slice(0, 1)
    field.matchedCount = primaryHits.length || (supportingHits.length ? 1 : 0)
    if (!main.length) {
      field.confidence = null
      field.note = '未抽取到遗留问题，值保持 null，需人工确认'
      return field
    }
    field.value = main.map((u) => u.text).join('；')
    field.sourceState = 'from_meeting'
    field.evidenceRefs = [
      ...main.map((u) => u.utteranceId),
      ...supportingHits.map((u) => u.utteranceId)
    ]
    field.confidence = avg([...main, ...supportingHits].map((u) => u.asrConfidence))
    return field
  }

  // 兜底：未知 kind 一律保持 null/unconfirmed，防止臆造
  field.confidence = null
  field.note = `未实现的抽取规则 ${spec.kind}，值保持 null`
  return field
}

export const mockGenerationAdapter = {
  id: 'mock-generation-v1',
  adapterMode: 'offline_rule_based',

  generate(contract, utterances, fixture) {
    const specs = TEMPLATES[contract.meetingType] || TEMPLATES.other
    const fields = specs.map((spec, i) =>
      buildField(spec, i, utterances, contract, fixture)
    )
    const warnings = [...contract.warnings]
    if (contract.instructionFlags.concise) {
      warnings.push('篇幅要求为软约束：必填字段一个未删，仅提示人工复核篇幅')
    }
    return {
      runVersion: contract.runVersion,
      template: { id: contract.meetingType, version: 'v1' },
      detectedLanguages: contract.detectedLanguages,
      outputLanguage: contract.outputLanguage,
      warnings,
      truncatedRatio: contract.truncatedRatio,
      injectionEvents: contract.injectionEvents,
      fields
    }
  }
}

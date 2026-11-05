// P5 整合输出稿件：CompositionAdapter 契约 + 本地确定性实现 + 云合成骨架
// 需求来源：草稿预览后，把草稿字段 / 会议发言 / 背景资料 / 来源标注 / 证据引用整合为一篇可读稿件。
//
// 边界（诚实性硬约束）：
// 1. 云 LLM 密钥未就绪，本文件提供「可替换的合成适配层」，本地实现是规则式确定性整合，
//    不是大模型生成；任何地方都不得宣称「AI 已生成稿件」。
// 2. 稿件正文不得臆造：结论文字一律取自 mergedFields（含人工 overlay）与被引用的 utterance / span 原文。
// 3. 三态来源标注、证据引用、未确认显式列出、FR-11 发布门禁在合成层同样不可关闭。
// 4. 稿件层独立做提示注入筛查，不依赖上游是否已过滤（三层防护的最后一环）。
// 5. 不写时间戳，保证同输入产生同 fingerprint / 同 markdown，Node 冒烟可重复断言。

import { INJECTION_PATTERNS } from './constraint-composer.js'

export const COMPOSITION_CONTRACT_METHODS = Object.freeze(['compose'])

export const ARTICLE_SECTION_IDS = Object.freeze([
  'overview',
  'core',
  'evidence',
  'open_items',
  'boundary'
])

export const COMPOSITION_OUTPUT_FIELDS = Object.freeze([
  'articleId',
  'runVersion',
  'adapterId',
  'adapterMode',
  'sections',
  'markdown',
  'fingerprint',
  'stats',
  'warnings',
  'sourceSummary'
])

export const ARTICLE_NOTICE =
  '本文为内部整理稿（草稿），由结构化草稿与会议证据整合而成，须人工确认后定稿；仅供内部参考，不得作为正式纪要对外流转。'

export const SOURCE_MARKS = Object.freeze({
  from_meeting: '来自会议',
  from_background: '来自背景',
  unconfirmed: '未确认'
})

// 云合成依赖：与 CloudGenerationAdapter 保持同一套「未连接即拒绝」语义
export const CLOUD_COMPOSITION_DEPENDENCIES = Object.freeze([
  { id: 'D-01', name: '云 LLM API 密钥', level: '阻塞', ready: false },
  { id: 'COM-01', name: 'JSON mode + article_schema_v1 输出约束', level: '阻塞', ready: false },
  { id: 'COM-02', name: '合成结果仍需过 V-1~V-6 与 FR-11 发布门禁', level: '阻塞', ready: false }
])

export function cloudCompositionReadiness() {
  const missing = CLOUD_COMPOSITION_DEPENDENCIES.filter((d) => !d.ready)
  return {
    ready: missing.length === 0,
    adapterMode: 'local_deterministic',
    missing,
    contractMethods: [...COMPOSITION_CONTRACT_METHODS],
    outputFields: [...COMPOSITION_OUTPUT_FIELDS],
    note: '云合成适配器未连接；当前走本地确定性整合，未调用任何 LLM'
  }
}

function notConnected(method) {
  return async () => {
    const error = new Error(
      `CloudCompositionAdapter.${method} 未连接：需先完成云 LLM 密钥 / article_schema_v1 输出约束 / 合成后校验与发布门禁（当前 adapter_mode=local_deterministic）`
    )
    error.code = 'NOT_CONNECTED'
    error.method = method
    throw error
  }
}

export const cloudCompositionAdapter = Object.freeze({
  id: 'cloud-composition-v1',
  adapterMode: 'cloud',
  supportedLanguages: ['zh-CN', 'en-US'],
  compose: notConnected('compose')
})

// 契约测试：本地 / 云两个适配器必须实现同一组方法
export function compositionAdapterContractCheck(localAdapter) {
  const localOk = COMPOSITION_CONTRACT_METHODS.every(
    (m) => typeof localAdapter?.[m] === 'function'
  )
  const cloudOk = COMPOSITION_CONTRACT_METHODS.every(
    (m) => typeof cloudCompositionAdapter[m] === 'function'
  )
  return {
    ok: localOk && cloudOk,
    methods: [...COMPOSITION_CONTRACT_METHODS],
    localOk,
    cloudOk,
    note: '同构校验只覆盖方法签名；云侧真实返回结构需依赖就绪后补契约测试'
  }
}

// ---- 工具 ----

function stableHash(text) {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

function clean(text) {
  return String(text ?? '').replace(/\r/g, '').trim()
}

function hitsInjection(text) {
  return INJECTION_PATTERNS.some(({ pattern }) => pattern.test(text))
}

function stamp(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

const unique = (list) => [...new Set(list.filter(Boolean))]

// 输入指纹：人工编辑 / 确认 / 驳回 / 证据变化都会改变指纹，页面据此判定稿件是否已过期
export function buildCompositionFingerprint({ draft, mergedFields, utterances, backgroundSpans }) {
  const payload = {
    runVersion: draft?.runVersion || '',
    outputLanguage: draft?.outputLanguage || '',
    fields: (mergedFields || []).map((f) => [
      f.fieldId,
      clean(f.value),
      f.sourceState,
      f.confirmState,
      f.humanEdited ? 1 : 0,
      [...(f.evidenceRefs || [])],
      (f.candidates || []).map((c) => c.text)
    ]),
    utterances: (utterances || []).map((u) => [u.utteranceId, clean(u.text), u.lang]),
    spans: (backgroundSpans || []).map((s) => [s.spanId, clean(s.text)])
  }
  return `art_${stableHash(JSON.stringify(payload))}`
}

export function isCompositionCurrent(article, input) {
  return Boolean(article?.fingerprint) && article.fingerprint === buildCompositionFingerprint(input)
}

// ---- 本地确定性整合 ----

function buildOverview({ draft, utterances, backgroundSpans, meetingLabel }) {
  const langs = (draft?.detectedLanguages || [])
    .map((l) => `${l.lang} ${Math.round(l.share * 100)}%`)
    .join(' / ')
  const speakers = unique((utterances || []).map((u) => u.speakerLabel))
  const starts = (utterances || []).map((u) => u.startMs || 0)
  const startMs = starts.length ? Math.min(...starts) : 0
  const endMs = (utterances || []).reduce((m, u) => Math.max(m, u.endMs || 0), 0)
  return [
    `会议：${clean(meetingLabel) || '未命名会议'}`,
    `模板：${draft?.template?.id || 'unknown'} / ${draft?.template?.version || 'v1'}`,
    `产出语言：${draft?.outputLanguage || 'zh-CN'}`,
    `识别语种：${langs || '未识别'}`,
    `参会说话人（会议内临时标签）：${speakers.length} 位 · ${speakers.join('、') || '—'}`,
    `发言记录：${(utterances || []).length} 条 · 覆盖 ${stamp(startMs)}–${stamp(endMs)}`,
    `背景资料片段：${(backgroundSpans || []).length} 条（仅用于实体消歧）`
  ]
}

function buildCoreParagraphs(mergedFields, warningsRef) {
  return (mergedFields || []).map((field, index) => {
    const sourceState = SOURCE_MARKS[field.sourceState] ? field.sourceState : 'unconfirmed'
    const mark = SOURCE_MARKS[sourceState]
    const candidateRefs = (field.candidates || []).flatMap((c) => c.evidenceRefs || [])
    const refs = unique([...(field.evidenceRefs || []), ...candidateRefs])
    const suppressed = sourceState === 'from_background' && hitsInjection(clean(field.value))
    const rejected = field.confirmState === '已驳回'
    const empty = field.value === null || field.value === undefined || clean(field.value) === ''

    if (suppressed) {
      warningsRef.push(
        `${field.fieldId}：背景片段命中越权指令模式，已忽略，不进入稿件正文（来源标注与必填字段保留）`
      )
    }

    let text
    if (suppressed) {
      text = `【${mark}】${field.label}：已忽略越权指令，此处不引用该背景片段，待人工核实。`
    } else if (rejected || empty) {
      const parts = [
        `【未确认】${field.label}：未确认，待人工核实` +
          `${field.rejectReason ? `（驳回原因：${clean(field.rejectReason)}）` : ''}` +
          `${Number(field.confidence) > 0 && Number(field.confidence) < 0.7 ? `（置信度 ${field.confidence}）` : ''}。`
      ]
      // 冲突候选即使字段值为 null 也必须并列展示，不得静默丢失（FR-07 / V-6）
      if (field.candidates?.length) {
        parts.push(
          `（冲突并列：${field.candidates
            .map((c) => `${clean(c.text)}${(c.evidenceRefs || []).length ? `（${c.evidenceRefs.join('、')}）` : ''}`)
            .join(' / ')}；不擅自选边）`
        )
      }
      text = parts.join('')
    } else {
      const parts = [`【${mark}】${clean(field.value)}`]
      const ownRefs = unique(field.evidenceRefs || [])
      if (ownRefs.length) parts.push(`（证据：${ownRefs.join('、')}）`)
      if (field.humanEdited && field.aiValue !== field.value) parts.push('（人工修订，AI 原值保留于草稿）')
      if (Number(field.confidence) > 0 && Number(field.confidence) < 0.7) parts.push('（低置信，需复核）')
      if (field.candidates?.length) {
        parts.push(
          `（冲突并列：${field.candidates.map((c) => clean(c.text)).join(' / ')}；不擅自选边）`
        )
      }
      text = parts.join('')
    }

    return {
      index: index + 1,
      fieldId: field.fieldId,
      label: field.label,
      key: field.key,
      text,
      sourceState: suppressed || rejected || empty ? 'unconfirmed' : sourceState,
      evidenceRefs: suppressed ? [] : refs,
      suppressed,
      unconfirmed: suppressed || rejected || empty || sourceState === 'unconfirmed'
    }
  })
}

function buildEvidenceParagraphs({ mergedFields, utterances, backgroundSpans, suppressedSpanIds }) {
  const refs = unique(
    (mergedFields || []).flatMap((f) => [
      ...(f.evidenceRefs || []),
      ...(f.candidates || []).flatMap((c) => c.evidenceRefs || [])
    ])
  )
  const byUtterance = new Map((utterances || []).map((u) => [u.utteranceId, u]))
  const bySpan = new Map((backgroundSpans || []).map((s) => [s.spanId, s]))
  const lines = []
  const usedUtterances = []
  const usedSpans = []

  refs.forEach((ref) => {
    const u = byUtterance.get(ref)
    if (u) {
      usedUtterances.push(u)
      lines.push({
        refId: ref,
        text: `[${ref}] ${u.speakerLabel} · ${stamp(u.startMs)}–${stamp(u.endMs)} · ${u.lang}：${clean(u.text)}`
      })
      return
    }
    const s = bySpan.get(ref)
    if (s) {
      usedSpans.push(s.spanId)
      const blocked = suppressedSpanIds.has(s.spanId) || hitsInjection(clean(s.text))
      lines.push({
        refId: ref,
        text: blocked
          ? `[${ref}] 背景资料：已忽略越权指令片段，不进入稿件正文`
          : `[${ref}] 背景资料（仅实体消歧）：${clean(s.text)}`
      })
      return
    }
    lines.push({ refId: ref, text: `[${ref}] 证据源缺失，待人工核实` })
  })

  // 发言按时间戳排序、背景片段随后、找不到的引用留在末尾，让稿件读起来是顺的
  const rank = (ref) => (byUtterance.has(ref) ? 0 : bySpan.has(ref) ? 1 : 2)
  lines.sort((a, b) => {
    const ra = rank(a.refId)
    const rb = rank(b.refId)
    if (ra !== rb) return ra - rb
    if (ra === 0) {
      return (byUtterance.get(a.refId).startMs || 0) - (byUtterance.get(b.refId).startMs || 0)
    }
    return a.refId.localeCompare(b.refId)
  })

  return { lines, usedUtterances, usedSpans }
}

function buildOpenItems(mergedFields) {
  const items = (mergedFields || [])
    .filter(
      (f) =>
        f.confirmState === '已驳回' ||
        f.confirmState === '未确认' ||
        f.confirmState === '编辑中' ||
        f.sourceState === 'unconfirmed' ||
        f.value === null ||
        clean(f.value) === '' ||
        (Number(f.confidence) > 0 && Number(f.confidence) < 0.7) ||
        f.candidates?.length
    )
    .map((f) => {
      const reasons = []
      if (f.confirmState === '已驳回') reasons.push('已驳回')
      if (f.value === null || clean(f.value) === '') reasons.push('值为空')
      if (f.sourceState === 'unconfirmed') reasons.push('来源未确认')
      if (Number(f.confidence) > 0 && Number(f.confidence) < 0.7) reasons.push(`低置信 ${f.confidence}`)
      if (f.candidates?.length) reasons.push('存在冲突候选')
      return `${f.label}：${reasons.length ? reasons.join('、') : '待人工复核'}`
    })
  return items.length ? items : ['暂无待确认事项（所有字段均有值、有来源、已确认）。']
}

function buildBoundary({ draft, injectionEvents, adapterMode }) {
  return [
    '来源标注三态：「来自会议」= 录音转写结论；「来自背景」= 背景资料，仅用于实体消歧，不构成会议结论；「未确认」= 需人工核实。',
    '优先级：录音中的明确决议 > 背景资料旧计划；冲突并列展示，不擅自选边。',
    '证据编号可回跳到会议转写稿或背景片段；未确认字段不会写成既成事实。',
    `越权指令：检测到 ${injectionEvents.length} 条，已丢弃，模板必填字段 / 三态来源标注 / 输出校验器 / 人工确认门禁均未关闭。`,
    `合成方式：${adapterMode === 'cloud' ? '云 LLM 合成（需依赖就绪）' : '本地确定性整合（未调用云 LLM，不改写原文、不翻译、不补写结论）'}。`,
    '本稿件不是正式纪要；人工确认定稿后方可导出（FR-11），导出物仅供内部参考，不得对外流转。'
  ]
}

function renderMarkdown(sections, draft) {
  const lines = [
    '# 会议纪要整理稿（内部草稿）',
    '',
    `> ${ARTICLE_NOTICE}`,
    '',
    `- RunVersion：\`${draft?.runVersion || 'unknown'}\``,
    `- 产出语言：${draft?.outputLanguage || 'zh-CN'}`,
    ''
  ]
  sections.forEach((section) => {
    lines.push(`## ${section.title}`, '')
    section.paragraphs.forEach((p) => {
      if (typeof p === 'string') lines.push(`- ${p}`)
      else lines.push(`### ${p.index}. ${p.label}`, '', p.text, '')
    })
    lines.push('')
  })
  return `${lines.join('\n').trim()}\n`
}

/**
 * 本地确定性整合：把结构化草稿 + 人工 overlay + 转写稿 + 背景片段 + 来源标注整合成连贯稿件。
 * 不调用 LLM、不联网、不改写原文；同输入必然得到同 fingerprint / 同 markdown。
 */
export function composeArticle(input = {}) {
  const {
    draft,
    mergedFields = [],
    utterances = [],
    backgroundSpans = [],
    injectionEvents = [],
    meetingLabel = '',
    adapterMode = 'local_deterministic'
  } = input

  if (!draft || !Array.isArray(mergedFields) || !mergedFields.length) {
    const error = new Error('composeArticle 需要 draft 与非空 mergedFields')
    error.code = 'ARTICLE_INPUT_INVALID'
    throw error
  }

  const warnings = []
  const core = buildCoreParagraphs(mergedFields, warnings)
  const suppressedSpanIds = new Set(
    (backgroundSpans || [])
      .filter((s) => hitsInjection(clean(s.text)))
      .map((s) => s.spanId)
  )
  const evidence = buildEvidenceParagraphs({
    mergedFields,
    utterances,
    backgroundSpans,
    suppressedSpanIds
  })
  const openItems = buildOpenItems(mergedFields)

  const sections = [
    {
      id: 'overview',
      title: '一、会议概况',
      paragraphs: buildOverview({ draft, utterances, backgroundSpans, meetingLabel }),
      evidenceRefs: []
    },
    {
      id: 'core',
      title: '二、核心内容（按模板字段整合）',
      paragraphs: core.map((p) => ({
        index: p.index,
        label: p.label,
        text: p.text
      })),
      paragraphsDetail: core,
      evidenceRefs: unique(core.flatMap((p) => p.evidenceRefs))
    },
    {
      id: 'evidence',
      title: '三、发言与证据索引',
      paragraphs: evidence.lines.length
        ? evidence.lines.map((l) => l.text)
        : ['本次草稿没有引用任何证据片段，待人工核实。'],
      evidenceRefs: evidence.lines.map((l) => l.refId)
    },
    {
      id: 'open_items',
      title: '四、待确认事项',
      paragraphs: openItems,
      evidenceRefs: []
    },
    {
      id: 'boundary',
      title: '五、来源与边界说明',
      paragraphs: buildBoundary({ draft, injectionEvents, adapterMode }),
      evidenceRefs: []
    }
  ]

  const fingerprint = buildCompositionFingerprint({
    draft,
    mergedFields,
    utterances,
    backgroundSpans
  })

  const coreDetail = sections.find((s) => s.id === 'core').paragraphsDetail
  const allRefs = unique(sections.flatMap((s) => s.evidenceRefs))
  const warningsOut = [
    ...warnings,
    `本地整合不改写原文、不翻译、不补写结论；产出语言标注沿用草稿配置（${draft.outputLanguage || 'zh-CN'}）`,
    ...(draft.injectionEvents?.length
      ? [`上游已丢弃 ${draft.injectionEvents.length} 条越权指令，稿件层独立复核完成`]
      : [])
  ]

  const article = {
    articleId: fingerprint.replace(/^art_/, 'article_'),
    runVersion: draft.runVersion,
    adapterId: 'local-composition-v1',
    adapterMode,
    modelVersion: null,
    promptVersion: null,
    sections: sections.map(({ paragraphsDetail, ...s }) => s),
    coreDetail,
    markdown: renderMarkdown(sections, draft),
    fingerprint,
    stats: {
      sectionCount: sections.length,
      fieldCount: mergedFields.length,
      paragraphCount: sections.reduce((n, s) => n + s.paragraphs.length, 0),
      evidenceRefCount: allRefs.length,
      utteranceCount: evidence.usedUtterances.length,
      backgroundSpanCount: evidence.usedSpans.length,
      unconfirmedCount: coreDetail.filter((p) => p.unconfirmed).length,
      humanEditedCount: mergedFields.filter((f) => f.humanEdited).length,
      suppressedCount: warnings.length
    },
    sourceSummary: {
      from_meeting: coreDetail.filter((p) => p.sourceState === 'from_meeting').length,
      from_background: coreDetail.filter((p) => p.sourceState === 'from_background').length,
      unconfirmed: coreDetail.filter((p) => p.sourceState === 'unconfirmed').length
    },
    warnings: warningsOut
  }
  return article
}

export const localCompositionAdapter = Object.freeze({
  id: 'local-composition-v1',
  adapterMode: 'local_deterministic',
  supportedLanguages: ['zh-CN', 'en-US'],
  compose: composeArticle
})

/**
 * 稿件层输出校验：来源标注 / 证据可追溯 / 结论来源边界 / 注入痕迹 / 未确认显式列出。
 * 只判定、不自动改写稿件；失败项交给页面与冒烟断言暴露。
 */
export function validateArticle(article, input = {}) {
  const results = []
  const add = (id, name, passed, detail = '') => results.push({ id, name, passed, detail })
  const core = article?.coreDetail || []
  const utterances = input.utterances || []
  const spans = input.backgroundSpans || []
  const knownRefs = new Set([
    ...utterances.map((u) => u.utteranceId),
    ...spans.map((s) => s.spanId)
  ])

  add(
    'A-1',
    '5 个固定段落齐全',
    article?.sections?.length === ARTICLE_SECTION_IDS.length &&
      article.sections.every((s, i) => s.id === ARTICLE_SECTION_IDS[i] && clean(s.title)),
    `${article?.sections?.length || 0} 段`
  )
  add(
    'A-2',
    '核心内容段数 = 草稿字段数',
    core.length === (input.mergedFields || []).length && core.length > 0,
    `${core.length} / ${(input.mergedFields || []).length}`
  )
  add(
    'A-3',
    '每段保留三态来源标注或显式未确认',
    core.every((p) => /【(来自会议|来自背景|未确认)】/.test(p.text)),
    core.filter((p) => !/【(来自会议|来自背景|未确认)】/.test(p.text)).map((p) => p.fieldId).join(',')
  )
  add(
    'A-4',
    '结论类字段不得标为来自背景',
    core.every(
      (p) => p.key === 'topic_context' || p.sourceState !== 'from_background'
    ),
    core.filter((p) => p.key !== 'topic_context' && p.sourceState === 'from_background')
      .map((p) => p.fieldId).join(',')
  )
  add(
    'A-5',
    '所有证据引用可追溯到发言或背景片段',
    article?.sections?.flatMap((s) => s.evidenceRefs || []).every((r) => knownRefs.has(r)),
    article?.sections?.flatMap((s) => s.evidenceRefs || []).filter((r) => !knownRefs.has(r)).join(',')
  )
  add(
    'A-6',
    '越权指令不进入稿件正文',
    !INJECTION_PATTERNS.some(({ pattern }) => pattern.test(article?.markdown || '')),
    `${article?.stats?.suppressedCount || 0} 条被抑制`
  )
  add(
    'A-7',
    '未确认字段不写成既成事实',
    core.filter((p) => p.unconfirmed).every((p) => p.text.includes('未确认') || p.text.includes('已忽略')),
    ''
  )
  add(
    'A-8',
    'markdown 与 sections 一致且含内部草稿声明',
    Boolean(article?.markdown?.includes(ARTICLE_NOTICE)) &&
      core.every((p) => article.markdown.includes(p.text)),
    ''
  )

  return {
    passed: results.every((r) => r.passed),
    results,
    allResults: results.map((r) => r.id)
  }
}

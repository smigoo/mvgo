// 实时会议会话模型：项目 / 主题 / 逐句推流 / 人工记录 / 增量 AI 分析
//
// 边界（硬约束，勿在未对接云端前放宽）：
// 1. 本模块不调用任何 LLM、不发网络请求；所谓「AI 分析」是本地规则抽取，
//    页面必须标注「本地规则抽取，未调用云端大模型」，不得对外宣称 AI 已生成。
// 2. 洞察只从「已进入的转写句」中抽取，不补写、不改写、不做跨句推断结论。
// 3. 每条洞察必须带 evidenceRefs（指向 utterance id）与 sourceState，
//    抽不到证据就不产出该条，而不是靠置信度兜底。
// 4. 人工记录与会话语义分离：人工记录只留痕，不参与规则抽取，
//    避免把人工判断伪装成 AI 从会议里听出来的结论。

export const LIVE_STATES = [
  { id: 'idle', label: '待开始' },
  { id: 'recording', label: '记录中' },
  { id: 'paused', label: '已暂停' },
  { id: 'finished', label: '已结束' }
]

export const LIVE_STATE_LABELS = LIVE_STATES.reduce((acc, item) => {
  acc[item.id] = item.label
  return acc
}, {})

// 演示用项目清单。真实项目应来自后端项目列表，接 E-01 后再替换。
export const LIVE_PROJECTS = [
  { id: 'prj-tunnel', name: '江阴靖江长江隧道智慧化平台' },
  { id: 'prj-mvgo', name: 'mvgo 感智晓界平台' },
  { id: 'prj-aidocs', name: 'aidocs 组件库' }
]

export const MANUAL_KINDS = [
  { id: 'note', label: '补充' },
  { id: 'decision', label: '决议' },
  { id: 'todo', label: '待办' },
  { id: 'risk', label: '风险' },
  { id: 'question', label: '疑问' }
]

export const INSIGHT_KINDS = [
  { id: 'decision', label: '决议', hint: '会中形成的明确结论' },
  { id: 'todo', label: '待办', hint: '有责任人或时间点的动作' },
  { id: 'risk', label: '风险', hint: '阻塞、延期、资源缺口' },
  { id: 'question', label: '疑问', hint: '待澄清的问题' },
  { id: 'conflict', label: '分歧', hint: '会中出现不同意见' }
]

const KIND_LABELS = INSIGHT_KINDS.reduce((acc, item) => {
  acc[item.id] = item.label
  return acc
}, {})

// 规则词表：按「决议 > 分歧 > 待办 > 风险 > 疑问」优先级判定，一局只归一类，
// 避免同一句话在多个卡片里重复计数造成「AI 分析很丰富」的假象。
const RULES = [
  {
    kind: 'decision',
    patterns: [/决定/, /定了/, /就按/, /确定(用|按|走)/, /拍板/, /通过(了)?方案/, /结论是/, /最终选/]
  },
  {
    kind: 'conflict',
    patterns: [/不同意/, /反对/, /我觉得不行/, /这样不行/, /有分歧/, /不认可/]
  },
  {
    kind: 'todo',
    patterns: [/下周[一二三四五六日]?/, /明天/, /本周[一二三四五六日]?/, /跟进/, /负责/, /推进/, /排期/, /(之|以)前(完成|给|出)/, /需要(补|加|改|出)/]
  },
  {
    kind: 'risk',
    patterns: [/风险/, /来不及/, /延期/, /阻塞/, /卡住/, /人手(不够|不足)/, /进度(落后|紧)/, /联调不通/]
  },
  {
    kind: 'question',
    patterns: [/[?？]/, /是否/, /能不能/, /要不要/, /怎么样/, /怎么办/, /谁(来|负责)/]
  }
]

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

// 置信度只做区间收敛（0.3~1）；拿不到真值就返回 null（未知）。
// 绝不回落 0.6 —— 本地 Whisper 不返回逐句置信度，编一个数出来就是造假。
function clampConfidence(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.min(1, Math.max(0.3, Math.round(num * 100) / 100))
}

// 单句归类：返回命中的 kind 或 null。纯函数，便于冒烟断言。
export function classifyUtterance(text) {
  const normalized = normalizeText(text)
  if (!normalized) return null
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.kind
  }
  return null
}

// 增量分析：只处理已进入的转写句，输出按 kind 分组的洞察。
// 同句去重（按 utterance id），同文去重（按归一化文本），保证反复调用结果稳定。
export function deriveInsights(utterances = []) {
  const seenId = new Set()
  const seenText = new Set()
  const buckets = INSIGHT_KINDS.reduce((acc, item) => {
    acc[item.id] = []
    return acc
  }, {})

  for (const utterance of utterances) {
    if (!utterance || !utterance.id) continue
    if (seenId.has(utterance.id)) continue
    const text = normalizeText(utterance.text)
    if (!text || seenText.has(text)) continue
    const kind = classifyUtterance(text)
    if (!kind) continue
    seenId.add(utterance.id)
    seenText.add(text)
    buckets[kind].push({
      id: `${kind}-${utterance.id}`,
      kind,
      kindLabel: KIND_LABELS[kind],
      text,
      speaker: utterance.speaker || '未标注',
      atMs: utterance.endMs ?? utterance.startMs ?? 0,
      evidenceRefs: [utterance.id],
      // 结论类只可能来自会议：本模块没有背景资料通道，故恒为 from_meeting
      sourceState: 'from_meeting',
      confidence: clampConfidence(utterance.confidence)
    })
  }

  return buckets
}

export function countInsights(buckets) {
  return Object.values(buckets).reduce((sum, list) => sum + list.length, 0)
}

// 会话对象：所有状态集中在 session.state 内，页面只做渲染与计时驱动。
export function createLiveSession({ projectId, projectName, topic, meetingType = 'progress_review' } = {}) {
  const matched = LIVE_PROJECTS.find((item) => item.id === projectId)
  const session = {
    id: `live_${Date.now().toString(36)}`,
    projectId: projectId || LIVE_PROJECTS[0].id,
    projectName: projectName || matched?.name || LIVE_PROJECTS[0].name,
    topic: normalizeText(topic) || '未命名会议',
    meetingType,
    status: 'idle',
    cursor: 0,
    total: 0,
    utterances: [],
    manualNotes: [],
    startedAt: null,
    endedAt: null,
    insightCursor: 0
  }
  session.insights = deriveInsights([])
  return session
}

export function setSessionTopic(session, topic) {
  if (!session) return session
  const value = normalizeText(topic)
  if (value) session.topic = value
  return session
}

export function setSessionProject(session, projectId) {
  if (!session) return session
  const matched = LIVE_PROJECTS.find((item) => item.id === projectId)
  if (!matched) return session
  session.projectId = matched.id
  session.projectName = matched.name
  return session
}

export function startSession(session, { now = Date.now() } = {}) {
  if (!session) return session
  session.status = 'recording'
  if (!session.startedAt) session.startedAt = now
  return session
}

export function pauseSession(session) {
  if (session && session.status === 'recording') session.status = 'paused'
  return session
}

export function resumeSession(session) {
  if (session && session.status === 'paused') session.status = 'recording'
  return session
}

export function finishSession(session, { now = Date.now() } = {}) {
  if (!session) return session
  session.status = 'finished'
  session.endedAt = now
  return session
}

// 推流一句：把源转写稿的第 cursor 条压入会话。到末尾返回 null，调用方应停止计时器。
export function pushNextUtterance(session, sourceUtterances = []) {
  if (!session) return null
  session.total = sourceUtterances.length
  if (session.cursor >= sourceUtterances.length) return null
  const source = sourceUtterances[session.cursor]
  session.cursor += 1
  const utterance = toSessionUtterance(source, session.cursor)
  session.utterances.push(utterance)
  session.insights = deriveInsights(session.utterances)
  return utterance
}

// 源句 → 会话句：逐字段搬运，缺失就留空，**不补默认值**。
// confidence 缺省保持 null（本地 Whisper 无逐句置信度，编一个数就是造假）。
// speakerDiarized 采用「显式否否」语义：只有源明确写 false 才算未区分——
// 示例稿自带标注说话人（说话人 1/2）视为已区分；本地 Whisper 显式声明 false。
function toSessionUtterance(source, seq) {
  // 注意 Number(null) === 0：null 置信度必须先排除，否则会被当成「0 分」再抬到下限，
  // 等于凭空造了一个分数出来。
  const raw = source?.confidence
  const conf = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
  return {
    id: source.id,
    seq,
    speaker: source.speaker || '',
    speakerLabel: source.speakerLabel || '',
    speakerDiarized: source.speakerDiarized !== false && Boolean(source.speaker),
    // 归属依据透传：'device_track' = 按设备轨（多轨采集），空 = 未标依据。
    // 页面据此区分「按设备归属」与「声纹分离」，不得把设备轨说成声纹。
    speakerBasis: source.speakerBasis || '',
    lang: source.lang || '',
    startMs: source.startMs ?? 0,
    endMs: source.endMs ?? source.startMs ?? 0,
    text: normalizeText(source.text),
    confidence: Number.isFinite(conf) ? clampConfidence(conf) : null,
    source: source.source || ''
  }
}

// 批量注入转写结果（真实 ASR 用）：整批写入后一次性重算洞察，
// 不做逐句定时器表演——转写出来几句就是几句，没转出来就是 0 句。
export function loadUtterances(session, utterances = []) {
  if (!session) return { added: 0, total: session?.utterances?.length || 0 }
  const list = Array.isArray(utterances) ? utterances : []
  let added = 0
  for (const item of list) {
    if (!item || !item.id) continue
    if (session.utterances.some((u) => u.id === item.id)) continue
    session.cursor += 1
    session.utterances.push(toSessionUtterance(item, session.cursor))
    added += 1
  }
  session.total = session.utterances.length
  if (added) session.insights = deriveInsights(session.utterances)
  return { added, total: session.utterances.length }
}

export function addManualNote(session, { kind = 'note', text } = {}) {
  if (!session) return { ok: false, error: 'NO_SESSION' }
  const content = normalizeText(text)
  if (!content) return { ok: false, error: 'EMPTY_TEXT' }
  const valid = MANUAL_KINDS.some((item) => item.id === kind)
  if (!valid) return { ok: false, error: 'BAD_KIND' }
  const note = {
    id: `m_${session.manualNotes.length + 1}_${Date.now().toString(36)}`,
    kind,
    kindLabel: MANUAL_KINDS.find((item) => item.id === kind).label,
    text: content.slice(0, 300),
    atMs: session.utterances.at(-1)?.endMs ?? 0,
    createdAt: new Date().toISOString()
  }
  session.manualNotes.push(note)
  return { ok: true, note }
}

export function updateManualNote(session, id, text) {
  if (!session) return { ok: false, error: 'NO_SESSION' }
  const note = session.manualNotes.find((item) => item.id === id)
  if (!note) return { ok: false, error: 'NOT_FOUND' }
  const content = normalizeText(text)
  if (!content) return { ok: false, error: 'EMPTY_TEXT' }
  note.text = content.slice(0, 300)
  return { ok: true, note }
}

export function removeManualNote(session, id) {
  if (!session) return { ok: false, error: 'NO_SESSION' }
  const index = session.manualNotes.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, error: 'NOT_FOUND' }
  session.manualNotes.splice(index, 1)
  return { ok: true }
}

// 会话统计：只算已进入的内容，不预测未推流部分。
export function summarizeSession(session) {
  if (!session) {
    return {
      utteranceCount: 0,
      durationMs: 0,
      speakerCount: 0,
      speakerDiarized: false,
      undiarizedCount: 0,
      manualCount: 0,
      insightCount: 0,
      byKind: {},
      progress: 0
    }
  }
  const utterances = session.utterances || []
  // 只有「确实做过说话人分离」的句子才计入说话人数。
  // 本地 Whisper 不做声纹聚类（speakerDiarized=false），若照样按 speaker 去重，
  // 一个 'S1' 就会显示成「1 位说话人」——那是编出来的数字，不算。
  const diarized = utterances.filter((item) => item.speakerDiarized === true)
  const speakers = new Set(diarized.map((item) => item.speaker).filter(Boolean))
  const undiarizedCount = utterances.filter((item) => item.speakerDiarized !== true).length
  const first = utterances[0]
  const last = utterances.at(-1)
  const durationMs = first && last ? Math.max(0, (last.endMs || 0) - (first.startMs || 0)) : 0
  const byKind = Object.entries(session.insights || {}).reduce((acc, [kind, list]) => {
    acc[kind] = list.length
    return acc
  }, {})
  return {
    utteranceCount: utterances.length,
    durationMs,
    speakerCount: speakers.size,
    speakerDiarized: speakers.size > 0,
    undiarizedCount,
    manualCount: (session.manualNotes || []).length,
    insightCount: countInsights(session.insights || {}),
    byKind,
    progress: session.total ? Math.round((utterances.length / session.total) * 100) : 0
  }
}

// 供页面渲染的扁平洞察列表（保持 INSIGHT_KINDS 顺序）
export function flattenInsights(buckets) {
  const rows = []
  for (const kind of INSIGHT_KINDS) {
    for (const item of buckets?.[kind.id] || []) rows.push(item)
  }
  return rows
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = Math.floor(total % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

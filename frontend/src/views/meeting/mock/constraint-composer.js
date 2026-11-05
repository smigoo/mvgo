// 约束合成层：三路输入（录音转写稿 / 会议背景资料 / 产出要求）→ GenerationContract
// 对应 T-040 输入契约与裁剪、T-041 规则 R-1~R-5、T-042 提示注入三层防护的 Mock 版。
// 硬约束（不可被用户指令关闭）：模板必填字段、三态来源标注、人工确认后定稿、输出校验器。

export const REQUIRED_FIELDS = {
  progress_review: ['topic_context', 'progress_summary', 'milestone_status', 'open_issues'],
  requirement_review: ['topic_context', 'options', 'conclusion', 'open_questions'],
  other: ['topic_context', 'progress_summary', 'open_issues']
}

export const MAX_CONTEXT_CHARS = 8000

// 产出要求白名单：只接受「软约束」，任何试图改写硬约束的指令一律忽略
export const INSTRUCTION_ALLOWLIST = [
  { key: 'concise', pattern: /精简|简短|篇幅|字数|精炼/ },
  { key: 'focus_issues', pattern: /遗留问题|风险|重点|突出|强调/ },
  { key: 'tabular', pattern: /表格|列表|分点|条目/ }
]

export const INJECTION_PATTERNS = [
  { id: 'INJ-1', pattern: /忽略(以上|上面|前面|上述|所有|之前).{0,8}(指令|要求|规则|约束)/ },
  { id: 'INJ-2', pattern: /(不要|无需|禁止|不用).{0,6}(标注|标|输出|带).{0,6}(来源|证据|引用)/ },
  { id: 'INJ-3', pattern: /(关闭|跳过|绕过|禁用).{0,6}(校验|检查|门禁|限制)/ },
  { id: 'INJ-4', pattern: /(把|将).{0,12}(结论|来源|状态).{0,6}(改成|改为|设为)/ },
  { id: 'INJ-5', pattern: /system\s*prompt|assistant\s*:|<\/?(system|instruction)>/i }
]

// 背景资料纯文本切分为 span，只用于实体消歧，绝不作为结论来源
export function splitBackground(text) {
  if (!text || !text.trim()) return []
  return text
    .split(/[\n；;。]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => ({
      spanId: `bs_${String(i + 1).padStart(3, '0')}`,
      text: s,
      usableAs: 'entity_disambiguation_only',
      isConclusionSource: false
    }))
}

export function detectInjection(background, instruction) {
  const events = []
  ;[
    { source: 'background', text: background || '' },
    { source: 'instruction', text: instruction || '' }
  ].forEach(({ source, text }) => {
    INJECTION_PATTERNS.forEach(({ id, pattern }) => {
      const m = text.match(pattern)
      if (m) events.push({ id, source, matched: m[0] })
    })
  })
  return events
}

export function parseInstruction(text) {
  const flags = {}
  INSTRUCTION_ALLOWLIST.forEach(({ key, pattern }) => {
    if (pattern.test(text || '')) flags[key] = true
  })
  return flags
}

// FR-12：RunVersion 必须随输入与重跑变化，否则人工 overlay 会错配到不同内容的新草稿。
// 用稳定哈希（djb2）拼输入指纹 + 运行序号；不用时间戳，保证 Node 冒烟可重复断言。
function stableHash(text) {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

export function buildRunVersion(fixture, config, utterances, runSeq = 1) {
  const fingerprint = stableHash(
    JSON.stringify({
      fixtureId: fixture.id,
      meetingType: config.meetingType || fixture.meetingType,
      primaryLanguage: config.primaryLanguage || '',
      outputLanguage: config.outputLanguage || '',
      background: config.background || '',
      instruction: config.instruction || '',
      utteranceIds: utterances.map((u) => u.utteranceId)
    })
  )
  return `rv_mock_${fixture.id}_${fingerprint}_r${runSeq}`
}

export function composeContract({ fixture, utterances, languageResult, config, runSeq = 1 }) {
  const meetingType = config.meetingType || fixture.meetingType
  const backgroundSpans = splitBackground(config.background)
  const injectionEvents = detectInjection(config.background, config.instruction)
  const instructionFlags = parseInstruction(config.instruction)

  // 拼接上下文时保留证据 ID 与 lang，Map-Reduce 分片不得丢失
  const fullContext = [
    ...utterances.map((u) => `[${u.utteranceId}][${u.lang}] ${u.speakerLabel}: ${u.text}`),
    ...backgroundSpans.map((s) => `[${s.spanId}][background] ${s.text}`)
  ].join('\n')
  const truncatedRatio =
    fullContext.length > MAX_CONTEXT_CHARS
      ? Number((1 - MAX_CONTEXT_CHARS / fullContext.length).toFixed(2))
      : 0
  const context = fullContext.slice(0, MAX_CONTEXT_CHARS)

  const outputLanguage =
    config.outputLanguage === 'meeting_primary'
      ? languageResult.primary
      : config.outputLanguage || 'zh-CN'

  const warnings = []
  if (truncatedRatio > 0) {
    warnings.push(`上下文已裁剪 ${Math.round(truncatedRatio * 100)}%，证据 ID 与片段级 lang 保留`)
  }
  if (injectionEvents.length) {
    warnings.push(`检测到 ${injectionEvents.length} 条越权指令，已忽略；模板必填字段 / 来源标注 / 校验器保持开启`)
  }
  if (languageResult.isCodeSwitching) {
    warnings.push('检测到中英混说，按片段级 lang 分别处理，产出语言按会前配置')
  }
  if (instructionFlags.concise) {
    warnings.push('已保留模板必填字段，篇幅要求为软约束，不做字段删减')
  }

  return {
    runVersion: buildRunVersion(fixture, config, utterances, runSeq),
    runSeq,
    inputFingerprintInputs: ['fixtureId', 'meetingType', 'primaryLanguage', 'outputLanguage', 'background', 'instruction', 'utteranceIds'],
    meetingType,
    fixtureId: fixture.id,
    requiredFields: [...(REQUIRED_FIELDS[meetingType] || REQUIRED_FIELDS.other)],
    outputLanguage,
    detectedLanguages: languageResult.segments,
    isCodeSwitching: languageResult.isCodeSwitching,
    utteranceRefs: utterances.map((u) => u.utteranceId),
    backgroundSpans,
    injectionEvents,
    instructionFlags,
    truncatedRatio,
    context,
    contextChars: context.length,
    warnings,
    priorityRule: '录音中的明确决议 > 背景资料旧计划；背景资料仅用于实体消歧',
    hardConstraints: ['模板必填字段', '三态来源标注', '人工确认后定稿', '输出校验器不可关闭']
  }
}

// T-032：LID 清单校验 —— 未列入清单的语种命中 E-18，不猜测、不进入 transcribe（PRD FR-16 / 4.5）
// 按 v1.2 默认假设：L1 = [zh-CN, en-US]，L2 = []。

export const L1_LANGUAGES = Object.freeze(['zh-CN', 'en-US'])

export function checkLanguageSupport(detectedLanguages, allowed = L1_LANGUAGES) {
  const unsupported = detectedLanguages.filter((l) => !allowed.includes(l.lang))
  return {
    allowedLanguages: [...allowed],
    supported: unsupported.length === 0,
    unsupported,
    routeable: detectedLanguages.filter((l) => allowed.includes(l.lang)),
    events: unsupported.map((l) => ({
      code: 'E-18',
      lang: l.lang,
      action: '标记未支持语种，不进入 transcribe'
    }))
  }
}

export function gateUtterances(utterances, allowed = L1_LANGUAGES) {
  const kept = []
  const blocked = []
  utterances.forEach((u) => (allowed.includes(u.lang) ? kept : blocked).push(u))
  return {
    kept,
    blocked,
    events: blocked.map((u) => ({
      code: 'E-18',
      utteranceId: u.utteranceId || u.id,
      lang: u.lang
    }))
  }
}

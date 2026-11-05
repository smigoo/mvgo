// S6 评测执行器（T-061 / T-062）：把评测样本的文本判据变成可执行断言
// 纯 JS、离线、无云依赖；页面「评测与注入回归」面板与 .dev-loop/mock-smoke.mjs 共用同一套判据。
// 只用虚构脱敏 fixture，不含真实会议数据。

import { EVAL_CASES } from '../fixtures/eval-cases.js'
import { INJECTION_CASES } from '../fixtures/injection-cases.js'
import { detectInjection, MAX_CONTEXT_CHARS } from './constraint-composer.js'
import { runMockPipeline } from './index.js'
import { checkLanguageSupport, gateUtterances } from './language-gate.js'
import { validateDraftShape, schemaOf } from '../contracts/index.js'

const fieldOf = (run, key) => (run.draft?.fields || []).find((f) => f.key === key)
const ok = (passed, detail) => ({ passed: Boolean(passed), detail })

// C-1 ~ C-8 的可执行判据（与 eval-cases.js 的 accept / reject 一一对应）
export const EVAL_CHECKERS = Object.freeze({
  'C-1'(run) {
    const schema = schemaOf(run.draft.template.id)
    const shape = validateDraftShape(run.draft)
    const conclusions = run.draft.fields.filter((f) => f.key !== 'topic_context')
    const clean = conclusions.every(
      (f) => f.sourceState === 'from_meeting' && f.evidenceRefs.length > 0
    )
    const noFakeConfirm = run.draft.fields.every(
      (f) => !(f.value === null && f.confirmState === '已确认')
    )
    return ok(
      shape.ok && schema.required.every((k) => Boolean(fieldOf(run, k))) && clean && noFakeConfirm,
      `必填 ${schema.required.length} 项 / schema ${shape.ok ? 'PASS' : shape.errors.join(';')} / 结论来源 ${clean ? 'PASS' : 'FAIL'}`
    )
  },

  'C-2'(run) {
    const f = fieldOf(run, 'milestone_status')
    const v6 = run.validation?.results.find((r) => r.id === 'V-6')
    return ok(
      f?.sourceState === 'unconfirmed' && f?.candidates?.length >= 2 && v6?.passed === true,
      `里程碑 ${f?.sourceState} / 候选 ${f?.candidates?.length ?? 0} / V-6 ${v6?.passed}`
    )
  },

  'C-3'(run) {
    const shape = validateDraftShape(run.draft)
    const injected = run.draft.injectionEvents.length > 0
    const validatorOn = run.validation?.allResults?.length === 6
    const sources = new Set(run.draft.fields.map((f) => f.sourceState))
    const noInjectedConclusion = !run.draft.fields.some(
      (f) => typeof f.value === 'string' && f.value.includes('全量通过')
    )
    return ok(
      shape.ok && injected && validatorOn && sources.size >= 1 && noInjectedConclusion,
      `注入 ${run.draft.injectionEvents.length} 条 / 校验器 ${run.validation?.allResults?.length}/6 / 来源态 ${sources.size} 种`
    )
  },

  'C-4'(run) {
    const c = run.artifacts.contract
    const ids = new Set((run.artifacts.transcript?.utterances || []).map((u) => u.utteranceId))
    const refsValid = run.draft.fields
      .flatMap((f) => f.evidenceRefs)
      .filter((r) => r.startsWith('u_'))
      .every((r) => ids.has(r))
    return ok(
      c.truncatedRatio > 0 && c.contextChars <= MAX_CONTEXT_CHARS && refsValid,
      `裁剪 ${Math.round(c.truncatedRatio * 100)}% / context ${c.contextChars} 字 / 证据 ID ${refsValid ? '有效' : '失效'}`
    )
  },

  'C-5'(run) {
    const c = fieldOf(run, 'conclusion')
    const o = fieldOf(run, 'options')
    return ok(
      typeof c?.value === 'string' && c.value.includes('未达成') && (o?.evidenceRefs?.length || 0) >= 2,
      `结论「${c?.value ?? 'null'}」/ 方案证据 ${o?.evidenceRefs?.length ?? 0} 条`
    )
  },

  'C-6'(run) {
    const langs = run.draft.detectedLanguages
    const utterances = run.artifacts.transcript?.utterances || []
    const langKept = utterances.length > 0 && utterances.every((u) => Boolean(u.lang))
    return ok(
      langs.length === 2 && langKept,
      `语种 ${langs.map((l) => l.lang).join('+')} / 片段级 lang ${langKept ? '保留' : '丢失'}`
    )
  },

  'C-7'(run, caseDef, ctx) {
    const gate = ctx.gate
    return ok(
      gate && gate.langCheck.unsupported.length > 0 &&
      gate.utteranceGate.blocked.length > 0 &&
      gate.utteranceGate.events.every((e) => e.code === 'E-18'),
      `未支持语种 ${gate?.langCheck.unsupported.map((l) => l.lang).join(',') || '-'} / 拦下片段 ${gate?.utteranceGate.blocked.length ?? 0}`
    )
  },

  'C-8'(run, caseDef, ctx) {
    const base = ctx.baseline
    if (!base) return ok(false, '缺少 baseline')
    const sig = (r) =>
      JSON.stringify(
        r.draft.fields.map((f) => [f.key, f.sourceState, f.evidenceRefs])
      )
    const shape = validateDraftShape(run.draft)
    return ok(
      shape.ok && sig(run) === sig(base) && run.draft.outputLanguage === 'zh-CN',
      `output=${run.draft.outputLanguage} / 字段结构 ${sig(run) === sig(base) ? '一致' : '变化'}`
    )
  }
})

export function runInjectionSuite(cases = INJECTION_CASES) {
  const rows = cases.map((c) => {
    const hits = detectInjection(c.text, '')
    const hit = hits.length > 0
    return {
      id: c.id,
      text: c.text,
      expectHit: c.expectHit,
      hit,
      passed: hit === c.expectHit,
      matched: hits.map((h) => `${h.id}:${h.matched}`)
    }
  })
  const attack = rows.filter((r) => r.expectHit)
  const benign = rows.filter((r) => !r.expectHit)
  return {
    total: rows.length,
    passed: rows.filter((r) => r.passed).length,
    failed: rows.filter((r) => !r.passed).length,
    attackHit: `${attack.filter((r) => r.hit).length}/${attack.length}`,
    benignFalsePositive: benign.filter((r) => r.hit).length,
    rows
  }
}

export function runEvalSuite(cases = EVAL_CASES) {
  const rows = cases.map((c) => {
    let run
    try {
      run = runMockPipeline(c.fixture, c.config)
    } catch (e) {
      return { id: c.id, name: c.name, passed: false, detail: `链路异常：${e.message}` }
    }
    const ctx = {}
    if (c.gate) {
      ctx.gate = {
        langCheck: checkLanguageSupport(run.draft.detectedLanguages, c.gate.allowed),
        utteranceGate: gateUtterances(
          run.artifacts.transcript?.utterances || [],
          c.gate.allowed
        )
      }
    }
    if (c.id === 'C-8') {
      ctx.baseline = runMockPipeline(c.fixture, {})
    }
    let result
    try {
      result = EVAL_CHECKERS[c.id](run, c, ctx)
    } catch (e) {
      result = ok(false, `判据异常：${e.message}`)
    }
    return {
      id: c.id,
      name: c.name,
      fixture: c.fixture,
      accept: c.accept,
      reject: c.reject,
      passed: result.passed,
      detail: result.detail
    }
  })
  return {
    total: rows.length,
    passed: rows.filter((r) => r.passed).length,
    failed: rows.filter((r) => !r.passed).length,
    rows
  }
}

export function runAllChecks() {
  const evalSuite = runEvalSuite()
  const injectionSuite = runInjectionSuite()
  return {
    evalSuite,
    injectionSuite,
    total: evalSuite.total + injectionSuite.total,
    passed: evalSuite.passed + injectionSuite.passed,
    failed: evalSuite.failed + injectionSuite.failed,
    ok: evalSuite.failed === 0 && injectionSuite.failed === 0
  }
}

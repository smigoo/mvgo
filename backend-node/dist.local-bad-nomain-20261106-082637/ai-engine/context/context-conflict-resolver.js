import { TRUST_LEVELS } from './context-schema.js'
import {
  evaluateVisualTrustVerdict,
  VISUAL_VERDICTS,
} from '../utils/visual-trust.js'

/**
 * 🛡️ verdict → trust 等级映射（穷举，2026-09-02 契约漂移治理）。
 *
 * 事故 mc-max-1788306653919-a57e4409：visual-trust.js 新增 low-coverage verdict，
 * 此处旧 if/else 漏接 → 23% 幻觉 vision 被当 trusted 放行。改为 Map 穷举映射：
 * 新增 verdict 若忘在此登记，穷举 spec（key 集合 === VISUAL_VERDICT_VALUES）会红。
 */
const VERDICT_TO_LEVEL = new Map([
  [VISUAL_VERDICTS.BLOCKED, TRUST_LEVELS.BLOCKED],
  [VISUAL_VERDICTS.CONFLICT, TRUST_LEVELS.BLOCKED],
  [VISUAL_VERDICTS.LOW_COVERAGE, TRUST_LEVELS.RESTRICTED],
  [VISUAL_VERDICTS.WARNING, TRUST_LEVELS.RESTRICTED],
  [VISUAL_VERDICTS.TRUSTED, TRUST_LEVELS.TRUSTED],
])

function pushIssue(issues, issue) {
  if (!issues.some((existing) => existing.id === issue.id)) issues.push(issue)
}

function collectVisualBackgroundClaim(visualAnalysis) {
  return (
    visualAnalysis?.visualElements?.background ||
    visualAnalysis?.layoutStructure?.styles?.background ||
    visualAnalysis?.styles?.background ||
    null
  )
}

/**
 * 在进入 Engineer 前裁决 Figma、Vision、Reviewer 和 Style Mapper 的冲突。
 * 返回最终信任等级、当前问题快照和被拒绝的诊断性声明。
 */
export function resolveContextConflicts({
  designFacts,
  visualAnalysis,
  reviewResult,
  styleMappings,
} = {}) {
  const issues = []
  const rejectedClaims = []
  const visualTrust = evaluateVisualTrustVerdict(visualAnalysis)
  const nestedReview = reviewResult?.reviewResult
  const normalizedReview =
    nestedReview && typeof nestedReview === 'object' ? nestedReview : reviewResult || null
  let level = TRUST_LEVELS.TRUSTED
  const reasons = []

  const mappedLevel = VERDICT_TO_LEVEL.get(visualTrust.verdict)
  if (mappedLevel === undefined) {
    // 未知 verdict：契约未同步（穷举 spec 应已拦截）。运行时 fail-safe 保守降级，而非静默 trusted。
    level = TRUST_LEVELS.RESTRICTED
    reasons.push(`未知 verdict「${visualTrust.verdict}」（契约未同步，保守降级）`)
  } else if (mappedLevel !== TRUST_LEVELS.TRUSTED) {
    level = mappedLevel
    reasons.push(visualTrust.reason)
  }

  if (normalizedReview?.degraded === true || normalizedReview?.score === 0) {
    if (level !== TRUST_LEVELS.BLOCKED) level = TRUST_LEVELS.RESTRICTED
    reasons.push('布局审查结果已降级或评分为 0')
    pushIssue(issues, {
      id: 'CONTEXT-LAYOUT-REVIEW-DEGRADED',
      status: 'open',
      severity: 'warning',
      expectedAction: 'ignore-review-as-design-fact',
    })
  }

  if (styleMappings?.synthesizedFallback === true) {
    if (level !== TRUST_LEVELS.BLOCKED) level = TRUST_LEVELS.RESTRICTED
    reasons.push('Style Mapper 使用了合成 fallback')
    rejectedClaims.push({
      source: 'style-mapper-fallback',
      property: 'themeVars',
      reason: 'synthesized-fallback-cannot-be-design-fact',
    })
    pushIssue(issues, {
      id: 'CONTEXT-STYLE-FALLBACK-REJECTED',
      status: 'open',
      severity: 'warning',
      expectedAction: 'exclude-fallback-style-facts',
    })
  }

  const visualBackground = collectVisualBackgroundClaim(visualAnalysis)
  if (visualBackground && designFacts?.root?.styleEvidence?.background?.allowed === false) {
    rejectedClaims.push({
      source: 'visual-analysis',
      property: 'root.background',
      value: visualBackground,
      reason: 'conflicts-with-figma-root-fill-evidence',
    })
    pushIssue(issues, {
      id: 'CONTEXT-ROOT-BACKGROUND-CONFLICT',
      status: 'open',
      severity: 'warning',
      expectedAction: 'do-not-generate-root-background',
    })
  }

  for (const chart of designFacts?.charts || []) {
    if (chart.legend?.owner === 'unresolved') {
      pushIssue(issues, {
        id: `CHART-LEGEND-OWNER:${chart.id}`,
        status: 'open',
        severity: 'warning',
        expectedAction: 'choose-dom-or-echarts-owner',
      })
    }
  }

  return {
    trustVerdict: {
      level,
      reasons: [...new Set(reasons)],
      visual: visualTrust,
      restrictions:
        level === TRUST_LEVELS.RESTRICTED
          ? ['no-unsupported-decoration', 'no-style-fallback', 'resolve-legend-owner']
          : [],
    },
    currentIssues: issues,
    diagnostics: {
      rejectedClaims,
      acceptedStyleMappings: styleMappings?.synthesizedFallback === true ? null : styleMappings || null,
    },
  }
}

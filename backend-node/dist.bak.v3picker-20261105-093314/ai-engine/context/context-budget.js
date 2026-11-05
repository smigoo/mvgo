import { CONTEXT_LIMITS } from './context-schema.js'

export function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8')
}

function uniqueOpenIssues(issues) {
  const byId = new Map()
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue?.id || issue.status === 'resolved') continue
    byId.set(issue.id, issue)
  }
  return [...byId.values()].slice(0, CONTEXT_LIMITS.maxIssues)
}

export function applyContextBudget(input) {
  const budgeted = {
    ...input,
    currentIssues: uniqueOpenIssues(input.currentIssues),
  }

  const sections = {
    designFacts: jsonByteLength(budgeted.designFacts),
    componentPlan: jsonByteLength(budgeted.componentPlan),
    resourceManifest: jsonByteLength(budgeted.resourceManifest),
    currentIssues: jsonByteLength(budgeted.currentIssues),
  }
  const violations = []

  if (sections.designFacts > CONTEXT_LIMITS.designFactsBytes) violations.push('designFacts')
  if (sections.componentPlan > CONTEXT_LIMITS.componentPlanBytes) violations.push('componentPlan')
  if (sections.resourceManifest > CONTEXT_LIMITS.resourceManifestBytes) violations.push('resourceManifest')
  if (sections.currentIssues > CONTEXT_LIMITS.currentIssuesBytes) violations.push('currentIssues')

  budgeted.contextManifest = {
    ...budgeted.contextManifest,
    budget: {
      limits: CONTEXT_LIMITS,
      sections,
      totalBytes: 0,
      passed: false,
      violations,
    },
  }

  const totalBytes = jsonByteLength(budgeted)
  if (totalBytes > CONTEXT_LIMITS.totalBytes) violations.push('total')
  budgeted.contextManifest.budget.totalBytes = totalBytes
  budgeted.contextManifest.budget.passed = violations.length === 0

  return budgeted
}

/**
 * 生产 next 模式的预算门禁：shadow 只记录诊断，next 不允许把超预算上下文交给 Engineer。
 */
export function assertContextBudgetReady(input, { mode = 'next' } = {}) {
  const budget = input?.contextManifest?.budget
  if (!budget || budget.passed !== true) {
    if (mode === 'shadow') return input
    const violations = budget?.violations?.join(', ') || 'budget-missing'
    throw new Error(`generationInput 超出上下文预算，禁止进入 Engineer: ${violations}`)
  }
  return input
}

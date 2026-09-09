import {
  GENERATION_INPUT_SCHEMA_VERSION,
  GENERATION_INPUT_FIELDS,
  RAW_CONTEXT_FIELDS,
  assertGenerationInputShape,
} from './context-schema.js'
import { compileDesignFacts } from './design-facts-compiler.js'
import { resolveContextConflicts } from './context-conflict-resolver.js'
import { applyContextBudget } from './context-budget.js'

function normalizeComponentPlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const sections = Array.isArray(plan.effectiveSections)
    ? plan.effectiveSections.map((section) => ({
        id: section.id || null,
        title: section.title || null,
        responsibility: section.responsibility || null,
        elementCount: Number.isFinite(section.elementCount) ? section.elementCount : null,
      }))
    : []

  return {
    effectiveSections: sections,
    isForced: plan.isForced === true,
    minFiles: Number.isFinite(plan.minFiles) ? plan.minFiles : null,
    reason: plan.reason || null,
  }
}

function normalizeResourceManifest(resourceDomMapping) {
  if (!Array.isArray(resourceDomMapping)) return []
  return resourceDomMapping.map((item) => ({
    resourceId: item.resourceId || item.id || item.name || null,
    fileName: item.fileName || item.filename || item.name || null,
    role: item.role || null,
    recommendedUsage: item.recommendedUsage || null,
    figmaNodeId: item.figmaNodeId || item.nodeId || null,
  }))
}

function checkpointRefs(state) {
  const outputPath = state.outputPath || state.ctx?.outputPath || null
  if (!outputPath) return {}
  return {
    figma: `${outputPath}/.checkpoint/figma.json`,
    visual: `${outputPath}/.checkpoint/visual.json`,
    analysis: `${outputPath}/.checkpoint/analysis.json`,
  }
}

/**
 * 构建 Engineer 未来唯一接收的 generationInput。
 * 当前模块为纯函数骨架；未接入任何 graph，调用方需显式选择 shadow/next。
 */
export function assembleGenerationContext(state = {}) {
  const visualAnalysis = state.visualAnalysis || {
    layoutStructure: state.layoutStructure,
    visualElements: state.visualElements,
    charts: state.charts,
    coverageReport: state.layoutStructure?.coverageReport,
  }
  const reviewResult = state.reviewResult || null
  const styleMappings = state.styleMappings || null
  const resourceDomMapping = state.resourceDomMapping || state.ctx?.resourceDomMapping || []
  const designFacts = compileDesignFacts({
    figmaNodeData: state.figmaNodeData || state.figmaData,
    visualAnalysis,
  })
  const resolution = resolveContextConflicts({
    designFacts,
    visualAnalysis,
    reviewResult,
    styleMappings,
  })

  const rawInput = {
    schemaVersion: GENERATION_INPUT_SCHEMA_VERSION,
    designFacts,
    componentPlan: normalizeComponentPlan(state.subComponentPlan || state.componentPlan),
    resourceManifest: normalizeResourceManifest(resourceDomMapping),
    currentIssues: resolution.currentIssues,
    trustVerdict: resolution.trustVerdict,
    contextManifest: {
      stage: 'engineer',
      mode: 'shadow-only',
      included: GENERATION_INPUT_FIELDS.filter((field) => field !== 'contextManifest'),
      excluded: RAW_CONTEXT_FIELDS,
      diagnosticsRef: checkpointRefs(state),
      conflictSummary: {
        rejectedClaimCount: resolution.diagnostics.rejectedClaims.length,
        rejectedClaimIds: resolution.diagnostics.rejectedClaims.map(
          (claim) => `${claim.source}:${claim.property}`,
        ),
      },
    },
  }

  const budgeted = applyContextBudget(rawInput)
  return assertGenerationInputShape(budgeted)
}

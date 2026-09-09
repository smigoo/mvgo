import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleGenerationContext } from '../src/ai-engine/context/generation-context-assembler.js'
import {
  applyContextBudget,
  assertContextBudgetReady,
} from '../src/ai-engine/context/context-budget.js'
import { runGenerationContextShadow } from '../src/ai-engine/context/generation-context-shadow.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sampleRoot = path.resolve(
  repoRoot,
  '../temp-components/6a7599af6eb9eebf9fba56cd/mv-1787213717433-66ffb69f-mv-max-1787192699501-724aa82b',
)

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(sampleRoot, relativePath), 'utf8'))
}

const figmaNodeData = readJson('.checkpoint/figma.json')
const visualAnalysis = readJson('.checkpoint/visual.json')
const analysis = readJson('.checkpoint/analysis.json')
const generationInput = assembleGenerationContext({
  outputPath: sampleRoot,
  figmaNodeData,
  visualAnalysis,
  reviewResult: analysis.reviewResult,
  styleMappings: analysis.styleMappings,
  subComponentPlan: analysis.subComponentPlan,
})

assert.equal(generationInput.designFacts.root.size.width, 425.8275146484375)
assert.equal(generationInput.designFacts.root.size.height, 807)
assert.equal(generationInput.designFacts.root.size.source, 'figma-api')
assert.equal(generationInput.designFacts.root.styleEvidence.background.allowed, false)
assert.equal(generationInput.trustVerdict.level, 'restricted')
assert.equal(generationInput.contextManifest.budget.passed, true)
assert.equal(generationInput.contextManifest.conflictSummary.rejectedClaimCount >= 2, true)
assert.equal(Object.hasOwn(generationInput.contextManifest.conflictSummary, 'rejectedClaims'), false)
assert.equal(
  generationInput.currentIssues.some((issue) => issue.id === 'CONTEXT-LAYOUT-REVIEW-DEGRADED'),
  true,
)
assert.equal(
  generationInput.currentIssues.some((issue) => issue.id === 'CONTEXT-STYLE-FALLBACK-REJECTED'),
  true,
)
assert.equal(
  generationInput.currentIssues.some((issue) => issue.id === 'CONTEXT-ROOT-BACKGROUND-CONFLICT'),
  true,
)
assert.equal(
  generationInput.currentIssues.some((issue) => issue.id.startsWith('CHART-LEGEND-OWNER:')),
  true,
)

for (const forbidden of [
  'figmaData',
  'figmaNodeData',
  'visualAnalysis',
  'reviewResult',
  'styleMappings',
  'previousCritiques',
]) {
  assert.equal(Object.hasOwn(generationInput, forbidden), false)
}

assert.deepEqual(Object.keys(generationInput.componentPlan).sort(), [
  'effectiveSections',
  'isForced',
  'minFiles',
  'reason',
])

const oversized = applyContextBudget({
  designFacts: { payload: 'x'.repeat(13 * 1024) },
  componentPlan: null,
  resourceManifest: [],
  currentIssues: [],
  contextManifest: {},
})
assert.equal(oversized.contextManifest.budget.passed, false)
assert.equal(oversized.contextManifest.budget.violations.includes('designFacts'), true)
assert.equal(oversized.contextManifest.budget.totalBytes > 13 * 1024, true)
assert.doesNotThrow(() => assertContextBudgetReady(oversized, { mode: 'shadow' }))
assert.throws(
  () => assertContextBudgetReady(oversized, { mode: 'next' }),
  /禁止进入 Engineer/,
)

const trustedInput = assembleGenerationContext({
  figmaNodeData: {
    id: 'trusted-root',
    name: 'Trusted sample',
    absoluteBoundingBox: { width: 320, height: 180 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
    strokes: [{ type: 'SOLID', visible: true }],
    cornerRadius: 4,
    effects: [{ type: 'DROP_SHADOW', visible: true }],
  },
  visualAnalysis: {
    coverageReport: { coverageRate: 92 },
    layoutStructure: { sections: [{ id: 'main' }] },
    charts: [{ id: 'chart-1', legend: { data: ['A', 'B'] } }],
  },
  reviewResult: { score: 92, degraded: false },
  styleMappings: { synthesizedFallback: false },
})
assert.equal(trustedInput.trustVerdict.level, 'trusted')
assert.equal(trustedInput.designFacts.charts[0].legend.items.length, 2)
assert.equal(trustedInput.designFacts.charts[0].legend.owner, 'unresolved')

let savedCheckpoint = null
const shadowState = {
  outputPath: sampleRoot,
  figmaNodeData,
  visualAnalysis,
  layoutStructure: visualAnalysis.layoutStructure,
  visualElements: visualAnalysis.visualElements,
  charts: visualAnalysis.charts,
  reviewResult: analysis.reviewResult,
  styleMappings: analysis.styleMappings,
  subComponentPlan: analysis.subComponentPlan,
  _saveCheckpoint: async (name, data) => {
    savedCheckpoint = { name, data }
  },
}
const shadowReport = await runGenerationContextShadow(shadowState, {
  pipeline: 'validation',
  iteration: 0,
})
assert.equal(savedCheckpoint.name, 'context-shadow')
assert.equal(savedCheckpoint.data.productionInputMode, 'legacy')
assert.equal(savedCheckpoint.data.engineerInputChanged, false)
assert.equal(shadowReport.generationInput.trustVerdict.level, 'restricted')
assert.equal(shadowReport.metrics.legacyEstimatedBytes > 0, true)
assert.equal(shadowReport.metrics.generationInputBytes > 0, true)

const failedShadow = await runGenerationContextShadow(
  {
    ...shadowState,
    _saveCheckpoint: async () => {
      throw new Error('checkpoint-write-test')
    },
  },
  { pipeline: 'validation-failure' },
)
assert.equal(failedShadow.productionInputMode, 'legacy')
assert.equal(failedShadow.engineerInputChanged, false)
assert.equal(failedShadow.error, 'checkpoint-write-test')

console.log(
  JSON.stringify(
    {
      ok: true,
      schemaVersion: generationInput.schemaVersion,
      trustLevel: generationInput.trustVerdict.level,
      rootSize: generationInput.designFacts.root.size,
      issueCount: generationInput.currentIssues.length,
      rejectedClaimCount: generationInput.contextManifest.conflictSummary.rejectedClaimCount,
      totalBytes: generationInput.contextManifest.budget.totalBytes,
      budgetPassed: generationInput.contextManifest.budget.passed,
      shadow: {
        productionInputMode: shadowReport.productionInputMode,
        engineerInputChanged: shadowReport.engineerInputChanged,
        legacyEstimatedBytes: shadowReport.metrics.legacyEstimatedBytes,
        generationInputBytes: shadowReport.metrics.generationInputBytes,
        reductionRate: shadowReport.metrics.reductionRate,
        failureIsolated: failedShadow.error === 'checkpoint-write-test',
      },
    },
    null,
    2,
  ),
)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGenerationContextShadow } from '../src/ai-engine/context/generation-context-shadow.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(repoRoot, '../temp-components')
const outputPath = process.argv[2] || path.resolve(
  repoRoot,
  '../artifacts/context-shadow-regression-20260820.json',
)
const preferredSampleId = 'mv-1787213717433-66ffb69f-mv-max-1787192699501-724aa82b'
const rawFields = [
  'figmaData',
  'figmaNodeData',
  'visualAnalysis',
  'reviewResult',
  'styleMappings',
  'previousCritiques',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeReview(reviewResult) {
  const nested = reviewResult?.reviewResult
  return nested && typeof nested === 'object' ? nested : reviewResult || null
}

function coverageRate(visual) {
  return (
    visual?.coverageReport?.coverageRate ??
    visual?.layoutStructure?.coverageReport?.coverageRate ??
    null
  )
}

function walkCompleteSamples(root) {
  const samples = []

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (!entry.isDirectory()) continue
      if (entry.name !== '.checkpoint') {
        walk(entryPath)
        continue
      }

      const files = {
        figma: path.join(entryPath, 'figma.json'),
        visual: path.join(entryPath, 'visual.json'),
        analysis: path.join(entryPath, 'analysis.json'),
      }
      if (!Object.values(files).every((file) => fs.existsSync(file))) continue

      try {
        const figma = readJson(files.figma)
        const visual = readJson(files.visual)
        const analysis = readJson(files.analysis)
        const review = normalizeReview(analysis.reviewResult)
        const sampleRoot = path.dirname(entryPath)
        samples.push({
          sampleRoot,
          sampleId: path.basename(sampleRoot),
          componentName: figma?.name || null,
          nodeId: figma?.id || null,
          prefix: path.basename(sampleRoot).startsWith('mv-') ? 'mv' : 'mc',
          width: figma?.absoluteBoundingBox?.width ?? null,
          height: figma?.absoluteBoundingBox?.height ?? null,
          coverageRate: coverageRate(visual),
          reviewDegraded: review?.degraded === true,
          reviewScore: typeof review?.score === 'number' ? review.score : null,
          styleFallback: analysis?.styleMappings?.synthesizedFallback === true,
          chartCount: (visual?.charts || visual?.layoutStructure?.charts || []).length,
          modifiedAtMs: fs.statSync(files.analysis).mtimeMs,
          figma,
          visual,
          analysis,
        })
      } catch (error) {
        samples.push({ invalid: true, sampleRoot: path.dirname(entryPath), error: error.message })
      }
    }
  }

  walk(root)
  return samples
}

function selectDiverseSamples(samples, limit = 5) {
  const valid = samples
    .filter((sample) => !sample.invalid)
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs)
  const selected = []
  const selectedRoots = new Set()
  const selectedNodeIds = new Set()

  function take(predicate, { requireNewNode = true } = {}) {
    const candidate = valid.find((sample) => {
      if (selectedRoots.has(sample.sampleRoot) || !predicate(sample)) return false
      if (requireNewNode && sample.nodeId && selectedNodeIds.has(sample.nodeId)) return false
      return true
    })
    if (!candidate) return false
    selected.push(candidate)
    selectedRoots.add(candidate.sampleRoot)
    if (candidate.nodeId) selectedNodeIds.add(candidate.nodeId)
    return true
  }

  take((sample) => sample.sampleId === preferredSampleId, { requireNewNode: false })
  take((sample) => sample.prefix === 'mv' && sample.coverageRate != null && sample.coverageRate >= 60)
  take((sample) => sample.prefix === 'mc' && sample.coverageRate != null && sample.coverageRate >= 60)
  take((sample) => sample.coverageRate != null && sample.coverageRate < 60)
  take((sample) => sample.reviewDegraded || sample.reviewScore === 0 || sample.styleFallback)
  take((sample) => sample.coverageRate == null)

  for (const sample of valid) {
    if (selected.length >= limit) break
    if (selectedRoots.has(sample.sampleRoot)) continue
    selected.push(sample)
    selectedRoots.add(sample.sampleRoot)
  }

  return selected.slice(0, limit)
}

async function evaluateSample(sample) {
  let checkpoint = null
  const state = {
    outputPath: sample.sampleRoot,
    figmaNodeData: sample.figma,
    visualAnalysis: sample.visual,
    layoutStructure: sample.visual.layoutStructure,
    visualElements: sample.visual.visualElements,
    charts: sample.visual.charts || sample.visual.layoutStructure?.charts,
    reviewResult: sample.analysis.reviewResult,
    styleMappings: sample.analysis.styleMappings,
    subComponentPlan: sample.analysis.subComponentPlan,
    resourceDomMapping: sample.analysis.resourceDomMapping || [],
    _saveCheckpoint: async (name, data) => {
      checkpoint = { name, data }
    },
  }
  const shadow = await runGenerationContextShadow(state, {
    pipeline: sample.prefix === 'mv' ? 'vue3' : 'phase2',
    iteration: 0,
  })
  const generationInput = shadow.generationInput || null
  const actualSize = generationInput?.designFacts?.root?.size || null
  const rawFieldLeaks = generationInput
    ? rawFields.filter((field) => Object.hasOwn(generationInput, field))
    : []
  const expectedRestricted =
    (sample.coverageRate != null && sample.coverageRate < 60) ||
    sample.reviewDegraded ||
    sample.reviewScore === 0 ||
    sample.styleFallback
  const trustLevel = generationInput?.trustVerdict?.level || null
  const assertions = {
    shadowCheckpointName: checkpoint?.name === 'context-shadow',
    productionStillLegacy: shadow.productionInputMode === 'legacy',
    engineerInputUnchanged: shadow.engineerInputChanged === false,
    rootWidthPreserved: sample.width == null || actualSize?.width === sample.width,
    rootHeightPreserved: sample.height == null || actualSize?.height === sample.height,
    noRawFieldLeak: rawFieldLeaks.length === 0,
    budgetPassed: generationInput?.contextManifest?.budget?.passed === true,
    restrictedWhenRequired: !expectedRestricted || trustLevel !== 'trusted',
  }
  const failedAssertions = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  return {
    sampleId: sample.sampleId,
    componentName: sample.componentName,
    nodeId: sample.nodeId,
    pipeline: sample.prefix === 'mv' ? 'vue3' : 'phase2',
    source: {
      sampleRoot: sample.sampleRoot,
      coverageRate: sample.coverageRate,
      reviewDegraded: sample.reviewDegraded,
      reviewScore: sample.reviewScore,
      styleFallback: sample.styleFallback,
      chartCount: sample.chartCount,
      figmaRootSize: { width: sample.width, height: sample.height },
    },
    result: {
      trustLevel,
      issueCount: generationInput?.currentIssues?.length ?? null,
      issueIds: generationInput?.currentIssues?.map((issue) => issue.id) || [],
      rawFieldLeaks,
      legacyEstimatedBytes: shadow.metrics?.legacyEstimatedBytes ?? null,
      generationInputBytes: shadow.metrics?.generationInputBytes ?? null,
      reductionRate: shadow.metrics?.reductionRate ?? null,
      budgetPassed: generationInput?.contextManifest?.budget?.passed ?? false,
      budgetViolations: generationInput?.contextManifest?.budget?.violations || [],
      actualRootSize: actualSize,
    },
    assertions,
    failedAssertions,
    passed: failedAssertions.length === 0,
  }
}

const inventory = walkCompleteSamples(tempRoot)
const validInventory = inventory.filter((sample) => !sample.invalid)
const invalidInventory = inventory.filter((sample) => sample.invalid)
const selected = selectDiverseSamples(validInventory, 5)
const samples = []
for (const sample of selected) samples.push(await evaluateSample(sample))

const reductionRates = samples
  .map((sample) => sample.result.reductionRate)
  .filter((value) => typeof value === 'number')
const summary = {
  completeSampleCount: validInventory.length,
  invalidSampleCount: invalidInventory.length,
  selectedSampleCount: samples.length,
  passedSampleCount: samples.filter((sample) => sample.passed).length,
  failedSampleCount: samples.filter((sample) => !sample.passed).length,
  trustDistribution: samples.reduce((acc, sample) => {
    const key = sample.result.trustLevel || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {}),
  averageReductionRate:
    reductionRates.length > 0
      ? Number((reductionRates.reduce((sum, value) => sum + value, 0) / reductionRates.length).toFixed(2))
      : null,
  minReductionRate: reductionRates.length > 0 ? Math.min(...reductionRates) : null,
  maxGenerationInputBytes: Math.max(
    0,
    ...samples.map((sample) => sample.result.generationInputBytes || 0),
  ),
  budgetFailureCount: samples.filter((sample) => !sample.result.budgetPassed).length,
  rawFieldLeakCount: samples.filter((sample) => sample.result.rawFieldLeaks.length > 0).length,
  sizeMismatchCount: samples.filter(
    (sample) =>
      !sample.assertions.rootWidthPreserved || !sample.assertions.rootHeightPreserved,
  ).length,
  trustedMisclassificationCount: samples.filter(
    (sample) => !sample.assertions.restrictedWhenRequired,
  ).length,
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: 'offline-read-only',
  selectionPolicy: [
    '优先纳入已知流量监测失败样本',
    '覆盖 Vue3(mv) 与 Phase2(mc)',
    '覆盖低/高 coverage、review degraded、style fallback',
    '优先选择不同 Figma nodeId，数量不足时按最近完整样本补齐',
  ],
  summary,
  samples,
  invalidSamples: invalidInventory.slice(0, 20),
  decision: {
    eligibleForLiveShadowValidation:
      summary.failedSampleCount === 0 &&
      summary.budgetFailureCount === 0 &&
      summary.rawFieldLeakCount === 0 &&
      summary.sizeMismatchCount === 0 &&
      summary.trustedMisclassificationCount === 0,
    productionSwitchRecommended: false,
    reason: '离线回归只验证上下文收敛与事实保留；切换 Engineer 输入前仍需真实 shadow 运行。',
  },
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ outputPath, ...summary, decision: report.decision }, null, 2))

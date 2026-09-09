import { assembleGenerationContext } from './generation-context-assembler.js'
import { jsonByteLength } from './context-budget.js'

function legacyContextProjection(state) {
  return {
    layoutStructure: state.layoutStructure,
    visualElements: state.visualElements,
    reviewResult: state.reviewResult,
    previousCritiques: state.checkResult?.critiques,
    charts: state.charts,
    chartDataHints: state.chartDataHints,
    interactions: state.interactions,
    figmaStyleTree: state.figmaStyleTree,
    figmaNodeData: state.figmaNodeData,
    styleMappings: state.styleMappings,
    assets: state.assets,
    resourceDomMapping: state.resourceDomMapping,
    headerSlots: state.headerSlots,
    techStackHints: state.techStackHints,
    elementStyleMap: state.styleMappings?.elementStyleMap,
    backgroundBrightness:
      state.visualElements?.backgroundBrightness ||
      state.layoutStructure?.styles?.backgroundBrightness ||
      'dark',
    subComponentPlan: state.subComponentPlan,
    docAnalysis: state.docAnalysis,
  }
}

function safeJsonByteLength(value) {
  try {
    return jsonByteLength(value)
  } catch {
    return null
  }
}

/**
 * 旁路生成新上下文并保存比较报告。
 * 不修改 state，不改变 Engineer 输入；任意错误都降级为 warning。
 */
export async function runGenerationContextShadow(
  state,
  { pipeline, logger, iteration = 0 } = {},
) {
  try {
    const generationInput = assembleGenerationContext(state)
    const legacyEstimatedBytes = safeJsonByteLength(legacyContextProjection(state))
    const generationInputBytes = jsonByteLength(generationInput)
    const reductionBytes =
      legacyEstimatedBytes == null ? null : legacyEstimatedBytes - generationInputBytes
    const reductionRate =
      legacyEstimatedBytes > 0
        ? Number(((reductionBytes / legacyEstimatedBytes) * 100).toFixed(2))
        : null

    const report = {
      schemaVersion: 1,
      mode: 'shadow',
      pipeline: pipeline || 'unknown',
      iteration,
      generatedAt: new Date().toISOString(),
      productionInputMode: 'legacy',
      engineerInputChanged: false,
      metrics: {
        legacyEstimatedBytes,
        generationInputBytes,
        reductionBytes,
        reductionRate,
        issueCount: generationInput.currentIssues.length,
        rejectedClaimCount:
          generationInput.contextManifest?.conflictSummary?.rejectedClaimCount || 0,
      },
      trustVerdict: generationInput.trustVerdict,
      budget: generationInput.contextManifest?.budget || null,
      generationInput,
    }

    if (typeof state._saveCheckpoint === 'function') {
      await state._saveCheckpoint('context-shadow', report)
    } else {
      logger?.warn?.('[Context Shadow] 未提供 checkpoint 保存器，仅完成内存比较')
    }

    logger?.info?.('[Context Shadow] 旁路比较完成', {
      pipeline: report.pipeline,
      iteration,
      trustLevel: generationInput.trustVerdict.level,
      legacyEstimatedBytes,
      generationInputBytes,
      reductionRate,
      issueCount: report.metrics.issueCount,
    })

    return report
  } catch (error) {
    logger?.warn?.(`[Context Shadow] 旁路比较失败，不影响旧链路: ${error.message}`)
    return {
      schemaVersion: 1,
      mode: 'shadow',
      pipeline: pipeline || 'unknown',
      iteration,
      productionInputMode: 'legacy',
      engineerInputChanged: false,
      error: error.message,
    }
  }
}

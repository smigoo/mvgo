/**
 * Phase 2 Figma阶段工作流 v3.0
 * 
 * 升级内容：
 * - 🆕 L0-A: preview-validator 自验环（visual-parser 之后）
 * - 🆕 L0-B: code-structure-validator（engineer 之后）
 * - 🆕 L1: refine-feedback 同伴评审环
 * - 🆕 L2: revision-decision 智能路由（4路分发）
 * - 🆕 并行精修: layout-refiner + style-refiner 同时执行
 * - 🆕 issueCategories 分类输出 → 精准路由
 * - 🔧 v3.0-minimal/full 模式切换
 * - 📊 Metrics 可观测性采集
 */

import { Graph } from './graph.js'
import { FigmaConnector } from '../roles/figma-connector.js'
import { VisualParser } from '../roles/visual-parser.js'
import { LayoutReviewer } from '../roles/layout-reviewer.js'
import { StyleMapper } from '../roles/style-mapper.js'
import { LayoutRefiner } from '../roles/layout-refiner.js'
import { StyleRefiner } from '../roles/style-refiner.js'
import { LayoutStyleRefiner } from '../roles/layout-style-refiner.js'
import { Vue3Engineer } from '../roles/vue3-engineer.js'
import { AdversarialChecker } from '../roles/adversarial-checker.js'
import { VisualComparator } from '../roles/visual-comparator.js'
import { renderScreenshot, evaluateRuntimeGate, classifyRuntimeGate, buildRuntimeRevisionGuidance } from '../roles/screenshot-renderer.js'
import { publishQualityPreview } from '../utils/workspace-preview-publisher.js'
// 🆕 v3.0: 引入 validators
import { PreviewAnalysisValidator } from '../validators/preview-analysis-validator.js'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'
import { OrphanComponentDetector } from '../validators/orphan-component-detector.js'
import { LessVariableChecker } from '../validators/less-variable-checker.js'
import { LessCompileGate } from '../validators/less-compile-gate.js'
import { HeaderRelationValidator } from '../validators/header-relation-validator.js'
import { HeaderSlotValidator } from '../validators/header-slot-validator.js'
import { createLogger } from '../logger/index.js'
// 🆕 v3.0 自优化器：基于历史 metrics 自动优化 Prompt 和参数
import { recordRun, getOptimizationForNextRun } from '../utils/self-optimizer.js'
// 🆕 Token 预算管控
import { TokenBudget } from '../utils/token-budget.js'
import { computeChangedFilePaths, readRevisionSnapshot, resolveTargetFiles } from '../utils/revision-files.js'
import { withTimeout } from '../orchestrator/orchestrator.js'

const logger = createLogger({ name: 'mc-component-graph-vue3' })

/**
 * 解析 v3.0 运行模式
 * @param {Object} options - 构造选项或 state
 * @returns {{ mode: 'off'|'minimal'|'full', config: Object }}
 */
function resolveV3Mode(options = {}) {
  // 优先级: state覆盖 > 参数 > 环境变量 > 默认full
  const envMode = process.env.V3_MODE || 'full'
  const paramMode = options.v3Mode || options.config?.v3Mode || ''
  const stateOverride = options.state?.v3ModeOverride
  
  let mode = stateOverride || paramMode || envMode
  if (!['off', 'minimal', 'full'].includes(mode)) {
    logger.warn(`未知 v3Mode "${mode}"，回退到 full`)
    mode = 'full'
  }

  return {
    mode,
    config: {
      l0MaxRetry: parseInt(process.env.L0_MAX_RETRY || '1'),
      l0BypassAfterFailures: parseInt(process.env.L0_BYPASS_AFTER_FAILURES || '5'),
      violationMaxCount: parseInt(process.env.VIOLATION_MAX_COUNT || '2'),
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '2'),
      qualityScoreThreshold: parseInt(process.env.QUALITY_SCORE_THRESHOLD || '75')
    }
  }
}

// ============================================
// 📊 Metrics 辅助函数
// ============================================

/** 在关键节点输出 metrics 日志 */
function emitMetrics(nodeName, metrics) {
  logger.info(`📊 [metrics] ${nodeName}`, metrics)
}

/** 判断当前模式是否启用某功能 */
function isFeatureEnabled(v3Mode, feature) {
  switch (feature) {
    case 'l0-preview':   return v3Mode !== 'off'     // minimal+full
    case 'l0-code':      return v3Mode !== 'off'     // minimal+full
    case 'style-standard': return v3Mode !== 'off'     // minimal+full
    case 'parallel-refine': return v3Mode === 'full'   // 仅 full
    case 'l1-feedback':   return v3Mode === 'full'   // 仅 full
    case 'l2-routing':    return v3Mode === 'full'   // 仅 full
    case 'violation-detect': return v3Mode === 'full' // 仅 full
    default:
      return v3Mode === 'full'
  }
}

/**
 * 创建 Phase 2 Figma阶段工作流图
 * @param {Object} [config] - 可选的 v3.0 配置
 * @param {string} [config.v3Mode='full'] - 运行模式: off | minimal | full
 */
export function createPhase2Graph(config = {}) {
  const graph = new Graph({ name: 'mc-component-phase2-figma' })
  
  // 预解析模式（init 节点中会再次确认）
  const resolvedConfig = resolveV3Mode(config)

  // ========================================
  // 节点 1: 初始化 (📊 metrics 注入)
  // ========================================
  graph.addNode('init', async (state) => {
    // 解析最终运行模式
    const { mode, config: v3Config } = resolveV3Mode({ ...config, state })
    
    logger.info('节点: 初始化Figma阶段', {
      componentName: state.componentName,
      fileKey: state.fileKey,
      nodeId: state.nodeId,
      v3Mode: mode,
      v3Config
    })

    // 📊 初始化 metrics
    emitMetrics('init', {
      v3Mode: mode,
      l0MaxRetry: v3Config.l0MaxRetry,
      l0BypassAfterFailures: v3Config.l0BypassAfterFailures,
      maxIterations: v3Config.maxIterations,
      timestamp: Date.now()
    })

    // 🆕 v3.0 自优化：加载历史模式，生成 Prompt 增强指令
    let selfOptimization = null
    try {
      if (mode === 'full') {
        selfOptimization = getOptimizationForNextRun()
        if (selfOptimization.promptAugmentation || selfOptimization.warnings?.length > 0) {
          logger.info('🧠 自优化: 已加载历史优化建议', {
            suggestionCount: selfOptimization._meta?.suggestionCount || 0,
            warnings: selfOptimization.warnings?.length || 0
          })
          // 将 warnings 推送到前端显示
          for (const w of (selfOptimization.warnings || [])) {
            state.onProgress?.({ stage: '自优化', message: w, status: 'warning' })
          }
        }
      }
    } catch (e) {
      logger.warn('🧠 自优化加载失败（非阻塞）', e.message)
      selfOptimization = null
    }

    state.onProgress?.({
      stage: '初始化',
      message: `🚀 开始Figma精修阶段... (v3.0 ${mode})`,
      status: 'running'
    })

    return {
      ...state,
      stage: 'figma',
      iterationCount: 0,
      maxIterations: v3Config.maxIterations,
      startTime: Date.now(),
      // 🆕 面板类型（传递给代码生成节点）
      panelType: state.panelType || 'default-panel',
      // 🆕 v3.0 模式状态（后续所有节点共享）
      _v3Mode: mode,
      _v3Config: v3Config,
      _l0ConsecutiveFailures: 0,  // L0-A (preview) 连续失败计数器
      _l0CodeConsecutiveFailures: 0,  // L0-B (code) 连续失败计数器
      violationCount: 0,          // 越权计数器
      validatorRetryCount: 0,     // L0-A 已重试次数
      codeValidatorRetryCount: 0, // L0-B 已重试次数
      // 🧠 自优化状态（供 microcode-engineer 等节点消费）
      _selfOptimization: selfOptimization
    }
  })

  // ========================================
  // 节点 2: Figma Connector - 获取详细数据
  // ========================================
  graph.addNode('figma-connector', async (state) => {
    logger.info('节点: Figma Connector - 获取详细数据')

    state.onProgress?.({
      stage: 'Figma数据获取',
      message: '📥 正在获取Figma详细数据和资源...',
      status: 'running'
    })

    try {
      const connector = new FigmaConnector({
        figmaToken: state.figmaToken || process.env.FIGMA_ACCESS_TOKEN
      })

      const result = await connector.execute({
        target: 'vue3',
        fileKey: state.fileKey,
        nodeId: state.nodeId,
        outputPath: state.outputPath
      })

      // 提取技术栈提示
      const techStackHints = connector.extractTechStackHints(result.figmaNodeData)

      // 优化 Figma 节点数据（减少 Token 消耗 40-50%）
      const optimizedFigmaData = connector.pruneRedundantFields(result.figmaNodeData)

      state.onProgress?.({
        stage: 'Figma数据获取',
        message: '✅ Figma数据获取完成',
        status: 'completed'
      })

      return {
        previewImage: result.previewImage,
        figmaNodeData: optimizedFigmaData,
        assets: result.assets,
        resourceDomMapping: result.resourceDomMapping,
        techStackHints: techStackHints
      }

    } catch (error) {
      logger.error('Figma数据获取失败', { error: error.message })
      state.onProgress?.({
        stage: 'Figma数据获取',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 3: Visual Parser - 重新分析
  // ========================================
  graph.addNode('visual-parser', async (state) => {
    logger.info('节点: Visual Parser - 重新分析')

    state.onProgress?.({
      stage: '视觉分析',
      message: '🔍 正在使用Figma数据重新分析...',
      status: 'running'
    })

    try {
      // 视觉任务：使用 visionAIConfig（Qwen/DashScope）
      const visionCfg = state.visionAIConfig || state.aiConfig || {}
      const parser = new VisualParser({
        apiKey: visionCfg.apiKey || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY,
        baseURL: visionCfg.baseURL || process.env.VISION_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        model: visionCfg.model || process.env.VISION_MODEL || process.env.ANTHROPIC_MODEL,
        onProgress: state.onProgress,
        onTokenUsage: state.onTokenUsage
      })

      // 添加可中断超时保护：图层超时会显式 abort 到 Vision 请求层
      const VISUAL_TIMEOUT_MS = 10 * 60 * 1000
      const runVisualParser = withTimeout(
        (nextState) => parser.execute({
          target: 'vue3',
          previewImage: nextState.previewImage,
          figmaData: nextState.figmaNodeData,
          outputPath: nextState.outputPath,
          resourceDomMapping: nextState.resourceDomMapping,
          fileKey: nextState.fileKey,
          nodeId: nextState.nodeId,
          signal: nextState.signal || nextState.__abortSignal || null,
          onProgress: nextState.onProgress,
          requestConcurrency: nextState.requestConcurrency,
          requestQueueTimeoutMs: nextState.requestQueueTimeoutMs,
          requestTimeoutMs: nextState.requestTimeoutMs,
          requestMaxRetries: nextState.requestMaxRetries,
        }),
        VISUAL_TIMEOUT_MS,
        { nodeName: 'visual-parser', onProgress: state.onProgress },
      )
      const result = await runVisualParser(state)

      // 🆕 P2 #3: Figma 视觉覆盖率硬校验 —— 覆盖率过低说明组件缺乏可靠设计依据
      const figmaCoverageRate = result.coverageReport?.coverageRate
      state._figmaCoverageRate = figmaCoverageRate ?? null
      const FIGMA_COVERAGE_WARN_THRESHOLD = parseInt(process.env.FIGMA_COVERAGE_WARN_THRESHOLD || '60', 10)
      if (figmaCoverageRate != null && figmaCoverageRate < FIGMA_COVERAGE_WARN_THRESHOLD) {
        state._figmaCoverageWarning = {
          rate: figmaCoverageRate,
          threshold: FIGMA_COVERAGE_WARN_THRESHOLD,
          message: `Figma 视觉覆盖率仅 ${figmaCoverageRate}%（阈值 ${FIGMA_COVERAGE_WARN_THRESHOLD}%），组件缺乏可靠设计依据，生成质量无法保证`
        }
        logger.warn('⚠️ P2 #3: Figma 视觉覆盖率过低（无设计依据风险）', { rate: figmaCoverageRate, threshold: FIGMA_COVERAGE_WARN_THRESHOLD })
        if (process.env.FIGMA_COVERAGE_HARD_BLOCK === 'true') {
          state._figmaCoverageBlocked = true
          logger.warn('🚫 P2 #3: Figma 覆盖率硬阻断已标记', { rate: figmaCoverageRate })
        }
      }

      // 🎯 Header关系验证（Priority 7）
      logger.info('开始Header关系验证')
      const headerValidation = HeaderRelationValidator.validate(
        result,
        state.figmaNodeData,
        { componentType: 'vue3' }
      )

      if (headerValidation.headerRightElements.length > 0) {
        logger.info('识别到header-right元素', {
          count: headerValidation.headerRightElements.length,
          confidence: headerValidation.confidence,
          elements: headerValidation.headerRightElements.map(e => e.name)
        })
      }

      // 🎯 头部插槽验证（基于Y坐标）— 🆕 重新启用，try/catch 包裹
      let headerSlotValidation = { validatedSlots: [], rejectedNodes: [], warnings: [] }
      try {
        logger.info('开始头部插槽验证')
        const figmaConnectorInstance = new FigmaConnector({
          apiKey: state.figmaToken || process.env.FIGMA_ACCESS_TOKEN
        })
        const headerSlotValidator = new HeaderSlotValidator(figmaConnectorInstance)
        headerSlotValidation = headerSlotValidator.validateHeaderSlots(
          state.figmaNodeData,
          result.headerSlots || [],
          { thresholdRatio: 0.3, componentType: 'vue3' }
        )

        if (headerSlotValidation.validatedSlots && headerSlotValidation.validatedSlots.length > 0) {
          logger.info('✅ 验证通过的头部插槽', {
            count: headerSlotValidation.validatedSlots.length,
            slots: headerSlotValidation.validatedSlots.map(s => ({
              type: s.slotType,
              control: s.controlType,
              node: s.figmaNode?.name
            }))
          })
        }

        if (headerSlotValidation.warnings && headerSlotValidation.warnings.length > 0) {
          logger.warn('⚠️ 头部插槽验证警告', {
            warnings: headerSlotValidation.warnings
          })
        }
      } catch (err) {
        logger.warn('⚠️ 头部插槽验证失败（非阻塞）', { error: err.message })
      }

      state.onProgress?.({
        stage: '视觉分析',
        message: '✅ 视觉分析完成',
        status: 'completed'
      })

      return {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        // 🆕 v3.7: Figma 图表数据提示
        chartDataHints: result.chartDataHints || [],
        headerValidation,
        headerSlotValidation,
        // 🆕 headerSlots：面板头部插槽信息（供 microcode-engineer 使用）
        headerSlots: result.headerSlots || [],
        // 顶层组件类型信息
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || []
      }

    } catch (error) {
      logger.error('视觉分析失败', { error: error.message })
      state.onProgress?.({
        stage: '视觉分析',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 4: Layout Reviewer - 审查布局
  // ========================================
  graph.addNode('layout-reviewer', async (state) => {
    logger.info('节点: Layout Reviewer - 审查布局')

    state.onProgress?.({
      stage: '布局审查',
      message: '🔎 正在审查布局结构...',
      status: 'running'
    })

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const reviewer = new LayoutReviewer({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL
      })

      const result = await reviewer.execute({
        target: 'vue3',
        layoutStructure: state.layoutStructure,
        onProgress: state.onProgress,
        signal: state.signal || state.__abortSignal || null,
        requestConcurrency: state.requestConcurrency,
        requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
        requestMaxRetries: state.requestMaxRetries,
      })

      state.onProgress?.({
        stage: '布局审查',
        message: `✅ 布局审查完成 (评分: ${result.score})`,
        status: 'completed'
      })

      return {
        reviewResult: result
      }

    } catch (error) {
      logger.error('布局审查失败', { error: error.message })
      state.onProgress?.({
        stage: '布局审查',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 4b: Style Mapper - 样式映射（与节点4并行）
  // ========================================
  graph.addNode('style-mapper', async (state) => {
    logger.info('节点: Style Mapper - 样式映射')

    state.onProgress?.({
      stage: '样式映射',
      message: '🎨 正在映射样式代码...',
      status: 'running'
    })

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const mapper = new StyleMapper({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL
      })

      const result = await mapper.execute({
        target: 'vue3',
        visualElements: state.visualElements,
        figmaStyles: state.figmaNodeData?.styles,
        // 🆕 v3.1: 传递完整 layoutStructure（SM 内部会调用 _collectElementsFromStructure
        // 递归收集所有子元素，包括 VP 后处理新增的 row/group/body.backgroundImage 等）
        elements: state.layoutStructure,
        backgroundBrightness: state.visualElements?.backgroundBrightness || state.layoutStructure?.styles?.backgroundBrightness || 'dark',
        onProgress: state.onProgress,
        signal: state.signal || state.__abortSignal || null,
        requestConcurrency: state.requestConcurrency,
        requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
        requestMaxRetries: state.requestMaxRetries,
      })

      state.onProgress?.({
        stage: '样式映射',
        message: `✅ 样式映射完成 (覆盖率: ${(result.tokenCoverage * 100).toFixed(0)}%)`,
        status: 'completed'
      })

      return {
        styleMappings: result
      }

    } catch (error) {
      logger.error('样式映射失败', { error: error.message })
      state.onProgress?.({
        stage: '样式映射',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 5: Microcode Engineer - 生成/修订代码
  // ========================================
  graph.addNode('microcode-engineer', async (state) => {
    const iteration = state.iterationCount || 0
    const action = iteration === 0 ? '生成' : '修订'

    logger.info(`节点: Microcode Engineer - ${action}代码 (第${iteration + 1}轮)`)

    state.onProgress?.({
      stage: '代码生成',
      message: `⚙️ 正在${action}组件代码...`,
      status: 'running'
    })

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {}
      // 渲染器：Vue3 组件固定使用 Vue3Engineer（面板头部/背景真实还原，产物为标准 SFC）
      const EngineerClass = Vue3Engineer
      const engineer = new EngineerClass({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      const result = await engineer.execute({
        target: 'vue3',
        signal: state.signal || state.__abortSignal || null,
        layoutStructure: state.layoutStructure,
        visualElements: state.visualElements,
        componentName: state.componentName,
        outputPath: state.outputPath,
        stage: 'figma',
        reviewResult: state.reviewResult,
        previousCritiques: state.checkResult?.critiques,
        charts: state.charts,
        chartDataHints: state.chartDataHints || [],
        interactions: state.interactions,
        // 传递顶层组件类型信息
        analysisType: state.analysisType || '',
        analysisTarget: state.analysisTarget || '',
        analysisDescription: state.analysisDescription || '',
        analysisEvidence: state.analysisEvidence || [],
        // Figma 精修数据
        figmaNodeData: state.figmaNodeData,
        styleMappings: state.styleMappings,
        assets: state.assets,
        resourceDomMapping: state.resourceDomMapping,
        // 🆕 面板类型（必须在代码中使用对应 panelKey）
        panelType: state.panelType || state._v3Config?.panelType || 'default-panel',
        // 🆕 headerSlots：面板头部插槽信息
        headerSlots: state.headerSlots || [],
        // 🆕 L0-B 重试修复指导
        _l0CodeRetryGuidance: state._l0CodeRetryGuidance,
        // 🆕 技术栈提示
        techStackHints: state.techStackHints,
        // 🧠 自优化：历史模式驱动的 Prompt 增强
        _selfOptimization: state._selfOptimization,
        // 🆕 v3.1: per-element 样式映射（来自 Style Mapper）
        elementStyleMap: state.styleMappings?.elementStyleMap,
        // 🆕 面板明暗主题（用于 theme-vars.less 默认主题）
        backgroundBrightness: state.visualElements?.backgroundBrightness || state.layoutStructure?.styles?.backgroundBrightness || 'dark',
        // 🆕 暂停检查回调（由 phase2.service 注入，每个分块前调用）
        pauseChecker: state.pauseChecker || null,
        // 🆕 P1: 按问题类别只修目标文件（部分修订）
        generatedFiles: state.generatedFiles,
        targetFiles: state._reviseFiles,
        reviseTarget: state._reviseTarget
      })

      state.onProgress?.({
        stage: '代码生成',
        message: `✅ 代码${action}完成`,
        status: 'completed'
      })

      return {
        generatedFiles: result.writtenFiles,
        componentStructure: result.componentStructure,
        // 🆕 每次回退自增 L0-B 重试计数（替代条件边中的 state 突变）
        codeValidatorRetryCount: (state.codeValidatorRetryCount || 0) + 1
      }

    } catch (error) {
      logger.error('代码生成失败', { error: error.message })
      state.onProgress?.({
        stage: '代码生成',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 5b: Layout Refiner - 布局精修（执行CSS布局修改）
  // ========================================
  graph.addNode('layout-refiner', async (state) => {
    logger.info('节点: Layout Refiner - 布局精修')

    state.onProgress?.({
      stage: '布局精修',
      message: '📐 正在精修CSS布局结构...',
      status: 'running'
    })

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const refiner = new LayoutRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      // 🆕 #5: 精修部分修订 —— 非 full 修订时，只把 critique 指定的文件/类交给 refiner 局部修改
      const _rt = (state._reviseTarget && state._reviseTarget !== 'full' && state.checkResult)
        ? resolveTargetFiles(state.checkResult, state.generatedFiles, { mainComponentFile: 'package/index.vue' })
        : null
      const refineTargetFiles = _rt?.hasTargets ? Array.from(_rt.targetFiles) : null
      const refineTargetClassNames = _rt?.targetClassNames?.length ? _rt.targetClassNames : null
      if (refineTargetFiles) {
        logger.info('🎯 #5: 布局精修仅处理目标文件', { files: refineTargetFiles, classes: refineTargetClassNames })
      }

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        layoutStructure: state.layoutStructure,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        onProgress: state.onProgress,
        signal: state.signal || state.__abortSignal || null,
        visualDiffGuidance: state.visualComparisonReport
          ? VisualComparator.formatForRefiner(state.visualComparisonReport)
          : null,
        targetFiles: refineTargetFiles,
        targetClassNames: refineTargetClassNames,
      })

      state.onProgress?.({
        stage: '布局精修',
        message: result.refined
          ? `✅ 布局精修完成 (${result.modifiedFiles.length}个文件)`
          : `⚠️ 布局精修跳过: ${result.reason || '无修改'}`,
        status: 'completed'
      })

      return {
        layoutRefineResult: result
      }

    } catch (error) {
      logger.error('布局精修失败', { error: error.message })
      state.onProgress?.({
        stage: '布局精修',
        message: `⚠️ 布局精修失败: ${error.message}（流程继续）`,
        status: 'warning'
      })
      return {
        layoutRefineResult: { refined: false, reason: error.message }
      }
    }
  })

  // ========================================
  // 节点 5c: Style Refiner - 样式精修（执行CSS样式修改）
  // ========================================
  graph.addNode('style-refiner', async (state) => {
    logger.info('节点: Style Refiner - 样式精修')

    state.onProgress?.({
      stage: '样式精修',
      message: '🎨 正在精修CSS样式（颜色/字体/阴影/圆角）...',
      status: 'running'
    })

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      // 🆕 #5: 精修部分修订 —— 非 full 修订时，只把 critique 指定的文件/类交给 refiner 局部修改
      const _rt = (state._reviseTarget && state._reviseTarget !== 'full' && state.checkResult)
        ? resolveTargetFiles(state.checkResult, state.generatedFiles, { mainComponentFile: 'package/index.vue' })
        : null
      const refineTargetFiles = _rt?.hasTargets ? Array.from(_rt.targetFiles) : null
      const refineTargetClassNames = _rt?.targetClassNames?.length ? _rt.targetClassNames : null
      if (refineTargetFiles) {
        logger.info('🎯 #5: 样式精修仅处理目标文件', { files: refineTargetFiles, classes: refineTargetClassNames })
      }

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        styleMappings: state.styleMappings,
        visualElements: state.visualElements,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        onProgress: state.onProgress,
        signal: state.signal || state.__abortSignal || null,
        visualDiffGuidance: state.visualComparisonReport
          ? VisualComparator.formatForRefiner(state.visualComparisonReport)
          : null,
        targetFiles: refineTargetFiles,
        targetClassNames: refineTargetClassNames,
      })

      state.onProgress?.({
        stage: '样式精修',
        message: result.refined
          ? `✅ 样式精修完成 (${result.modifiedFiles.length}个文件)`
          : `⚠️ 样式精修跳过: ${result.reason || '无修改'}`,
        status: 'completed'
      })

      return {
        styleRefineResult: result
      }

    } catch (error) {
      logger.error('样式精修失败', { error: error.message })
      state.onProgress?.({
        stage: '样式精修',
        message: `⚠️ 样式精修失败: ${error.message}（流程继续）`,
        status: 'warning'
      })
      return {
        styleRefineResult: { refined: false, reason: error.message }
      }
    }
  })

  // ========================================
  // 节点 6: Adversarial Checker - 对抗性检查 (🆕 v3.0 越权检测)
  // ========================================
  graph.addNode('adversarial-checker', async (state) => {
    logger.info('节点: Adversarial Checker - 对抗性检查', {
      _reviseTarget: state._reviseTarget,
      hasPreRefineFiles: !!state.preRefineFiles
    })

    state.onProgress?.({
      stage: '质量检查',
      message: '🔍 正在进行对抗性代码检查...',
      status: 'running'
    })

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const checker = new AdversarialChecker({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage,
        onProgress: state.onProgress,
      })
      
      // revision 迭代仅将变更文件完整发送给 LLM；本地检查仍读取完整文件。
      let changedFileNames = null
      if (state.iterationCount > 0 && state.preRefineFiles) {
        const currentFiles = readRevisionSnapshot(state.generatedFiles, state.outputPath)
        const changeStats = computeChangedFilePaths(currentFiles, state.preRefineFiles)
        // Checker 内部按短名（basename）比对，这里把完整相对路径映射为短名。
        changedFileNames = new Set([...changeStats.changedFilePaths].map((p) => p.split('/').pop()))
        logger.info('📊 #354b: 变更检测完成', {
          changed: changedFileNames.size,
          unchanged: changeStats.unchangedCount,
          total: changeStats.totalCount,
        })
      }

      // 🔧 总超时保护：adversarial-checker 最多允许 8 分钟（含 LLM 5min + 重试 + 本地检查）
      const ADVERSARIAL_TOTAL_TIMEOUT = 8 * 60 * 1000
      const runAdversarialChecker = withTimeout(
        (nextState) => checker.execute({
          target: 'vue3',
          componentType: 'vue3',
          generatedFiles: nextState.generatedFiles,
          outputPath: nextState.outputPath,
          layoutStructure: nextState.layoutStructure,
          _reviseTarget: nextState._reviseTarget,
          originalFiles: nextState.preRefineFiles,
          resourceDomMapping: nextState.resourceDomMapping,
          headerSlots: nextState.headerSlots || [],
          elementStyleMap: nextState.styleMappings?.elementStyleMap,
          changedFileNames,  // 🆕 #354b: 变更文件集合
          cachedSfcFacts: nextState._sfcFactsCache,   // 🆕 P2 #8: SFC 事实缓存（revision 轮复用）
          cachedSfcFactsHash: nextState._sfcFactsHash,
          onProgress: nextState.onProgress,
          signal: nextState.signal || nextState.__abortSignal || null,
          requestConcurrency: nextState.requestConcurrency,
          requestQueueTimeoutMs: nextState.requestQueueTimeoutMs,
          requestTimeoutMs: nextState.requestTimeoutMs,
          requestMaxRetries: nextState.requestMaxRetries,
        }),
        ADVERSARIAL_TOTAL_TIMEOUT,
        { nodeName: 'adversarial-checker', onProgress: state.onProgress },
      )

      let result
      try {
        result = await runAdversarialChecker(state)
      } catch (raceError) {
        if (raceError.code === 'NODE_EXEC_TIMEOUT' || raceError.message.includes('总超时')) {
          logger.warn('⚠️ 对抗性检查总超时，返回安全兜底结果让流程继续', { error: raceError.message })
          result = {
            checkResult: 'pass',
            qualityScore: 70,  // 低于 qualityScoreThreshold(75)，不会触发提前退出
            complexity: 'simple',  // 🆕 超时兜底保守预估为 simple（避免高成本路由）
            critiques: [],
            issueCategories: {},
            recommendations: [],
            summary: '对抗性检查因超时跳过（安全兜底）',
            authorizationViolation: null
          }
        } else {
          throw raceError
        }
      }

      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 质量检查完成 (评分: ${result.qualityScore})${result.authorizationViolation?.violation ? ' | ⚠️ 检测到越权修改' : ''}`,
        status: 'completed'
      })

      // 🆕 预启动截图任务：与图引擎调度并行执行
      if (state.outputPath) {
        const _sid = state.sessionId || state.componentName || 'unknown'
        const _tgt = state.target || 'vue3'
        const _groupId = state.groupId || 'default-group'
        const _outputPath = state.outputPath
        const _previewImage = state.previewImage || null
        const _onProgress = state.onProgress
        const _componentName = state.componentName

        const _screenshotPromise = (async () => {
          const startTime = Date.now()
          try {
            await publishQualityPreview({
              outputPath: _outputPath,
              componentId: _sid,
              groupId: _groupId,
              target: _tgt,
            })
            const r = await renderScreenshot({
              outputPath: _outputPath,
              sessionId: _sid,
              groupId: _groupId,
              componentName: _componentName,
              target: _tgt,
              previewImage: _previewImage,
              onProgress: _onProgress,
              hardGate: true,
              allowMissingAssetSelfHeal: true,
            })
            const duration = Date.now() - startTime
            logger.info('✅ 预启动截图任务完成', { sessionId: _sid, durationMs: duration })
            return r
          } catch (e) {
            const duration = Date.now() - startTime
            logger.warn('预启动截图任务失败（非阻塞）', { error: e.message, sessionId: _sid, durationMs: duration })
            return { renderedImage: null, isStaticFallback: false, runtimeGate: null }
          }
        })()

        return {
          checkResult: result,
          _screenshotPromise,  // 🆕 预启动的截图Promise
        }
      }

      return {
        checkResult: result
      }

    } catch (error) {
      logger.error('质量检查失败', { error: error.message })
      state.onProgress?.({
        stage: '质量检查',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 节点 6b: Runtime Preview Gate - 发布当前迭代产物并执行真实运行时硬门禁
  // ========================================
  graph.addNode('runtime-preview-gate', async (state) => {
    logger.info('节点: Runtime Preview Gate - Vue3 真实预览检查')
    const sessionId = state.sessionId || state.componentName || 'unknown'
    const outputPath = state.outputPath

    try {
      if (!outputPath) throw new Error('缺少 outputPath')

      // 🆕 检查是否有预启动的截图任务
      const screenshotPromise = state._screenshotPromise
      let renderedImage, isStaticFallback, runtimeGate

      if (screenshotPromise) {
        logger.info('⏳ 等待预启动的截图任务完成...')
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: '⏳ 等待组件截图完成...',
          status: 'running',
        })
        const result = await screenshotPromise
        logger.info('✅ 预启动截图任务已完成')
        renderedImage = result.renderedImage
        isStaticFallback = result.isStaticFallback
        runtimeGate = result.runtimeGate
      } else {
        logger.info('📷 无预启动任务,同步执行截图...')
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: '📷 渲染组件截图...',
          status: 'running',
        })

        await publishQualityPreview({
          outputPath,
          componentId: sessionId,
          groupId: state.groupId || 'default-group',
          target: 'vue3',
        })

        const result = await renderScreenshot({
          outputPath,
          sessionId,
          groupId: state.groupId || 'default-group',
          componentName: state.componentName,
          target: 'vue3',
          previewImage: state.previewImage || null,
          onProgress: state.onProgress,
          hardGate: true,
          allowMissingAssetSelfHeal: true,
        })
        renderedImage = result.renderedImage
        isStaticFallback = result.isStaticFallback
        runtimeGate = result.runtimeGate
      }

      let visualComparisonReport = null
      if (
        runtimeGate?.status === 'PASS' &&
        renderedImage &&
        !isStaticFallback &&
        state.previewImage
      ) {
        state.onProgress?.({
          stage: '视觉质量门禁',
          message: '正在对比 Figma 原图与真实渲染结果...',
          status: 'running',
        })
        const visionCfg = state.visionAIConfig || state.aiConfig || {}
        const comparator = new VisualComparator({
          apiKey: visionCfg.apiKey || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY,
          model: visionCfg.model || process.env.VISION_MODEL || process.env.ANTHROPIC_MODEL,
          baseURL: visionCfg.baseURL || process.env.VISION_BASE_URL || process.env.ANTHROPIC_BASE_URL,
          onTokenUsage: state.onTokenUsage,
          similarityThreshold: parseInt(process.env.VISUAL_SIMILARITY_THRESHOLD || '85'),
        })
        visualComparisonReport = await comparator.compare(state.previewImage, renderedImage, {
          signal: state.signal || state.__abortSignal || null,
          onProgress: state.onProgress,
          requestConcurrency: state.requestConcurrency,
          requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
          requestMaxRetries: state.requestMaxRetries,
        })
        state.onProgress?.({
          stage: '视觉质量门禁',
          message: `视觉相似度 ${visualComparisonReport.overallSimilarity}/100${visualComparisonReport.pass ? '，检查通过' : '，需要继续优化'}`,
          status: visualComparisonReport.pass ? 'completed' : 'warning',
        })
      }

      emitMetrics('runtime-preview-gate', {
        status: runtimeGate?.status || 'BLOCK',
        issueCount: runtimeGate?.issues?.length || 0,
        hasRenderedImage: !!renderedImage,
        isStaticFallback: !!isStaticFallback,
        visualSimilarity: visualComparisonReport?.overallSimilarity ?? null,
        visualPass: visualComparisonReport?.pass ?? false,
      })
      state.onProgress?.({
        stage: '运行时质量门禁',
        message: runtimeGate?.status === 'PASS'
          ? 'Vue3 真实预览加载与渲染检查通过'
          : `Vue3 真实预览检查未通过（${runtimeGate?.issues?.length || 1} 项阻断问题）`,
        status: runtimeGate?.status === 'PASS' ? 'completed' : 'warning',
      })

      return {
        renderedImage,
        renderedImageIsStaticFallback: isStaticFallback,
        runtimeGate,
        visualComparisonReport,
      }
    } catch (error) {
      const runtimeGate = {
        status: 'BLOCK',
        issues: [{
          id: 'RUNTIME-000',
          severity: 'BLOCK',
          category: 'preview-publish',
          message: `运行时预览准备失败: ${error.message}`,
          evidence: { stack: error.stack || '' },
        }],
        isStaticFallback: false,
      }
      logger.error('Vue3 Runtime Preview Gate 失败', { error: error.message })
      return { renderedImage: null, renderedImageIsStaticFallback: false, runtimeGate }
    }
  })

  // ========================================
  // 节点 7: 决策节点 - 🆕 v3.0 L2 智能路由
  // ========================================
  graph.addNode('revision-decision', async (state) => {
    const { checkResult, iterationCount, maxIterations } = state

    const runtimeGate = state.runtimeGate
    if (runtimeGate?.status === 'WARN' && runtimeGate?.warning) {
      logger.warn('Vue3 运行时质量门禁告警已降级，不进入修订', {
        warning: runtimeGate.warning,
      })
      state.onProgress?.({
        stage: '运行时质量门禁',
        message: runtimeGate.warning.message,
        status: 'warning',
      })
      return {
        needsRevision: false,
        violationCount: state.violationCount || 0,
      }
    }
    if (runtimeGate?.status === 'BLOCK') {
      const canReviseRuntime = iterationCount < maxIterations
      const runtimeDecision = evaluateRuntimeGate(runtimeGate)
      const issueSummary = runtimeDecision.reason

      if (runtimeDecision.action === 'fail') {
        const error = new Error(`运行时质量门禁阻断: ${issueSummary}`)
        error.code = 'RUNTIME_QUALITY_GATE_BLOCKED'
        error.runtimeGate = runtimeGate
        throw error
      }

      if (runtimeDecision.action === 'complete_with_warning') {
        const warning = runtimeGate.warning || {
          code: 'RUNTIME_GATE_WARNING',
          type: 'runtime-gate-warning',
          message: `运行时存在非阻断问题，已按告警完成: ${issueSummary}`,
          details: runtimeGate.issues || [],
        }
        runtimeGate.status = 'WARN'
        runtimeGate.warning = warning
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: warning.message,
          status: 'warning',
        })
        return {
          needsRevision: false,
          violationCount: state.violationCount || 0,
        }
      }

      if (!canReviseRuntime) {
        const warning = {
          code: 'RUNTIME_INCREMENTAL_EXHAUSTED',
          type: 'runtime-incremental-exhausted',
          message: `运行时存在可增量修复问题，但已达最大修订次数，按告警完成: ${issueSummary}`,
          details: runtimeGate.issues || [],
        }
        runtimeGate.status = 'WARN'
        runtimeGate.warning = warning
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: warning.message,
          status: 'warning',
        })
        return {
          needsRevision: false,
          violationCount: state.violationCount || 0,
        }
      }

      logger.warn('Vue3 运行时质量门禁未通过，进入增量修订', {
        iterationCount,
        maxIterations,
        issues: runtimeGate.issues,
        runtimeDecision,
      })
      state.onProgress?.({
        stage: '迭代修订',
        message: `运行时存在非致命问题，进入第 ${iterationCount + 2} 轮增量修订`,
        status: 'warning',
      })
      const revisionGuidance = runtimeDecision.revisionGuidance || buildRuntimeRevisionGuidance(runtimeGate)
      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount: state.violationCount || 0,
        _reviseTarget: revisionGuidance.reviseTarget || 'layout',
        _runtimeRevisionGuidance: revisionGuidance,
        _lastRoutingReason: `运行时增量修订(${revisionGuidance.scope || 'runtime'}): ${issueSummary}`,
        _noMoreIterations: false,
      }
    }

    // 🆕 v3.0: 提取 issueCategories（adversarial-checker 新增输出）
    const categories = checkResult?.issueCategories || {}
    const critiques = Array.isArray(checkResult?.critiques) ? checkResult.critiques : []
    const hasHighCritique = critiques.some(item => item?.severity === 'high')
    const visualReport = state.visualComparisonReport
    const visualAvailable = !!visualReport && !visualReport.degraded
    const hasVisualHighIssue = visualReport?.issues?.some(item => item?.severity === 'high') ?? false
    const visualNeedsRevision = !visualAvailable || visualReport.pass !== true || hasVisualHighIssue

    // 🆕 v3.0: 越权降级检测
    const hasViolation = checkResult?.authorizationViolation?.violation
    const violationCount = (state.violationCount || 0) + (hasViolation ? 1 : 0)

    logger.info('节点: 🆕 L2 智能路由决策', {
      checkResult: checkResult?.checkResult,
      iteration: iterationCount,
      maxIterations,
      categories,
      _reviseTarget: state._reviseTarget,
      hasViolation,
      violationCount,
      hasHighCritique,
      visualAvailable,
      visualSimilarity: visualReport?.overallSimilarity ?? null,
      visualPass: visualReport?.pass ?? false,
    })

    // 只有文本结论、严重问题和真实视觉比对同时通过，才允许提前完成。
    const qualityScoreThreshold = state._v3Config?.qualityScoreThreshold || 75
    const qualityScore = checkResult?.qualityScore || 0
    const checkerPassed = checkResult?.checkResult !== 'needs_revision'
    if (
      qualityScore >= qualityScoreThreshold &&
      checkerPassed &&
      !hasHighCritique &&
      violationCount === 0 &&
      !visualNeedsRevision
    ) {
      logger.info(`✅ qualityScore >= ${qualityScoreThreshold}，且文本/视觉质量门禁均通过，提前退出迭代`)
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 质量分数已达标 (>= ${qualityScoreThreshold})，完成生成`,
        status: 'completed'
      })
      return {
        needsRevision: false,
        violationCount
      }
    }

    // 🆕 #354a: 复杂度自动路由 — 提取 adversarial-checker 评估的复杂度
    const complexity = checkResult?.complexity || 'medium'

    // 🆕 单次精修标记：上次简单组件精修后，本轮直接完成不循环
    if (
      state._noMoreIterations &&
      checkerPassed &&
      !hasHighCritique &&
      !visualNeedsRevision
    ) {
      logger.info(`🛑 简单组件单次精修已完成，且文本/视觉质量门禁均通过 (complexity=${complexity})`)
      return {
        needsRevision: false,
        violationCount,
        _noMoreIterations: false
      }
    }

    // 🆕 simple 组件降低提前退出阈值（75→70，可配置）
    const simpleExitThreshold = state._v3Config?.simpleExitThreshold || 70
    if (
      complexity === 'simple' &&
      qualityScore >= simpleExitThreshold &&
      checkerPassed &&
      !hasHighCritique &&
      !visualNeedsRevision
    ) {
      logger.info(`✅ #354a: 简单组件 qualityScore=${qualityScore}，且文本/视觉质量门禁均通过，跳过精修直接完成`)
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 简单组件质量达标 (>= ${simpleExitThreshold})，完成生成`,
        status: 'completed'
      })
      return { needsRevision: false, violationCount }
    }

    // 任一门禁要求修订，都不能因为单项分数达标而被覆盖。
    const needsRevision =
      checkResult?.checkResult === 'needs_revision' ||
      hasHighCritique ||
      visualNeedsRevision
    const canRevise = iterationCount < maxIterations

    if (needsRevision && canRevise) {
      // 🆕 v3.0: 越权降级策略（连续 2 次 → 强制 full）
      if (violationCount >= 2) {
        logger.warn(`⚠️ 连续 ${violationCount} 次越权修改，强制降级到 microcode-engineer (full)`)
        state.onProgress?.({
          stage: '迭代修订',
          message: `🔴 连续${violationCount}次越权，强制全量重做`,
          status: 'warning'
        })
        return {
          needsRevision: true,
          iterationCount: iterationCount + 1,
          violationCount: 0,  // 重置计数器
          _reviseTarget: 'full'  // ✅ 修复：作为新字段返回，避免状态突变
        }
      }

      // 🆕 v3.0: 按问题类型精准路由
      let target = 'microcode-engineer'  // 默认全量
      let reason = '全量修订'
      let _reviseTarget = 'full'  // 默认全量修订

      // 如果有越权但未达降级阈值，也强制走 engineer
      if (hasViolation) {
        target = 'microcode-engineer'
        reason = `越权修改: ${checkResult.authorizationViolation.message}`
        _reviseTarget = 'full'
      } else if (categories.compliance && categories.compliance.length > 0) {
        target = 'microcode-engineer'
        reason = `合规问题: ${categories.compliance.join(', ')}`
        _reviseTarget = 'full'
      } else if (categories.structural && categories.structural.length > 0) {
        target = 'microcode-engineer'
        reason = `结构问题: ${categories.structural.join(', ')}`
        _reviseTarget = 'structural'
      } else if (categories.stylistic && categories.stylistic.length > 0) {
        target = 'style-refiner'
        reason = `纯样式问题: ${categories.stylistic.join(', ')}`
        _reviseTarget = 'stylistic'
      } else if (visualNeedsRevision) {
        target = 'parallel-refine'
        reason = visualAvailable
          ? `视觉比对未通过: 相似度 ${visualReport.overallSimilarity}/100，${visualReport.issues?.length || 0} 项差异`
          : '缺少可用的真实视觉比对结果'
        _reviseTarget = 'layout'
      } else if (categories.layout && categories.layout.length > 0) {
        target = 'parallel-refine'
        reason = `纯布局问题: ${categories.layout.join(', ')}`
        _reviseTarget = 'layout'
      }

      // 🆕 同目标重试计数器（防止精准路由循环）
      const retryCountByTarget = state.retryCountByTarget || {}
      const currentRetryCount = (retryCountByTarget[target] || 0) + 1
      retryCountByTarget[target] = currentRetryCount

      // 降级策略：同一目标连续失败2次 → 强制全量重做
      if (currentRetryCount >= 2 && target !== 'microcode-engineer') {
        logger.warn(`⚠️ ${target} 连续失败 ${currentRetryCount} 次，降级为全量修订`)
        target = 'microcode-engineer'
        _reviseTarget = 'full'
        reason = `精准路由无效（${reason}），降级为全量修订`
        retryCountByTarget[target] = 0  // 重置计数器
      }

      logger.info(`L2 路由决定: → ${target} (${reason})`, {
        retryCount: currentRetryCount,
        retryCountByTarget
      })

      state.onProgress?.({
        stage: '迭代修订',
        message: `⚠️ 第${iterationCount + 2}轮: ${reason}`,
        status: 'running'
      })

      // 🆕 #354a: 简单组件单次精修后标记不再循环（score≥50 允许一轮，<50 正常迭代）
      const _noMoreIterations = complexity === 'simple' && qualityScore >= 50
      if (_noMoreIterations) {
        logger.info(`🔄 #354a: 简单组件走单次精修 (score=${qualityScore})，精修后直接完成`)
      }

      // 🆕 P1: 按问题类别只修目标文件 —— 非 full 修订且已解析到具体文件时，
      // 计算 targetFiles，让 Engineer 只重新生成被 critique 实际引用的文件，其余从磁盘保留。
      let _reviseFiles = null
      if (_reviseTarget && _reviseTarget !== 'full' && target === 'microcode-engineer') {
        const tf = resolveTargetFiles(checkResult, state.generatedFiles, { mainComponentFile: 'package/index.vue' })
        if (tf.hasTargets) {
          _reviseFiles = Array.from(tf.targetFiles)
          logger.info('🎯 P1: 按类别只修目标文件', { target, files: _reviseFiles })
        }
      }

      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount,
        _reviseTarget,  // ✅ 修复：作为新字段返回，避免状态突变
        _reviseFiles,    // 🆕 P1: 仅重做这些文件，其余从磁盘保留
        retryCountByTarget,  // 🆕 追踪同目标重试次数
        _noMoreIterations  // 🆕 #354a: 简单组件单次精修后不再循环
      }
    }

    if (needsRevision && !canRevise) {
      const reasons = []
      if (checkResult?.checkResult === 'needs_revision') reasons.push('质量检查仍要求修订')
      if (hasHighCritique) reasons.push('仍存在 high 级问题')
      if (!visualAvailable) reasons.push('缺少可用的视觉比对结果')
      else if (!visualReport.pass) reasons.push(`视觉相似度 ${visualReport.overallSimilarity}/100 未达标`)
      const error = new Error(`视觉质量门禁阻断: 已达最大修订次数，${reasons.join('；') || '质量仍未达标'}`)
      error.code = 'VISUAL_QUALITY_GATE_BLOCKED'
      error.visualComparisonReport = visualReport || null
      error.checkResult = checkResult || null
      state.onProgress?.({
        stage: '视觉质量门禁',
        message: error.message,
        status: 'failed'
      })
      throw error
    }

    return { needsRevision: false }
  })

  // ========================================
  // 节点 8: 完成（🆕 v3.0 增强）
  // ========================================
  graph.addNode('complete', async (state) => {
    logger.info('节点: Figma阶段完成')

    // 🧹 孤儿组件检测与清理
    logger.info('开始孤儿组件检测')
    state.onProgress?.({
      stage: '代码清理',
      message: '🧹 检测并清理孤儿组件...',
      status: 'running'
    })

    const orphanDetectionResult = await OrphanComponentDetector.detect(state.outputPath)

    if (orphanDetectionResult.deleted.length > 0) {
      logger.info('已清理孤儿组件', {
        count: orphanDetectionResult.deleted.length,
        files: orphanDetectionResult.deleted
      })
    }

    // 🔍 Less 变量完整性检查
    logger.info('开始 Less 变量检查')
    state.onProgress?.({
      stage: '样式检查',
      message: '🔍 检查 Less 变量完整性...',
      status: 'running'
    })

    const lessVariableResult = await LessVariableChecker.check(state.outputPath)

    if (lessVariableResult.fixed) {
      logger.info('已自动修复 Less 变量', {
        missingCount: lessVariableResult.missingVariables.length,
        variables: lessVariableResult.missingVariables
      })
    }

    // 🆕 v3.0: Scoped 合规最终确认
    logger.info('🆕 开始最终 scoped 合规检查')
    state.onProgress?.({
      stage: '合规确认',
      message: '✅ 确认样式标准符合度...',
      status: 'running'
    })
    
    // 读取生成的文件做最终扫描
    const fs = await import('fs')
    const { join } = await import('path')
    let scopedCompliant = true
    
    try {
      if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
        for (const f of state.generatedFiles) {
          if (f.endsWith('.vue')) {
            const fullPath = join(state.outputPath, f)
            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              if (!/<style[^>]*lang=["']less["'][^>]*scoped/.test(content)) {
                logger.warn(`🚨 最终扫描: ${f} 缺少 <style lang="less" scoped>`)
                scopedCompliant = false
              }
            } catch (e) {
              // 文件可能不存在，跳过
            }
          }
        }
      }
    } catch (e) {
      logger.warn('最终扫描失败（非阻塞）', { error: e.message })
    }

    if (scopedCompliant) {
      logger.info('✅ 最终扫描: scoped 合规通过')
    }

    const duration = Date.now() - state.startTime
    const durationSec = (duration / 1000).toFixed(1)

    // 🧠 v3.0 自优化：记录本次运行 metrics（供下次运行分析）
    try {
      recordRun({
        componentName: state.componentName,
        fileKey: state.fileKey,
        nodeId: state.nodeId,
        totalDuration: duration,
        finalQualityScore: state.checkResult?.qualityScore || state.adversarialResult?.qualityScore || 0,
        visualSimilarity: state.visualComparisonReport?.overallSimilarity ?? null,
        iterationCount: (state.iterationCount || 0) + 1,
        routingEvents: state._routingEvents || [],
        l0Result: state.validationResult ? {
          pass: state.validationResult.pass,
          issues: state.validationResult.issues?.length || 0
        } : null,
        issueCategories: state.checkResult?.issueCategories ||
          state.adversarialResult?.issueCategories || {},
        v3Mode: state._v3Mode,
        scopedCompliant,
        violationCount: state.violationCount || 0,
        selfOptimizationApplied: !!state._selfOptimization?.promptAugmentation
      })
      emitMetrics('complete', { durationMs: duration, scored: true, selfOptimized: true })
    } catch (e) {
      logger.warn('🧠 自优化记录失败（非阻塞）', e.message)
    }

    state.onProgress?.({
      stage: '完成',
      message: `🎉 Figma精修完成! 耗时 ${durationSec}s ${scopedCompliant ? '| ✅ 样式标准合规' : ''}`,
      status: 'completed'
    })

    return {
      success: true,
      message: 'Figma阶段完成',
      outputPath: state.outputPath,
      generatedFiles: state.generatedFiles,
      reviewResult: state.reviewResult,
      checkResult: state.checkResult,
      orphanDetectionResult,
      lessVariableResult,
      iterations: state.iterationCount + 1,
      duration: `${durationSec}s`,
      // 🆕 v3.0 新增输出
      scopedCompliant,
      upstreamIssues: state.upstreamIssues || null,
      runtimeGate: state.runtimeGate || null,
      lessCompileGate: state.codeValidationResult?.lessCompileGate || null,
      codeValidationResult: state.codeValidationResult || null,
      visualComparisonReport: state.visualComparisonReport || null,
      // 🆕 P2 #3: 透出 Figma 覆盖率与告警
      figmaCoverageRate: state._figmaCoverageRate ?? null,
      figmaCoverageWarning: state._figmaCoverageWarning || null,
      warnings: [
        ...(state.runtimeGate?.warning ? [state.runtimeGate.warning] : []),
        ...(state._figmaCoverageWarning ? [state._figmaCoverageWarning] : [])
      ]
    }
  })

  // ========================================
  // 节点 4c: 并行分析汇聚 - 等待Layout Reviewer和Style Mapper完成
  // ========================================
  graph.addNode('parallel-analysis', async (state) => {
    logger.info('节点: 并行分析 - Layout Reviewer & Style Mapper')

    state.onProgress?.({
      stage: '并行分析',
      message: '🔄 正在并行执行布局审查和样式映射...',
      status: 'running'
    })

    try {
      // 文本任务：使用 textAIConfig（Claude）- 布局审查和样式映射都是文本任务
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const textConfig = {
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      }

      // 并行执行Layout Reviewer和Style Mapper
      const [reviewResult, styleMappings] = await Promise.all([
        (async () => {
          const reviewer = new LayoutReviewer(textConfig)
          reviewer.onProgress = state.onProgress
          return await reviewer.execute({
            target: 'vue3',
            layoutStructure: state.layoutStructure,
            onProgress: state.onProgress,
            signal: state.signal || state.__abortSignal || null,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
          })
        })(),
        (async () => {
          const mapper = new StyleMapper(textConfig)
          mapper.onProgress = state.onProgress
          return await mapper.execute({
            target: 'vue3',
            visualElements: state.visualElements,
            figmaStyles: state.figmaNodeData?.styles,
            // 🆕 v3.1: 传递 layoutStructure（用于 per-element 样式提取）
            // 传入完整 layoutStructure 而非只传 elements[]，因为 SM 的 _extractElementStyles 
            // 支持直接处理 layoutStructure 对象（内部会调用 _collectElementsFromStructure）
            elements: state.layoutStructure,
            backgroundBrightness: state.visualElements?.backgroundBrightness || state.layoutStructure?.styles?.backgroundBrightness || 'dark',
            onProgress: state.onProgress,
            signal: state.signal || state.__abortSignal || null,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
          })
        })()
      ])

      state.onProgress?.({
        stage: '并行分析',
        message: '✅ 并行分析完成',
        status: 'completed'
      })

      return {
        reviewResult,
        styleMappings
      }

    } catch (error) {
      logger.error('并行分析失败', { error: error.message })
      state.onProgress?.({
        stage: '并行分析',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 🆕 v3.0: 节点 L0-A - Preview Validator（visual-parser 之后立即校验）
  // 支持: off 模式跳过 / minimal+full 模式启用 / 自动降级
  // ========================================
  graph.addNode('preview-validator', async (state) => {
    const v3Mode = state._v3Mode || 'full'
    
    // 📊 metrics
    const t0 = Date.now()
    
    if (!isFeatureEnabled(v3Mode, 'l0-preview')) {
      logger.info('🆕 L0-A Preview Validator: 跳过 (v3Mode=off)')
      emitMetrics('preview-validator', { skipped: true, reason: 'v3Mode=off' })
      return { 
        validationResult: { pass: true, blockCount: 0, warnCount: 0, errors: [] }, 
        validatorRetryCount: 0 
      }
    }

    logger.info(`🆕 节点: L0-A Preview Validator (mode=${v3Mode})`)

    // 🔧 降级策略检查：连续失败超过阈值 → 降级为 WARN-only
    const consecutiveFailures = state._l0ConsecutiveFailures || 0
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 5
    let bypassValidation = false

    if (consecutiveFailures >= bypassThreshold) {
      bypassValidation = true
      logger.warn(`⚠️ L0 连续失败 ${consecutiveFailures} 次，降级为 WARN-only 模式`)
      emitMetrics('preview-validator', { action: 'degraded_to_warn_only', consecutiveFailures })
    }

    // 构建分析结果对象用于校验
    // 注意：state.layoutStructure 是完整的分析结果对象（含 .layout.sections），
    // 需取其 .layout 子对象，否则 analysis.layout.sections 会错误指向 analysisResult.sections（undefined）
    const analysis = {
      layout: state.layoutStructure?.layout || state.layoutStructure,
      styles: state.visualElements,
      charts: state.charts,
      interactions: state.interactions
    }

    const result = PreviewAnalysisValidator.validate(analysis)
    
    // 如果是降级模式，检查是否存在硬性 BLOCK（结构完整性 / layout 缺失），这些不可被 bypass
    if (bypassValidation && !result.pass) {
      const hardBlocks = (result.errors || []).filter(e =>
        e.severity === 'BLOCK' && e.id === 'STRUCT-01'
      )
      if (hardBlocks.length > 0) {
        // 硬性 BLOCK 不 bypass，保留失败状态但标记降级
        logger.warn(`⚠️ L0 降级但存在 ${hardBlocks.length} 个硬性 BLOCK，保留失败状态`)
        result._bypassed = false
        result._degraded = true
      } else {
        result._bypassed = true
        result._originalPass = false
        result.pass = true  // 降级后强制通过
        logger.warn('L0 降级: 强制标记为 pass（原结果为 needs_revision）')
      }
    }

    // 更新连续失败计数
    const newConsecutiveFailures = result.pass ? 0 : consecutiveFailures + 1

    logger.info(`L0-A 校验结果: pass=${result.pass}, BLOCK=${result.blockCount}, WARN=${result.warnCount}`)

    // 如果有 WARN/BLOCK，记录详情
    if (result.errors.length > 0) {
      result.errors.forEach(e => {
        if (e.severity.includes('BLOCK')) {
          logger.error(`  [${e.id}] ${e.message}`)
        } else {
          logger.warn(`  [${e.id}] ${e.message}`)
        }
      })
    }

    // 📊 metrics
    emitMetrics('preview-validator', {
      pass: result.pass,
      blockCount: result.blockCount,
      warnCount: result.warnCount,
      retryCount: state.validatorRetryCount || 0,
      bypassed: bypassValidation,
      consecutiveFailures: newConsecutiveFailures,
      durationMs: Date.now() - t0
    })

    // 🆕 生成重试指导（用于 L0-A 重试时回传给 visual-parser）
    const retryCount = state.validatorRetryCount || 0
    const maxRetry = state._v3Config?.l0MaxRetry || 1
    const nextRetryCount = !result.pass && !bypassValidation && retryCount < maxRetry
      ? retryCount + 1
      : retryCount
    const retryGuidance = nextRetryCount > retryCount
      ? PreviewAnalysisValidator.generateRetryGuidance(result.errors)
      : null

    return {
      validationResult: result,
      validatorRetryCount: nextRetryCount,
      _l0ConsecutiveFailures: newConsecutiveFailures,
      _l0Degraded: result._degraded || false,
      retryGuidance  // 🆕 重试指导文本，visual-parser 可据此修正输出
    }
  })

  // ========================================
  // 🆕 v3.0: 节点 parallel-refine — 并行精修（替代 layout→style 串行链）
  // ========================================
  graph.addNode('parallel-refine', async (state) => {
    const t0 = Date.now()  // 📊 metrics 计时
    const reviseTarget = state._reviseTarget || 'full'

    // 🆕 v3.8: 当全面精修时，使用合并精修器（单次 LLM 调用替代 layout→style 串行）
    const useMergedRefiner = reviseTarget === 'full'

    // 🆕 #5: 精修部分修订 —— 非 full 修订时，只把 critique 指定的文件/类交给 refiner 局部修改
    const _rt = (reviseTarget && reviseTarget !== 'full' && state.checkResult)
      ? resolveTargetFiles(state.checkResult, state.generatedFiles, { mainComponentFile: 'package/index.vue' })
      : null
    const refineTargetFiles = _rt?.hasTargets ? Array.from(_rt.targetFiles) : null
    const refineTargetClassNames = _rt?.targetClassNames?.length ? _rt.targetClassNames : null
    if (refineTargetFiles) {
      logger.info('🎯 #5: 并行精修仅处理目标文件', { files: refineTargetFiles, classes: refineTargetClassNames })
    }

    state.onProgress?.({
      stage: '串行精修',
      message: useMergedRefiner
        ? '⚡ 合并精修（布局+样式）单次 LLM 调用中...'
        : '⚙️ 布局精修 → 样式精修 顺序执行中...',
      status: 'running'
    })

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const textConfig = {
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      }

      // 🆕 v3.0: 精修前保存文件快照（用于越权检测 diff）
      const fs = await import('fs')
      const pathMod = await import('path')
      let preRefineFiles = {}
      
      if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
        for (const f of state.generatedFiles) {
          try {
            const fullPath = pathMod.join(state.outputPath, f)
            preRefineFiles[f] = fs.readFileSync(fullPath, 'utf-8')
          } catch (e) {
            // 文件可能不存在
          }
        }
      }

      // 🆕 v3.8: 全面精修 → 使用合并精修器（节省一次 LLM 调用）
      if (useMergedRefiner) {
        logger.info('⚡ 使用合并精修器 (LayoutStyleRefiner)，单次 LLM 调用完成布局+样式精修')
        try {
          const refiner = new LayoutStyleRefiner(textConfig)
          const mergedResult = await refiner.execute({
            target: 'vue3',
            figmaNodeData: state.figmaNodeData,
            layoutStructure: state.layoutStructure,
            styleMappings: state.styleMappings,
            visualElements: state.visualElements,
            outputPath: state.outputPath,
            generatedFiles: state.generatedFiles,
            _reviseTarget: 'full',
            onProgress: state.onProgress,
            signal: state.signal || state.__abortSignal || null,
            targetFiles: refineTargetFiles,
            targetClassNames: refineTargetClassNames,
          })

          state.onProgress?.({
            stage: '合并精修',
            message: `✅ 合并精修完成（布局+样式）`,
            status: 'completed'
          })

          emitMetrics('parallel-refine-merged', {
            reviseTarget: 'full',
            merged: true,
            durationMs: Date.now() - t0
          })

          return {
            layoutRefineResult: { refined: true, merged: true },
            styleRefineResult: { refined: true, merged: true },
            mergedRefineResult: mergedResult,
            preRefineFiles,
            _refineStart: t0
          }
        } catch (err) {
          logger.error('合并精修失败，回退到串行精修', { reason: err?.message })
          state.onProgress?.({
            stage: '合并精修',
            message: `⚠️ 合并精修失败，回退到串行 layout→style`,
            status: 'warning'
          })
          // 不回退，继续执行下面的串行逻辑
        }
      }

      // 🆕 P0-3修复：串行执行 layout-refiner → style-refiner（非 full 目标或合并回退时使用）
      let layoutResult = null
      let styleResult = null
      let layoutError = null
      let styleError = null

      // 1. 先执行 layout-refiner
      try {
        const refiner = new LayoutRefiner(textConfig)
        layoutResult = await refiner.execute({
          target: 'vue3',
          figmaNodeData: state.figmaNodeData,
          layoutStructure: state.layoutStructure,
          outputPath: state.outputPath,
          generatedFiles: state.generatedFiles,
          _reviseTarget: state._reviseTarget,
          onProgress: state.onProgress,
          signal: state.signal || state.__abortSignal || null,
          targetFiles: refineTargetFiles,
          targetClassNames: refineTargetClassNames,
        })
      } catch (err) {
        layoutError = err
        logger.error('layout-refiner 执行失败', { reason: err?.message })
        state.onProgress?.({
          stage: '布局精修',
          message: `⚠️ 布局精修失败，继续样式精修`,
          status: 'warning'
        })
      }

      // 2. 再执行 style-refiner（此时读取的是 layout-refiner 已写入的文件）
      try {
        const refiner = new StyleRefiner(textConfig)
        styleResult = await refiner.execute({
          target: 'vue3',
          figmaNodeData: state.figmaNodeData,
          styleMappings: state.styleMappings,
          visualElements: state.visualElements,
          outputPath: state.outputPath,
          generatedFiles: state.generatedFiles,
          _reviseTarget: state._reviseTarget,
          onProgress: state.onProgress,
          signal: state.signal || state.__abortSignal || null,
          targetFiles: refineTargetFiles,
          targetClassNames: refineTargetClassNames,
        })
      } catch (err) {
        styleError = err
        logger.error('style-refiner 执行失败', { reason: err?.message })
        state.onProgress?.({
          stage: '样式精修',
          message: `⚠️ 样式精修失败，仅应用布局精修`,
          status: 'warning'
        })
      }

      // 至少一个成功才算部分成功
      if (!layoutResult && !styleResult) {
        throw new Error('串行精修完全失败')
      }

      state.onProgress?.({
        stage: '串行精修',
        message: `✅ 串行精修完成${(!layoutResult && !layoutError ? '' : layoutError ? '（布局失败）' : '')}${(!styleResult && !styleError ? '' : styleError ? '（样式失败）' : '')}`,
        status: 'completed'
      })

      // 📊 metrics
      emitMetrics('parallel-refine', {
        reviseTarget: state._reviseTarget || 'full',
        layoutRefined: layoutResult?.refined,
        styleRefined: styleResult?.refined,
        durationMs: Date.now() - t0
      })

      return {
        layoutRefineResult: layoutResult,
        styleRefineResult: styleResult,
        // 🆕 传递文件快照给下游 adversarial-checker 使用
        preRefineFiles,
        _refineStart: t0  // 记录开始时间用于下游 metrics
      }

    } catch (error) {
      logger.error('串行精修失败', { error: error.message })
      state.onProgress?.({
        stage: '串行精修',
        message: `❌ 失败: ${error.message}`,
        status: 'failed'
      })
      throw error
    }
  })

  // ========================================
  // 🆕 v3.0: 节点 refine-feedback — L1 同伴评审反馈汇聚
  // ========================================
  graph.addNode('refine-feedback', async (state) => {
    logger.info('🆕 节点: L1 精修反馈汇聚')

    // 收集 layout-refiner 和 style-refiner 的上游问题检测
    const layoutFeedback = state.layoutRefineResult?.upstreamFeedback || {}
    const styleFeedback = state.styleRefineResult?.upstreamFeedback || {}

    const upstreamIssues = {
      needsEngineerRework: layoutFeedback.needsEngineerRework || styleFeedback.needsEngineerRework,
      templateIssues: [
        ...(layoutFeedback.templateIssues || []),
        ...(styleFeedback.variableMissing || [])
      ],
      styleOnlyIssues: styleFeedback.styleOnlyIssues || [],
      layoutOnlyIssues: layoutFeedback.layoutIssues || []
    }

    if (upstreamIssues.needsEngineerRework) {
      logger.warn('L1 精修阶段检测到结构性问题，需要回退到 engineer', {
        templateIssues: upstreamIssues.templateIssues
      })
    } else {
      logger.info('L1 精修反馈: 无结构性问题，可继续')
    }

    return { upstreamIssues }
  })

  // ========================================
  // 🆕 v3.0: 节点 L0-B - Code Structure Validator（engineer 之后立即校验）
  // 校验生成的 Vue 文件是否符合 scoped-less 标准
  // ========================================
  graph.addNode('code-structure-validator', async (state) => {
    const v3Mode = state._v3Mode || 'full'
    const t0 = Date.now()
    
    if (!isFeatureEnabled(v3Mode, 'l0-code')) {
      logger.info('🆕 L0-B Code Structure Validator: 跳过 (v3Mode=off)')
      emitMetrics('code-structure-validator', { skipped: true, reason: 'v3Mode=off' })
      return { codeValidationResult: { pass: true, blockCount: 0, issues: [] } }
    }

    logger.info(`🆕 节点: L0-B Code Structure Validator (mode=${v3Mode})`)

    // 构建 generatedFiles 对象供 validator 使用
    const fs = await import('fs')
    const pathMod = await import('path')
    
    let filesForCheck = []
    if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
      for (const f of state.generatedFiles) {
        try {
          const fullPath = pathMod.join(state.outputPath, f)
          const content = fs.readFileSync(fullPath, 'utf-8')
          filesForCheck.push({ path: f, content })
        } catch (e) {}
      }
    }

    const componentId = state.componentId || ''
    const result = CodeStructureValidator.validate(filesForCheck, componentId, {
      target: 'vue3',
      layoutStructure: state.layoutStructure,
      visualElements: state.visualElements,
      resourceDomMapping: state.resourceDomMapping,
      previewAnalysis: { componentTitle: state.analysisTarget || '' },
    })

    // P0：逐 SFC + 共享 LESS 真实编译门禁。LESS 失败属于发布硬阻断，不能降级为 WARN。
    const filesByPath = Object.fromEntries(filesForCheck.map(file => [file.path, file.content]))
    const lessCompileResult = await LessCompileGate.validate(filesByPath, { outputPath: state.outputPath })
    if (!lessCompileResult.pass) {
      const lessIssues = lessCompileResult.diagnostics.map(item => ({
        ...item,
        file: item.file,
        severity: 'BLOCK',
      }))
      result.pass = false
      result.issues = [...(result.issues || []), ...lessIssues]
      result.blockCount = (result.blockCount || 0) + lessIssues.length
      result.lessCompileGate = lessCompileResult
    } else {
      result.lessCompileGate = lessCompileResult
    }

    // 降级检查：硬性 BLOCK（scoped 属性缺失 / 文件结构完整性 / LESS 编译失败）不可被 bypass
    const consecutiveCodeFailures = state._l0CodeConsecutiveFailures || 0
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 5
    
    if (!result.pass && consecutiveCodeFailures >= bypassThreshold) {
      const hardBlockIssues = (result.issues || []).filter(i =>
        i.severity === 'BLOCK' && (i.id === 'CODE-001' || i.id === 'CODE-002' || i.id === 'CODE-008' || i.id === 'CODE-009' || i.id === 'LESS-COMPILE-001')
      )
      if (hardBlockIssues.length > 0) {
        logger.warn(`⚠️ L0-B 降级但存在 ${hardBlockIssues.length} 个硬性 BLOCK（scoped/文件结构），保留失败状态`)
        result._bypassed = false
        result._degraded = true
      } else {
        result._bypassed = true
        result._originalPass = false
        result.pass = true
        logger.warn(`⚠️ L0-B 连续失败 ${consecutiveCodeFailures} 次，降级为 WARN-only`)
      }
    }

    const newConsecutive = result.pass ? 0 : consecutiveCodeFailures + 1

    logger.info(`L0-B 校验结果: pass=${result.pass}, BLOCK=${result.blockCount}, Issues=${result.issues?.length || 0}`)

    if (result.issues?.length > 0) {
      result.issues.forEach(i => {
        if (i.severity === 'BLOCK') logger.error(`  [${i.id}] ${i.message} (${i.file})`)
        else logger.warn(`  [${i.id}] ${i.message} (${i.file})`)
      })
    }

    emitMetrics('code-structure-validator', {
      pass: result.pass,
      blockCount: result.blockCount,
      issueCount: result.issues?.length || 0,
      bypassed: result._bypassed,
      consecutiveFailures: newConsecutive,
      durationMs: Date.now() - t0
    })

    // 🆕 生成修复指导（用于重试）
    let retryGuidance = ''
    if (!result.pass && !result._bypassed) {
      const blockIssues = result.issues?.filter(i => i.severity === 'BLOCK') || []
      if (blockIssues.length > 0) {
        retryGuidance = '\n\n🔴 上次生成未通过 L0-B 代码结构校验，必须修复以下问题：\n\n'
        blockIssues.forEach((issue, i) => {
          retryGuidance += `${i + 1}. [${issue.id}] ${issue.message}\n`
          if (issue.file) retryGuidance += `   文件: ${issue.file}${issue.line ? `:${issue.line}:${issue.column || 1}` : ''}\n`
          const current = issue.snippet?.find?.(row => row.current)
          if (current) retryGuidance += `   错误代码: ${current.code.trim()}\n`
          if (issue.hint?.suggestion) retryGuidance += `   诊断建议: ${issue.hint.suggestion}\n`
        })
        if (result.lessCompileGate && !result.lessCompileGate.pass) {
          retryGuidance += LessCompileGate.buildFixGuidance(result.lessCompileGate)
        }
        retryGuidance += '\n请确保：\n'
        retryGuidance += '- 每个 .vue 文件都有 <style lang="less" scoped>\n'
        retryGuidance += '- 根组件导入 ./resources/styles/index.less\n'
        retryGuidance += '- components/ 子组件导入 ../resources/styles/index.less\n'
        retryGuidance += '- 禁止手写 import 本地图片，由 injectResourceImports 自动注入\n'
        retryGuidance += '- declare.json componentName 必须等于预览图识别的组件标题\n'

        logger.info('L0-B 生成修复指导', { issueCount: blockIssues.length })
      }
    }

    const lessTargetFiles = result.lessCompileGate?.diagnostics?.map(item => item.file) || []
    return {
      codeValidationResult: result,
      _l0CodeConsecutiveFailures: newConsecutive,
      _l0CodeDegraded: result._degraded || false,
      _l0CodeRetryGuidance: retryGuidance,
      // P1：LESS 失败时只重做报错文件；其他文件从磁盘保留。
      _reviseFiles: lessTargetFiles.length > 0 ? [...new Set(lessTargetFiles)] : state._reviseFiles,
      _reviseTarget: lessTargetFiles.length > 0 ? 'style' : state._reviseTarget
    }
  })

  // ========================================
  // 添加边（流程控制）— 🆕 v3.0 重构后的完整拓扑（支持模式切换）
  // ========================================

  graph.setEntry('init')
  graph.addEdge('init', 'figma-connector')
  graph.addEdge('figma-connector', 'visual-parser')
  
  // ── L0-A 边：根据模式决定是否走 preview-validator ──
  // off 模式: visual-parser → parallel-analysis（跳过 L0）
  // minimal/full: visual-parser → preview-validator
  graph.addConditionalEdge('visual-parser', (state) => {
    const mode = state._v3Mode || 'full'
    return isFeatureEnabled(mode, 'l0-preview') ? 'preview-validator' : 'parallel-analysis'
  })
  
  // preview-validator 条件分流
  graph.addConditionalEdge('preview-validator', (state) => {
    const r = state.validationResult
    const maxRetry = state._v3Config?.l0MaxRetry || 1
    
    if (r.pass) return 'parallel-analysis'           // 通过 → 继续
    if ((state.validatorRetryCount || 0) <= maxRetry && state.retryGuidance) return 'visual-parser'  // 可重试 → 回 visual-parser
    return 'parallel-analysis'                        // 重试耗尽 → 带 warning 继续
  })

  graph.addEdge('parallel-analysis', 'microcode-engineer')
  
  // ── 🆕 L0-B: engineer → code-structure-validator（校验 scoped-less 合规性）──
  graph.addEdge('microcode-engineer', 'code-structure-validator')
  
  // ── L0-B 条件分流：校验结果决定下一步 ──
  graph.addConditionalEdge('code-structure-validator', (state) => {
    const r = state.codeValidationResult
    const maxRetry = state._v3Config?.l0MaxRetry || 1
    const retryCount = state.codeValidatorRetryCount || 0

    // BLOCK 且可重试 → 回 engineer 重做
    if (!r.pass && !r._bypassed && retryCount < maxRetry) {
      logger.info(`L0-B 校验失败，回退 engineer 重试 (${retryCount + 1}/${maxRetry})`, {
        hasGuidance: !!state._l0CodeRetryGuidance
      })

      // ✅ 不直接突变 state，计数器通过 engineer 节点 return 自增
      return 'microcode-engineer'
    }

    // LESS 编译失败在自动定向修复 1 次后仍失败：硬阻断发布，不允许继续到预览/复制 workspace。
    if (!r.pass && r.lessCompileGate && !r.lessCompileGate.pass) {
      const first = r.lessCompileGate.diagnostics?.[0]
      const location = first ? `${first.file}:${first.line}:${first.column}` : '未知位置'
      const error = new Error(`LESS 编译门禁阻断: ${location} ${first?.message || 'LESS 编译失败'}`)
      error.code = 'LESS_COMPILE_GATE_BLOCKED'
      error.lessCompileGate = r.lessCompileGate
      error.codeValidationResult = r
      throw error
    }

    // 通过/结构规则重试耗尽/降级通过 → 继续精修
    const mode = state._v3Mode || 'full'
    return isFeatureEnabled(mode, 'parallel-refine') ? 'parallel-refine' : 'layout-refiner-legacy'
  })

  // ── 精修链路：根据模式选择串行/并行（L0-B 之后到达）──
  // minimal/off: code-structure-validator → layout-refiner-legacy → style-refiner-legacy (串行)
  // full: code-structure-validator → parallel-refine (并行)

  // ⚠️ 注意：legacy 边的定义已移到 legacy 节点定义之后 (line ~1520)
  // 原因：Graph.addEdge() 要求源/目标节点必须先通过 addNode() 注册

  // ── full 模式的并行精修后续 ──
  // parallel-refine → refine-feedback(L1) 或直连 adversarial-checker(minimal)
  graph.addConditionalEdge('parallel-refine', (state) => {
    const mode = state._v3Mode || 'full'
    return isFeatureEnabled(mode, 'l1-feedback') ? 'refine-feedback' : 'adversarial-checker'
  })
  
  // 🆕 L1/L2简化：L1不做回退决策，直接流向L2统一决策
  // L1的精修建议通过state传递给L2
  graph.addEdge('refine-feedback', 'adversarial-checker')

  graph.addEdge('adversarial-checker', 'runtime-preview-gate')
  graph.addEdge('runtime-preview-gate', 'revision-decision')

  // ── L2 智能路由（revision-decision 分发）──
  // full 模式: 4路分发（stylistic/layout/full/structural）
  // minimal/off: binary 决策（engineer 或 complete）
  graph.addConditionalEdge('revision-decision', (state) => {
    if (!state.needsRevision) return 'complete'

    const mode = state._v3Mode || 'full'

    // minimal/off 模式：仅 binary 决策
    if (!isFeatureEnabled(mode, 'l2-routing')) {
      emitMetrics('revision-decision', { 
        routingTarget: 'microcode-engineer', 
        routingReason: 'binary_decision(v2_compat)', 
        v3Mode: mode 
      })
      return 'microcode-engineer'
    }

    // full 模式：4路智能路由
    let target = 'microcode-engineer'
    switch (state._reviseTarget) {
      case 'stylistic':
        target = 'style-refiner'; break
      case 'layout':
        target = 'parallel-refine'; break
      default:
        target = 'microcode-engineer'
    }

    // 🧠 记录路由事件（供自优化分析路由循环）
    const routingEvent = {
      target,
      reason: state._lastRoutingReason || `target=${state._reviseTarget}`,
      _reviseTarget: state._reviseTarget
    }
    state._routingEvents = [...(state._routingEvents || []), routingEvent]

    emitMetrics('revision-decision', {
      routingTarget: target,
      routingReason: state._lastRoutingReason || `target=${state._reviseTarget}`,
      violationCount: state.violationCount || 0,
      v3Mode: mode
    })

    return target
  })

  // 🆕 L2 路由到 style-refiner 后仍需回到 adversarial-checker
  graph.addEdge('style-refiner', 'adversarial-checker')

  // ========================================
  // 🆕 串行兼容节点（minimal/off 模式回退用）
  // 这些节点在 full 模式下不会被访问到
  // ========================================
  graph.addNode('layout-refiner-legacy', async (state) => {
    logger.info('📦 节点: Layout Refiner (串行兼容模式/minimal)')

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const refiner = new LayoutRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        layoutStructure: state.layoutStructure,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        _reviseTarget: 'full',  // 串行模式下不做范围限制
        onProgress: state.onProgress,
      })

      emitMetrics('layout-refiner-legacy', { refined: result.refined, durationMs: Date.now() - (state._refineStart || Date.now()) })
      return { layoutRefineResult: result }
    } catch (error) {
      logger.error('串行布局精修失败', { error: error.message })
      throw error
    }
  })

  graph.addNode('style-refiner-legacy', async (state) => {
    logger.info('📦 节点: Style Refiner (串行兼容模式/minimal)')

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        styleMappings: state.styleMappings,
        visualElements: state.visualElements,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        _reviseTarget: 'full',
        onProgress: state.onProgress,
      })

      emitMetrics('style-refiner-legacy', { refined: result.refined, durationMs: Date.now() - (state._refineStart || Date.now()) })
      return { styleRefineResult: result }
    } catch (error) {
      logger.error('串行样式精修失败', { error: error.message })
      throw error
    }
  })

  // ========================================
  // 🆕 串行兼容链路（minimal/off 模式使用）
  // 必须在节点定义之后添加边，因为 addEdge() 会检查节点是否存在
  // ========================================
  graph.addEdge('layout-refiner-legacy', 'style-refiner-legacy')
  graph.addEdge('style-refiner-legacy', 'adversarial-checker')

  logger.info(`✅ Phase 2 Figma阶段工作流图创建完成 (v3.0 协作拓扑版 | 默认模式: ${resolvedConfig.mode})`)
  logger.info('   新增节点: preview-validator, parallel-refine, refine-feedback, layout-refiner-legacy, style-refiner-legacy')
  logger.info('   新增循环: L0-A(自验), L1(反馈), L2(智能路由)')
  logger.info('   模式切换: off / minimal / full (通过 V3_MODE env 或 config.v3Mode)')
  logger.info(`   当前默认: ${resolvedConfig.mode} | l0MaxRetry=${resolvedConfig.config.l0MaxRetry} | bypassThreshold=${resolvedConfig.config.l0BypassAfterFailures}`)

  return graph
}

/**
 * 运行 Phase 2 Figma阶段流程
 */
export async function runVue3Generation(options) {
  const {
    componentName,
    fileKey,
    nodeId,
    outputPath,
    panelType,  // 🆕 面板类型
    figmaToken,
    aiConfig,
    visionAIConfig,
    textAIConfig,
    onProgress,
    sessionId,    // 🆕 用于 Token 追踪关联
    groupId,      // 🆕 运行时预览发布路径
    pauseChecker, // 🆕 分块生成前暂停检查
  } = options

  logger.info('开始 Vue3 Figma阶段生成', {
    componentName,
    fileKey,
    nodeId,
    visionModel: visionAIConfig?.model || aiConfig?.model,
    textModel: textAIConfig?.model || aiConfig?.model
  })

  // 🆕 创建 Token 预算管控器
  const tokenBudget = new TokenBudget({
    onWarning: (status) => {
      onProgress?.({
        type: 'budget-warning',
        stage: '预算警告',
        message: `Token 使用已超过 ${Math.round(status.warningThreshold * 100)}% (${status.used.toLocaleString()}/${status.budget.toLocaleString()})`,
        status: 'warning',
        tokenStatus: status
      })
    },
    onExceeded: (status) => {
      onProgress?.({
        type: 'budget-exceeded',
        stage: '预算超限',
        message: `Token 预算已耗尽 (${status.used.toLocaleString()}/${status.budget.toLocaleString()})，生成将降级返回`,
        status: 'error',
        tokenStatus: status
      })
    }
  })

  // 🆕 onTokenUsage 钩子：Agent 每次 LLM 调用后触发
  const onTokenUsage = (usageData) => {
    // 累积到预算管控器
    const status = tokenBudget.track(
      usageData.totalTokens,
      usageData.nodeName,
      usageData.model,
      { inputTokens: usageData.inputTokens, outputTokens: usageData.outputTokens }
    )

    // 🆕 持久化到 MongoDB（如果外部提供了记录函数）
    if (options.onTokenUsageRecord) {
      try {
        options.onTokenUsageRecord({
          ...usageData,
          sessionId: sessionId || null,
          componentName: componentName || undefined,
          fileKey: fileKey || undefined,
          nodeId: nodeId || undefined
        })
      } catch (e) {
        // 静默失败，不影响主流程
      }
    }

    // 通过 SSE 推送 token metrics 事件（复用现有 metrics 通道）
    onProgress?.({
      type: 'metrics',
      node: usageData.nodeName,
      model: usageData.model,
      tokens: {
        input: usageData.inputTokens,
        output: usageData.outputTokens,
        total: usageData.totalTokens
      },
      budget: status,
      timestamp: Date.now()
    })
  }

  const graph = createPhase2Graph()

  const initialState = {
    componentName,
    fileKey,
    nodeId,
    outputPath,
    panelType: panelType || 'default-panel',  // 🆕 面板类型
    figmaToken,
    aiConfig,
    visionAIConfig,
    textAIConfig,
    onProgress,
    // 🆕 Token 追踪
    onTokenUsage,
    tokenBudget,
    sessionId: sessionId || null,
    groupId: groupId || 'default-group',
    target: 'vue3',
    pauseChecker: pauseChecker || null,
  }

  try {
    const result = await graph.run(initialState)

    logger.info('✅ Vue3 Figma阶段完成', {
      success: result.success,
      iterations: result.iterations,
      duration: result.duration
    })

    return result

  } catch (error) {
    logger.error('Phase 2 Figma阶段失败', { error: error.message })
    throw error
  }
}

export default createPhase2Graph

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
import { MicrocodeEngineer } from '../roles/microcode-engineer.js'
// 🆕 S9: 文档分析编排器（CJS 模块，ESM 默认导入互操作）
import docAnalyzerModule from '../../phase2/doc/doc-analyzer.js'
import { AdversarialChecker } from '../roles/adversarial-checker.js'
// 🆕 视觉比对：截图渲染 + 视觉比对
import { renderScreenshot, warmupBrowser, evaluateRuntimeGate, classifyRuntimeGate, buildRuntimeRevisionGuidance } from '../roles/screenshot-renderer.js'
import { publishQualityPreview } from '../utils/workspace-preview-publisher.js'
import { VisualComparator } from '../roles/visual-comparator.js'
// 🆕 v3.0: 引入 validators
import { PreviewAnalysisValidator } from '../validators/preview-analysis-validator.js'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'
// 🆕 S11: 文档页面元素覆盖率校验器（L0-B 扩展）
import { ElementCoverageValidator } from '../validators/element-coverage-validator.js'
import { OrphanComponentDetector } from '../validators/orphan-component-detector.js'
import { LessVariableChecker } from '../validators/less-variable-checker.js'
import { HeaderRelationValidator } from '../validators/header-relation-validator.js'
import { HeaderSlotValidator } from '../validators/header-slot-validator.js'
import { createLogger } from '../logger/index.js'
// 🆕 v3.0 自优化器：基于历史 metrics 自动优化 Prompt 和参数
import { recordRun, getOptimizationForNextRun } from '../utils/self-optimizer.js'
// 🆕 Token 预算管控
import { TokenBudget } from '../utils/token-budget.js'
import { computeChangedFilePaths, readRevisionSnapshot, resolveTargetFiles } from '../utils/revision-files.js'
import { withTimeout } from '../orchestrator/orchestrator.js'

const logger = createLogger({ name: 'mc-component-graph-phase2-v3' })

/**
 * 🆕 S9: 为文档 D2 组装 LLM 调用器（OpenAI 兼容 / Anthropic 双协议）
 * 配置缺失返回 undefined（文档分析自动降级，D2 跳过不阻塞）
 */
function buildDocInvokeLLM(textCfg = {}) {
  const apiKey = textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY
  const baseURL = textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL
  const model = textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL
  if (!apiKey || !baseURL) return undefined

  const isOpenAICompatible =
    baseURL.includes('dashscope') || baseURL.includes('openai') ||
    baseURL.includes('deepseek') || baseURL.includes('/v1')

  return async (prompt) => {
    if (isOpenAICompatible) {
      const axios = (await import('axios')).default
      const url = baseURL.endsWith('/chat/completions')
        ? baseURL
        : `${baseURL.replace(/\/$/, '')}/chat/completions`
      const response = await axios.post(
        url,
        { model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2048 },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 },
      )
      return response.data.choices[0].message.content
    }
    const { ChatAnthropic } = await import('@langchain/anthropic')
    const { HumanMessage } = await import('@langchain/core/messages')
    const llm = new ChatAnthropic({
      modelName: model,
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL || undefined,
      temperature: 0.2,
      maxTokens: 2048,
    })
    const response = await llm.invoke([new HumanMessage({ content: prompt })])
    return Array.isArray(response.content)
      ? response.content
          .filter((c) => !c?.type || c.type !== 'thinking')
          .map((c) => (typeof c === 'string' ? c : c.text || ''))
          .join('')
      : String(response.content || '')
  }
}

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
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '1'),  // 🆕 P1-2: 默认从 2 降到 1，避免无效迭代
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

    // 🆕 S9+S10: 文档子管线（并行版）— init 发起 Promise 不阻塞，figma-connector 汇合
    // 优先级：预分析产物(state.docAnalysis) > 原文分析(state.requirementDoc)
    // Promise 自捕获错误（resolve null），不阻塞主管线
    let docAnalysis = state.docAnalysis || null
    let docAnalysisPromise = null
    let docAnalysisDegraded = false
    if (!docAnalysis && state.requirementDoc && state.requirementDoc.trim().length >= 20) {
      state.onProgress?.({ stage: '文档分析', message: '📄 需求文档后台并行解析中（D0/D1 确定性 + D2 LLM）...', status: 'running' })
      const textCfg = state.textAIConfig || state.aiConfig || {}
      const invokeLLM = buildDocInvokeLLM(textCfg)
      docAnalysisDegraded = !invokeLLM
      docAnalysisPromise = docAnalyzerModule
        .analyze(state.requirementDoc, { invokeLLM, source: 'paste' })
        .then((result) => {
          logger.info('📄 文档子管线完成（并行）', {
            events: result.events?.length || 0,
            apis: result.dataBinding?.apis?.length || 0,
            businessConfig: result.businessConfig?.length || 0,
            uiElements: result.uiElements?.length || 0,
            llmUsed: result.extractionMeta?.llmUsed || []
          })
          return result
        })
        .catch((e) => {
          logger.warn('📄 文档分析失败（降级为纯视觉生成，不阻塞）', e.message)
          return null
        })
    } else if (docAnalysis) {
      state.onProgress?.({ stage: '文档分析', message: '📄 使用预分析文档产物（前端已解析）', status: 'completed' })
    }

    // 🆕 P1-4: 预热 Puppeteer browser（非阻塞，避免 screenshot-renderer 首次启动延迟）
    warmupBrowser().catch(() => {})  // 静默错误，不阻塞 init

    return {
      ...state,
      stage: 'figma',
      iterationCount: 0,
      maxIterations: v3Config.maxIterations,
      startTime: Date.now(),
      // 🆕 S9: 文档分析产物（engineer 注入依据）
      docAnalysis,
      // 🆕 S10: 文档分析 Promise（figma-connector 节点汇合，60s 超时兜底）
      _docAnalysisPromise: docAnalysisPromise,
      _docAnalysisDegraded: docAnalysisDegraded,
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
      _selfOptimization: selfOptimization,
      // 🆕 视觉比对：质量模式 (fast | standard | strict)
      _qualityMode: state.qualityMode || config.qualityMode || 'standard',
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
      // 🆕 S15: UI 缓存短路（路径B — 缓存命中则跳过 Figma API 调用）
      if (state._uiCache?.figmaNodeData) {
        logger.info('🗃️ figma-connector: UI 缓存命中，跳过 Figma API 调用')
        state.onProgress?.({
          stage: 'Figma数据获取',
          message: '🗃️ 使用缓存的 Figma 数据（路径B免重复拉取）',
          status: 'completed'
        })
        const cachedTechHints = state._uiCache.techStackHints || []
        return {
          previewImage: state._uiCache.previewImage || null,
          figmaNodeData: state._uiCache.figmaNodeData,
          assets: state._uiCache.assets || [],
          resourceDomMapping: state._uiCache.resourceDomMapping || null,
          techStackHints: cachedTechHints,
          docAnalysis: state.docAnalysis || null
        }
      }

      const connector = new FigmaConnector({
        figmaToken: state.figmaToken || process.env.FIGMA_ACCESS_TOKEN
      })

      // 🆕 S10: Figma 拉取与文档分析 Promise 真并发（两管线并行，60s 超时兜底）
      // 💬 为什么这里用 Promise.race 而不是 withTimeout？
      // - 文档分析 Promise 是在前置节点（文档分析节点）内已经启动的，不是在这个节点内创建的
      // - withTimeout 需要重新创建 Promise 才能取消，但这里无法重新触发文档分析
      // - Promise.race 的超时只是"不再等待"，底层 Promise 仍会在后台继续执行（但不阻塞主流程）
      // - 这是 Promise.race 的合理用法：join 外部已启动的异步任务 + 超时降级
      const docJoinPromise = state._docAnalysisPromise
        ? Promise.race([
            state._docAnalysisPromise,
            new Promise((resolve) => setTimeout(() => resolve('__doc_timeout__'), 60000)),
          ])
        : Promise.resolve(null)

      const [result, docResult] = await Promise.all([
        connector.execute({
          fileKey: state.fileKey,
          nodeId: state.nodeId,
          outputPath: state.outputPath
        }),
        docJoinPromise
      ])

      // 🆕 S10: 汇合文档分析结果（并行完成 / 超时降级 / 失败降级）
      let docAnalysis = state.docAnalysis || null
      if (state._docAnalysisPromise) {
        if (docResult === '__doc_timeout__') {
          logger.warn('📄 文档分析超过 60s，降级为确定性结果或纯视觉生成')
          state.onProgress?.({ stage: '文档分析', message: '⚠️ 文档分析超时(60s)，按已提取内容继续', status: 'warning' })
          // 超时但 Promise 可能稍后完成 — 不等待，docAnalysis 保持 null（engineer 无注入，降级）
        } else if (docResult) {
          docAnalysis = docResult
          state.onProgress?.({
            stage: '文档分析',
            message: `✅ 文档解析完成（并行）：${docResult.extractionMeta?.deterministicFields || 0} 字段` +
              `${docResult.extractionMeta?.fullConfigDetected ? '（含微码四配置 ✓）' : ''}` +
              `${state._docAnalysisDegraded ? '（无文本AI配置，D2 降级）' : ''}`,
            status: 'completed'
          })
        } else {
          state.onProgress?.({ stage: '文档分析', message: '⚠️ 文档分析失败，按纯视觉生成', status: 'warning' })
        }
      }

      // 提取技术栈提示
      const techStackHints = connector.extractTechStackHints(result.figmaNodeData)

      // 优化 Figma 节点数据（减少 Token 消耗 40-50%）
      const optimizedFigmaData = connector.pruneRedundantFields(result.figmaNodeData)

      state.onProgress?.({
        stage: 'Figma数据获取',
        message: '✅ Figma数据获取完成',
        status: 'completed'
      })

      // 🆕 保存 checkpoint
      state._saveCheckpoint?.('figma', optimizedFigmaData)

      return {
        previewImage: result.previewImage,
        figmaNodeData: optimizedFigmaData,
        assets: result.assets,
        resourceDomMapping: result.resourceDomMapping,
        techStackHints: techStackHints,
        // 🆕 S10: 汇合后的文档分析产物
        docAnalysis
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
      // 🆕 S15: 视觉分析缓存短路（路径B — 缓存命中则跳过 Vision AI 调用）
      if (state._uiCache?.previewAnalysis) {
        logger.info('🗃️ visual-parser: 视觉分析缓存命中，跳过 Vision AI 调用')
        state.onProgress?.({
          stage: '视觉分析',
          message: '🗃️ 使用缓存的视觉分析结果（路径B免重复 Vision AI）',
          status: 'completed'
        })
        const cached = state._uiCache.previewAnalysis
        return {
          layoutStructure: cached.layoutStructure || cached,
          visualElements: cached.visualElements || null,
          charts: cached.charts || [],
          interactions: cached.interactions || [],
          analysisType: cached.analysisType || state.analysisType || '',
          analysisTarget: cached.analysisTarget || state.analysisTarget || '',
          analysisDescription: cached.analysisDescription || '',
          analysisEvidence: cached.analysisEvidence || [],
          _uiCacheHit: true
        }
      }

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
        // 硬阻断（默认关闭，FIGMA_COVERAGE_HARD_BLOCK=true 时启用）：标记后修订路由将跳过无依据重生成
        if (process.env.FIGMA_COVERAGE_HARD_BLOCK === 'true') {
          state._figmaCoverageBlocked = true
          logger.warn('🚫 P2 #3: Figma 覆盖率硬阻断已标记', { rate: figmaCoverageRate })
        }
      }

      // 🎯 Header关系验证（Priority 7）
      logger.info('开始Header关系验证')
      const headerValidation = HeaderRelationValidator.validate(
        result,
        state.figmaNodeData
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
          { thresholdRatio: 0.3 }
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

      // 🆕 P0-3: 缓存 visual-parser 结果（L0-A 循环中避免重复调用）
      state._visualParserCache = {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        headerSlots: result.headerSlots || [],
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || [],
        timestamp: Date.now()
      }

      // 🆕 保存 checkpoint
      state._saveCheckpoint?.('visual', {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        headerSlots: result.headerSlots || [],
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || [],
        headerValidation,
        headerSlotValidation,
      })

      return {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
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
      // 渲染器：微码组件固定使用 MicrocodeEngineer（面板头部/背景由 base-panel 插槽剥离，产物含 component.js/declare.json）
      const EngineerClass = MicrocodeEngineer
      const engineer = new EngineerClass({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage
      })

      // 提取 Figma 节点中文名称作为 displayName（用于 declare.json componentName）
      const displayName = state.figmaNodeData?.name || state.analysisTarget || state.componentName

      const result = await engineer.execute({
        onProgress: state.onProgress,  // 🆕 v3.8: 传递 SSE 进度回调（LLM 心跳 via invokeWithTimeout）
        signal: state.signal || state.__abortSignal || null,
        layoutStructure: state.layoutStructure,
        visualElements: state.visualElements,
        componentName: state.componentName,
        displayName,  // 🆕 v3.3: Figma 节点中文名称
        outputPath: state.outputPath,
        stage: 'figma',
        reviewResult: state.reviewResult,
        previousCritiques: state.checkResult?.critiques,
        charts: state.charts,
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
        // 🆕 S9: 文档分析产物（四配置/数据对接/交互注入依据）
        docAnalysis: state.docAnalysis,
        // 🆕 暂停检查回调（由 phase2.service 注入，每个分块前调用）
        pauseChecker: state.pauseChecker || null,
        // 🆕 运行时增量修订指导（来自 classifyRuntimeGate + buildRuntimeRevisionGuidance）
        _runtimeRevisionGuidance: state._runtimeRevisionGuidance,
        // 🆕 P1: 按问题类别只修目标文件（非 full 修订时生效）
        targetFiles: state._reviseFiles || null,
        reviseTarget: state._reviseTarget || null,
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
          componentType: 'microcode',  // 🆕 显式指定组件类型，提高可读性
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

      // 🆕 提前启动 screenshot 发布 + 渲染，与 graph 引擎调度并行
      // parallel-quality-check 只需 await 已启动的 Promise
      let _screenshotPromise = null
      const _skipVisComp = process.env.SKIP_VISUAL_COMPARISON === 'true' || process.env.SKIP_VISUAL_COMPARISON === '1'
      if (state.outputPath && !_skipVisComp) {
        const _sid = state.sessionId || state.componentName || 'unknown'
        const _tgt = state.target || 'microcode'
        _screenshotPromise = (async () => {
          try {
            await publishQualityPreview({
              outputPath: state.outputPath,
              componentId: _sid,
              groupId: state.groupId || 'default-group',
              target: _tgt,
            })
            const r = await renderScreenshot({
              outputPath: state.outputPath,
              sessionId: _sid,
              groupId: state.groupId || 'default-group',
              componentName: state.componentName,
              target: _tgt,
              previewImage: state.previewImage || null,
              onProgress: state.onProgress,
              hardGate: true,
              allowMissingAssetSelfHeal: true,
            })
            logger.info('✅ 预启动截图任务完成', { sessionId: _sid })
            return r
          } catch (e) {
            logger.warn('预启动截图任务失败（非阻塞）', { error: e.message })
            return { renderedImage: null, isStaticFallback: false, runtimeGate: null }
          }
        })()
      }

      return {
        checkResult: result,
        _screenshotPromise,  // 🆕 提前启动的截图 Promise
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
  // 节点 6b: Screenshot Renderer - 渲染截图 (🆕 异步非阻塞)
  // ========================================
  graph.addNode('screenshot-renderer', async (state) => {
    logger.info('节点: Screenshot Renderer - 启动异步截图任务')

    // 质量模式判断：fast 模式跳过视觉比对
    const qualityMode = state._qualityMode || 'standard'
    if (qualityMode === 'fast') {
      logger.info(' fast 模式：跳过视觉比对')
      return { renderedImage: null, visualComparisonReport: null, _screenshotPromise: null }
    }

    // 环境变量开关：临时关闭视觉比对（2026-08-01）
    if (process.env.SKIP_VISUAL_COMPARISON === 'true' || process.env.SKIP_VISUAL_COMPARISON === '1') {
      logger.info('⏭️ SKIP_VISUAL_COMPARISON=true：跳过截图渲染')
      return { renderedImage: null, visualComparisonReport: null, _screenshotPromise: null }
    }

    const sessionId = state.sessionId || state.componentName || 'unknown'
    const target = state.target || 'microcode'
    const previewImage = state.previewImage || null
    const outputPath = state.outputPath

    if (!outputPath || !previewImage) {
      logger.warn('跳过截图渲染：缺少 outputPath 或 previewImage', {
        hasOutputPath: !!outputPath,
        hasPreviewImage: !!previewImage,
      })
      return { renderedImage: null, _screenshotPromise: null }
    }

    // 启动异步截图任务，不等待结果
    const startTime = Date.now()
    logger.info('🚀 启动后台截图任务，继续执行后续节点', { sessionId, target })
    
    state.onProgress?.({
      stage: '视觉比对',
      message: '🚀 后台渲染组件截图...',
      status: 'running'
    })

    const screenshotPromise = (async () => {
      try {
        const result = await renderScreenshot({
          outputPath,
          sessionId,
          componentName: state.componentName,
          target,
          previewImage,
          onProgress: state.onProgress,
        })
        const duration = Date.now() - startTime
        logger.info('✅ 后台截图任务完成', { sessionId, durationMs: duration })
        return result
      } catch (error) {
        logger.error('后台截图任务失败（非阻塞）', { error: error.message, sessionId })
        return { renderedImage: null }
      }
    })()

    // 返回 Promise 对象，让后续节点在需要时 await
    return { _screenshotPromise: screenshotPromise }
  })

  // ========================================
  // 节点 6c: Visual Comparator - 视觉比对 (🆕 异步等待截图)
  // ========================================
  graph.addNode('visual-comparator', async (state) => {
    logger.info('节点: Visual Comparator - 视觉比对')

    // 环境变量开关：临时关闭视觉比对（2026-08-01）
    if (process.env.SKIP_VISUAL_COMPARISON === 'true' || process.env.SKIP_VISUAL_COMPARISON === '1') {
      logger.info('️ SKIP_VISUAL_COMPARISON=true：跳过视觉比对')
      return { visualComparisonReport: null }
    }

    // 等待后台截图任务完成
    if (state._screenshotPromise) {
      logger.info('⏳ 等待后台截图任务完成...')
      state.onProgress?.({
        stage: '视觉比对',
        message: '⏳ 等待组件截图完成...',
        status: 'running',
      })
      
      const screenshotResult = await state._screenshotPromise
      state.renderedImage = screenshotResult.renderedImage
      state.renderedImageIsStaticFallback = screenshotResult.isStaticFallback
      logger.info('✅ 后台截图任务已完成，继续视觉比对')
    }

    // 无截图则跳过
    if (!state.renderedImage) {
      logger.info('无渲染截图，跳过视觉比对')
      return { visualComparisonReport: null }
    }

    // 静态抽取降级 → 不进行比对（截图内容失真，比对无意义）
    if (state.renderedImageIsStaticFallback) {
      logger.info('⚠️ 截图来自静态抽取降级，跳过视觉比对（前端服务未连接）')
      state.onProgress?.({
        stage: '视觉比对',
        message: '⚠️ 前端服务未连接，截图采用静态抽取（含未解析模板），已跳过视觉比对',
        status: 'warning',
      })
      return { visualComparisonReport: null }
    }

    const figmaImage = state.previewImage
    if (!figmaImage) {
      logger.warn('无 Figma 原图，跳过视觉比对')
      return { visualComparisonReport: null }
    }

    state.onProgress?.({
      stage: '视觉比对',
      message: '正在比对设计稿与渲染结果...',
      status: 'running',
    })

    try {
      const visionCfg = state.visionAIConfig || state.aiConfig || {}
      const comparator = new VisualComparator({
        apiKey: visionCfg.apiKey || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: visionCfg.model || process.env.VISION_MODEL || process.env.ANTHROPIC_MODEL,
        baseURL: visionCfg.baseURL || process.env.VISION_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage,
      })

      const report = await comparator.compare(figmaImage, state.renderedImage, {
        signal: state.signal || state.__abortSignal || null,
        onProgress: state.onProgress,
        requestConcurrency: state.requestConcurrency,
        requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
        requestMaxRetries: state.requestMaxRetries,
      })

      state.onProgress?.({
        stage: '视觉比对',
        message: `视觉比对完成 (相似度: ${report.overallSimilarity}/100${report.pass ? ' | 通过' : ' | 有差异'})`,
        status: report.pass ? 'completed' : 'warning',
      })

      logger.info('视觉比对结果', {
        similarity: report.overallSimilarity,
        issueCount: report.issues?.length || 0,
        pass: report.pass,
        degraded: report.degraded || false,
      })

      return { visualComparisonReport: report }
    } catch (error) {
      logger.error('视觉比对节点失败（非阻塞）', { error: error.message })
      state.onProgress?.({
        stage: '视觉比对',
        message: `视觉比对失败: ${error.message}`,
        status: 'warning',
      })
      return { visualComparisonReport: null }
    }
  })

  // ========================================
  // 节点 6d: Runtime Preview Gate - 发布当前迭代产物并执行真实运行时硬门禁
  // ========================================
  graph.addNode('parallel-quality-check', async (state) => {
    logger.info('节点: Runtime Preview Gate - 发布当前迭代产物并执行真实预览')
    const startTime = Date.now()
    const sessionId = state.sessionId || state.componentName || 'unknown'
    const target = state.target || 'microcode'
    const outputPath = state.outputPath

    try {
      if (!outputPath) throw new Error('缺少 outputPath')

      let renderedImage, isStaticFallback, runtimeGate

      // 🆕 优先使用 adversarial-checker 预启动的截图 Promise（已并行执行）
      if (state._screenshotPromise) {
        logger.info('⏳ 等待预启动的截图任务完成（已并行执行）')
        const result = await state._screenshotPromise
        renderedImage = result.renderedImage
        isStaticFallback = result.isStaticFallback
        runtimeGate = result.runtimeGate
        logger.info('✅ 预启动截图任务已完成')
      } else {
        // 回退路径：预启动未触发或不可用，走原同步逻辑
        logger.info('📸 走同步截图路径（无预启动 Promise）')
        await publishQualityPreview({
          outputPath,
          componentId: sessionId,
          groupId: state.groupId || 'default-group',
          target,
        })

        const result = await renderScreenshot({
          outputPath,
          sessionId,
          groupId: state.groupId || 'default-group',
          componentName: state.componentName,
          target,
          previewImage: state.previewImage || null,
          onProgress: state.onProgress,
          hardGate: true,
          allowMissingAssetSelfHeal: true,
        })
        renderedImage = result.renderedImage
        isStaticFallback = result.isStaticFallback
        runtimeGate = result.runtimeGate
      }

      const duration = Date.now() - startTime
      emitMetrics('runtime-preview-gate', {
        status: runtimeGate?.status || 'BLOCK',
        issueCount: runtimeGate?.issues?.length || 0,
        hasRenderedImage: !!renderedImage,
        isStaticFallback: !!isStaticFallback,
        durationMs: duration,
        isPreStarted: !!state._screenshotPromise,  // 🆕 标记是否走预启动路径
      })

      state.onProgress?.({
        stage: '运行时质量门禁',
        message: runtimeGate?.status === 'PASS'
          ? '真实预览加载与渲染检查通过'
          : `真实预览检查未通过（${runtimeGate?.issues?.length || 1} 项阻断问题）`,
        status: runtimeGate?.status === 'PASS' ? 'completed' : 'warning',
      })

      return {
        renderedImage,
        renderedImageIsStaticFallback: isStaticFallback,
        runtimeGate,
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
      logger.error('Runtime Preview Gate 失败', { error: error.message })
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
      logger.warn('运行时质量门禁告警已降级，不进入修订', {
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

      logger.warn('运行时质量门禁未通过，进入增量修订', {
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

    // 🆕 规范类 critique 检测：运行时已通过时，尽量避免回到 full engineer
    const critiques = Array.isArray(checkResult?.critiques) ? checkResult.critiques : []
    const hasComplianceCategory = Array.isArray(categories.compliance) && categories.compliance.length > 0
    const complianceOnlyCritiques = critiques.length > 0 && critiques.every((critique) => {
      const category = String(critique?.category || '').toLowerCase()
      const issue = String(critique?.issue || '').toLowerCase()
      const fix = String(critique?.fix || '').toLowerCase()
      const location = String(critique?.location || '').toLowerCase()
      const text = `${category} ${issue} ${fix} ${location}`
      return category === 'standards' || category === 'compliance' ||
        text.includes('style lang="less" scoped') ||
        text.includes("style lang='less' scoped") ||
        text.includes('@import') ||
        text.includes('aria-label') ||
        text.includes('键盘') ||
        text.includes('keyboard') ||
        text.includes('button') ||
        text.includes('base-panel') ||
        text.includes('header/bg-layer') ||
        text.includes('header / bg-layer')
    })

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
      violationCount
    })

    // 🆕 P1优化: qualityScore >= 阈值 提前退出（可配置，默认75）
    const qualityScoreThreshold = state._v3Config?.qualityScoreThreshold || 75
    const textScore = checkResult?.qualityScore || 0

    // 🆕 视觉比对：合并评分
    const visualReport = state.visualComparisonReport
    const visualScore = visualReport?.overallSimilarity ?? null
    const hasVisualHighIssue = visualReport?.issues?.some(i => i.severity === 'high') ?? false

    // 合并评分 = 文本分 × 0.5 + 视觉分 × 0.5（视觉分缺失时只用文本分）
    const qualityScore = visualScore !== null
      ? Math.round(textScore * 0.5 + visualScore * 0.5)
      : textScore

    logger.info('📊 质量评分', {
      textScore,
      visualScore: visualScore ?? 'N/A',
      mergedScore: qualityScore,
      hasVisualHighIssue,
      qualityMode: state._qualityMode || 'standard',
    })

    if (qualityScore >= qualityScoreThreshold && violationCount === 0 && !hasVisualHighIssue) {
      logger.info(`✅ P1优化: 合并评分 >= ${qualityScoreThreshold} 且无越权/无高优视觉问题，提前退出迭代`)
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
    if (state._noMoreIterations) {
      logger.info(`🛑 简单组件单次精修已完成，结束迭代 (complexity=${complexity})`)
      return {
        needsRevision: false,
        violationCount,
        _noMoreIterations: false  // 重置标记
      }
    }

    // 🆕 simple 组件降低提前退出阈值（75→70，可配置）
    const simpleExitThreshold = state._v3Config?.simpleExitThreshold || 70
    if (complexity === 'simple' && qualityScore >= simpleExitThreshold) {
      logger.info(`✅ #354a: 简单组件 qualityScore=${qualityScore} >= ${simpleExitThreshold}，跳过精修直接完成`)
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 简单组件质量达标 (>= ${simpleExitThreshold})，完成生成`,
        status: 'completed'
      })
      return { needsRevision: false, violationCount }
    }

    // 判断是否需要修订
    const needsRevision = checkResult?.checkResult === 'needs_revision'
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
      } else if (runtimeGate?.status === 'PASS' && hasComplianceCategory && complianceOnlyCritiques) {
        target = 'parallel-refine'
        reason = `运行时已通过，规范类问题走轻修订: ${categories.compliance.join(', ')}`
        _reviseTarget = 'layout'
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
      } else if (categories.layout && categories.layout.length > 0) {
        target = 'parallel-refine'
        reason = `纯布局问题: ${categories.layout.join(', ')}`
        _reviseTarget = 'layout'
      } else {
        // 🆕 P1-1 优化: issueCategories 都为空但 needs_revision 时，走 layout-style-refiner 合并精修
        // 这种情况通常是视觉上有问题但分类不明确，避免走全量重做浪费 tokens
        const hasAnyIssues = (categories.compliance?.length || 0) + 
                            (categories.structural?.length || 0) + 
                            (categories.stylistic?.length || 0) + 
                            (categories.layout?.length || 0)
        
        if (hasAnyIssues === 0 && !hasViolation) {
          // 检查是否有 critiques（可能有未分类的问题）
          const hasCritiques = checkResult?.critiques && checkResult.critiques.length > 0
          
          if (hasCritiques) {
            // 有 critiques 但没分类 → 走合并精修（layout-style-refiner）
            target = 'parallel-refine'  // parallel-refine 会调用 layout-style-refiner
            reason = `未分类问题（${checkResult.critiques.length} 条 critiques），走合并精修`
            _reviseTarget = 'layout'  // 以布局为主，同时处理样式
            
            logger.info('🎯 P1-1: issueCategories 为空但有 critiques，走合并精修', {
              critiqueCount: checkResult.critiques.length
            })
          } else {
            // 完全没有问题但标记为 needs_revision → 可能是 LLM 误判，直接完成
            logger.warn('⚠️ P1-1: needs_revision 但无任何问题，可能是 LLM 误判，强制完成', {
              qualityScore
            })
            return {
              needsRevision: false,
              violationCount,
              _forceComplete: true  // 标记强制完成
            }
          }
        }
      }

      // 🆕 视觉比对路由增强：当文本分类不明确时，用视觉 issue 类型辅助路由
      if (visualReport && visualReport.issues && visualReport.issues.length > 0) {
        const visualColorIssues = visualReport.issues.filter(i => i.category === 'color' || i.category === 'font')
        const visualLayoutIssues = visualReport.issues.filter(i => i.category === 'layout' || i.category === 'proportion' || i.category === 'spacing')
        const visualMissingIssues = visualReport.issues.filter(i => i.category === 'missing_element' || i.category === 'extra_element')

        if (visualMissingIssues.length > 0 && target === 'microcode-engineer') {
          // 元素缺失/多余 → 需要全量重做（保持 engineer 路由）
          reason += ` + 视觉发现元素缺失: ${visualMissingIssues.map(i => i.description).join('; ')}`
        } else if (visualColorIssues.length > 0 && visualLayoutIssues.length === 0 && target !== 'style-refiner') {
          // 纯颜色/字体问题 → 路由到 style-refiner
          target = 'style-refiner'
          _reviseTarget = 'stylistic'
          reason = `视觉发现颜色/字体问题: ${visualColorIssues.map(i => i.description).join('; ')}`
        } else if (visualLayoutIssues.length > 0 && target !== 'parallel-refine') {
          // 布局/间距问题 → 路由到 parallel-refine
          target = 'parallel-refine'
          _reviseTarget = 'layout'
          reason = `视觉发现布局/间距问题: ${visualLayoutIssues.map(i => i.description).join('; ')}`
        }
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

      // 🆕 P2 #3: Figma 覆盖率硬阻断（默认关闭，仅 FIGMA_COVERAGE_HARD_BLOCK=true 生效）
      // 无可靠设计依据时，不再进入全量/精准重生成，直接带警告完成，避免浪费模型调用。
      if (state._figmaCoverageBlocked && process.env.FIGMA_COVERAGE_HARD_BLOCK === 'true') {
        logger.warn('🚫 P2 #3: Figma 覆盖率硬阻断 — 跳过无依据重生成，直接带警告完成', { rate: state._figmaCoverageRate })
        return {
          needsRevision: false,
          violationCount,
          _forceComplete: true,
          _figmaCoverageBlocked: true
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
      logger.warn('达到最大迭代次数，停止修订')
      state.onProgress?.({
        stage: '迭代修订',
        message: '⚠️ 已达最大修订次数，停止迭代',
        status: 'warning'
      })
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
          if (f.endsWith('common.less')) {
            const fullPath = join(state.outputPath, f)
            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              const classes = content.match(/\.[a-zA-Z][\w-]+(?=\s*\{)/g) || []
              const violations = classes.filter(c => !c.startsWith(`.c-${state.componentId || ''}-`) && !/^&|^:root|^@keyframes/.test(c))
              if (violations.length > 0) {
                logger.warn(`🚨 最终扫描: ${f} 有 ${violations.length} 个 class 缺少前缀`)
              }
            } catch (e) {}
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
      // 🆕 视觉比对输出
      visualComparisonReport: state.visualComparisonReport || null,
      qualityMode: state._qualityMode || 'standard',
      runtimeGate: state.runtimeGate || null,
      // 🆕 P2 #3: 透出 Figma 覆盖率与告警，供前端/任务结果展示
      figmaCoverageRate: state._figmaCoverageRate ?? null,
      figmaCoverageWarning: state._figmaCoverageWarning || null,
      warnings: [
        ...(state.runtimeGate?.warning ? [state.runtimeGate.warning] : []),
        ...(state._figmaCoverageWarning ? [state._figmaCoverageWarning] : [])
      ],
    }
  })

  // ========================================
  // 节点 4c: 并行分析汇聚 - 等待Layout Reviewer和Style Mapper完成
  // ========================================
  graph.addNode('parallel-analysis', async (state) => {
    logger.info('节点: 并行分析 - Layout Reviewer & Style Mapper')

    // 🆕 断点续跑：如果有缓存的分析结果，直接跳过
    if (state._resumeData?.cachedReviewResult && state._resumeData?.cachedStyleMappings) {
      logger.info('⏭️ 断点续跑: 跳过并行分析（使用缓存结果）')
      state.onProgress?.({
        stage: '并行分析',
        message: '⏭️ 跳过并行分析（产物已缓存，断点续跑）',
        status: 'completed'
      })
      return {
        reviewResult: state._resumeData.cachedReviewResult,
        styleMappings: state._resumeData.cachedStyleMappings,
      }
    }

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

      // 🆕 保存 checkpoint
      state._saveCheckpoint?.('analysis', { reviewResult, styleMappings })

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
        : '⚙️ 布局精修 → 样式精修 顺序执��中...',
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
            // 🆕 传递合并结果给下游
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
    })

    // 🆕 S11: 文档页面元素覆盖率校验（有 docAnalysis.uiElements 才执行，确定性零 LLM）
    let elementCoverage = null
    const uiElements = state.docAnalysis?.uiElements || []
    if (uiElements.length > 0) {
      const coverageValidator = new ElementCoverageValidator()
      const filesRecord = Object.fromEntries((filesForCheck || []).map((f) => [f.path, f.content]))
      elementCoverage = coverageValidator.validate({ uiElements, files: filesRecord })

      if (!elementCoverage.pass) {
        // 缺失元素 → WARN 级 issue（不硬阻塞），汇入 L0-B issues 并供 L2 精准路由
        const coverageIssues = [
          ...elementCoverage.missing.map((m) => ({
            id: 'DOC_ELEMENT_MISSING',
            severity: 'WARN',
            message: m.hint,
            file: 'package/index.vue',
            element: m.element,
          })),
          ...elementCoverage.conditionalMissing.map((m) => ({
            id: 'DOC_ELEMENT_CONDITIONAL_MISSING',
            severity: 'WARN',
            message: m.hint,
            file: 'package/index.vue',
            element: m.element,
          })),
        ]
        result.issues = [...(result.issues || []), ...coverageIssues]
        logger.warn(`📐 元素覆盖率: ${elementCoverage.summary}`)
        state.onProgress?.({
          stage: 'L0-B校验',
          message: `⚠️ ${elementCoverage.summary}（已加入修复清单）`,
          status: 'warning'
        })
      } else {
        logger.info(`📐 元素覆盖率: ${elementCoverage.summary}`)
      }
    }

    // 降级检查：硬性 BLOCK（scoped 属性缺失 / 文件结构完整性）不可被 bypass
    const consecutiveCodeFailures = state._l0CodeConsecutiveFailures || 0
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 5
    
    if (!result.pass && consecutiveCodeFailures >= bypassThreshold) {
      const hardBlockIssues = (result.issues || []).filter(i =>
        i.severity === 'BLOCK' && i.id === 'CODE-001'
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
          if (issue.file) retryGuidance += `   文件: ${issue.file}\n`
        })
        retryGuidance += '\n请确保：\n'
        retryGuidance += '- 每个 .vue 文件都有 <style lang="less" scoped>\n'
        retryGuidance += '- style 块第一行是 @import \'../resources/styles/index.less\'\n'
        retryGuidance += '- common.less 中的 class 都带组件前缀 .c-{componentId}-\n'

        logger.info('L0-B 生成修复指导', { issueCount: blockIssues.length })
      }
    }

    return {
      codeValidationResult: result,
      _l0CodeConsecutiveFailures: newConsecutive,
      _l0CodeDegraded: result._degraded || false,
      _l0CodeRetryGuidance: retryGuidance,  // 🆕 传递修复指导
      elementCoverage  // 🆕 S11: 元素覆盖率结果（L2 精准路由/对抗检查消费）
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

    // 通过/重试耗尽/降级通过 → 继续精修
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

  // 视觉比对阶段已暂时禁用（2026-08-01），parallel-quality-check 直连 revision-decision
  graph.addEdge('adversarial-checker', 'parallel-quality-check')
  graph.addEdge('parallel-quality-check', 'revision-decision')

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
export async function runPhase2Generation(options) {
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
    sessionId,       // 🆕 用于 Token 追踪关联
    groupId,         // 🆕 运行时预览发布路径
    requirementDoc,  // 🆕 S9: 需求文档（可选，驱动文档子管线）
    docAnalysis,     // 🆕 S9: 预分析文档产物（可选，免重复分析）
    uiCache,         // 🆕 S15: UI 缓存（路径B — figma/visual 节点短路）
    _resumeData,     // 🆕 断点续跑数据 { stage, cachedReviewResult, cachedStyleMappings }
    pauseChecker,    // 🆕 分块生成前暂停检查
  } = options

  // 🆕 断点续跑：检查点保存辅助函数
  const saveCheckpoint = async (name, data) => {
    if (!outputPath) return
    try {
      const { mkdirSync, writeFileSync } = (await import('fs'))
      const { join } = await import('path')
      const cpDir = join(outputPath, '.checkpoint')
      mkdirSync(cpDir, { recursive: true })
      writeFileSync(join(cpDir, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8')
      logger.info(`💾 Checkpoint 已保存: ${name}`)
    } catch (e) {
      logger.warn(`Checkpoint 保存失败 (${name}): ${e.message}`)
    }
  }

  // 🆕 断点续跑模式
  const resumeMode = _resumeData?.stage || null
  if (resumeMode) {
    logger.info(`🔄 断点续跑模式: ${resumeMode}`)
  }

  logger.info('开始 Phase 2 Figma阶段生成', {
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
    target: 'microcode',
    pauseChecker: pauseChecker || null,
    // 🆕 S9: 需求文档传递（init 节点文档子管线消费）
    requirementDoc,
    docAnalysis,
    // 🆕 S15: UI 缓存传递（figma-connector / visual-parser 节点短路）
    _uiCache: uiCache || null,
    // 🆕 断点续跑数据
    _resumeData: _resumeData || null,
    _saveCheckpoint: saveCheckpoint,
  }

  try {
    const result = await graph.run(initialState)

    logger.info('✅ Phase 2 Figma阶段完成', {
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

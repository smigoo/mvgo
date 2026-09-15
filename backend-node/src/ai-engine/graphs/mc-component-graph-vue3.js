/**
 * Phase 2 Figma阶段工作流 v3.0
 *
 * 升级内容：
 * -L0-A: preview-validator 自验环（visual-parser 之后）
 * -L0-B: code-structure-validator（engineer 之后）
 * -L1: refine-feedback 同伴评审环
 * -L2: revision-decision 智能路由（4路分发）
 * -并行精修: layout-refiner + style-refiner 同时执行
 * -issueCategories 分类输出 → 精准路由
 * - -minimal/full 模式切换
 * - 📊 Metrics 可观测性采集
 */

import { Graph } from './graph.js';
import { FigmaConnector } from '../roles/figma-connector.js';
import {
  VisualParser,
  evaluateVisualTrustVerdict,
  applyHallucinationDrop,
} from '../roles/visual-parser.js';
import { LayoutReviewer } from '../roles/layout-reviewer.js';
import { StyleMapper } from '../roles/style-mapper.js';
import { LayoutRefiner } from '../roles/layout-refiner.js';
import { StyleRefiner } from '../roles/style-refiner.js';
import { LayoutStyleRefiner } from '../roles/layout-style-refiner.js';
import { postRefineResourceImportGuard } from '../utils/resource-import-guard.js';
// P2 收编：saveCheckpoint 原在本文件重复实现一份，与 phase2 graph 逐字节相同 → 统一到 utils
import { saveCheckpoint as saveCheckpointShared } from '../utils/save-checkpoint.js';
import { Vue3Engineer } from '../roles/vue3-engineer.js';
import { GenerationContext } from '../types/generation-context.js';
import { runGenerationContextShadow } from '../context/generation-context-shadow.js';
import { subcomponentPlanner } from '../roles/subcomponent-planner.js';
import { AdversarialChecker } from '../roles/adversarial-checker.js';
import { VisualComparator } from '../roles/visual-comparator.js';
import { isFeatureEnabled } from '../config/v3-mode-features.js';
import {
  renderScreenshot,
  evaluateRuntimeGate,
  classifyRuntimeGate,
  buildRuntimeRevisionGuidance,
  hasDeterministicRuntimeMissing,
} from '../roles/screenshot-renderer.js';
import {
  getMaxIterations,
  getQualityScoreThreshold,
  getVisualSimilarityThreshold,
} from '../../config/runtime-env.js';
// 🛡️ 2026-09-03 修复：原 const {publishQualityPreview} = require(...cjs) 顶层裸 require——
// ESM 判定（Node 语法检测）下抛 "require is not defined"。publisher 已 module.exports named export，
// cjs-module-lexer 可识别，改 ESM import 兼容 CJS/ESM 双加载。
import { publishQualityPreview } from '../utils/workspace-preview-publisher.js';
//  引入 validators
import { PreviewAnalysisValidator } from '../validators/preview-analysis-validator.js';
import {
  CodeStructureValidator,
  hasScopedLessStyle,
} from '../validators/code-structure-validator.js';
//  P0-4: flex 布局静态检查 + 自动修复（零 LLM）
import {
  checkFlexUsage,
  autoFixFlexIssues,
} from '../validators/code-structure-validator.js';
import { OrphanComponentDetector } from '../validators/orphan-component-detector.js';
import { LessVariableChecker } from '../validators/less-variable-checker.js';
import { LessCompileGate } from '../validators/less-compile-gate.js';
import { HeaderRelationValidator } from '../validators/header-relation-validator.js';
import { HeaderSlotValidator } from '../validators/header-slot-validator.js';
import { applyHeaderSlotContractRewrite } from '../utils/header-slot-contract.js';
import { resolveNodeExclusivity } from '../utils/node-exclusivity.js';
import { validateDoNotInvent } from '../validators/do-not-invent-validator.js';
//  P0-2: 结构顺序门禁（零 LLM，防区块颠倒）
import { validateStructureOrder } from '../validators/structure-order-validator.js';
import { formatFigmaStyleData } from '../utils/figma-format.js';
import { createLogger } from '../logger/index.js';
// 自优化器：基于历史 metrics 自动优化 Prompt 和参数
import {
  recordRun,
  getOptimizationForNextRun,
} from '../utils/self-optimizer.js';
//Token 预算管控
import { TokenBudget } from '../utils/token-budget.js';
import {
  computeChangedFilePaths,
  readRevisionSnapshot,
  resolveTargetFiles,
} from '../utils/revision-files.js';
import {
  detectNavSignal,
  injectNavSectionIfMissing,
} from '../utils/nav-section.js';
import { withTimeout } from '../orchestrator/orchestrator.js';

const logger = createLogger({ name: 'mc-component-graph-vue3' });

/**
 * 解析 v3.0 运行模式
 * @param {Object} options - 构造选项或 state
 * @returns {{ mode: 'off'|'minimal'|'full'|'generate', config: Object }}
 */
function resolveV3Mode(options = {}) {
  // 优先级: state覆盖 > 参数 > 环境变量 > 默认generate（代码写完即停，人工精修）
  const envMode = process.env.V3_MODE || 'generate';
  const paramMode = options.v3Mode || options.config?.v3Mode || '';
  const stateOverride = options.state?.v3ModeOverride;

  let mode = stateOverride || paramMode || envMode;
  if (!['off', 'minimal', 'full', 'generate'].includes(mode)) {
    logger.warn(`未知 v3Mode "${mode}"，回退到 generate`);
    mode = 'generate';
  }

  return {
    mode,
    config: {
      l0MaxRetry: parseInt(process.env.L0_MAX_RETRY || '2'),
      l0BypassAfterFailures: parseInt(
        process.env.L0_BYPASS_AFTER_FAILURES || '3',
      ),
      violationMaxCount: parseInt(process.env.VIOLATION_MAX_COUNT || '2'),
      maxIterations: getMaxIterations(),
      qualityScoreThreshold: getQualityScoreThreshold(),
    },
  };
}

// ============================================
// 📊 Metrics 辅助函数
// ============================================

/** 在关键节点输出 metrics 日志 */
function emitMetrics(nodeName, metrics) {
  logger.info(`📊 [metrics] ${nodeName}`, metrics);
}

/**
 * 创建 Phase 2 Figma阶段工作流图
 * @param {Object} [config] - 可选的 v3.0 配置
 * @param {string} [config.v3Mode='generate'] - 运行模式: off | minimal | full | generate
 *   - generate（默认）: 代码写完即停（保留 L0-B 确定性校验），不进入精修/对抗检查/质量门禁/修订循环
 */
export function createPhase2Graph(config = {}) {
  const graph = new Graph({ name: 'mc-component-phase2-figma' });

  // 预解析模式（init 节点中会再次确认）
  const resolvedConfig = resolveV3Mode(config);

  // ========================================
  // 节点 1: 初始化 (📊 metrics 注入)
  // ========================================
  graph.addNode('init', async (state) => {
    // 解析最终运行模式
    const { mode, config: v3Config } = resolveV3Mode({ ...config, state });

    logger.info('节点: 初始化Figma阶段', {
      componentName: state.componentName,
      fileKey: state.fileKey,
      nodeId: state.nodeId,
      v3Mode: mode,
      v3Config,
    });

    // 📊 初始化 metrics
    emitMetrics('init', {
      v3Mode: mode,
      l0MaxRetry: v3Config.l0MaxRetry,
      l0BypassAfterFailures: v3Config.l0BypassAfterFailures,
      maxIterations: v3Config.maxIterations,
      timestamp: Date.now(),
    });

    // 自优化：加载历史模式，生成 Prompt 增强指令
    let selfOptimization = null;
    try {
      if (mode === 'full') {
        selfOptimization = getOptimizationForNextRun();
        if (
          selfOptimization.promptAugmentation ||
          selfOptimization.warnings?.length > 0
        ) {
          logger.info('🧠 自优化: 已加载历史优化建议', {
            suggestionCount: selfOptimization._meta?.suggestionCount || 0,
            warnings: selfOptimization.warnings?.length || 0,
          });
          // 将 warnings 推送到前端显示
          for (const w of selfOptimization.warnings || []) {
            state.onProgress?.({
              stage: '自优化',
              message: w,
              status: 'warning',
            });
          }
        }
      }
    } catch (e) {
      logger.warn('🧠 自优化加载失败（非阻塞）', e.message);
      selfOptimization = null;
    }

    state.onProgress?.({
      stage: '初始化',
      message: `🚀 开始Figma精修阶段... (v3.0 ${mode})`,
      status: 'running',
    });

    // 标记初始化完成，避免前端时间线永远卡在"正在处理"
    state.onProgress?.({
      stage: '初始化',
      message: '初始化完成',
      status: 'completed',
    });

    return {
      ...state,
      stage: 'figma',
      iterationCount: 0,
      maxIterations: v3Config.maxIterations,
      startTime: Date.now(),
      //面板类型（传递给代码生成节点）
      panelType: state.panelType || 'default-panel',
      // 模式状态（后续所有节点共享）
      _v3Mode: mode,
      _v3Config: v3Config,
      _l0ConsecutiveFailures: 0, // L0-A (preview) 连续失败计数器
      _l0CodeConsecutiveFailures: 0, // L0-B (code) 连续失败计数器
      violationCount: 0, // 越权计数器
      validatorRetryCount: 0, // L0-A 已重试次数
      codeValidatorRetryCount: 0, // L0-B 已重试次数
      // 🧠 自优化状态（供 microcode-engineer 等节点消费）
      _selfOptimization: selfOptimization,
    };
  });

  // ========================================
  // 节点 2: Figma Connector - 获取详细数据
  // ========================================
  graph.addNode('figma-connector', async (state) => {
    logger.info('节点: Figma Connector - 获取详细数据');

    state.onProgress?.({
      stage: 'Figma数据获取',
      message: '📥 正在获取Figma详细数据和资源...',
      status: 'running',
    });

    try {
      const connector = new FigmaConnector({
        figmaToken: state.figmaToken,
      });

      //S15: UI 缓存短路（路径B — 缓存命中则跳过 Figma API 调用）
      if (state._uiCache?.figmaNodeData) {
        logger.info('🗃️ figma-connector: UI 缓存命中，跳过 Figma API 调用');
        state.onProgress?.({
          stage: 'Figma数据获取',
          message: '🗃️ 使用缓存的 Figma 数据（断点续跑免重复拉取）',
          status: 'completed',
        });
        const cachedNodeData = state._uiCache.figmaNodeData;

        // 🔧 修复：缓存命中也要下载业务资源图（与 phase2 图保持一致）
        let assets = [];
        let resourceDomMapping = null;
        try {
          const { join } = await import('path');
          const resourcesDir = join(state.outputPath, 'resources/images');

          assets = await connector.downloadAssets(
            state.fileKey,
            cachedNodeData,
            resourcesDir,
          );
          resourceDomMapping = connector._buildResourceDomMapping(
            cachedNodeData,
            assets,
          );

          // 资源文件存在性校验
          const { existsSync } = await import('fs');
          let missingCount = 0;
          for (const m of resourceDomMapping) {
            if (m.downloadStatus !== 'success' || !m.resourceFile) continue;
            const fileName = m.resourceFile.split('/').pop();
            const realPath = join(resourcesDir, fileName);
            if (!existsSync(realPath)) {
              m.downloadStatus = 'missing';
              m.fallbackHint = `⚠️ 资源文件不存在(${fileName}), 请使用CSS替代方案`;
              missingCount++;
            }
          }
          if (missingCount > 0) {
            logger.warn(
              `缓存命中路径: ${missingCount} 个资源文件磁盘不存在，已降级`,
            );
          }

          // 保存 resource-dom-mapping.json
          const { mkdirSync, writeFileSync } = await import('fs');
          const mappingDir = join(state.outputPath, '.mc-gen');
          mkdirSync(mappingDir, { recursive: true });
          writeFileSync(
            join(mappingDir, 'resource-dom-mapping.json'),
            JSON.stringify(resourceDomMapping, null, 2),
          );

          logger.info('✅ 缓存命中路径: 业务资源下载完成', {
            assetsCount: assets.length,
            mappingsCount: resourceDomMapping.length,
          });
        } catch (err) {
          logger.error('❌ 缓存命中路径: 资源下载失败', { error: err.message });
          assets = [];
          resourceDomMapping = null;
        }

        // 6-A · 缓存路径也需构建颜色索引（与主路径同口径）
        const cachedConnector = new FigmaConnector({ figmaToken: state.figmaToken });
        const nodeColorIndex = cachedConnector.buildNodeColorIndex(cachedNodeData);

        return {
          figmaStyleTree: formatFigmaStyleData(cachedNodeData),
          previewImage: state._uiCache.previewImage || null,
          figmaNodeData: cachedNodeData,
          assets,
          resourceDomMapping,
          techStackHints: state._uiCache.techStackHints || [],
          // 6-A · nodeId→fills 颜色索引（确定性事实源，供 6-B 颜色装配消费）
          nodeColorIndex,
        };
      }

      const result = await connector.execute({
        target: 'vue3',
        fileKey: state.fileKey,
        nodeId: state.nodeId,
        outputPath: state.outputPath,
      });

      // 提取技术栈提示
      const techStackHints = connector.extractTechStackHints(
        result.figmaNodeData,
      );

      // 优化 Figma 节点数据（减少 Token 消耗 40-50%）
      const optimizedFigmaData = connector.pruneRedundantFields(
        result.figmaNodeData,
      );
      const figmaStyleTree = formatFigmaStyleData(optimizedFigmaData);

      // 6-A · 构建 nodeId→fills 颜色索引（确定性事实源，供 6-B 颜色装配消费）
      const nodeColorIndex = connector.buildNodeColorIndex(optimizedFigmaData);

      //保存 Figma checkpoint（断点续跑用）— 存裸节点数据，与微码图格式一致
      state._saveCheckpoint?.('figma', optimizedFigmaData);

      // 🏷️ 早提取组件中文名（根节点名 cp-流量监测 → 流量监测），随完成事件带给 service 层
      // 回写任务 displayName。仅接受含 CJK 的标题。
      const _rootTitle = String(optimizedFigmaData?.name || '')
        .replace(/^(cp|mc|mv|page)-/, '')
        .trim();
      const _earlyDisplayName = /[\u4e00-\u9fa5]/.test(_rootTitle)
        ? _rootTitle
        : '';

      state.onProgress?.({
        stage: 'Figma数据获取',
        message: '✅ Figma数据获取完成',
        status: 'completed',
        ...(_earlyDisplayName ? { displayName: _earlyDisplayName } : {}),
      });

      return {
        figmaStyleTree: figmaStyleTree,
        previewImage: result.previewImage,
        figmaNodeData: optimizedFigmaData,
        assets: result.assets,
        resourceDomMapping: result.resourceDomMapping,
        techStackHints: techStackHints,
        // 6-A · nodeId→fills 颜色索引（确定性事实源，供 6-B 颜色装配消费）
        nodeColorIndex,
      };
    } catch (error) {
      logger.error('Figma数据获取失败', { error: error.message });
      state.onProgress?.({
        stage: 'Figma数据获取',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  // 节点 3: Visual Parser - 重新分析
  // ========================================
  graph.addNode('visual-parser', async (state) => {
    logger.info('节点: Visual Parser - 重新分析');

    state.onProgress?.({
      stage: '视觉分析',
      message: '🔍 正在使用Figma数据重新分析...',
      status: 'running',
    });

    try {
      //S15: UI 缓存短路（路径B — previewAnalysis 命中则跳过 Vision AI 调用）
      if (state._uiCache?.previewAnalysis) {
        logger.info('🗃️ visual-parser: 视觉分析缓存命中，跳过 Vision AI 调用');
        state.onProgress?.({
          stage: '视觉分析',
          message: '🗃️ 使用缓存的视觉分析结果（断点续跑免重复分析）',
          status: 'completed',
        });
        const cached = state._uiCache.previewAnalysis;
        const cachedResult = {
          layoutStructure: cached.layoutStructure,
          visualElements: cached.visualElements,
          interactions: cached.interactions || [],
          charts: cached.charts || [],
          chartDataHints: cached.chartDataHints || [],
          headerValidation: cached.headerValidation || {
            headerRightElements: [],
          },
          headerSlotValidation: cached.headerSlotValidation || {
            validatedSlots: [],
            rejectedNodes: [],
            warnings: [],
          },
          headerSlots: cached.headerSlots || [],
          analysisType: cached.analysisType || '',
          analysisTarget: cached.analysisTarget || '',
          analysisDescription: cached.analysisDescription || '',
          analysisEvidence: cached.analysisEvidence || [],
          _uiCacheHit: true,
        };
        // 🛡️ 缓存命中也要做事实校验（2026-09-15）：uiCache 里存的是**加工后**结构，
        // 后处理规则变更（如新增幻觉 section 剔除）对缓存任务永不生效 —— 补跑幂等事实校验。
        // 事实源是实时 Figma 树（state.figmaNodeData），不是缓存里那份。
        return applyHallucinationDrop(cachedResult, state.figmaNodeData);
      }

      // 视觉任务：使用 visionAIConfig（Qwen/DashScope）
      const visionCfg = state.visionAIConfig || state.aiConfig || {};
      const parser = new VisualParser({
        apiKey: visionCfg.apiKey,
        baseURL: visionCfg.baseURL,
        model: visionCfg.model,
        temperature: visionCfg.temperature,
        providerType: visionCfg.providerType,
        providerId: visionCfg.providerId,
        onProgress: state.onProgress,
        onTokenUsage: state.onTokenUsage,
      });

      // 添加可中断超时保护：图层超时会显式 abort 到 Vision 请求层
      const VISUAL_TIMEOUT_MS = 10 * 60 * 1000;
      const runVisualParser = withTimeout(
        (nextState) =>
          parser.execute({
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
      );
      const result = await runVisualParser(state);

      //  Figma 视觉覆盖率硬校验 —— 覆盖率过低说明组件缺乏可靠设计依据
      const figmaCoverageRate = result.coverageReport?.coverageRate;
      state._figmaCoverageRate = figmaCoverageRate ?? null;
      const FIGMA_COVERAGE_WARN_THRESHOLD = parseInt(
        process.env.FIGMA_COVERAGE_WARN_THRESHOLD || '60',
        10,
      );
      if (
        figmaCoverageRate != null &&
        figmaCoverageRate < FIGMA_COVERAGE_WARN_THRESHOLD
      ) {
        state._figmaCoverageWarning = {
          rate: figmaCoverageRate,
          threshold: FIGMA_COVERAGE_WARN_THRESHOLD,
          message: `Figma 视觉覆盖率仅 ${figmaCoverageRate}%（阈值 ${FIGMA_COVERAGE_WARN_THRESHOLD}%），组件缺乏可靠设计依据，生成质量无法保证`,
        };
        logger.warn('⚠️ P2 #3: Figma 视觉覆盖率过低（无设计依据风险）', {
          rate: figmaCoverageRate,
          threshold: FIGMA_COVERAGE_WARN_THRESHOLD,
        });
        if (process.env.FIGMA_COVERAGE_HARD_BLOCK === 'true') {
          state._figmaCoverageBlocked = true;
          logger.warn('🚫 P2 #3: Figma 覆盖率硬阻断已标记', {
            rate: figmaCoverageRate,
          });
        }
      }

      // 🎯 Header关系验证（Priority 7）
      logger.info('开始Header关系验证');
      const headerValidation = HeaderRelationValidator.validate(
        result,
        state.figmaNodeData,
        { componentType: 'vue3' },
      );

      if (headerValidation.headerRightElements.length > 0) {
        logger.info('识别到header-right元素', {
          count: headerValidation.headerRightElements.length,
          confidence: headerValidation.confidence,
          elements: headerValidation.headerRightElements.map((e) => e.name),
        });
      }

      // 🎯 头部插槽验证（基于Y坐标）—重新启用，try/catch 包裹
      let headerSlotValidation = {
        validatedSlots: [],
        rejectedNodes: [],
        warnings: [],
      };
      try {
        logger.info('开始头部插槽验证');
        const figmaConnectorInstance = new FigmaConnector({
          figmaToken: state.figmaToken,
        });
        const headerSlotValidator = new HeaderSlotValidator(
          figmaConnectorInstance,
        );
        headerSlotValidation = headerSlotValidator.validateHeaderSlots(
          state.figmaNodeData,
          result.headerSlots || [],
          { thresholdRatio: 0.3, componentType: 'vue3' },
        );

        if (
          headerSlotValidation.validatedSlots &&
          headerSlotValidation.validatedSlots.length > 0
        ) {
          logger.info('✅ 验证通过的头部插槽', {
            count: headerSlotValidation.validatedSlots.length,
            slots: headerSlotValidation.validatedSlots.map((s) => ({
              type: s.slotType,
              control: s.controlType,
              node: s.figmaNode?.name,
            })),
          });
        }

        if (
          headerSlotValidation.warnings &&
          headerSlotValidation.warnings.length > 0
        ) {
          logger.warn('⚠️ 头部插槽验证警告', {
            warnings: headerSlotValidation.warnings,
          });
        }
      } catch (err) {
        logger.warn('⚠️ 头部插槽验证失败（非阻塞）', { error: err.message });
      }

      // 🎯 headerSlots 契约回写（与微码图同款）：vue3 不消费 base-panel 插槽，
      // 但 state 数据双端一致；derived 结果同时供结构标记/日志链路使用，无 prompt 副作用。
      // 🛡️ C-1（2026-09-02，9c3aff7f）：validator rejectedNodes（Figma 标题同行找不到匹配）
      // 的 vision 越界候选在此剔除，保证双端数据一致。
      const contractSlots = headerSlotValidation?.contractSlots || [];
      const rejectedNodes = headerSlotValidation?.rejectedNodes || [];
      const rewrite = applyHeaderSlotContractRewrite({
        headerSlots: result.headerSlots || [],
        contractSlots,
        rejectedNodes,
      });
      result.headerSlots = rewrite.headerSlots;
      if (rewrite.existingAll > 0 || contractSlots.length > 0) {
        logger.info(
          `✅ headerSlots 契约回写(vue3): vision ${rewrite.existingAll}（纠错后 ${rewrite.visionKept}）+ derived kept=${rewrite.derivedKept} = ${result.headerSlots.length} 个`,
        );
      }

      // 🛡️ Loop 2.1.C（2026-09-10）：header vs content 互斥（figmaNodeId 只落一次）。
      // 同一 node 同时出现在 headerSlots 与 layout.sections（如 header-stats）→ 二选一，
      // 避免 T09 兜底注入后双份渲染。业务交互控件（tab/icon）保留在 slot。
      try {
        const layout = result.layout || result.layoutStructure?.layout;
        const sections = layout?.sections || result.layoutStructure?.sections || [];
        if (result.headerSlots?.length > 0 && sections.length > 0) {
          const exc = resolveNodeExclusivity(result.headerSlots, sections)
          result.headerSlots = exc.slots
          if (layout) {
            layout.sections = exc.sections
          } else if (result.layoutStructure) {
            result.layoutStructure.sections = exc.sections
          }
          if (exc.removedSlots.length > 0 || exc.removedContentNodes.length > 0) {
            logger.info('🛡️ 2.1.C 互斥裁决：剔除重复 node', {
              removedSlots: exc.removedSlots.length,
              removedContentNodes: exc.removedContentNodes.length,
            })
          }
        }
      } catch (excErr) {
        logger.warn('⚠️ 2.1.C 互斥裁决失败（非阻塞）', { error: excErr?.message })
      }

      state.onProgress?.({
        stage: '视觉分析',
        message: '✅ 视觉分析完成',
        status: 'completed',
      });

      // 🛡️ P1: 视觉可信度评估（防止「解析成功但内容矛盾」进入生成）
      const visualTrust = evaluateVisualTrustVerdict(result);
      state._visualTrustVerdict = visualTrust.verdict;
      if (
        visualTrust.verdict === 'conflict' ||
        visualTrust.verdict === 'blocked' ||
        visualTrust.verdict === 'low-coverage'
      ) {
        logger.warn('⚠️ 视觉分析可信度异常，标记降级', {
          verdict: visualTrust.verdict,
          reason: visualTrust.reason,
        });
        state._visualDegraded = true;
        state._visualDegradeReason =
          state._visualDegradeReason ||
          `视觉分析${visualTrust.verdict}: ${visualTrust.reason}`;
      } else if (visualTrust.verdict === 'warning') {
        logger.warn('⚠️ 视觉分析覆盖率不足，保留降级提示', {
          reason: visualTrust.reason,
        });
      }

      //保存视觉分析 checkpoint（断点续跑用）— 结构对齐微码图 visual.json
      state._saveCheckpoint?.('visual', {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        chartDataHints: result.chartDataHints || [],
        headerValidation,
        headerSlotValidation,
        headerSlots: result.headerSlots || [],
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || [],
      });

      return {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        //  Figma 图表数据提示
        chartDataHints: result.chartDataHints || [],
        headerValidation,
        headerSlotValidation,
        //headerSlots：面板头部插槽信息（供 microcode-engineer 使用）
        headerSlots: result.headerSlots || [],
        // 顶层组件类型信息
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || [],
        // 视觉可信度 verdict 透传（trusted/warning/conflict/blocked）
        _visualTrustVerdict:
          visualTrust?.verdict || state._visualTrustVerdict || null,
        //  P0-3: 视觉分析降级标志透传（视觉超时→Figma 兜底 或 完全降级）
        _visualDegraded: result.degraded === true,
        _visualLayoutSource:
          result.layoutSource ||
          (result.layoutStructure && result.layoutStructure.layoutSource) ||
          null,
        _visualDegradeReason:
          result.degradeReason ||
          (result.layoutStructure && result.layoutStructure.degradeReason) ||
          null,
      };
    } catch (error) {
      logger.error('视觉分析失败', { error: error.message });
      state.onProgress?.({
        stage: '视觉分析',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  // 节点 5: Vue3 Engineer - 生成/修订代码
  // 说明：节点名沿用 'microcode-engineer' 以兼容既有边/条件路由（节点 ID 仅内部标识），
  // 但 header 日志明确显示 'Vue3 Engineer'，避免与 mc 任务混淆。内部实际跑 Vue3Engineer。
  // ========================================
  graph.addNode('microcode-engineer', async (state) => {
    const iteration = state.iterationCount || 0;
    const action = iteration === 0 ? '生成' : '修订';

    logger.info(`节点: Vue3 Engineer - ${action}代码 (第${iteration + 1}轮)`);

    // Shadow 模式：运行 Context Assembler 收集诊断；接管成功后把裁决事实写回 state，
    // 使 engineer 的 generationInput 成为一等公民字段（单一事实源，下游只读不再推断）。
    const shadowReport = await runGenerationContextShadow(state, {
      pipeline: 'vue3',
      logger,
      iteration,
    });
    if (shadowReport?.generationInput && !shadowReport.error) {
      state.generationInput = shadowReport.generationInput;
    }

    state.onProgress?.({
      stage: '代码生成',
      message: `⚙️ 正在${action}组件代码...`,
      status: 'running',
    });

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {};
      // 渲染器：Vue3 组件固定使用 Vue3Engineer（面板头部/背景真实还原，产物为标准 SFC）
      const EngineerClass = Vue3Engineer;
      const engineer = new EngineerClass({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
      });

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
        figmaStyleTree: state.figmaStyleTree,
        // 1-1 接入：生成上下文值对象（档位/类型/资源映射成为一等公民字段）
        ctx: new GenerationContext({
          tier: state.generationTier || 'max',
          componentType: state.target,
          componentId: state.sessionId,
          groupId: state.groupId,
          sessionId: state.sessionId,
          sourceType: state.sourceType,
          resourceDomMapping: state.resourceDomMapping,
        }),
        figmaNodeData: state.figmaNodeData,
        styleMappings: state.styleMappings,
        assets: state.assets,
        resourceDomMapping: state.resourceDomMapping,
        //面板类型（必须在代码中使用对应 panelKey）
        panelType:
          state.panelType || state._v3Config?.panelType || 'default-panel',
        //headerSlots：面板头部插槽信息
        headerSlots: state.headerSlots || [],
        //L0-B 重试修复指导
        _l0CodeRetryGuidance: state._l0CodeRetryGuidance,
        //技术栈提示
        techStackHints: state.techStackHints,
        // 🧠 自优化：历史模式驱动的 Prompt 增强
        _selfOptimization: state._selfOptimization,
        //  per-element 样式映射（来自 Style Mapper）
        elementStyleMap: state.styleMappings?.elementStyleMap,
        //面板明暗主题（用于 theme-vars.less 默认主题）
        backgroundBrightness:
          state.visualElements?.backgroundBrightness ||
          state.layoutStructure?.styles?.backgroundBrightness ||
          'dark',
        //暂停检查回调（由 phase2.service 注入，每个分块前调用）
        pauseChecker: state.pauseChecker || null,
        onFilesReady: state.onFilesReady || null,
        // SSE 进度回调（文件生命周期追踪通过 { fileLifecycle } 标记路由）
        onProgress: state.onProgress || null,
        //  按问题类别只修目标文件（部分修订）
        generatedFiles: state.generatedFiles,
        targetFiles: state._reviseFiles,
        reviseTarget: state._reviseTarget,
        //子组件强制清单（来自 subcomponent-planner 节点；isForced=true 时 prompt 强约束 LLM import）
        subComponentPlan: state.subComponentPlan,
        // 🛡️ 资源归属指导（方案5）：上一轮漏用背景时，本轮注入归属指导。
        _attributionGuidance: state._attributionGuidance || null,
      });

      state.onProgress?.({
        stage: '代码生成',
        message: `✅ 代码${action}完成`,
        status: 'completed',
      });

      return {
        generatedFiles: result.writtenFiles,
        componentStructure: result.componentStructure,
        // L0-B 重试计数由 code-structure-validator 节点负责（失败才 +1、通过即重置），
        // engineer 不再无条件自增，避免首次失败即耗尽预算（off-by-one）且跨轮累积。
        //  P0-2: 结构顺序门禁重试标记（engineer 已按 retryGuidance 重排区块）
        _structureOrderRetried:
          state._structureOrderRetried ||
          state._structureOrderResult?.detected === true,
        // 🛡️ 资源归属指导写回 state，供下一轮重试注入。
        _attributionGuidance:
          result._attributionGuidance || state._attributionGuidance || null,
      };
    } catch (error) {
      logger.error('代码生成失败', { error: error.message });
      state.onProgress?.({
        stage: '代码生成',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  // 节点 5c: Style Refiner - 样式精修（执行CSS样式修改）
  // ========================================
  graph.addNode('style-refiner', async (state) => {
    logger.info('节点: Style Refiner - 样式精修');

    state.onProgress?.({
      stage: '样式精修',
      message: '🎨 正在精修CSS样式（颜色/字体/阴影/圆角）...',
      status: 'running',
    });

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
      });

      // 精修部分修订 —— 非 full 修订时，只把 critique 指定的文件/类交给 refiner 局部修改
      const _rt =
        state._reviseTarget &&
        state._reviseTarget !== 'full' &&
        state.checkResult
          ? resolveTargetFiles(state.checkResult, state.generatedFiles, {
              mainComponentFile: 'package/index.vue',
            })
          : null;
      const refineTargetFiles = _rt?.hasTargets
        ? Array.from(_rt.targetFiles)
        : null;
      const refineTargetClassNames = _rt?.targetClassNames?.length
        ? _rt.targetClassNames
        : null;
      if (refineTargetFiles) {
        logger.info('🎯 #5: 样式精修仅处理目标文件', {
          files: refineTargetFiles,
          classes: refineTargetClassNames,
        });
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
      });

      await postRefineResourceImportGuard(
        state.outputPath,
        state.resourceDomMapping,
        'vue3',
        logger,
      );

      state.onProgress?.({
        stage: '样式精修',
        message: result.refined
          ? `✅ 样式精修完成 (${result.modifiedFiles.length}个文件)`
          : `⚠️ 样式精修跳过: ${result.reason || '无修改'}`,
        status: 'completed',
      });

      return {
        styleRefineResult: result,
      };
    } catch (error) {
      logger.error('样式精修失败', { error: error.message });
      state.onProgress?.({
        stage: '样式精修',
        message: `⚠️ 样式精修失败: ${error.message}（流程继续）`,
        status: 'warning',
      });
      return {
        styleRefineResult: { refined: false, reason: error.message },
      };
    }
  });

  // ========================================
  // 节点 6: Adversarial Checker - 对抗性检查 (越权检测)
  // ========================================
  graph.addNode('adversarial-checker', async (state) => {
    logger.info('节点: Adversarial Checker - 对抗性检查', {
      _reviseTarget: state._reviseTarget,
      hasPreRefineFiles: !!state.preRefineFiles,
    });

    state.onProgress?.({
      stage: '质量检查',
      message: '🔍 正在进行对抗性代码检查...',
      status: 'running',
    });

    try {
      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const checker = new AdversarialChecker({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        onProgress: state.onProgress,
      });

      // revision 迭代仅将变更文件完整发送给 LLM；本地检查仍读取完整文件。
      let changedFileNames = null;
      if (state.iterationCount > 0 && state.preRefineFiles) {
        const currentFiles = readRevisionSnapshot(
          state.generatedFiles,
          state.outputPath,
        );
        const changeStats = computeChangedFilePaths(
          currentFiles,
          state.preRefineFiles,
        );
        // Checker 内部按短名（basename）比对，这里把完整相对路径映射为短名。
        changedFileNames = new Set(
          [...changeStats.changedFilePaths].map((p) => p.split('/').pop()),
        );
        logger.info('📊 #354b: 变更检测完成', {
          changed: changedFileNames.size,
          unchanged: changeStats.unchangedCount,
          total: changeStats.totalCount,
        });
      }

      //总超时保护：adversarial-checker 最多允许 8 分钟（含 LLM 5min + 重试 + 本地检查）
      const ADVERSARIAL_TOTAL_TIMEOUT = 8 * 60 * 1000;
      const runAdversarialChecker = withTimeout(
        (nextState) =>
          checker.execute({
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
            changedFileNames, // 变更文件集合
            cachedSfcFacts: nextState._sfcFactsCache, //  SFC 事实缓存（revision 轮复用）
            cachedSfcFactsHash: nextState._sfcFactsHash,
            onProgress: nextState.onProgress,
            signal: nextState.signal || nextState.__abortSignal || null,
            requestConcurrency: nextState.requestConcurrency,
            requestQueueTimeoutMs: nextState.requestQueueTimeoutMs,
            requestTimeoutMs: nextState.requestTimeoutMs,
            requestMaxRetries: nextState.requestMaxRetries,
            l0bPassed: nextState.codeValidationResult?.pass === true, // ③ L0-B PASS 时跳过 adversarial LLM
          }),
        ADVERSARIAL_TOTAL_TIMEOUT,
        { nodeName: 'adversarial-checker', onProgress: state.onProgress },
      );

      let result;
      try {
        result = await runAdversarialChecker(state);
      } catch (raceError) {
        if (
          raceError.code === 'NODE_EXEC_TIMEOUT' ||
          raceError.message.includes('总超时')
        ) {
          logger.warn('⚠️ 对抗性检查总超时，返回安全兜底结果让流程继续', {
            error: raceError.message,
          });
          result = {
            checkResult: 'pass',
            qualityScore: 70, // 低于 qualityScoreThreshold(90)，不会触发提前退出
            complexity: 'simple', //超时兜底保守预估为 simple（避免高成本路由）
            critiques: [],
            issueCategories: {},
            recommendations: [],
            summary: '对抗性检查因超时跳过（安全兜底）',
            authorizationViolation: null,
          };
        } else {
          throw raceError;
        }
      }

      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 质量检查完成 (评分: ${result.qualityScore})${result.authorizationViolation?.violation ? ' | ⚠️ 检测到越权修改' : ''}`,
        status: 'completed',
      });

      //预启动截图任务：与图引擎调度并行执行
      if (state.outputPath) {
        const _sid = state.sessionId || state.componentName || 'unknown';
        const _tgt = state.target || 'vue3';
        const _groupId = state.groupId || 'default-group';
        const _outputPath = state.outputPath;
        const _previewImage = state.previewImage || null;
        const _onProgress = state.onProgress;
        const _componentName = state.componentName;

        const _screenshotPromise = (async () => {
          const startTime = Date.now();
          try {
            await publishQualityPreview({
              outputPath: _outputPath,
              componentId: _sid,
              groupId: _groupId,
              target: _tgt,
            });
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
            });
            const duration = Date.now() - startTime;
            logger.info('✅ 预启动截图任务完成', {
              sessionId: _sid,
              durationMs: duration,
            });
            return r;
          } catch (e) {
            const duration = Date.now() - startTime;
            logger.warn('预启动截图任务失败（非阻塞）', {
              error: e.message,
              sessionId: _sid,
              durationMs: duration,
            });
            return {
              renderedImage: null,
              isStaticFallback: false,
              runtimeGate: null,
            };
          }
        })();

        return {
          checkResult: result,
          _screenshotPromise, //预启动的截图Promise
        };
      }

      return {
        checkResult: result,
      };
    } catch (error) {
      logger.error('质量检查失败', { error: error.message });
      state.onProgress?.({
        stage: '质量检查',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  // 节点 6b: Runtime Preview Gate - 发布当前迭代产物并执行真实运行时硬门禁
  // ========================================
  graph.addNode('runtime-preview-gate', async (state) => {
    logger.info('节点: Runtime Preview Gate - Vue3 真实预览检查');
    const sessionId = state.sessionId || state.componentName || 'unknown';
    const outputPath = state.outputPath;

    try {
      if (!outputPath) throw new Error('缺少 outputPath');

      //检查是否有预启动的截图任务
      const screenshotPromise = state._screenshotPromise;
      let renderedImage, isStaticFallback, runtimeGate, visualFidelity;

      if (screenshotPromise) {
        logger.info('⏳ 等待预启动的截图任务完成...');
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: '⏳ 等待组件截图完成...',
          status: 'running',
        });
        const result = await screenshotPromise;
        logger.info('✅ 预启动截图任务已完成');
        renderedImage = result.renderedImage;
        isStaticFallback = result.isStaticFallback;
        runtimeGate = result.runtimeGate;
        visualFidelity = result.visualFidelity;
      } else {
        logger.info('📷 无预启动任务,同步执行截图...');
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: '📷 渲染组件截图...',
          status: 'running',
        });

        await publishQualityPreview({
          outputPath,
          componentId: sessionId,
          groupId: state.groupId || 'default-group',
          target: 'vue3',
        });

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
        });
        renderedImage = result.renderedImage;
        isStaticFallback = result.isStaticFallback;
        runtimeGate = result.runtimeGate;
        visualFidelity = result.visualFidelity;
      }

      let visualComparisonReport = null;
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
        });
        const visionCfg = state.visionAIConfig || state.aiConfig || {};
        const comparator = new VisualComparator({
          apiKey: visionCfg.apiKey,
          model: visionCfg.model,
          baseURL: visionCfg.baseURL,
          temperature: visionCfg.temperature,
          providerType: visionCfg.providerType,
          providerId: visionCfg.providerId,
          onTokenUsage: state.onTokenUsage,
          similarityThreshold: getVisualSimilarityThreshold(),
        });
        visualComparisonReport = await comparator.compare(
          state.previewImage,
          renderedImage,
          {
            signal: state.signal || state.__abortSignal || null,
            onProgress: state.onProgress,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
            requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
          },
        );
        state.onProgress?.({
          stage: '视觉质量门禁',
          message: `视觉相似度 ${visualComparisonReport.overallSimilarity}/100${visualComparisonReport.pass ? '，检查通过' : '，需要继续优化'}`,
          status: visualComparisonReport.pass ? 'completed' : 'warning',
        });
      }

      emitMetrics('runtime-preview-gate', {
        status: runtimeGate?.status || 'BLOCK',
        issueCount: runtimeGate?.issues?.length || 0,
        hasRenderedImage: !!renderedImage,
        isStaticFallback: !!isStaticFallback,
        visualSimilarity: visualComparisonReport?.overallSimilarity ?? null,
        visualPass: visualComparisonReport?.pass ?? false,
      });
      state.onProgress?.({
        stage: '运行时质量门禁',
        message:
          runtimeGate?.status === 'PASS'
            ? 'Vue3 真实预览加载与渲染检查通过'
            : `Vue3 真实预览检查未通过（${runtimeGate?.issues?.length || 1} 项阻断问题）`,
        status: runtimeGate?.status === 'PASS' ? 'completed' : 'warning',
      });

      return {
        renderedImage,
        renderedImageIsStaticFallback: isStaticFallback,
        runtimeGate,
        visualComparisonReport,
        visualFidelity,
      };
    } catch (error) {
      const runtimeGate = {
        status: 'BLOCK',
        issues: [
          {
            id: 'RUNTIME-000',
            severity: 'BLOCK',
            category: 'preview-publish',
            message: `运行时预览准备失败: ${error.message}`,
            evidence: { stack: error.stack || '' },
          },
        ],
        isStaticFallback: false,
      };
      logger.error('Vue3 Runtime Preview Gate 失败', { error: error.message });
      return {
        renderedImage: null,
        renderedImageIsStaticFallback: false,
        runtimeGate,
      };
    }
  });

  // ========================================
  // 节点 7: 决策节点 - L2 智能路由
  // ========================================
  graph.addNode('revision-decision', async (state) => {
    const { checkResult, iterationCount, maxIterations } = state;

    const runtimeGate = state.runtimeGate;
    if (runtimeGate?.status === 'WARN' && runtimeGate?.warning) {
      logger.warn('Vue3 运行时质量门禁告警已降级，不进入修订', {
        warning: runtimeGate.warning,
      });
      state.onProgress?.({
        stage: '运行时质量门禁',
        message: runtimeGate.warning.message,
        status: 'warning',
      });
      return {
        needsRevision: false,
        violationCount: state.violationCount || 0,
      };
    }
    if (runtimeGate?.status === 'BLOCK') {
      const canReviseRuntime = iterationCount < maxIterations;
      const runtimeDecision = evaluateRuntimeGate(runtimeGate);
      const issueSummary = runtimeDecision.reason;

      if (runtimeDecision.action === 'fail') {
        const error = new Error(`运行时质量门禁阻断: ${issueSummary}`);
        error.code = 'RUNTIME_QUALITY_GATE_BLOCKED';
        error.runtimeGate = runtimeGate;
        throw error;
      }

      if (runtimeDecision.action === 'complete_with_warning') {
        const warning = runtimeGate.warning || {
          code: 'RUNTIME_GATE_WARNING',
          type: 'runtime-gate-warning',
          message: `运行时存在非阻断问题，已按告警完成: ${issueSummary}`,
          details: runtimeGate.issues || [],
        };
        runtimeGate.status = 'WARN';
        runtimeGate.warning = warning;
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: warning.message,
          status: 'warning',
        });
        return {
          needsRevision: false,
          violationCount: state.violationCount || 0,
        };
      }

      if (!canReviseRuntime) {
        const warning = {
          code: 'RUNTIME_INCREMENTAL_EXHAUSTED',
          type: 'runtime-incremental-exhausted',
          message: `运行时存在可增量修复问题，但已达最大修订次数，按告警完成: ${issueSummary}`,
          details: runtimeGate.issues || [],
        };
        runtimeGate.status = 'WARN';
        runtimeGate.warning = warning;
        state.onProgress?.({
          stage: '运行时质量门禁',
          message: warning.message,
          status: 'warning',
        });
        return {
          needsRevision: false,
          violationCount: state.violationCount || 0,
        };
      }

      logger.warn('Vue3 运行时质量门禁未通过，进入增量修订', {
        iterationCount,
        maxIterations,
        issues: runtimeGate.issues,
        runtimeDecision,
      });
      state.onProgress?.({
        stage: '迭代修订',
        message: `运行时存在非致命问题，进入第 ${iterationCount + 2} 轮增量修订`,
        status: 'warning',
      });
      const revisionGuidance =
        runtimeDecision.revisionGuidance ||
        buildRuntimeRevisionGuidance(runtimeGate);
      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount: state.violationCount || 0,
        _reviseTarget: revisionGuidance.reviseTarget || 'layout',
        _runtimeRevisionGuidance: revisionGuidance,
        _lastRoutingReason: `运行时增量修订(${revisionGuidance.scope || 'runtime'}): ${issueSummary}`,
        _noMoreIterations: false,
      };
    }

    //  提取 issueCategories（adversarial-checker 新增输出）
    const categories = checkResult?.issueCategories || {};
    const critiques = Array.isArray(checkResult?.critiques)
      ? checkResult.critiques
      : [];
    const hasHighCritique = critiques.some((item) => item?.severity === 'high');
    const visualReport = state.visualComparisonReport;
    const visualAvailable = !!visualReport && !visualReport.degraded;
    const hasVisualHighIssue =
      visualReport?.issues?.some((item) => item?.severity === 'high') ?? false;
    const visualNeedsRevision =
      !visualAvailable || visualReport.pass !== true || hasVisualHighIssue;

    //  越权降级检测
    const hasViolation = checkResult?.authorizationViolation?.violation;
    const violationCount = (state.violationCount || 0) + (hasViolation ? 1 : 0);

    logger.info('节点:L2 智能路由决策', {
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
    });

    // 只有文本结论、严重问题和真实视觉比对同时通过，才允许提前完成。
    const qualityScoreThreshold = state._v3Config?.qualityScoreThreshold ?? 90;
    const qualityScore = checkResult?.qualityScore || 0;
    const checkerPassed = checkResult?.checkResult !== 'needs_revision';
    if (
      qualityScore >= qualityScoreThreshold &&
      checkerPassed &&
      !hasHighCritique &&
      violationCount === 0 &&
      !visualNeedsRevision
    ) {
      logger.info(
        `✅ qualityScore >= ${qualityScoreThreshold}，且文本/视觉质量门禁均通过，提前退出迭代`,
      );
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 质量分数已达标 (>= ${qualityScoreThreshold})，完成生成`,
        status: 'completed',
      });
      return {
        needsRevision: false,
        violationCount,
      };
    }

    // 复杂度自动路由 — 提取 adversarial-checker 评估的复杂度
    const complexity = checkResult?.complexity || 'medium';

    //单次精修标记：上次简单组件精修后，本轮直接完成不循环
    if (
      state._noMoreIterations &&
      checkerPassed &&
      !hasHighCritique &&
      !visualNeedsRevision
    ) {
      logger.info(
        `🛑 简单组件单次精修已完成，且文本/视觉质量门禁均通过 (complexity=${complexity})`,
      );
      return {
        needsRevision: false,
        violationCount,
        _noMoreIterations: false,
      };
    }

    //simple 组件降低提前退出阈值（75→70，可配置）
    const simpleExitThreshold = state._v3Config?.simpleExitThreshold || 70;
    if (
      complexity === 'simple' &&
      qualityScore >= simpleExitThreshold &&
      checkerPassed &&
      !hasHighCritique &&
      !visualNeedsRevision
    ) {
      logger.info(
        `✅ #354a: 简单组件 qualityScore=${qualityScore}，且文本/视觉质量门禁均通过，跳过精修直接完成`,
      );
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 简单组件质量达标 (>= ${simpleExitThreshold})，完成生成`,
        status: 'completed',
      });
      return { needsRevision: false, violationCount };
    }

    // 任一门禁要求修订，都不能因为单项分数达标而被覆盖。
    const needsRevision =
      checkResult?.checkResult === 'needs_revision' ||
      hasHighCritique ||
      visualNeedsRevision;
    const canRevise = iterationCount < maxIterations;

    if (needsRevision && canRevise) {
      //  越权降级策略（连续 2 次 → 强制 full）
      if (violationCount >= 2) {
        logger.warn(
          `⚠️ 连续 ${violationCount} 次越权修改，强制降级到 microcode-engineer (full)`,
        );
        state.onProgress?.({
          stage: '迭代修订',
          message: `🔴 连续${violationCount}次越权，强制全量重做`,
          status: 'warning',
        });
        return {
          needsRevision: true,
          iterationCount: iterationCount + 1,
          violationCount: 0, // 重置计数器
          _reviseTarget: 'full', // ✅ 修复：作为新字段返回，避免状态突变
        };
      }

      //  按问题类型精准路由
      let target = 'microcode-engineer'; // 默认全量
      let reason = '全量修订';
      let _reviseTarget = 'full'; // 默认全量修订

      // 如果有越权但未达降级阈值，也强制走 engineer
      if (hasViolation) {
        target = 'microcode-engineer';
        reason = `越权修改: ${checkResult.authorizationViolation.message}`;
        _reviseTarget = 'full';
      } else if (categories.compliance && categories.compliance.length > 0) {
        target = 'microcode-engineer';
        reason = `合规问题: ${categories.compliance.join(', ')}`;
        _reviseTarget = 'full';
      } else if (categories.structural && categories.structural.length > 0) {
        target = 'microcode-engineer';
        reason = `结构问题: ${categories.structural.join(', ')}`;
        _reviseTarget = 'structural';
      } else if (categories.stylistic && categories.stylistic.length > 0) {
        target = 'style-refiner';
        reason = `纯样式问题: ${categories.stylistic.join(', ')}`;
        _reviseTarget = 'stylistic';
      } else if (visualNeedsRevision) {
        target = 'parallel-refine';
        reason = visualAvailable
          ? `视觉比对未通过: 相似度 ${visualReport.overallSimilarity}/100，${visualReport.issues?.length || 0} 项差异`
          : '缺少可用的真实视觉比对结果';
        _reviseTarget = 'layout';
      } else if (categories.layout && categories.layout.length > 0) {
        target = 'parallel-refine';
        reason = `纯布局问题: ${categories.layout.join(', ')}`;
        _reviseTarget = 'layout';
      }

      //同目标重试计数器（防止精准路由循环）
      const retryCountByTarget = state.retryCountByTarget || {};
      const currentRetryCount = (retryCountByTarget[target] || 0) + 1;
      retryCountByTarget[target] = currentRetryCount;

      // 降级策略：同一目标连续失败2次 → 强制全量重做
      if (currentRetryCount >= 2 && target !== 'microcode-engineer') {
        logger.warn(
          `⚠️ ${target} 连续失败 ${currentRetryCount} 次，降级为全量修订`,
        );
        target = 'microcode-engineer';
        _reviseTarget = 'full';
        reason = `精准路由无效（${reason}），降级为全量修订`;
        retryCountByTarget[target] = 0; // 重置计数器
      }

      logger.info(`L2 路由决定: → ${target} (${reason})`, {
        retryCount: currentRetryCount,
        retryCountByTarget,
      });

      state.onProgress?.({
        stage: '迭代修订',
        message: `⚠️ 第${iterationCount + 2}轮: ${reason}`,
        status: 'running',
      });

      // 简单组件单次精修后标记不再循环（score≥50 允许一轮，<50 正常迭代）
      const _noMoreIterations = complexity === 'simple' && qualityScore >= 50;
      if (_noMoreIterations) {
        logger.info(
          `🔄 #354a: 简单组件走单次精修 (score=${qualityScore})，精修后直接完成`,
        );
      }

      //  按问题类别只修目标文件 —— 非 full 修订且已解析到具体文件时，
      // 计算 targetFiles，让 Engineer 只重新生成被 critique 实际引用的文件，其余从磁盘保留。
      let _reviseFiles = null;
      if (
        _reviseTarget &&
        _reviseTarget !== 'full' &&
        target === 'microcode-engineer'
      ) {
        const tf = resolveTargetFiles(checkResult, state.generatedFiles, {
          mainComponentFile: 'package/index.vue',
        });
        if (tf.hasTargets) {
          _reviseFiles = Array.from(tf.targetFiles);
          logger.info('🎯 P1: 按类别只修目标文件', {
            target,
            files: _reviseFiles,
          });
        }
      }

      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount,
        _reviseTarget, // ✅ 修复：作为新字段返回，避免状态突变
        _reviseFiles, //  仅重做这些文件，其余从磁盘保留
        retryCountByTarget, //追踪同目标重试次数
        _noMoreIterations, // 简单组件单次精修后不再循环
      };
    }

    if (needsRevision && !canRevise) {
      const reasons = [];
      if (checkResult?.checkResult === 'needs_revision')
        reasons.push('质量检查仍要求修订');
      if (hasHighCritique) reasons.push('仍存在 high 级问题');
      if (!visualAvailable) reasons.push('缺少可用的视觉比对结果');
      else if (!visualReport.pass)
        reasons.push(`视觉相似度 ${visualReport.overallSimilarity}/100 未达标`);
      const error = new Error(
        `视觉质量门禁阻断: 已达最大修订次数，${reasons.join('；') || '质量仍未达标'}`,
      );
      error.code = 'VISUAL_QUALITY_GATE_BLOCKED';
      error.visualComparisonReport = visualReport || null;
      error.checkResult = checkResult || null;
      state.onProgress?.({
        stage: '视觉质量门禁',
        message: error.message,
        status: 'failed',
      });
      throw error;
    }

    return { needsRevision: false };
  });

  // ========================================
  // 节点 8: 完成（增强）
  // ========================================
  graph.addNode('complete', async (state) => {
    logger.info('节点: Figma阶段完成');

    // 🎯 2026-09-14 治本⑤：运行时门禁降级可见化（与 phase2 图 complete 节点同款）。
    // 降级放行时产物未经真实渲染验证，必须写进 component-meta.json 让 UI 可见，不再静默。
    if (state.outputPath && state.runtimeGate) {
      try {
        const { readFileSync, writeFileSync, existsSync } = await import('fs');
        const { join } = await import('path');
        const metaPath = join(state.outputPath, 'component-meta.json');
        let prevMeta = {};
        try {
          prevMeta = existsSync(metaPath)
            ? JSON.parse(readFileSync(metaPath, 'utf-8'))
            : {};
        } catch (_) {
          /* 旧 meta 损坏则重建 */
        }
        const runtimeVerified = !state._runtimeGateDowngraded;
        // 6-A: nodeColorIndex 写进 component-meta.json（确定性颜色事实源，供后续 6-B 装配消费）
        const nodeColorIndexPlain = state.nodeColorIndex
          ? Object.fromEntries(state.nodeColorIndex instanceof Map ? state.nodeColorIndex : Object.entries(state.nodeColorIndex))
          : undefined;

        const nextMeta = {
          ...prevMeta,
          runtimeVerified,
          // 7-A: visualFidelity — 用 ?? 防止 parallel-quality-check 的 undefined 覆盖 visual-comparator 的有效值
          ...(state.visualFidelity != null ? { visualFidelity: state.visualFidelity } : {}),
          // 6-A: nodeColorIndex
          ...(nodeColorIndexPlain && Object.keys(nodeColorIndexPlain).length > 0 ? { nodeColorIndex: nodeColorIndexPlain } : {}),
          ...(runtimeVerified
            ? {}
            : {
                runtimeGateDowngradedAt: Date.now(),
                runtimeGateIssues: (state.runtimeGate?.issues || []).map(
                  (i) => ({ id: i.id, severity: i.severity, message: i.message }),
                ),
                runtimeGateNote:
                  '运行时门禁降级放行（如真实预览页不可达）：产物未经真实渲染验证',
              }),
        };
        writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2), 'utf-8');
        if (!runtimeVerified) {
          logger.warn('🩹 运行时门禁降级已留痕 component-meta.json', {
            issues: nextMeta.runtimeGateIssues?.length || 0,
          });
        }
      } catch (metaErr) {
        logger.warn('⚠️ 运行时验证标记写入失败（非阻断）', {
          error: metaErr?.message || String(metaErr),
        });
      }
    }

    // 🎯 2026-09-14 治本①②：section 内容映射守卫（左右序 + 内容错装），与 phase2 图同款。
    // 🛡️ 阶段 C（2026-09-15 序 5）：高置信 duplicateTextIssues 确定性自愈。
    try {
      const {
        checkSectionContent,
        healDuplicateTextIssues,
      } = await import('../utils/section-content-guard.js');
      const { validateVueSfc } = await import('../utils/sfc-syntax-validation.js');
      const { readdirSync: _rds, readFileSync: _rfs, existsSync: _ex, writeFileSync: _wfs3 } = await import('fs');
      const { join: _j } = await import('path');
      const compDir = _j(state.outputPath, 'package', 'components');
      const files = [];
      if (_ex(compDir)) {
        for (const name of _rds(compDir)) {
          if (!name.endsWith('.vue')) continue;
          files.push({ path: `package/components/${name}`, content: _rfs(_j(compDir, name), 'utf-8') });
        }
      }
      const figmaRootForGuard =
        state.figmaNodeData ||
        state._uiCache?.figmaNodeData ||
        state._visualParserCache?.figmaNodeData;
      const contentCheck = checkSectionContent({
        files,
        plan: state.subComponentPlan,
        figmaRoot: figmaRootForGuard,
      });
      if (contentCheck.duplicateTextIssues.length > 0) {
        const healResult = healDuplicateTextIssues({
          files,
          plan: state.subComponentPlan,
          figmaRoot: figmaRootForGuard,
          validateSfc: (c, p) => validateVueSfc(c, p),
        });
        if (healResult.healed.length > 0) {
          for (const h of healResult.healed) {
            for (const wp of h.removedFrom) {
              const rec = healResult.files.find((f) => f.path === wp);
              if (rec && typeof rec.content === 'string') {
                try { _wfs3(_j(state.outputPath, wp), rec.content, 'utf-8'); } catch (_) {}
              }
            }
          }
          logger.warn('🩹 内容映射守卫：高置信重复文本已确定性自愈', {
            healed: healResult.healed.map((h) => ({ text: h.text, removedFrom: h.removedFrom })),
          });
        }
      }
      if (
        contentCheck.memberOrderIssues.length > 0 ||
        contentCheck.duplicateTextIssues.length > 0
      ) {
        const metaPath = _j(state.outputPath, 'component-meta.json');
        let prev = {};
        try { prev = _ex(metaPath) ? JSON.parse(_rfs(metaPath, 'utf-8')) : {}; } catch (_) {}
        const { writeFileSync: _wfs } = await import('fs');
        _wfs(metaPath, JSON.stringify({ ...prev, contentMappingIssues: { memberOrderIssues: contentCheck.memberOrderIssues, duplicateTextIssues: contentCheck.duplicateTextIssues, checkedAt: Date.now() } }, null, 2), 'utf-8');
        logger.warn('🩹 内容映射守卫发现问题（左右序/内容错装，已留痕）', {
          memberOrderIssues: contentCheck.memberOrderIssues.length,
          duplicateTextIssues: contentCheck.duplicateTextIssues.length,
        });
        state.onProgress?.({
          stage: '内容映射校验',
          message: `⚠️ 内容映射守卫：${contentCheck.memberOrderIssues.length} 处左右序异常、${contentCheck.duplicateTextIssues.length} 处文本重复/错装`,
          status: 'warning',
        });
      }
    } catch (contentGuardErr) {
      logger.warn('⚠️ 内容映射守卫执行失败（非阻断）', {
        error: contentGuardErr?.message || String(contentGuardErr),
      });
    }

    // 🧹 孤儿组件检测与清理
    logger.info('开始孤儿组件检测');
    state.onProgress?.({
      stage: '代码清理',
      message: '🧹 检测并清理孤儿组件...',
      status: 'running',
    });

    const orphanDetectionResult = await OrphanComponentDetector.detect(
      state.outputPath,
    );

    if (orphanDetectionResult.deleted.length > 0) {
      logger.info('已清理孤儿组件', {
        count: orphanDetectionResult.deleted.length,
        files: orphanDetectionResult.deleted,
      });
    }

    // 🔍 Less 变量完整性检查
    logger.info('开始 Less 变量检查');
    state.onProgress?.({
      stage: '样式检查',
      message: '🔍 检查 Less 变量完整性...',
      status: 'running',
    });

    const lessVariableResult = await LessVariableChecker.check(
      state.outputPath,
    );

    if (lessVariableResult.fixed) {
      logger.info('已自动修复 Less 变量', {
        missingCount: lessVariableResult.missingVariables.length,
        variables: lessVariableResult.missingVariables,
      });
    }

    // complete 阶段所有后处理完成后，从磁盘重新读取并执行最终 LESS 编译门禁。
    const finalLessCompileResult = await LessCompileGate.validateDirectory(
      state.outputPath,
    );
    if (!finalLessCompileResult.pass) {
      const diagnostic = finalLessCompileResult.diagnostics.find(
        (item) => item.severity === 'BLOCK',
      );
      const error = new Error(
        `最终 LESS 编译门禁阻断: ${diagnostic?.file || 'unknown'}:${diagnostic?.line || 1}:${diagnostic?.column || 1} ${diagnostic?.message || 'LESS 编译失败'}`,
      );
      error.code = 'LESS_COMPILE_GATE_BLOCKED';
      error.lessCompileGate = finalLessCompileResult;
      throw error;
    }
    logger.info('✅ 最终 LESS 编译门禁通过', {
      checkedFiles: finalLessCompileResult.checkedFiles.length,
    });

    //  Scoped 合规最终确认
    logger.info('开始最终 scoped 合规检查');
    state.onProgress?.({
      stage: '合规确认',
      message: '✅ 确认样式标准符合度...',
      status: 'running',
    });

    // 读取生成的文件做最终扫描
    const fs = await import('fs');
    const { join } = await import('path');
    let scopedCompliant = true;

    try {
      if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
        for (const f of state.generatedFiles) {
          if (f.endsWith('.vue')) {
            const fullPath = join(state.outputPath, f);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              if (!hasScopedLessStyle(content)) {
                logger.warn(
                  `🚨 最终扫描: ${f} 缺少 <style lang="less" scoped>`,
                );
                scopedCompliant = false;
              }
            } catch (e) {
              // 文件可能不存在，跳过
            }
          }
        }
      }
    } catch (e) {
      logger.warn('最终扫描失败（非阻塞）', { error: e.message });
    }

    if (scopedCompliant) {
      logger.info('✅ 最终扫描: scoped 合规通过');
    }

    const duration = Date.now() - state.startTime;
    const durationSec = (duration / 1000).toFixed(1);

    // 🧠 v3.0 自优化：记录本次运行 metrics（供下次运行分析）
    try {
      recordRun({
        componentName: state.componentName,
        fileKey: state.fileKey,
        nodeId: state.nodeId,
        totalDuration: duration,
        finalQualityScore:
          state.checkResult?.qualityScore ||
          state.adversarialResult?.qualityScore ||
          0,
        visualSimilarity:
          state.visualComparisonReport?.overallSimilarity ?? null,
        iterationCount: (state.iterationCount || 0) + 1,
        routingEvents: state._routingEvents || [],
        l0Result: state.validationResult
          ? {
              pass: state.validationResult.pass,
              issues: state.validationResult.issues?.length || 0,
            }
          : null,
        issueCategories:
          state.checkResult?.issueCategories ||
          state.adversarialResult?.issueCategories ||
          {},
        v3Mode: state._v3Mode,
        scopedCompliant,
        violationCount: state.violationCount || 0,
        selfOptimizationApplied: !!state._selfOptimization?.promptAugmentation,
      });
      emitMetrics('complete', {
        durationMs: duration,
        scored: true,
        selfOptimized: true,
      });
    } catch (e) {
      logger.warn('🧠 自优化记录失败（非阻塞）', e.message);
    }

    state.onProgress?.({
      stage: '完成',
      message: `🎉 Figma精修完成! 耗时 ${durationSec}s ${scopedCompliant ? '| ✅ 样式标准合规' : ''}`,
      status: 'completed',
    });

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
      // 新增输出
      scopedCompliant,
      upstreamIssues: state.upstreamIssues || null,
      runtimeGate: state.runtimeGate || null,
      lessCompileGate: state.codeValidationResult?.lessCompileGate || null,
      codeValidationResult: state.codeValidationResult || null,
      visualComparisonReport: state.visualComparisonReport || null,
      //  透出 Figma 覆盖率与告警
      figmaCoverageRate: state._figmaCoverageRate ?? null,
      figmaCoverageWarning: state._figmaCoverageWarning || null,
      warnings: [
        ...(state.runtimeGate?.warning ? [state.runtimeGate.warning] : []),
        ...(state._figmaCoverageWarning ? [state._figmaCoverageWarning] : []),
      ],
    };
  });

  // ========================================
  // 节点 4c: 并行分析汇聚 - 等待Layout Reviewer和Style Mapper完成
  // ========================================
  graph.addNode('parallel-analysis', async (state) => {
    logger.info('节点: 并行分析 - Layout Reviewer & Style Mapper');

    //断点续跑：如果有缓存的分析结果，直接跳过
    if (
      state._resumeData?.cachedReviewResult &&
      state._resumeData?.cachedStyleMappings
    ) {
      logger.info('⏭️ 断点续跑: 跳过并行分析（使用缓存结果）');
      state.onProgress?.({
        stage: '并行分析',
        message: '⏭️ 跳过并行分析（产物已缓存，断点续跑）',
        status: 'completed',
      });
      return {
        reviewResult: state._resumeData.cachedReviewResult,
        styleMappings: state._resumeData.cachedStyleMappings,
      };
    }

    state.onProgress?.({
      stage: '并行分析',
      message: '🔄 正在并行执行布局审查和样式映射...',
      status: 'running',
    });

    try {
      // 文本任务：使用 textAIConfig（Claude）- 布局审查和样式映射都是文本任务
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const textConfig = {
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        // 字段映射：前端配置面板存的是 unifiedTemperature / textTemperature，
        // 推理模型强制 temperature=1 的归一化在 BaseAgent 构造函数内完成。
        temperature:
          textCfg.temperature ??
          textCfg.textTemperature ??
          textCfg.unifiedTemperature,
        onTokenUsage: state.onTokenUsage,
      };

      // 并行执行Layout Reviewer和Style Mapper
      const [reviewResult, styleMappings] = await Promise.all([
        (async () => {
          const reviewer = new LayoutReviewer(textConfig);
          reviewer.onProgress = state.onProgress;
          return await reviewer.execute({
            target: 'vue3',
            layoutStructure: state.layoutStructure,
            onProgress: state.onProgress,
            signal: state.signal || state.__abortSignal || null,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
            requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
          });
        })(),
        (async () => {
          const mapper = new StyleMapper(textConfig);
          mapper.onProgress = state.onProgress;
          return await mapper.execute({
            target: 'vue3',
            visualElements: state.visualElements,
            figmaStyles: state.figmaNodeData?.styles,
            //  传递 layoutStructure（用于 per-element 样式提取）
            // 传入完整 layoutStructure 而非只传 elements[]，因为 SM 的 _extractElementStyles
            // 支持直接处理 layoutStructure 对象（内部会调用 _collectElementsFromStructure）
            elements: state.layoutStructure,
            backgroundBrightness:
              state.visualElements?.backgroundBrightness ||
              state.layoutStructure?.styles?.backgroundBrightness ||
              'dark',
            onProgress: state.onProgress,
            signal: state.signal || state.__abortSignal || null,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
            requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
          });
        })(),
      ]);

      state.onProgress?.({
        stage: '并行分析',
        message: '✅ 并行分析完成',
        status: 'completed',
      });

      //保存 analysis checkpoint（断点续跑用）— 结构对齐微码图 analysis.json
      state._saveCheckpoint?.('analysis', { reviewResult, styleMappings });

      return {
        reviewResult,
        styleMappings,
      };
    } catch (error) {
      logger.error('并行分析失败', { error: error.message });
      state.onProgress?.({
        stage: '并行分析',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  // 节点 4c: Subcomponent Planner（强制子组件清单生成）
  // 位置：parallel-analysis 之后、microcode-engineer 之前
  // 职责：基于 layoutStructure.sections 纯规则产出子组件清单（PascalCase 名称 + 职责），
  //       注入到 engineer prompt 强制 LLM import，并在生成后校验覆盖度。
  // ========================================
  graph.addNode('subcomponent-planner', async (state) => {
    state.onProgress?.({
      stage: '子组件规划',
      message: '🧩 正在基于布局 sections 规划强制子组件...',
      status: 'running',
    });

    // 断点续跑：如果已缓存 subComponentPlan 则复用
    if (state._resumeData?.cachedSubComponentPlan) {
      logger.info('⏭️ 断点续跑: 跳过子组件规划（使用缓存结果）');
      state.onProgress?.({
        stage: '子组件规划',
        message: '⏭️ 跳过（产物已缓存）',
        status: 'completed',
      });
      return { subComponentPlan: state._resumeData.cachedSubComponentPlan };
    }

    try {
      const plan = subcomponentPlanner.plan(state.layoutStructure, {
        skipPanelHeaderFilter: true,
        // 🛡️ 臆造壳锚定事实源（2026-09-14 · 34750940）：planner 内 anchorPhantomSections 消费
        figmaNodeData: state.figmaNodeData,
      }); // Vue3 无 base-panel，header 要独立拆
      // 🛡️ P0：导航作为必含 section —— 若检测到导航信号（styleMappings/elementStyleMap/figmaNodeData 任一含导航关键词）
      // 但 effectiveSections 尚无 nav，则强制注入，确保左侧竖向导航进入生成（含其样式事实）。
      const navSignal = detectNavSignal({
        layoutStructure: state.layoutStructure,
        styleMappings: state.styleMappings,
        elementStyleMap: state.elementStyleMap,
        figmaNodeData: state.figmaNodeData,
      });
      const finalPlan = injectNavSectionIfMissing(plan, navSignal, {
        figmaNodeData: state.figmaNodeData,
        elementStyleMap: state.elementStyleMap,
      });
      const injectedNav = finalPlan !== plan;
      state.onProgress?.({
        stage: '子组件规划',
        message: `✅ 完成：${finalPlan.effectiveSections.length} 个 section${finalPlan.isForced ? '（强制拆分）' : '（不强拆）'}${injectedNav ? '（已强制注入导航 section）' : ''}`,
        status: 'completed',
      });
      // 保存到 analysis checkpoint（与 reviewResult/styleMappings 同批），便于断点续跑
      state._saveCheckpoint?.('analysis', {
        reviewResult: state.reviewResult,
        styleMappings: state.styleMappings,
        subComponentPlan: finalPlan,
      });
      return { subComponentPlan: finalPlan };
    } catch (error) {
      // 规划失败不能阻断后续流程，降级为"不强拆"，让 LLM 自由裁量
      logger.warn('子组件规划失败，降级为不强拆', { error: error.message });
      state.onProgress?.({
        stage: '子组件规划',
        message: `⚠️ 规划失败，降级: ${error.message}`,
        status: 'completed',
      });
      return {
        subComponentPlan: {
          items: [],
          isForced: false,
          reason: `规划失败: ${error.message}`,
        },
      };
    }
  });

  // ========================================
  //  节点 L0-A - Preview Validator（visual-parser 之后立即校验）
  // 支持: off 模式跳过 / minimal+full 模式启用 / 自动降级
  // ========================================
  graph.addNode('preview-validator', async (state) => {
    const v3Mode = state._v3Mode || 'generate';

    // 📊 metrics
    const t0 = Date.now();

    if (!isFeatureEnabled(v3Mode, 'l0-preview')) {
      logger.info('L0-A Preview Validator: 跳过 (v3Mode=off)');
      emitMetrics('preview-validator', { skipped: true, reason: 'v3Mode=off' });
      return {
        validationResult: {
          pass: true,
          blockCount: 0,
          warnCount: 0,
          errors: [],
        },
        validatorRetryCount: 0,
      };
    }

    logger.info(`节点: L0-A Preview Validator (mode=${v3Mode})`);

    //降级策略检查：连续失败超过阈值 → 降级为 WARN-only
    const consecutiveFailures = state._l0ConsecutiveFailures || 0;
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 3;
    let bypassValidation = false;

    if (consecutiveFailures >= bypassThreshold) {
      bypassValidation = true;
      logger.warn(
        `⚠️ L0 连续失败 ${consecutiveFailures} 次，降级为 WARN-only 模式`,
      );
      emitMetrics('preview-validator', {
        action: 'degraded_to_warn_only',
        consecutiveFailures,
      });
    }

    // 构建分析结果对象用于校验
    // 注意：state.layoutStructure 是完整的分析结果对象（含 .layout.sections），
    // 需取其 .layout 子对象，否则 analysis.layout.sections 会错误指向 analysisResult.sections（undefined）
    const analysis = {
      layout: state.layoutStructure?.layout || state.layoutStructure,
      styles: state.visualElements,
      charts: state.charts,
      interactions: state.interactions,
    };

    const result = PreviewAnalysisValidator.validate(analysis);

    // 如果是降级模式，检查是否存在硬性 BLOCK（结构完整性 / layout 缺失），这些不可被 bypass
    if (bypassValidation && !result.pass) {
      const hardBlocks = (result.errors || []).filter(
        (e) => e.severity === 'BLOCK' && e.id === 'STRUCT-01',
      );
      if (hardBlocks.length > 0) {
        // 硬性 BLOCK 不 bypass，保留失败状态但标记降级
        logger.warn(
          `⚠️ L0 降级但存在 ${hardBlocks.length} 个硬性 BLOCK，保留失败状态`,
        );
        result._bypassed = false;
        result._degraded = true;
      } else {
        result._bypassed = true;
        result._originalPass = false;
        result.pass = true; // 降级后强制通过
        logger.warn('L0 降级: 强制标记为 pass（原结果为 needs_revision）');
      }
    }

    // 更新连续失败计数
    const newConsecutiveFailures = result.pass ? 0 : consecutiveFailures + 1;

    logger.info(
      `L0-A 校验结果: pass=${result.pass}, BLOCK=${result.blockCount}, WARN=${result.warnCount}`,
    );

    // 如果有 WARN/BLOCK，记录详情
    if (result.errors.length > 0) {
      result.errors.forEach((e) => {
        if (e.severity.includes('BLOCK')) {
          logger.error(`  [${e.id}] ${e.message}`);
        } else {
          logger.warn(`  [${e.id}] ${e.message}`);
        }
      });
    }

    // 📊 metrics
    emitMetrics('preview-validator', {
      pass: result.pass,
      blockCount: result.blockCount,
      warnCount: result.warnCount,
      retryCount: state.validatorRetryCount || 0,
      bypassed: bypassValidation,
      consecutiveFailures: newConsecutiveFailures,
      durationMs: Date.now() - t0,
    });

    //生成重试指导（用于 L0-A 重试时回传给 visual-parser）
    const retryCount = state.validatorRetryCount || 0;
    const maxRetry = state._v3Config?.l0MaxRetry || 1;
    const nextRetryCount =
      !result.pass && !bypassValidation && retryCount < maxRetry
        ? retryCount + 1
        : retryCount;
    const retryGuidance =
      nextRetryCount > retryCount
        ? PreviewAnalysisValidator.generateRetryGuidance(result.errors)
        : null;

    return {
      validationResult: result,
      validatorRetryCount: nextRetryCount,
      _l0ConsecutiveFailures: newConsecutiveFailures,
      _l0Degraded: result._degraded || false,
      retryGuidance, //重试指导文本，visual-parser 可据此修正输出
    };
  });

  // ========================================
  //  节点 parallel-refine — 并行精修（替代 layout→style 串行链）
  // ========================================
  graph.addNode('parallel-refine', async (state) => {
    const t0 = Date.now(); // 📊 metrics 计时
    const reviseTarget = state._reviseTarget || 'full';

    //  当全面精修时，使用合并精修器（单次 LLM 调用替代 layout→style 串行）
    const useMergedRefiner = reviseTarget === 'full';

    // 精修部分修订 —— 非 full 修订时，只把 critique 指定的文件/类交给 refiner 局部修改
    const _rt =
      reviseTarget && reviseTarget !== 'full' && state.checkResult
        ? resolveTargetFiles(state.checkResult, state.generatedFiles, {
            mainComponentFile: 'package/index.vue',
          })
        : null;
    const refineTargetFiles = _rt?.hasTargets
      ? Array.from(_rt.targetFiles)
      : null;
    const refineTargetClassNames = _rt?.targetClassNames?.length
      ? _rt.targetClassNames
      : null;
    if (refineTargetFiles) {
      logger.info('🎯 #5: 并行精修仅处理目标文件', {
        files: refineTargetFiles,
        classes: refineTargetClassNames,
      });
    }

    state.onProgress?.({
      stage: '串行精修',
      message: useMergedRefiner
        ? '⚡ 合并精修（布局+样式）单次 LLM 调用中...'
        : '⚙️ 布局精修 → 样式精修 顺序执行中...',
      status: 'running',
    });

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const textConfig = {
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        // 字段映射：前端配置面板存的是 unifiedTemperature / textTemperature，
        // 推理模型强制 temperature=1 的归一化在 BaseAgent 构造函数内完成。
        temperature:
          textCfg.temperature ??
          textCfg.textTemperature ??
          textCfg.unifiedTemperature,
        onTokenUsage: state.onTokenUsage,
      };

      //  精修前保存文件快照（用于越权检测 diff）
      const fs = await import('fs');
      const pathMod = await import('path');
      let preRefineFiles = {};

      if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
        for (const f of state.generatedFiles) {
          try {
            const fullPath = pathMod.join(state.outputPath, f);
            preRefineFiles[f] = fs.readFileSync(fullPath, 'utf-8');
          } catch (e) {
            // 文件可能不存在
          }
        }
      }

      //  全面精修 → 使用合并精修器（节省一次 LLM 调用）
      if (useMergedRefiner) {
        logger.info(
          '⚡ 使用合并精修器 (LayoutStyleRefiner)，单次 LLM 调用完成布局+样式精修',
        );
        try {
          const refiner = new LayoutStyleRefiner(textConfig);
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
          });

          await postRefineResourceImportGuard(
            state.outputPath,
            state.resourceDomMapping,
            'vue3',
            logger,
          );
          state.onProgress?.({
            stage: '合并精修',
            message: `✅ 合并精修完成（布局+样式）`,
            status: 'completed',
          });

          emitMetrics('parallel-refine-merged', {
            reviseTarget: 'full',
            merged: true,
            durationMs: Date.now() - t0,
          });

          return {
            layoutRefineResult: { refined: true, merged: true },
            styleRefineResult: { refined: true, merged: true },
            mergedRefineResult: mergedResult,
            preRefineFiles,
            _refineStart: t0,
          };
        } catch (err) {
          logger.error('合并精修失败，回退到串行精修', {
            reason: err?.message,
          });
          state.onProgress?.({
            stage: '合并精修',
            message: `⚠️ 合并精修失败，回退到串行 layout→style`,
            status: 'warning',
          });
          // 不回退，继续执行下面的串行逻辑
        }
      }

      //P0-3修复：串行执行 layout-refiner → style-refiner（非 full 目标或合并回退时使用）
      let layoutResult = null;
      let styleResult = null;
      let layoutError = null;
      let styleError = null;

      // 1. 先执行 layout-refiner
      try {
        const refiner = new LayoutRefiner(textConfig);
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
        });
      } catch (err) {
        layoutError = err;
        logger.error('layout-refiner 执行失败', { reason: err?.message });
        state.onProgress?.({
          stage: '布局精修',
          message: `⚠️ 布局精修失败，继续样式精修`,
          status: 'warning',
        });
      }

      // 2. 再执行 style-refiner（此时读取的是 layout-refiner 已写入的文件）
      try {
        const refiner = new StyleRefiner(textConfig);
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
        });
      } catch (err) {
        styleError = err;
        logger.error('style-refiner 执行失败', { reason: err?.message });
        state.onProgress?.({
          stage: '样式精修',
          message: `⚠️ 样式精修失败，仅应用布局精修`,
          status: 'warning',
        });
      }

      // 至少一个成功才算部分成功
      if (!layoutResult && !styleResult) {
        throw new Error('串行精修完全失败');
      }

      state.onProgress?.({
        stage: '串行精修',
        message: `✅ 串行精修完成${!layoutResult && !layoutError ? '' : layoutError ? '（布局失败）' : ''}${!styleResult && !styleError ? '' : styleError ? '（样式失败）' : ''}`,
        status: 'completed',
      });

      await postRefineResourceImportGuard(
        state.outputPath,
        state.resourceDomMapping,
        'vue3',
        logger,
      );

      // 📊 metrics
      emitMetrics('parallel-refine', {
        reviseTarget: state._reviseTarget || 'full',
        layoutRefined: layoutResult?.refined,
        styleRefined: styleResult?.refined,
        durationMs: Date.now() - t0,
      });

      return {
        layoutRefineResult: layoutResult,
        styleRefineResult: styleResult,
        //传递文件快照给下游 adversarial-checker 使用
        preRefineFiles,
        _refineStart: t0, // 记录开始时间用于下游 metrics
      };
    } catch (error) {
      logger.error('串行精修失败', { error: error.message });
      state.onProgress?.({
        stage: '串行精修',
        message: `❌ 失败: ${error.message}`,
        status: 'failed',
      });
      throw error;
    }
  });

  // ========================================
  //  节点 refine-feedback — L1 同伴评审反馈汇聚
  // ========================================
  graph.addNode('refine-feedback', async (state) => {
    logger.info('节点: L1 精修反馈汇聚');

    // 收集 layout-refiner 和 style-refiner 的上游问题检测
    const layoutFeedback = state.layoutRefineResult?.upstreamFeedback || {};
    const styleFeedback = state.styleRefineResult?.upstreamFeedback || {};

    const upstreamIssues = {
      needsEngineerRework:
        layoutFeedback.needsEngineerRework || styleFeedback.needsEngineerRework,
      templateIssues: [
        ...(layoutFeedback.templateIssues || []),
        ...(styleFeedback.variableMissing || []),
      ],
      styleOnlyIssues: styleFeedback.styleOnlyIssues || [],
      layoutOnlyIssues: layoutFeedback.layoutIssues || [],
    };

    if (upstreamIssues.needsEngineerRework) {
      logger.warn('L1 精修阶段检测到结构性问题，需要回退到 engineer', {
        templateIssues: upstreamIssues.templateIssues,
      });
    } else {
      logger.info('L1 精修反馈: 无结构性问题，可继续');
    }

    return { upstreamIssues };
  });

  // ========================================
  //  节点 L0-B - Code Structure Validator（engineer 之后立即校验）
  // 校验生成的 Vue 文件是否符合 scoped-less 标准
  // ========================================
  graph.addNode('code-structure-validator', async (state) => {
    const v3Mode = state._v3Mode || 'generate';
    const t0 = Date.now();

    if (!isFeatureEnabled(v3Mode, 'l0-code')) {
      logger.info('L0-B Code Structure Validator: 跳过 (v3Mode=off)');
      emitMetrics('code-structure-validator', {
        skipped: true,
        reason: 'v3Mode=off',
      });
      return {
        codeValidationResult: { pass: true, blockCount: 0, issues: [] },
      };
    }

    logger.info(`节点: L0-B Code Structure Validator (mode=${v3Mode})`);

    // 🛡️ L0-B 增量校验（revision 轮优化）：
    // 仅当「上一轮 L0-B 已通过」且处于迭代轮时启用——通过后文件内容只可能被精修器/定向修订
    // 局部改动，对未变更文件跳过校验是安全的（它们上轮已通过）。
    // L0-B 自身失败后的重试轮（prevPassed=false）必须全量校验：LLM 可能未真正修复但输出内容
    // 与上轮相同，若按"内容未变"跳过会把未修复的 BLOCK 漏检，破坏 fail-closed 语义。
    let changedFileNames = null;
    const prevL0Passed = state.codeValidationResult?.pass === true;
    if (
      prevL0Passed &&
      (state.iterationCount || 0) > 0 &&
      state.preRefineFiles
    ) {
      const currentFiles = readRevisionSnapshot(
        state.generatedFiles,
        state.outputPath,
      );
      const changeStats = computeChangedFilePaths(
        currentFiles,
        state.preRefineFiles,
      );
      changedFileNames = new Set(
        [...changeStats.changedFilePaths].map((p) => p.split('/').pop()),
      );
      logger.info('📊 L0-B 增量校验变更检测', {
        changed: changedFileNames.size,
        unchanged: changeStats.unchangedCount,
        total: changeStats.totalCount,
      });
    }

    // 构建 generatedFiles 对象供 validator 使用
    const fs = await import('fs');
    const pathMod = await import('path');

    let filesForCheck = [];
    if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
      for (const f of state.generatedFiles) {
        try {
          const fullPath = pathMod.join(state.outputPath, f);
          const content = fs.readFileSync(fullPath, 'utf-8');
          filesForCheck.push({ path: f, content });
        } catch (e) {}
      }
    }

    // 完全无变更（含文件增删）→ 直接复用上轮通过结果，跳过全量校验 + LESS 编译
    if (changedFileNames && changedFileNames.size === 0) {
      logger.info('⏭️ L0-B 增量：无文件变更，复用上一轮校验结果');
      emitMetrics('code-structure-validator', {
        incremental: true,
        skippedFiles: 0,
        pass: true,
        durationMs: Date.now() - t0,
      });
      return {
        codeValidationResult: {
          ...state.codeValidationResult,
          pass: true,
          _incrementalReused: true,
        },
        codeValidatorRetryCount: 0,
        _l0CodeConsecutiveFailures: 0,
        _l0CodeDegraded: false,
        _l0CodeRetryGuidance: '',
        _structureOrderResult: null,
        _l0FilesForCheck: filesForCheck,
        _reviseFiles: state._reviseFiles,
        _reviseTarget: state._reviseTarget,
      };
    }

    // 增量校验：只对变更文件跑正则校验（未变更文件上轮已通过，跳过省时）
    // CODE-003（common.less 前缀）需 common.less 参与校验上下文，故并入上下文文件。
    let filesForValidation = filesForCheck;
    if (changedFileNames && changedFileNames.size > 0) {
      const ctxExtras = filesForCheck.filter((f) => {
        const base = f.path.split('/').pop();
        return base === 'common.less' || base === 'declare.json';
      });
      filesForValidation = [
        ...filesForCheck.filter((f) =>
          changedFileNames.has(f.path.split('/').pop()),
        ),
        ...ctxExtras,
      ];
      logger.info('📊 L0-B 增量校验文件集', {
        total: filesForCheck.length,
        validating: filesForValidation.length,
        skipped: filesForCheck.length - filesForValidation.length,
      });
    }

    const componentId = state.componentId || '';
    const result = CodeStructureValidator.validate(
      filesForValidation,
      componentId,
      {
        target: 'vue3',
        layoutStructure: state.layoutStructure,
        visualElements: state.visualElements,
        resourceDomMapping: state.resourceDomMapping,
        previewAnalysis: { componentTitle: state.analysisTarget || '' },
        // 🛡️ P0：传入根装饰真值（designFacts.root.styleEvidence），供 CODE-014 硬性校验根容器臆造装饰
        designFacts: state.designFacts || null,
        figmaNodeData: state.figmaNodeData || null,
      },
    );

    // P0：逐 SFC + 共享 LESS 真实编译门禁。LESS 失败属于发布硬阻断，不能降级为 WARN。
    const filesByPath = Object.fromEntries(
      filesForCheck.map((file) => [file.path, file.content]),
    );
    const lessCompileResult = await LessCompileGate.validate(filesByPath, {
      outputPath: state.outputPath,
    });
    if (!lessCompileResult.pass) {
      const lessIssues = lessCompileResult.diagnostics.map((item) => ({
        ...item,
        file: item.file,
        severity: 'BLOCK',
      }));
      result.pass = false;
      result.issues = [...(result.issues || []), ...lessIssues];
      result.blockCount = (result.blockCount || 0) + lessIssues.length;
      result.lessCompileGate = lessCompileResult;
    } else {
      result.lessCompileGate = lessCompileResult;
    }

    //  🛡️ P0-4: flex 静态检查 + 自动修复（零 LLM）
    //  - FLEX-001: column-flex 容器内 flex:1 子元素缺 min-height:0 → BLOCK 并入校验结果，并自动补
    //  - FLEX-002: column-flex 无任何 flex 子属性 → WARN 提示冗余
    //  增量模式下仅对变更文件执行（未变更文件上轮已检查并修复）
    try {
      let flexFixCount = 0;
      const flexTargets =
        changedFileNames && changedFileNames.size > 0
          ? filesForCheck.filter((f) =>
              changedFileNames.has(f.path.split('/').pop()),
            )
          : filesForCheck;
      for (const file of flexTargets) {
        if (!/\.(vue|less)$/.test(file.path)) continue;
        const styleMatches =
          file.content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        for (const styleTag of styleMatches) {
          const bodyMatch = styleTag.match(/>([\s\S]*?)<\/style>/i);
          const styleBody = bodyMatch ? bodyMatch[1] : '';
          if (!styleBody) continue;
          // 🛡️ autoFix 前置（P0-2）：先确定性修复 FLEX-001（补 min-height:0），再用「修复后」内容检查，
          // 避免「能机器修的 BLOCK」也计入 result 触发重试、白占 l0MaxRetry 预算。
          const { content: fixedContent, fixed } = autoFixFlexIssues(styleBody);
          let effectiveBody = styleBody;
          if (fixed > 0) {
            flexFixCount += fixed;
            effectiveBody = fixedContent;
            const fsWrite = await import('fs');
            const pathModWrite = await import('path');
            const fullPath = pathModWrite.join(state.outputPath, file.path);
            try {
              const original = fsWrite.readFileSync(fullPath, 'utf-8');
              const fixedFile = original.replace(
                styleTag,
                styleTag.replace(styleBody, fixedContent),
              );
              fsWrite.writeFileSync(fullPath, fixedFile, 'utf-8');
              file.content = fixedFile;
            } catch (e) {
              logger.warn('P0-4 flex 自动修复写盘失败（非阻断）', {
                file: file.path,
                error: e.message,
              });
            }
          }
          // 修复后复查：仅把「仍存在」的 flex 问题计入 result
          const flexIssues = checkFlexUsage(effectiveBody);
          if (flexIssues.length === 0) continue;
          for (const fi of flexIssues) {
            const issueEntry = {
              id: fi.id,
              severity: fi.severity,
              category: 'flex-layout',
              message: fi.message,
              file: file.path,
              hint: { suggestion: fi.suggestion },
            };
            result.issues = [...(result.issues || []), issueEntry];
            if (fi.severity === 'BLOCK')
              result.blockCount = (result.blockCount || 0) + 1;
          }
        }
      }
      if (flexFixCount > 0) {
        logger.warn(
          `✅ P0-4 flex 自动修复: ${flexFixCount} 处缺失 min-height:0 已补齐`,
          { files: filesForCheck.filter((f) => f.path).length },
        );
      }

      // 🛡️ L0-B 自动修复: FLEX-002（冗余 flex column）
      let flex002FixCount = 0;
      const { autoFixRedundantFlex } =
        await import('../validators/code-structure-validator.js');
      for (const file of flexTargets) {
        if (!/\.(vue|less)$/.test(file.path)) continue;
        const styleMatches =
          file.content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        for (const styleTag of styleMatches) {
          const bodyMatch = styleTag.match(/>([\s\S]*?)<\/style>/i);
          const styleBody = bodyMatch ? bodyMatch[1] : '';
          if (!styleBody) continue;
          const { content: fixedContent, fixed } =
            autoFixRedundantFlex(styleBody);
          if (fixed > 0) {
            flex002FixCount += fixed;
            const fsWrite = await import('fs');
            const pathModWrite = await import('path');
            const fullPath = pathModWrite.join(state.outputPath, file.path);
            try {
              const original = fsWrite.readFileSync(fullPath, 'utf-8');
              const fixedFile = original.replace(
                styleTag,
                styleTag.replace(styleBody, fixedContent),
              );
              fsWrite.writeFileSync(fullPath, fixedFile, 'utf-8');
              file.content = fixedFile;
            } catch (e) {
              logger.warn('FLEX-002 自动修复写盘失败（非阻断）', {
                file: file.path,
                error: e.message,
              });
            }
          }
        }
      }
      if (flex002FixCount > 0) {
        logger.warn(
          `✅ FLEX-002 自动修复: ${flex002FixCount} 处冗余 flex column 已移除`,
        );
      }
    } catch (flexErr) {
      logger.warn('P0-4 flex 检查异常（非阻断）', { error: flexErr.message });
    }

    //  🛡️ P0-5: CODE-001/CODE-002 自动修复（零 LLM）
    //  - CODE-001: <style> 缺 lang="less" 或 scoped → 自动补齐为 <style lang="less" scoped>
    //  - CODE-002: <style> 内缺 @import index.less → 自动插入正确路径
    // 治本：LLM 高频漏写这两个属性，后处理补齐避免 fail-closed 触发重试循环。
    try {
      const code001Issues = (result.issues || []).filter(
        (i) => i.id === 'CODE-001' && i.severity === 'BLOCK',
      );
      const code002Issues = (result.issues || []).filter(
        (i) => i.id === 'CODE-002' && i.severity === 'BLOCK',
      );
      let codeFixCount = 0;
      const fixedFiles = new Set();

      // 按文件聚合修复
      for (const file of filesForCheck) {
        if (!file.path.endsWith('.vue')) continue;
        const has001 = code001Issues.some((i) => i.file === file.path);
        const has002 = code002Issues.some((i) => i.file === file.path);
        if (!has001 && !has002) continue;

        let content = file.content;
        let changed = false;

        // CODE-001: 修复 <style> 标签属性
        if (has001) {
          // 找到第一个 <style ...> 标签
          const styleTagMatch = content.match(/<style\b([^>]*)>/i);
          if (styleTagMatch) {
            const existingAttrs = styleTagMatch[1] || '';
            const hasLangLess = /lang\s*=\s*["']less["']/i.test(existingAttrs);
            const hasScoped = /\bscoped\b/i.test(existingAttrs);

            let newAttrs = existingAttrs;
            if (!hasLangLess) {
              // 插入 lang="less"（若已有其他 lang 值，替换；否则追加）
              if (/lang\s*=\s*["'][^"']*["']/i.test(newAttrs)) {
                newAttrs = newAttrs.replace(
                  /lang\s*=\s*["'][^"']*["']/i,
                  'lang="less"',
                );
              } else {
                newAttrs = ` lang="less"${newAttrs}`;
              }
              changed = true;
            }
            if (!hasScoped) {
              newAttrs = newAttrs.replace(/\s+$/, '') + ' scoped';
              changed = true;
            }

            if (changed) {
              const newTag = `<style${newAttrs.trim() ? ' ' + newAttrs.trim() : ''}>`;
              content = content.replace(styleTagMatch[0], newTag);
              codeFixCount++;
            }
          }
        }

        // CODE-002: 补齐 @import index.less
        if (has002) {
          // 重新匹配修复后的 <style> 标签
          const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          if (styleMatch) {
            const styleBody = styleMatch[1];
            // 判断文件层级，决定 import 路径
            let importPath = '../resources/styles/index.less'; // 默认主组件 package/index.vue
            if (
              /\/components\//.test(file.path) ||
              file.path.startsWith('components/')
            ) {
              importPath = '../../resources/styles/index.less'; // 子组件 package/components/Xxx.vue
            }
            const importLine = `@import '${importPath}';\n`;

            // 检查是否真的缺（再次确认，避免误补）
            if (
              !styleBody.includes('@import') ||
              !styleBody.includes('index.less')
            ) {
              // 在 <style> 标签开头后插入 import
              const newStyleBody = importLine + styleBody;
              content = content.replace(
                styleMatch[0],
                styleMatch[0].replace(styleBody, newStyleBody),
              );
              changed = true;
              codeFixCount++;
            }
          }
        }

        if (changed) {
          // 写回磁盘 + 更新内存
          const fsWrite = await import('fs');
          const pathModWrite = await import('path');
          const fullPath = pathModWrite.join(state.outputPath, file.path);
          try {
            fsWrite.writeFileSync(fullPath, content, 'utf-8');
            file.content = content;
            fixedFiles.add(file.path);
          } catch (e) {
            logger.warn('P0-5 CODE-001/002 自动修复写盘失败（非阻断）', {
              file: file.path,
              error: e.message,
            });
          }
        }
      }

      if (codeFixCount > 0) {
        // 从 result.issues 中移除已修复的 CODE-001/CODE-002，并重算 blockCount
        const fixedPaths = [...fixedFiles];
        result.issues = (result.issues || []).filter((i) => {
          if (
            (i.id === 'CODE-001' || i.id === 'CODE-002') &&
            i.file &&
            fixedPaths.includes(i.file)
          ) {
            return false; // 已修复，移除
          }
          return true;
        });
        result.blockCount = result.issues.filter(
          (i) => i.severity === 'BLOCK',
        ).length;
        result.pass = result.blockCount === 0;
        logger.warn(
          `✅ P0-5 CODE-001/002 自动修复: ${codeFixCount} 处 style 属性/@import 已补齐`,
          { files: fixedPaths },
        );
      }
    } catch (codeErr) {
      logger.warn('P0-5 CODE-001/002 检查异常（非阻断）', {
        error: codeErr.message,
      });
    }

    // 降级检查：硬性 BLOCK（scoped 属性缺失 / 文件结构完整性 / LESS 编译失败）不可被 bypass
    const consecutiveCodeFailures = state._l0CodeConsecutiveFailures || 0;
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 3;

    if (!result.pass && consecutiveCodeFailures >= bypassThreshold) {
      const hardBlockIssues = (result.issues || []).filter(
        (i) =>
          i.severity === 'BLOCK' &&
          (i.id === 'CODE-001' ||
            i.id === 'CODE-002' ||
            i.id === 'CODE-008' ||
            i.id === 'CODE-009' ||
            i.id === 'LESS-COMPILE-001'),
      );
      if (hardBlockIssues.length > 0) {
        logger.warn(
          `⚠️ L0-B 降级但存在 ${hardBlockIssues.length} 个硬性 BLOCK（scoped/文件结构），保留失败状态`,
        );
        result._bypassed = false;
        result._degraded = true;
      } else {
        result._bypassed = true;
        result._originalPass = false;
        result.pass = true;
        logger.warn(
          `⚠️ L0-B 连续失败 ${consecutiveCodeFailures} 次，降级为 WARN-only`,
        );
      }
    }

    const newConsecutive = result.pass ? 0 : consecutiveCodeFailures + 1;

    logger.info(
      `L0-B 校验结果: pass=${result.pass}, BLOCK=${result.blockCount}, Issues=${result.issues?.length || 0}`,
    );

    // 文件生命周期：L0-B 逐文件 BLOCK 归属（校验失败文件标红色状态点）
    const l0BlockByFile = new Map();
    for (const issue of result.issues || []) {
      if (issue.severity !== 'BLOCK' || !issue.file) continue;
      l0BlockByFile.set(issue.file, (l0BlockByFile.get(issue.file) || 0) + 1);
    }
    if (state.onProgress) {
      const l0Paths = (filesForCheck || []).map((f) => f.path).filter(Boolean);
      const l0BlockFiles = [...l0BlockByFile.keys()];
      state.onProgress({
        fileLifecycle: {
          phase: 'validating',
          summary: result.pass
            ? 'L0-B 代码结构校验通过'
            : `L0-B 校验未通过：${l0BlockFiles.length} 个文件存在 BLOCK`,
          files: l0Paths.map((path) => ({
            path,
            state: l0BlockByFile.has(path) ? 'failed' : 'passed',
          })),
        },
      });
    }

    if (result.issues?.length > 0) {
      result.issues.forEach((i) => {
        if (i.severity === 'BLOCK')
          logger.error(`  [${i.id}] ${i.message} (${i.file})`);
        else logger.warn(`  [${i.id}] ${i.message} (${i.file})`);
      });
    }

    emitMetrics('code-structure-validator', {
      pass: result.pass,
      blockCount: result.blockCount,
      issueCount: result.issues?.length || 0,
      bypassed: result._bypassed,
      consecutiveFailures: newConsecutive,
      durationMs: Date.now() - t0,
    });

    //生成修复指导（用于重试）
    let retryGuidance = '';
    if (!result.pass && !result._bypassed) {
      const blockIssues =
        result.issues?.filter((i) => i.severity === 'BLOCK') || [];
      if (blockIssues.length > 0) {
        retryGuidance =
          '\n\n🔴 上次生成未通过 L0-B 代码结构校验，必须修复以下问题：\n\n';
        blockIssues.forEach((issue, i) => {
          retryGuidance += `${i + 1}. [${issue.id}] ${issue.message}\n`;
          if (issue.file)
            retryGuidance += `   文件: ${issue.file}${issue.line ? `:${issue.line}:${issue.column || 1}` : ''}\n`;
          const current = issue.snippet?.find?.((row) => row.current);
          if (current) retryGuidance += `   错误代码: ${current.code.trim()}\n`;
          if (issue.hint?.suggestion)
            retryGuidance += `   诊断建议: ${issue.hint.suggestion}\n`;
        });
        if (result.lessCompileGate && !result.lessCompileGate.pass) {
          retryGuidance += LessCompileGate.buildFixGuidance(
            result.lessCompileGate,
          );
        }
        retryGuidance += '\n请确保：\n';
        retryGuidance += '- 每个 .vue 文件都有 <style lang="less" scoped>\n';
        retryGuidance += '- 根组件导入 ./resources/styles/index.less\n';
        retryGuidance +=
          '- components/ 子组件导入 ../resources/styles/index.less\n';
        retryGuidance +=
          '- 禁止手写 import 本地图片，由 injectResourceImports 自动注入\n';
        retryGuidance +=
          '- declare.json componentName 必须等于预览图识别的组件标题\n';

        // R1' 重试轮结构锚定：注入组件树骨架，约束 LLM 不得重排结构
        const skeleton = CodeStructureValidator.extractComponentSkeleton(filesForCheck);
        if (skeleton) {
          retryGuidance += '\n\n' + skeleton;
          logger.info('R1: 已注入组件树骨架到重试指导', {
            skeletonLength: skeleton.length,
          });
        }

        logger.info('L0-B 生成修复指导', { issueCount: blockIssues.length });
      }
    }

    const lessTargetFiles =
      result.lessCompileGate?.diagnostics?.map((item) => item.file) || [];

    //  P0-2: 结构顺序门禁（零 LLM）— L0-B 通过后、generate 模式 complete 前，
    //  校验模板区块顺序 vs layoutStructure.sections 的 Y 顺序，颠倒则拦截回 engineer。
    //  仅当 layoutStructure 含 Figma 兜底重建的 y 坐标时才有依据可比对，否则放行。
    let structureOrderResult = null;
    const gateMode = state._v3Mode || 'generate';
    if (gateMode === 'generate' && !state._structureOrderRetried) {
      // 复用 filesForCheck（已在节点开头从磁盘读取），避免二次读盘
      structureOrderResult = validateStructureOrder(
        filesForCheck,
        state.layoutStructure,
      );
      if (structureOrderResult.detected) {
        logger.warn('⚠️ P0-2 结构顺序门禁：检测到区块颠倒', {
          inverted: structureOrderResult.inverted,
        });
        // 与 L0-B 修复指导合并：优先结构顺序问题
        retryGuidance =
          structureOrderResult.retryGuidance +
          (retryGuidance ? '\n\n' + retryGuidance : '');
      } else if (structureOrderResult.matched?.length > 0) {
        logger.info('✅ P0-2 结构顺序门禁通过', {
          matched: structureOrderResult.matched.length,
        });
      }
    }

    return {
      codeValidationResult: result,
      // L0-B 重试计数：失败且未绕过 → +1；通过 → 重置 0（避免跨轮累积耗尽预算）。
      // 条件边用 <= 比较，保证 l0MaxRetry=N 时最多 N 次重试。
      codeValidatorRetryCount:
        !result.pass && !result._bypassed
          ? (state.codeValidatorRetryCount || 0) + 1
          : 0,
      _l0CodeConsecutiveFailures: newConsecutive,
      _l0CodeDegraded: result._degraded || false,
      _l0CodeRetryGuidance: retryGuidance,
      //  P0-2: 结构顺序门禁结果（条件边读取决定回 engineer / complete）
      _structureOrderResult: structureOrderResult,
      //  L0-B 已读盘文件内容（供 do-not-invent-check 等后续节点复用，避免二次读盘）
      _l0FilesForCheck: filesForCheck,
      // P1：LESS 失败时只重做报错文件；其他文件从磁盘保留。
      _reviseFiles:
        lessTargetFiles.length > 0
          ? [...new Set(lessTargetFiles)]
          : state._reviseFiles,
      _reviseTarget: lessTargetFiles.length > 0 ? 'style' : state._reviseTarget,
    };
  });

  // ========================================
  // 添加边（流程控制）— 重构后的完整拓扑（支持模式切换）
  // ========================================

  graph.setEntry('init');
  graph.addEdge('init', 'figma-connector');
  graph.addEdge('figma-connector', 'visual-parser');

  // ── L0-A 边：根据模式决定是否走 preview-validator ──
  // off 模式: visual-parser → parallel-analysis（跳过 L0）
  // minimal/full: visual-parser → preview-validator
  graph.addConditionalEdge('visual-parser', (state) => {
    const mode = state._v3Mode || 'generate';
    return isFeatureEnabled(mode, 'l0-preview')
      ? 'preview-validator'
      : 'parallel-analysis';
  });

  // preview-validator 条件分流
  graph.addConditionalEdge('preview-validator', (state) => {
    const r = state.validationResult;
    const maxRetry = state._v3Config?.l0MaxRetry || 1;

    if (r.pass) return 'parallel-analysis'; // 通过 → 继续
    if ((state.validatorRetryCount || 0) <= maxRetry && state.retryGuidance)
      return 'visual-parser'; // 可重试 → 回 visual-parser
    return 'parallel-analysis'; // 重试耗尽 → 带 warning 继续
  });

  graph.addEdge('parallel-analysis', 'subcomponent-planner');
  // 子组件规划 → 代码生成（强制子组件清单注入 engineer）
  graph.addEdge('subcomponent-planner', 'microcode-engineer');

  // ──L0-B: engineer → code-structure-validator（校验 scoped-less 合规性）──
  graph.addEdge('microcode-engineer', 'code-structure-validator');

  // ── L0-B 条件分流：校验结果决定下一步 ──
  graph.addConditionalEdge('code-structure-validator', (state) => {
    const r = state.codeValidationResult;
    const maxRetry = state._v3Config?.l0MaxRetry ?? 1;
    const retryCount = state.codeValidatorRetryCount || 0;

    // BLOCK 且可重试 → 回 engineer 重做（计数由 code-structure-validator 节点管理）
    if (!r.pass && !r._bypassed && retryCount <= maxRetry) {
      logger.info(
        `L0-B 校验失败，回退 engineer 重试 (${retryCount}/${maxRetry})`,
        {
          hasGuidance: !!state._l0CodeRetryGuidance,
        },
      );

      return 'microcode-engineer';
    }

    // LESS 编译失败在自动定向修复 1 次后仍失败：硬阻断发布，不允许继续到预览/复制 workspace。
    if (!r.pass && r.lessCompileGate && !r.lessCompileGate.pass) {
      const first = r.lessCompileGate.diagnostics?.[0];
      const location = first
        ? `${first.file}:${first.line}:${first.column}`
        : '未知位置';
      const error = new Error(
        `LESS 编译门禁阻断: ${location} ${first?.message || 'LESS 编译失败'}`,
      );
      error.code = 'LESS_COMPILE_GATE_BLOCKED';
      error.lessCompileGate = r.lessCompileGate;
      error.codeValidationResult = r;
      throw error;
    }

    // ✅ fail-closed: 真正的 BLOCK（未 degrade bypass）重试耗尽后禁止发布（complete / 复制 workspace）
    if (!r.pass && !r._bypassed && retryCount > maxRetry) {
      const blockIssues = (r.issues || []).filter(
        (i) => i.severity === 'BLOCK',
      );
      const err = new Error(
        `L0-B 代码结构校验未通过且重试耗尽，禁止发布组件：${blockIssues.map((i) => i.id || i.severity).join(', ') || 'unknown'}`,
      );
      err.code = 'L0B_BLOCK_EXHAUSTED';
      err.codeValidationResult = r;
      throw err;
    }

    // generate 模式：L0-B 通过/重试耗尽 → 先跑结构顺序门禁（P0-2，零 LLM），
    // 再决定 complete / 回 engineer 重试（上限 1 次）。杜绝「视觉降级→盲写→区块颠倒」。
    const mode = state._v3Mode || 'generate';
    if (mode === 'generate') {
      const gate = state._structureOrderResult;
      if (gate?.detected && !state._structureOrderRetried) {
        logger.warn(
          '⚠️ P0-2 结构顺序门禁拦截：区块顺序与设计稿颠倒，回 engineer 重试',
          {
            inverted: gate.inverted,
          },
        );
        state.onProgress?.({
          type: 'progress',
          stage: '结构顺序校验',
          message: `⚠️ 布局顺序与设计稿颠倒（${gate.inverted.map((i) => `${i.upper} 应在 ${i.lower} 上方`).join('；')}），正在修正...`,
          status: 'running',
        });
        return 'microcode-engineer';
      }
      if (gate?.detected) {
        logger.warn(
          '⚠️ P0-2 结构顺序门禁：重试后仍颠倒，放行并标记降级（由前端提示精修）',
          {
            inverted: gate.inverted,
          },
        );
        state._visualDegraded = true;
        state._visualLayoutSource =
          state._visualLayoutSource || 'structure-order-failed';
      }
      // L0-B 通过 / 已降级 bypass → 进入「禁止臆造」硬门禁（generate 模式一次确定性校验）
      return 'do-not-invent-check';
    }

    // 通过/结构规则重试耗尽/降级通过 → 继续精修
    return isFeatureEnabled(mode, 'parallel-refine')
      ? 'parallel-refine'
      : 'layout-refiner-legacy';
  });

  // ========================================
  // 禁止臆造硬门禁（generate 模式）：代码落盘 / 完成前的确定性校验
  // 命中 BLOCK（核心文案篡改 / 图表系列膨胀）→ 抛错 fail-closed，禁止发布
  // ========================================
  graph.addNode('do-not-invent-check', async (state) => {
    // 优先复用 L0-B 已读盘的文件内容（state._l0FilesForCheck），避免二次读盘
    const files = {};
    const cached = Array.isArray(state._l0FilesForCheck)
      ? state._l0FilesForCheck
      : null;
    if (cached) {
      for (const f of cached) files[f.path] = f.content;
    } else {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      for (const f of state.generatedFiles || []) {
        try {
          files[f] = readFileSync(join(state.outputPath, f), 'utf-8');
        } catch (e) {
          /* 忽略缺失文件 */
        }
      }
    }
    const analysis = {
      charts: state.charts || [],
      doNotInvent:
        state.layoutStructure?.doNotInvent ||
        state._visualParserCache?.doNotInvent ||
        [],
      layoutStructure: state.layoutStructure,
    };
    const res = validateDoNotInvent({ files, analysis });
    state._doNotInventResult = res;
    if (!res.pass) {
      const err = new Error(
        `禁止臆造校验未通过，禁止发布组件：${res.issues.map((i) => i.id).join(', ') || 'unknown'}`,
      );
      err.code = 'DO_NOT_INVENT_BLOCKED';
      err.doNotInventResult = res;
      throw err;
    }
    logger.info('✅ 禁止臆造校验通过', { issueCount: res.issues.length });
    return { doNotInventResult: res };
  });

  // ========================================
  // generate 模式一次性运行时门禁：真实预览渲染 + 运行检查（不进入精修循环）
  // BLOCK/fatal → 抛错 fail-closed；渲染基础设施异常 → 非阻塞降级（避免 Puppeteer 偶发失败阻断所有生成）
  // ========================================
  graph.addNode('generate-runtime-verify', async (state) => {
    try {
      await publishQualityPreview({
        outputPath: state.outputPath,
        componentId: state.sessionId,
        groupId: state.groupId || 'default-group',
        target: state.target,
      });
      const result = await renderScreenshot({
        outputPath: state.outputPath,
        sessionId: state.sessionId,
        groupId: state.groupId || 'default-group',
        componentName: state.componentName,
        target: state.target,
        previewImage: state.previewImage || null,
        onProgress: state.onProgress,
        hardGate: true,
        allowMissingAssetSelfHeal: true,
      });
      const runtimeGate = result.runtimeGate || evaluateRuntimeGate(result);
      state.runtimeGate = runtimeGate;
      state.visualFidelity = result.visualFidelity;
      const classification = classifyRuntimeGate(runtimeGate);
      const action =
        classification?.action ||
        (runtimeGate?.status === 'PASS' ? 'pass' : 'fail');
      state.onProgress?.({
        stage: '运行时质量门禁',
        message:
          action === 'pass' || action === 'complete_with_warning'
            ? '真实预览加载与渲染检查通过'
            : action === 'incremental_fix'
              ? `运行时检查发现问题，但不阻断生成（${runtimeGate?.issues?.length || 1} 项）`
              : `真实预览检查未通过（${runtimeGate?.issues?.length || 1} 项阻断问题）`,
        status:
          action === 'pass' ||
          action === 'complete_with_warning' ||
          action === 'incremental_fix'
            ? 'completed'
            : 'warning',
      });
      if (action === 'fail' && runtimeGate?.status === 'BLOCK') {
        // 诊断：打印具体阻断项（如 RUNTIME-004 组件渲染失败 / RUNTIME-012 空白截图），便于人工定位根因
        logger.warn('[运行时质量门禁] 诊断阻断项', {
          v3Mode: state._v3Mode,
          blockingIssues: (classification?.blockingIssues || []).map((i) => ({
            id: i.id,
            severity: i.severity,
            category: i.category,
            message: i.message,
          })),
        });
        // 🔧 generate 模式（写完即停）：与 phase2.service.ts:634「generate 模式跳过质量门禁」一致，
        // 运行时门禁失败不 fail-closed 抛错，产物仍发布到 workspace 供人工审查，避免 20+ 分钟成果作废。
        // 非 generate 模式（minimal/full）保留原 fail-closed 语义（service 层亦会据此标记 terminalError）。
        // 🛡️ P0 升级（2026-09-02，mv-max-1788359428498-ee0cbe69）：确定性运行时缺失（X is not defined /
        // Cannot read properties of undefined 等）不降级——坏产物此前被当成功任务交付，generate 也要硬 BLOCK。
        const isGenerateMode = (state._v3Mode || 'generate') === 'generate';
        const isDeterministicMissing = hasDeterministicRuntimeMissing(runtimeGate);
        if (isGenerateMode && !isDeterministicMissing) {
          logger.warn('generate 运行时门禁未通过，降级为完成（不阻断发布）', {
            issues: (runtimeGate?.issues || []).map((i) => ({
              id: i.id,
              severity: i.severity,
              message: i.message,
            })),
          });
          state.onProgress?.({
            stage: '运行时质量门禁',
            message: `运行时门禁未通过（generate 模式不阻断）：${runtimeGate?.issues?.length || 0} 项，产物已发布供人工审查`,
            status: 'warning',
          });
          return {
            runtimeGate,
            renderedImage: result.renderedImage,
            _runtimeGateDowngraded: true,
          };
        }
        if (isDeterministicMissing) {
          logger.error('🚫 vue3 generate 运行时门禁硬 BLOCK（确定性运行时缺失，降级会交付坏产物）', {
            v3Mode: state._v3Mode,
            issues: (runtimeGate?.issues || []).map((i) => ({
              id: i.id,
              severity: i.severity,
              message: i.message,
              errors: i.evidence?.errors?.slice?.(0, 3),
            })),
          });
        }
        const err = new Error(
          `generate 运行时质量门禁阻断: ${(runtimeGate.issues || []).map((i) => i.id).join(', ')}`,
        );
        err.code = 'GENERATE_RUNTIME_GATE_BLOCKED';
        err.runtimeGate = runtimeGate;
        throw err;
      }
      if (action === 'incremental_fix') {
        logger.warn(
          'vue3 generate 运行时门禁发现问题但不阻断（incremental_fix）',
          {
            issues: runtimeGate?.issues?.map((i) => ({
              id: i.id,
              severity: i.severity,
              message: i.message,
            })),
            reason: classification?.reason,
          },
        );
      }
      return { runtimeGate, renderedImage: result.renderedImage };
    } catch (error) {
      if (error.code === 'GENERATE_RUNTIME_GATE_BLOCKED') throw error;
      logger.warn('generate 运行时门禁跳过（渲染基础设施异常）', {
        error: error.message,
      });
      state.onProgress?.({
        stage: '运行时质量门禁',
        message: `运行时门禁跳过（渲染异常）：${error.message}`,
        status: 'warning',
      });
      return {
        runtimeGate: {
          status: 'WARN',
          warning: { message: '运行时门禁跳过: ' + error.message },
        },
      };
    }
  });

  graph.addEdge('do-not-invent-check', 'generate-runtime-verify');
  graph.addEdge('generate-runtime-verify', 'complete');

  // ── 精修链路：根据模式选择串行/并行（L0-B 之后到达）──
  // minimal/off: code-structure-validator → layout-refiner-legacy → style-refiner-legacy (串行)
  // full: code-structure-validator → parallel-refine (并行)

  // ⚠️ 注意：legacy 边的定义已移到 legacy 节点定义之后 (line ~1520)
  // 原因：Graph.addEdge() 要求源/目标节点必须先通过 addNode() 注册

  // ── full 模式的并行精修后续 ──
  // parallel-refine → refine-feedback(L1) 或直连 adversarial-checker(minimal)
  graph.addConditionalEdge('parallel-refine', (state) => {
    const mode = state._v3Mode || 'generate';
    return isFeatureEnabled(mode, 'l1-feedback')
      ? 'refine-feedback'
      : 'adversarial-checker';
  });

  //L1/L2简化：L1不做回退决策，直接流向L2统一决策
  // L1的精修建议通过state传递给L2
  graph.addEdge('refine-feedback', 'adversarial-checker');

  graph.addEdge('adversarial-checker', 'runtime-preview-gate');
  graph.addEdge('runtime-preview-gate', 'revision-decision');

  // ── L2 智能路由（revision-decision 分发）──
  // full 模式: 4路分发（stylistic/layout/full/structural）
  // minimal/off: binary 决策（engineer 或 complete）
  graph.addConditionalEdge('revision-decision', (state) => {
    if (!state.needsRevision) return 'complete';

    const mode = state._v3Mode || 'generate';

    // minimal/off 模式：仅 binary 决策
    if (!isFeatureEnabled(mode, 'l2-routing')) {
      emitMetrics('revision-decision', {
        routingTarget: 'microcode-engineer',
        routingReason: 'binary_decision(v2_compat)',
        v3Mode: mode,
      });
      return 'microcode-engineer';
    }

    // full 模式：4路智能路由
    let target = 'microcode-engineer';
    switch (state._reviseTarget) {
      case 'stylistic':
        target = 'style-refiner';
        break;
      case 'layout':
        target = 'parallel-refine';
        break;
      default:
        target = 'microcode-engineer';
    }

    // 🧠 记录路由事件（供自优化分析路由循环）
    const routingEvent = {
      target,
      reason: state._lastRoutingReason || `target=${state._reviseTarget}`,
      _reviseTarget: state._reviseTarget,
    };
    state._routingEvents = [...(state._routingEvents || []), routingEvent];

    emitMetrics('revision-decision', {
      routingTarget: target,
      routingReason:
        state._lastRoutingReason || `target=${state._reviseTarget}`,
      violationCount: state.violationCount || 0,
      v3Mode: mode,
    });

    return target;
  });

  //L2 路由到 style-refiner 后仍需回到 adversarial-checker
  graph.addEdge('style-refiner', 'adversarial-checker');

  // ========================================
  //串行兼容节点（minimal/off 模式回退用）
  // 这些节点在 full 模式下不会被访问到
  // ========================================
  graph.addNode('layout-refiner-legacy', async (state) => {
    logger.info('📦 节点: Layout Refiner (串行兼容模式/minimal)');

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const refiner = new LayoutRefiner({
        apiKey:
          textCfg.apiKey ||
          process.env.TEXT_API_KEY ||
          process.env.ANTHROPIC_API_KEY,
        model:
          textCfg.model ||
          process.env.TEXT_MODEL ||
          process.env.ANTHROPIC_MODEL,
        baseURL:
          textCfg.baseURL ||
          process.env.TEXT_BASE_URL ||
          process.env.ANTHROPIC_BASE_URL,
        onTokenUsage: state.onTokenUsage,
      });

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        layoutStructure: state.layoutStructure,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        _reviseTarget: 'full', // 串行模式下不做范围限制
        onProgress: state.onProgress,
      });

      emitMetrics('layout-refiner-legacy', {
        refined: result.refined,
        durationMs: Date.now() - (state._refineStart || Date.now()),
      });
      return { layoutRefineResult: result };
    } catch (error) {
      logger.error('串行布局精修失败', { error: error.message });
      throw error;
    }
  });

  graph.addNode('style-refiner-legacy', async (state) => {
    logger.info('📦 节点: Style Refiner (串行兼容模式/minimal)');

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
      });

      const result = await refiner.execute({
        target: 'vue3',
        figmaNodeData: state.figmaNodeData,
        styleMappings: state.styleMappings,
        visualElements: state.visualElements,
        outputPath: state.outputPath,
        generatedFiles: state.generatedFiles,
        _reviseTarget: 'full',
        onProgress: state.onProgress,
      });

      emitMetrics('style-refiner-legacy', {
        refined: result.refined,
        durationMs: Date.now() - (state._refineStart || Date.now()),
      });
      return { styleRefineResult: result };
    } catch (error) {
      logger.error('串行样式精修失败', { error: error.message });
      throw error;
    }
  });

  // ========================================
  //串行兼容链路（minimal/off 模式使用）
  // 必须在节点定义之后添加边，因为 addEdge() 会检查节点是否存在
  // ========================================
  graph.addEdge('layout-refiner-legacy', 'style-refiner-legacy');
  graph.addEdge('style-refiner-legacy', 'adversarial-checker');

  logger.info(`✅ Vue3 组件生成管线已就绪 (模式: ${resolvedConfig.mode})`);
  logger.info(
    '   新增节点: preview-validator, parallel-refine, refine-feedback, layout-refiner-legacy, style-refiner-legacy',
  );
  logger.info('   新增循环: L0-A(自验), L1(反馈), L2(智能路由)');
  logger.info(
    '   模式切换: off / minimal / full (通过 V3_MODE env 或 config.v3Mode)',
  );
  logger.info(
    `   当前默认: ${resolvedConfig.mode} | l0MaxRetry=${resolvedConfig.config.l0MaxRetry} | bypassThreshold=${resolvedConfig.config.l0BypassAfterFailures}`,
  );

  return graph;
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
    panelType, //面板类型
    figmaToken,
    aiConfig,
    visionAIConfig,
    textAIConfig,
    onProgress,
    sessionId, //用于 Token 追踪关联
    groupId, //运行时预览发布路径
    pauseChecker, //分块生成前暂停检查
    onFilesReady, //完整 files map 生成后发布任务级候选快照
    uiCache, //S15: UI 缓存（路径B — figma/visual 节点短路）
    _resumeData, //断点续跑数据 { stage, cachedReviewResult, cachedStyleMappings }
    generationTier, //生成档位（lite/max），由 controller 透传
    sourceType, //输入来源（screenshot/figma/html）
  } = options;

  logger.info('开始 Vue3 Figma阶段生成', {
    componentName,
    fileKey,
    nodeId,
    visionModel: visionAIConfig?.model || aiConfig?.model,
    textModel: textAIConfig?.model || aiConfig?.model,
  });

  //断点续跑：检查点保存辅助函数
  // P2 收编：实现已移至 ../utils/save-checkpoint.js，与 phase2 graph 共用同一份。
  // 原实现在两个 graph 中各存一份、逐字节相同；分叉后只会在「换 graph 后断点续跑失效」时暴露。
  const saveCheckpoint = async (name, data) =>
    saveCheckpointShared({
      outputPath,
      name,
      data,
      logger,
      fileKey,
      nodeId,
    });

  //创建 Token 预算管控器
  const tokenBudget = new TokenBudget({
    onWarning: (status) => {
      onProgress?.({
        type: 'budget-warning',
        stage: '预算警告',
        message: `Token 使用已超过 ${Math.round(status.warningThreshold * 100)}% (${status.used.toLocaleString()}/${status.budget.toLocaleString()})`,
        status: 'warning',
        tokenStatus: status,
      });
    },
    onExceeded: (status) => {
      onProgress?.({
        type: 'budget-exceeded',
        stage: '预算超限',
        message: `Token 预算已耗尽 (${status.used.toLocaleString()}/${status.budget.toLocaleString()})，生成将降级返回`,
        status: 'error',
        tokenStatus: status,
      });
    },
  });

  //onTokenUsage 钩子：Agent 每次 LLM 调用后触发
  const onTokenUsage = (usageData) => {
    // 累积到预算管控器
    const status = tokenBudget.track(
      usageData.totalTokens,
      usageData.nodeName,
      usageData.model,
      {
        inputTokens: usageData.inputTokens,
        outputTokens: usageData.outputTokens,
      },
    );

    //持久化到 MongoDB（如果外部提供了记录函数）
    if (options.onTokenUsageRecord) {
      try {
        options.onTokenUsageRecord({
          ...usageData,
          sessionId: sessionId || null,
          componentName: componentName || undefined,
          fileKey: fileKey || undefined,
          nodeId: nodeId || undefined,
        });
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
        total: usageData.totalTokens,
      },
      budget: status,
      timestamp: Date.now(),
    });
  };

  const graph = createPhase2Graph();

  const initialState = {
    componentName,
    fileKey,
    nodeId,
    outputPath,
    panelType: panelType || 'default-panel', //面板类型
    figmaToken,
    aiConfig,
    visionAIConfig,
    textAIConfig,
    onProgress,
    //Token 追踪
    onTokenUsage,
    tokenBudget,
    sessionId: sessionId || null,
    groupId: groupId || 'default-group',
    target: 'vue3',
    generationTier: generationTier || 'max',
    sourceType: sourceType || null,
    pauseChecker: pauseChecker || null,
    onFilesReady: onFilesReady || null,
    //S15: UI 缓存 → figma/visual 节点短路（路径B）
    _uiCache: uiCache || null,
    //断点续跑数据
    _resumeData: _resumeData || null,
    //检查点保存
    _saveCheckpoint: saveCheckpoint,
  };

  try {
    const result = await graph.run(initialState);

    logger.info('✅ Vue3 Figma阶段完成', {
      success: result.success,
      iterations: result.iterations,
      duration: result.duration,
    });

    return result;
  } catch (error) {
    logger.error('Phase 2 Figma阶段失败', { error: error.message });
    throw error;
  }
}

export default createPhase2Graph;

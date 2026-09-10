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
  VISUAL_VERDICTS,
} from '../roles/visual-parser.js';
import { LayoutReviewer } from '../roles/layout-reviewer.js';
import { StyleMapper } from '../roles/style-mapper.js';
import { LayoutRefiner } from '../roles/layout-refiner.js';
import { StyleRefiner } from '../roles/style-refiner.js';
import { LayoutStyleRefiner } from '../roles/layout-style-refiner.js';
import { postRefineResourceImportGuard } from '../utils/resource-import-guard.js';
// P2 收编：saveCheckpoint 原在本文件重复实现一份，与 vue3 graph 逐字节相同 → 统一到 utils
import { saveCheckpoint as saveCheckpointShared } from '../utils/save-checkpoint.js';
import { MicrocodeEngineer } from '../roles/microcode-engineer.js';
//S9: 文档分析编排器（CJS 模块，ESM 默认导入互操作）
import docAnalyzerModule from '../../phase2/doc/doc-analyzer.js';
import { AdversarialChecker } from '../roles/adversarial-checker.js';
//视觉比对：截图渲染 + 视觉比对
import {
  renderScreenshot,
  warmupBrowser,
  evaluateRuntimeGate,
  classifyRuntimeGate,
  buildRuntimeRevisionGuidance,
  hasDeterministicRuntimeMissing,
} from '../roles/screenshot-renderer.js';
import {
  getMaxIterations,
  getQualityScoreThreshold,
  getMinIterations,
  getMaxVisualIterations,
} from '../../config/runtime-env.js';
// 🛡️ 2026-09-03 修复：原 const {publishQualityPreview} = require(...cjs) 顶层裸 require——
// ESM 判定（Node 语法检测）下抛 "require is not defined"。publisher 已 module.exports named export，
// cjs-module-lexer 可识别，改 ESM import 兼容 CJS/ESM 双加载。
import { publishQualityPreview } from '../utils/workspace-preview-publisher.js';
import { VisualComparator } from '../roles/visual-comparator.js';
import { join } from 'path';
import { existsSync } from 'fs';
//  引入 validators
import { PreviewAnalysisValidator } from '../validators/preview-analysis-validator.js';
import {
  CodeStructureValidator,
  hasScopedLessStyle,
  findPrefixViolations,
  resolveClassPrefixId,
} from '../validators/code-structure-validator.js';
import { isFeatureEnabled } from '../config/v3-mode-features.js';
//  P0-4: flex 布局静态检查 + 自动修复（零 LLM）
import {
  checkFlexUsage,
  autoFixFlexIssues,
} from '../validators/code-structure-validator.js';
//  P0-2: 结构顺序门禁（零 LLM，防区块颠倒）
import { validateStructureOrder } from '../validators/structure-order-validator.js';
import { LessCompileGate } from '../validators/less-compile-gate.js';
//  R5: 产物集合级完整性硬门禁（complete 节点第一步，缺失/空/无 template 即 fail-closed）
import {
  assertArtifactIntegrity,
  buildArtifactIntegrityError,
} from '../utils/artifact-integrity.js';
//S11: 文档页面元素覆盖率校验器（L0-B 扩展）
import { ElementCoverageValidator } from '../validators/element-coverage-validator.js';
import { formatFigmaStyleData } from '../utils/figma-format.js';
import { GenerationContext } from '../types/generation-context.js';
import { runGenerationContextShadow } from '../context/generation-context-shadow.js';
import { OrphanComponentDetector } from '../validators/orphan-component-detector.js';
import { LessVariableChecker } from '../validators/less-variable-checker.js';
import { HeaderRelationValidator } from '../validators/header-relation-validator.js';
import { HeaderSlotValidator } from '../validators/header-slot-validator.js';
import { applyHeaderSlotContractRewrite } from '../utils/header-slot-contract.js';
import { resolveNodeExclusivity } from '../utils/node-exclusivity.js';
import { validateDoNotInvent } from '../validators/do-not-invent-validator.js';
import { createLogger } from '../logger/index.js';
import { subcomponentPlanner } from '../roles/subcomponent-planner.js';
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
  resolveTargetFilesFromIssues,
  extractFilesFromErrorMsg,
} from '../utils/revision-files.js';
import { withTimeout } from '../orchestrator/orchestrator.js';
import { buildChatUrl } from '../utils/chat-url.js';
import { isOpenAICompatibleBaseURL } from '../utils/provider-utils.js';
import {
  detectNavSignal,
  injectNavSectionIfMissing,
} from '../utils/nav-section.js';

const logger = createLogger({ name: 'mc-component-graph-phase2-v3' });

/**
 *S9: 为文档 D2 组装 LLM 调用器（OpenAI 兼容 / Anthropic 双协议）
 * 配置缺失返回 undefined（文档分析自动降级，D2 跳过不阻塞）
 */
function buildDocInvokeLLM(textCfg = {}) {
  const apiKey = textCfg.apiKey;
  const baseURL = textCfg.baseURL;
  const model = textCfg.model;
  if (!apiKey || !baseURL) return undefined;

  const isOpenAICompatible = isOpenAICompatibleBaseURL(baseURL);

  return async (prompt) => {
    if (isOpenAICompatible) {
      const axios = (await import('axios')).default;
      const url = buildChatUrl(baseURL);
      const response = await axios.post(
        url,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );
      return response.data.choices[0].message.content;
    }
    const { ChatAnthropic } = await import('@langchain/anthropic');
    const { HumanMessage } = await import('@langchain/core/messages');
    const llm = new ChatAnthropic({
      modelName: model,
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL || undefined,
      temperature: 0.2,
      maxTokens: 2048,
    });
    const response = await llm.invoke([new HumanMessage({ content: prompt })]);
    return Array.isArray(response.content)
      ? response.content
          .filter((c) => !c?.type || c.type !== 'thinking')
          .map((c) => (typeof c === 'string' ? c : c.text || ''))
          .join('')
      : String(response.content || '');
  };
}

/**
 * 解析 v3.0 运行模式
 * @param {Object} options - 构造选项或 state
 * @returns {{ mode: 'off'|'minimal'|'full', config: Object }}
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
      // 质量参数统一走 runtime-env（默认对齐本地严格值，线上未配置也与本地一致）
      maxIterations: getMaxIterations(),
      qualityScoreThreshold: getQualityScoreThreshold(),
      minIterations: getMinIterations(),
      maxVisualIterations: getMaxVisualIterations(),
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

function isUntrustedVisualAnalysis(result = {}) {
  return (
    result.degraded === true ||
    result.visualDegraded === true ||
    result.layoutStructure?.degraded === true ||
    result.layoutStructure?.visualDegraded === true
  );
}

function buildVisualAnalysisBlockError(result = {}) {
  const reason =
    result.degradeReason ||
    result.layoutStructure?.degradeReason ||
    '视觉分析结果已降级';
  const layoutSource =
    result.layoutSource || result.layoutStructure?.layoutSource || 'unknown';
  return new Error(
    `视觉分析失败或降级，已阻断代码生成，避免大模型盲生成/臆造内容。原因：${reason}；layoutSource=${layoutSource}`,
  );
}

/**
 * 创建 Phase 2 Figma阶段工作流图
 * @param {Object} [config] - 可选的 v3.0 配置
 * @param {string} [config.v3Mode='generate'] - 运行模式: off | minimal | full | generate
 *   - generate（默认）: 代码写完即停（保留 L0-B 确定性校验），不进入精修/对抗检查/质量门禁/修订循环
 *   - full: 完整自动链路（精修 + 质量闭环 + 最多3轮修订）
 */
export function createPhase2Graph(config = {}) {
  const graph = new Graph({ name: 'mc-component-phase2-figma' });

  // 🆕 节点跳过机制（管线二可编辑）：config.skipNodes 数组内的节点注册为
  // pass-through（保留图结构与边，不破坏路由），运行时直接透传 state。
  // 用于 phase2 变体管线：用户删掉的节点 → 引擎跳过，其余全链路不变。
  const skipSet = new Set(
    Array.isArray(config.skipNodes) ? config.skipNodes : [],
  );
  const addNodeWithSkip = (name, handler) => {
    if (skipSet.has(name)) {
      logger.info(`⏭️ 跳过节点（变体管线配置）: ${name}`);
      graph.addNode(name, async (state) => {
        state.onProgress?.({
          stage: name,
          message: `⏭️ 已跳过（变体管线）`,
          status: 'completed',
        });
        return state;
      });
    } else {
      graph.addNode(name, handler);
    }
  };

  //修订环闭包计数器：绕过 state.iterationCount 跨节点持久化失效（实测在修订环里
  // state.iterationCount 不递增，导致 maxIterations 兜底失效、refiner 无限循环烧钱）。
  // 每次调用 createPhase2Graph() 重建闭包，per-session 独立初始化。
  let revisionLoopCount = 0;

  // 预解析模式（init 节点中会再次确认）
  const resolvedConfig = resolveV3Mode(config);

  // ========================================
  // 节点 1: 初始化 (📊 metrics 注入)
  // ========================================
  addNodeWithSkip('init', async (state) => {
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

    //S9+S10: 文档子管线（并行版）— init 发起 Promise 不阻塞，figma-connector 汇合
    // 优先级：预分析产物(state.docAnalysis) > 原文分析(state.requirementDoc)
    // Promise 自捕获错误（resolve null），不阻塞主管线
    let docAnalysis = state.docAnalysis || null;
    let docAnalysisPromise = null;
    let docAnalysisDegraded = false;
    if (
      !docAnalysis &&
      state.requirementDoc &&
      state.requirementDoc.trim().length >= 20
    ) {
      state.onProgress?.({
        stage: '文档分析',
        message: '📄 需求文档后台并行解析中（D0/D1 确定性 + D2 LLM）...',
        status: 'running',
      });
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const invokeLLM = buildDocInvokeLLM(textCfg);
      docAnalysisDegraded = !invokeLLM;
      docAnalysisPromise = docAnalyzerModule
        .analyze(state.requirementDoc, { invokeLLM, source: 'paste' })
        .then((result) => {
          logger.info('📄 文档子管线完成（并行）', {
            events: result.events?.length || 0,
            apis: result.dataBinding?.apis?.length || 0,
            businessConfig: result.businessConfig?.length || 0,
            uiElements: result.uiElements?.length || 0,
            llmUsed: result.extractionMeta?.llmUsed || [],
          });
          return result;
        })
        .catch((e) => {
          logger.warn('📄 文档分析失败（降级为纯视觉生成，不阻塞）', e.message);
          return null;
        });
    } else if (docAnalysis) {
      state.onProgress?.({
        stage: '文档分析',
        message: '📄 使用预分析文档产物（前端已解析）',
        status: 'completed',
      });
    }

    //  预热 Puppeteer browser（非阻塞，避免 screenshot-renderer 首次启动延迟）
    warmupBrowser().catch(() => {}); // 静默错误，不阻塞 init

    return {
      ...state,
      stage: 'figma',
      iterationCount: 0,
      maxIterations: v3Config.maxIterations,
      startTime: Date.now(),
      //S9: 文档分析产物（engineer 注入依据）
      docAnalysis,
      //S10: 文档分析 Promise（figma-connector 节点汇合，60s 超时兜底）
      _docAnalysisPromise: docAnalysisPromise,
      _docAnalysisDegraded: docAnalysisDegraded,
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
      //视觉比对：质量模式 (fast | standard | strict)
      _qualityMode: state.qualityMode || config.qualityMode || 'standard',
    };
  });

  // ========================================
  // 节点 2: Figma Connector - 获取详细数据
  // ========================================
  addNodeWithSkip('figma-connector', async (state) => {
    logger.info('节点: Figma Connector - 获取详细数据');

    state.onProgress?.({
      stage: 'Figma数据获取',
      message: '📥 正在获取Figma详细数据和资源...',
      status: 'running',
    });

    try {
      //S15: UI 缓存短路（路径B — 缓存命中则跳过 Figma API 调用）
      if (state._uiCache?.figmaNodeData) {
        logger.info('🗃️ figma-connector: UI 缓存命中，跳过 Figma API 调用');
        state.onProgress?.({
          stage: 'Figma数据获取',
          message: '🗃️ 使用缓存的 Figma 数据（路径B免重复拉取）',
          status: 'completed',
        });
        const cachedTechHints = state._uiCache.techStackHints || [];
        const cachedNodeData = state._uiCache.figmaNodeData;

        // 🔧 修复：缓存命中也要下载业务资源图（downloadAssets 不能跳过）
        // 背景：缓存只存了 figmaNodeData（节点树），没存图片文件本身
        // downloadAssets 需要写文件到当前任务的 resources/images/，不能复用
        let assets = [];
        let resourceDomMapping = null;
        try {
          const connector = new FigmaConnector({
            figmaToken: state.figmaToken,
          });
          const { join } = await import('path');
          const resourcesDir = join(state.outputPath, 'resources/images');

          // 用缓存的 nodeData 下载图片（不调 Figma fetchNodeData API）
          assets = await connector.downloadAssets(
            state.fileKey,
            cachedNodeData,
            resourcesDir,
          );
          resourceDomMapping = connector._buildResourceDomMapping(
            cachedNodeData,
            assets,
          );

          // 资源文件存在性校验（与 connector.execute 一致）
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

          // 保存 resource-dom-mapping.json（与 connector.execute 一致）
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
          // 降级：继续用空数组，不阻断生成
          assets = [];
          resourceDomMapping = null;
        }

        return {
          figmaStyleTree: formatFigmaStyleData(cachedNodeData),
          previewImage: state._uiCache.previewImage || null,
          figmaNodeData: cachedNodeData,
          assets,
          resourceDomMapping,
          techStackHints: cachedTechHints,
          docAnalysis: state.docAnalysis || null,
        };
      }

      const connector = new FigmaConnector({
        figmaToken: state.figmaToken,
      });

      //S10: Figma 拉取与文档分析 Promise 真并发（两管线并行，60s 超时兜底）
      // 💬 为什么这里用 Promise.race 而不是 withTimeout？
      // - 文档分析 Promise 是在前置节点（文档分析节点）内已经启动的，不是在这个节点内创建的
      // - withTimeout 需要重新创建 Promise 才能取消，但这里无法重新触发文档分析
      // - Promise.race 的超时只是"不再等待"，底层 Promise 仍会在后台继续执行（但不阻塞主流程）
      // - 这是 Promise.race 的合理用法：join 外部已启动的异步任务 + 超时降级
      const docJoinPromise = state._docAnalysisPromise
        ? Promise.race([
            state._docAnalysisPromise,
            new Promise((resolve) =>
              setTimeout(() => resolve('__doc_timeout__'), 60000),
            ),
          ])
        : Promise.resolve(null);

      const [result, docResult] = await Promise.all([
        connector.execute({
          fileKey: state.fileKey,
          nodeId: state.nodeId,
          outputPath: state.outputPath,
        }),
        docJoinPromise,
      ]);

      //S10: 汇合文档分析结果（并行完成 / 超时降级 / 失败降级）
      let docAnalysis = state.docAnalysis || null;
      if (state._docAnalysisPromise) {
        if (docResult === '__doc_timeout__') {
          logger.warn('📄 文档分析超过 60s，降级为确定性结果或纯视觉生成');
          state.onProgress?.({
            stage: '文档分析',
            message: '⚠️ 文档分析超时(60s)，按已提取内容继续',
            status: 'warning',
          });
          // 超时但 Promise 可能稍后完成 — 不等待，docAnalysis 保持 null（engineer 无注入，降级）
        } else if (docResult) {
          docAnalysis = docResult;
          state.onProgress?.({
            stage: '文档分析',
            message:
              `✅ 文档解析完成（并行）：${docResult.extractionMeta?.deterministicFields || 0} 字段` +
              `${docResult.extractionMeta?.fullConfigDetected ? '（含微码四配置 ✓）' : ''}` +
              `${state._docAnalysisDegraded ? '（无文本AI配置，D2 降级）' : ''}`,
            status: 'completed',
          });
        } else {
          state.onProgress?.({
            stage: '文档分析',
            message: '⚠️ 文档分析失败，按纯视觉生成',
            status: 'warning',
          });
        }
      }

      // 提取技术栈提示
      const techStackHints = connector.extractTechStackHints(
        result.figmaNodeData,
      );

      // 优化 Figma 节点数据（减少 Token 消耗 40-50%）
      const optimizedFigmaData = connector.pruneRedundantFields(
        result.figmaNodeData,
      );
      const figmaStyleTree = formatFigmaStyleData(optimizedFigmaData);

      // 🏷️ 早提取组件中文名（根节点名 cp-流量监测 → 流量监测），随完成事件带给 service 层
      // 回写任务 displayName（监控浮窗/任务中心尽早显示中文名）。仅接受含 CJK 的标题。
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

      //保存 checkpoint
      state._saveCheckpoint?.('figma', optimizedFigmaData);

      return {
        figmaStyleTree: figmaStyleTree,
        previewImage: result.previewImage,
        figmaNodeData: optimizedFigmaData,
        assets: result.assets,
        resourceDomMapping: result.resourceDomMapping,
        techStackHints: techStackHints,
        //S10: 汇合后的文档分析产物
        docAnalysis,
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
  addNodeWithSkip('visual-parser', async (state) => {
    logger.info('节点: Visual Parser - 重新分析');

    state.onProgress?.({
      stage: '视觉分析',
      message: '🔍 正在使用Figma数据重新分析...',
      status: 'running',
    });

    try {
      //S15: 视觉分析缓存短路（路径B — 缓存命中则跳过 Vision AI 调用）
      if (state._uiCache?.previewAnalysis) {
        logger.info('🗃️ visual-parser: 视觉分析缓存命中，跳过 Vision AI 调用');
        state.onProgress?.({
          stage: '视觉分析',
          message: '🗃️ 使用缓存的视觉分析结果（路径B免重复 Vision AI）',
          status: 'completed',
        });
        const cached = state._uiCache.previewAnalysis;
        const cachedResult = {
          layoutStructure: cached.layoutStructure || cached,
          visualElements: cached.visualElements || null,
          charts: cached.charts || [],
          interactions: cached.interactions || [],
          analysisType: cached.analysisType || state.analysisType || '',
          analysisTarget: cached.analysisTarget || state.analysisTarget || '',
          analysisDescription: cached.analysisDescription || '',
          analysisEvidence: cached.analysisEvidence || [],
          analysisDiagnostics: cached.analysisDiagnostics || [],
          analysisFixes: cached.analysisFixes || [],
          chromeSectionDiagnostics: cached.chromeSectionDiagnostics || [],
          resourceDiagnostics: cached.resourceDiagnostics || [],
          coverageReport: cached.coverageReport || null,
          textTruthValidation: cached.textTruthValidation || null,
          chartDataHints: cached.chartDataHints || null,
          degraded:
            cached.degraded === true ||
            cached.layoutStructure?.degraded === true,
          visualDegraded:
            cached.visualDegraded === true ||
            cached.layoutStructure?.visualDegraded === true,
          layoutSource:
            cached.layoutSource || cached.layoutStructure?.layoutSource || null,
          degradeReason:
            cached.degradeReason ||
            cached.layoutStructure?.degradeReason ||
            null,
          _uiCacheHit: true,
        };
        if (isUntrustedVisualAnalysis(cachedResult)) {
          const blockError = buildVisualAnalysisBlockError(cachedResult);
          logger.error('🚫 命中的视觉缓存为降级结果，阻断后续生成', {
            reason: cachedResult.degradeReason,
            layoutSource: cachedResult.layoutSource,
          });
          state.onProgress?.({
            stage: '视觉分析',
            message: `❌ ${blockError.message}`,
            status: 'failed',
          });
          throw blockError;
        }
        return cachedResult;
      }

      // 视觉任务：使用 visionAIConfig（Qwen/DashScope）
      const visionCfg = state.visionAIConfig || state.aiConfig || {};
      // 🔧 P2-temperature: 必须显式传 temperature，否则用户在前端配置的 visionTemperature 会被丢弃
      // resolveVisionConfig/resolveTextConfig 已在 ai-defaults.js 中读取并写入 visionCfg.temperature
      const parser = new VisualParser({
        apiKey: visionCfg.apiKey,
        baseURL: visionCfg.baseURL,
        model: visionCfg.model,
        temperature: visionCfg.temperature, // 🔧 补齐：用户配置的 temperature
        providerType: visionCfg.providerType, // 🔧 补齐：显式 provider 类型
        providerId: visionCfg.providerId, // 🔧 补齐：供应商池 pick 的 provider id
        onProgress: state.onProgress,
        onTokenUsage: state.onTokenUsage,
      });

      // 添加可中断超时保护：图层超时会显式 abort 到 Vision 请求层
      const VISUAL_TIMEOUT_MS = 10 * 60 * 1000;
      const runVisualParser = withTimeout(
        (nextState) =>
          parser.execute({
            target: 'microcode',
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
      let result = await runVisualParser(state);

      // Vision 超时/解析失败后的 Figma 坐标兜底只能用于诊断展示，不能继续进入 LLM 代码生成。
      // 否则 layout-reviewer/style-mapper/microcode-engineer 会把不可信的浅层 Figma 节点名当成完整设计，
      // 再结合业务语义补全统计卡、图表、任务列表等 UI，造成严重臆造。
      if (isUntrustedVisualAnalysis(result)) {
        const blockError = buildVisualAnalysisBlockError(result);
        logger.error('🚫 视觉分析降级，阻断后续生成', {
          reason: result.degradeReason || result.layoutStructure?.degradeReason,
          layoutSource:
            result.layoutSource || result.layoutStructure?.layoutSource,
          sectionsCount:
            result.layoutStructure?.layout?.sections?.length ||
            result.layoutStructure?.sections?.length ||
            0,
          analysisEvidenceCount: result.analysisEvidence?.length || 0,
        });
        state.onProgress?.({
          stage: '视觉分析',
          message: `❌ ${blockError.message}`,
          status: 'failed',
        });
        throw blockError;
      }

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
        // 硬阻断（默认关闭，FIGMA_COVERAGE_HARD_BLOCK=true 时启用）：标记后修订路由将跳过无依据重生成
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
          { thresholdRatio: 0.3 },
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

      // 🎯 headerSlots 契约回写 + 确定性纠错：
      // 1. 纠错：tab/segmented/switch 是「内容筛选控件」而非「标题栏辅助元素」，vision 看图
      //    极易把「紧贴标题的内容 tab」误判为 header-right 插槽（mc-max-1788003430879 实锤：
      //    tabs 实际在 slot-con 内容容器，vision 却输出 header-right tab 且 figmaNodeId 指向
      //    header 内的装饰矢量，不可靠）。故 tab 类候选只信确定性推导（derive 从 header 容器
      //    内命中 tab 才保留），vision 的 tab 候选无 derive 佐证 → 剔除。
      // 2. 纠错（🛡️ C-1，2026-09-02，9c3aff7f 实锤）：header-slot-validator 对「Figma 标题
      //    同行找不到匹配节点」的 vision 候选写入 rejectedNodes——内容区元素（tabs-icon/num）
      //    被误判 header-right 时在此剔除，杜绝流入 prompt → T09 文字兜底双份渲染。
      // 3. 合并：确定性推导（contractSlots）追加进 result.headerSlots，修复 vision 漏识别断点。
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
          `✅ headerSlots 契约回写: vision ${rewrite.existingAll}（纠错后 ${rewrite.visionKept}）+ derived kept=${rewrite.derivedKept} = ${result.headerSlots.length} 个`,
        );
      }

      // 🛡️ Loop 2.1.C（2026-09-10）：header vs content 互斥（figmaNodeId 只落一次）。
      // 同一 node 同时出现在 headerSlots 与 layout.sections → 二选一，避免 T09 双份渲染。
      try {
        const layout = result.layout || result.layoutStructure?.layout;
        const sections = layout?.sections || result.layoutStructure?.sections || [];
        if (result.headerSlots?.length > 0 && sections.length > 0) {
          const exc = resolveNodeExclusivity(result.headerSlots, sections);
          result.headerSlots = exc.slots;
          if (layout) {
            layout.sections = exc.sections;
          } else if (result.layoutStructure) {
            result.layoutStructure.sections = exc.sections;
          }
          if (exc.removedSlots.length > 0 || exc.removedContentNodes.length > 0) {
            logger.info('🛡️ 2.1.C 互斥裁决：剔除重复 node', {
              removedSlots: exc.removedSlots.length,
              removedContentNodes: exc.removedContentNodes.length,
            });
          }
        }
      } catch (excErr) {
        logger.warn('⚠️ 2.1.C 互斥裁决失败（非阻塞）', { error: excErr?.message });
      }

      state.onProgress?.({
        stage: '视觉分析',
        message: '✅ 视觉分析完成',
        status: 'completed',
      });

      //  缓存 visual-parser 结果（L0-A 循环中避免重复调用）
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
        analysisDiagnostics: result.analysisDiagnostics || [],
        analysisFixes: result.analysisFixes || [],
        chromeSectionDiagnostics: result.chromeSectionDiagnostics || [],
        resourceDiagnostics: result.resourceDiagnostics || [],
        coverageReport: result.coverageReport || null,
        textTruthValidation: result.textTruthValidation || null,
        chartDataHints: result.chartDataHints || null,
        //  P0-3: 降级标志
        degraded: result.degraded === true,
        layoutSource: result.layoutSource || null,
        degradeReason: result.degradeReason || null,
        timestamp: Date.now(),
      };

      //保存 checkpoint
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
        analysisDiagnostics: result.analysisDiagnostics || [],
        analysisFixes: result.analysisFixes || [],
        chromeSectionDiagnostics: result.chromeSectionDiagnostics || [],
        resourceDiagnostics: result.resourceDiagnostics || [],
        coverageReport: result.coverageReport || null,
        textTruthValidation: result.textTruthValidation || null,
        chartDataHints: result.chartDataHints || null,
        headerValidation,
        headerSlotValidation,
      });

      // 🛡️ P1: 视觉可信度评估（防止「解析成功但内容矛盾」进入生成）
      let visualTrust = evaluateVisualTrustVerdict(result);
      state._visualTrustVerdict = visualTrust.verdict;

      // 🛡️ low-coverage 定向重分析（2026-09-03）：覆盖率 <35% 先补跑一次（复用已识别节点、只补 missing），
      // 二次仍不达标才降级。此前 low-coverage 直接 _visualDegraded=true 硬失败，复杂设计稿（如隧道监控
      // 39%）一次低覆盖即失败，重试确定性复现 → 永远生成不了。补跑一次给视觉模型补全遗漏的机会。
      // 2026-09-04：阈值 40%→35% 同步到引导语文案（与 visual-trust.js 硬阈值保持一致）。
      if (
        visualTrust.verdict === VISUAL_VERDICTS.LOW_COVERAGE &&
        !state._lowCoverageRetried
      ) {
        state._lowCoverageRetried = true;
        const retryGuidance =
          `首次视觉分析覆盖率仅 ${visualTrust.coverageRate}%（<35%）。请对照 Figma 节点真值，` +
          `补充识别上一轮遗漏的区块、文字、图表与元素，尽量将覆盖率提升到 35% 以上；` +
          `严禁臆造 Figma 中不存在的元素。`;
        logger.warn('⚠️ 视觉覆盖率不足，触发一次定向重分析', {
          rate: visualTrust.coverageRate,
        });
        state.onProgress?.({
          stage: '视觉分析',
          message: `⚠️ 覆盖率 ${visualTrust.coverageRate}% 不足，正在定向补全重分析…`,
          status: 'running',
        });
        try {
          const retried = await parser.execute({
            target: 'microcode',
            previewImage: state.previewImage,
            figmaData: state.figmaNodeData,
            outputPath: state.outputPath,
            resourceDomMapping: state.resourceDomMapping,
            fileKey: state.fileKey,
            nodeId: state.nodeId,
            signal: state.signal || state.__abortSignal || null,
            onProgress: state.onProgress,
            requestConcurrency: state.requestConcurrency,
            requestQueueTimeoutMs: state.requestQueueTimeoutMs,
            requestTimeoutMs: state.requestTimeoutMs,
            requestMaxRetries: state.requestMaxRetries,
            retryGuidance,
            bypassCache: true,
          });
          if (retried && !isUntrustedVisualAnalysis(retried)) {
            result = retried;
            visualTrust = evaluateVisualTrustVerdict(retried);
            state._visualTrustVerdict = visualTrust.verdict;
            logger.info('✅ 定向重分析完成', {
              verdict: visualTrust.verdict,
              rate: visualTrust.coverageRate,
            });
            state.onProgress?.({
              stage: '视觉分析',
              message: `✅ 定向重分析完成，覆盖率 ${visualTrust.coverageRate}%`,
              status: 'completed',
            });
          }
        } catch (reErr) {
          logger.warn('⚠️ 定向重分析失败，维持首次分析结果', {
            error: reErr.message,
          });
        }
      }

      if (
        visualTrust.verdict === VISUAL_VERDICTS.CONFLICT ||
        visualTrust.verdict === VISUAL_VERDICTS.BLOCKED ||
        visualTrust.verdict === VISUAL_VERDICTS.LOW_COVERAGE
      ) {
        // 矛盾/不可用 → 标记降级，下游 engineer 兜底拒绝盲写、运行时门禁兜底拦截
        logger.warn('⚠️ 视觉分析可信度异常，标记降级', {
          verdict: visualTrust.verdict,
          reason: visualTrust.reason,
        });
        state._visualDegraded = true;
        state._visualDegradeReason =
          state._visualDegradeReason ||
          `视觉分析${visualTrust.verdict}: ${visualTrust.reason}`;
      } else if (visualTrust.verdict === VISUAL_VERDICTS.WARNING) {
        logger.warn('⚠️ 视觉分析覆盖率不足，保留降级提示', {
          reason: visualTrust.reason,
        });
      }

      return {
        layoutStructure: result.layoutStructure,
        visualElements: result.visualElements,
        interactions: result.interactions,
        charts: result.charts,
        headerValidation,
        headerSlotValidation,
        //headerSlots：面板头部插槽信息（供 microcode-engineer 使用）
        headerSlots: result.headerSlots || [],
        // 顶层组件类型信息
        analysisType: result.analysisType || '',
        analysisTarget: result.analysisTarget || '',
        analysisDescription: result.analysisDescription || '',
        analysisEvidence: result.analysisEvidence || [],
        analysisDiagnostics: result.analysisDiagnostics || [],
        analysisFixes: result.analysisFixes || [],
        chromeSectionDiagnostics: result.chromeSectionDiagnostics || [],
        resourceDiagnostics: result.resourceDiagnostics || [],
        coverageReport: result.coverageReport || null,
        textTruthValidation: result.textTruthValidation || null,
        chartDataHints: result.chartDataHints || null,
        // 视觉可信度 verdict 透传（trusted/warning/conflict/blocked）
        _visualTrustVerdict:
          visualTrust?.verdict || state._visualTrustVerdict || null,
        //  P0-3: 视觉分析降级标志透传（视觉超时→Figma 兜底 或 完全降级）
        // 🛡️ 覆盖修复（2026-09-02）：此前只透传 result.degraded（=「分析抛异常→兜底」），
        // 会覆盖掉上方 low-coverage/conflict/blocked 判定写入的 state._visualDegraded=true →
        // engineer 收到 false 不 throw，幻觉 vision 继续生成（设备监测事故）。改为 OR 保留两者。
        _visualDegraded: result.degraded === true || state._visualDegraded === true,
        _visualLayoutSource:
          result.layoutSource ||
          (result.layoutStructure && result.layoutStructure.layoutSource) ||
          null,
        _visualDegradeReason:
          // 🛡️ 修复（2026-09-03）：优先透传上方 low-coverage/conflict/blocked 判定写入的
          // state._visualDegradeReason（含「覆盖率严重不足 (39%)」等真实原因）。此前只取
          // result.degradeReason，low-coverage 场景下 result 无该字段 → 返回 null → engineer
          // 抛错只剩兜底文案「视觉分析结果已降级」，真实原因丢失。
          state._visualDegradeReason ||
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
  // 节点 5: Microcode Engineer - 生成/修订代码
  // ========================================
  addNodeWithSkip('microcode-engineer', async (state) => {
    const iteration = state.iterationCount || 0;
    const action = iteration === 0 ? '生成' : '修订';

    logger.info(
      `节点: Microcode Engineer - ${action}代码 (第${iteration + 1}轮)`,
    );

    // 🛡️ P0-3: Token 预算检查
    if (state._budgetExceeded) {
      logger.warn('⚠️ Token 预算已耗尽，跳过代码生成节点');
      state.onProgress?.({
        stage: '代码生成',
        message: '⚠️ Token 预算已耗尽，使用现有代码完成',
        status: 'warning',
      });
      // 如果已有生成的文件，直接返回；否则返回错误
      if (state.generatedFiles && state.generatedFiles.length > 0) {
        return { generatedFiles: state.generatedFiles };
      } else {
        throw new Error('Token 预算已耗尽且无可用代码');
      }
    }

    // Shadow 模式：运行 Context Assembler 收集诊断；接管成功后把裁决事实写回 state，
    // 使 engineer 的 generationInput 成为一等公民字段（单一事实源，下游只读不再推断）。
    const shadowReport = await runGenerationContextShadow(state, {
      pipeline: 'phase2',
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
      // 渲染器：微码组件固定使用 MicrocodeEngineer（面板头部/背景由 base-panel 插槽剥离，产物含 component.js/declare.json）
      const EngineerClass = MicrocodeEngineer;
      const engineer = new EngineerClass({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        providerId: textCfg.providerId || null,
      });

      // 提取 Figma 节点中文名称作为 displayName（用于 declare.json componentName）
      const displayName =
        state.figmaNodeData?.name ||
        state.analysisTarget ||
        state.componentName;

      if (
        state._visualDegraded ||
        state.layoutStructure?.degraded ||
        state.layoutStructure?.visualDegraded
      ) {
        const reason =
          state._visualDegradeReason ||
          state.layoutStructure?.degradeReason ||
          '视觉分析结果已降级';
        throw new Error(
          `视觉分析不可信，禁止进入代码生成，避免臆造内容。原因：${reason}`,
        );
      }

      const result = await engineer.execute({
        onProgress: state.onProgress, //  传递 SSE 进度回调（LLM 心跳 via invokeWithTimeout）
        signal: state.signal || state.__abortSignal || null,
        generationInput: state.generationInput, // 🆕 Context Assembler 裁决事实
        layoutStructure: state.layoutStructure,
        visualElements: state.visualElements,
        // 子组件规划结果（subcomponent-planner 产出）：engineer 据此生成强制子组件清单
        subComponentPlan: state.subComponentPlan,
        componentName: state.componentName,
        displayName, //  Figma 节点中文名称
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
        //视觉降级防线：engineer 内部也会兜底拒绝，避免未来改边绕过 visual-parser 闸门
        _visualDegraded: state._visualDegraded,
        _visualDegradeReason: state._visualDegradeReason,
        //S9: 文档分析产物（四配置/数据对接/交互注入依据）
        docAnalysis: state.docAnalysis,
        //暂停检查回调（由 phase2.service 注入，每个分块前调用）
        pauseChecker: state.pauseChecker || null,
        onFilesReady: state.onFilesReady || null,
        //运行时增量修订指导（来自 classifyRuntimeGate + buildRuntimeRevisionGuidance）
        _runtimeRevisionGuidance: state._runtimeRevisionGuidance,
        //  按问题类别只修目标文件（非 full 修订时生效）
        targetFiles: state._reviseFiles || null,
        reviseTarget: state._reviseTarget || null,
        // 🛡️ 资源归属指导（方案5）：上一轮漏用背景时，本轮注入归属指导。
        _attributionGuidance: state._attributionGuidance || null,
      });

      state.onProgress?.({
        stage: '代码生成',
        message: `✅ 代码${action}完成`,
        status: 'completed',
      });

      // 🆕 处理资源归属 BLOCK 返回（非异常路径）
      if (
        result &&
        result.success === false &&
        result.errorType === 'RESOURCE_ATTRIBUTION_BLOCK'
      ) {
        logger.warn('🚫 资源归属校验失败，准备触发重试', {
          blockCount: result.blockIssues?.length || 0,
          issues: result.blockIssues?.map((i) => i.message) || [],
        });

        // 触发重试决策（复用现有的 retry-policy 机制）
        const { decideRetry } = await import('./retry-policy.js');
        const decision = decideRetry(result.errorMessage, state);

        if (decision.ok) {
          state._pendingRetry = true;
          state._pendingRetryPolicyId = decision.policy.id;
          state._retryBudget = decision.budget;
          state._l0CodeRetryGuidance =
            (state._l0CodeRetryGuidance || '') + (decision.guidance || '');
          state._attributionGuidance = result.attributionGuidance; // 🆕 注入资源归属指导

          logger.warn('🛡️ 资源归属校验失败已判定可重试，带指导回退 engineer', {
            policy: decision.policy.id,
            policyName: decision.policy.name,
            used: decision.budget[decision.policy.id],
            budget: decision.policy.budget,
          });

          return {
            _pendingRetry: true,
            _pendingRetryPolicyId: decision.policy.id,
            _retryBudget: decision.budget,
            _l0CodeRetryGuidance: state._l0CodeRetryGuidance,
            _attributionGuidance: state._attributionGuidance,
            generatedFiles: result.partialResult?.files
              ? Object.keys(result.partialResult.files)
              : state.generatedFiles,
          };
        }

        // 重试预算耗尽，转为异常
        logger.error(`🚫 资源归属校验失败且无重试预算：${result.errorMessage}`);
        throw new Error(result.errorMessage);
      }

      return {
        generatedFiles: result.writtenFiles,
        componentStructure: result.componentStructure,
        // L0-B 重试计数由 code-structure-validator 节点负责（失败才 +1、通过即重置），
        // engineer 不再无条件自增，避免首次失败即耗尽预算（off-by-one）且跨轮累积。
        //  P0-2: 结构顺序门禁重试标记（engineer 已按 retryGuidance 重排区块）
        _structureOrderRetried:
          state._structureOrderRetried ||
          state._structureOrderResult?.detected === true,
        // 🛡️ 资源归属指导写回 state，供下一轮重试注入（单一事实源闭环）。
        _attributionGuidance:
          result._attributionGuidance || state._attributionGuidance || null,
      };
    } catch (error) {
      const errMsg = error?.message || String(error);
      // 🚨 崩溃堆栈追踪（2026-08-30 为排查 Cannot read properties of undefined (reading 'error') 添加）
      logger.error('代码生成失败', {
        error: errMsg,
        errorName: error?.name,
        errorStack: error?.stack,
        errorCode: error?.code,
      });
      state.onProgress?.({
        stage: '代码生成',
        message: `❌ 失败: ${errMsg}`,
        status: 'failed',
      });
      // 🛡️ P1-3 深化（2026-08-27）：语义门禁失败（模板引用 script 未声明变量/组件，如
      // "tabs 未声明"）此前直接 throw → graph fail-closed，无重试、无失败指导，模型每次重试
      // 掷骰子。此处识别语义失败，构造针对性指导回退 engineer 重试一次（复用 _l0CodeRetryGuidance
      // 注入链路），重试仍失败才 throw 保持 fail-closed。
      // 🛡️ 资源未使用重试（2026-08-28）：RES-UNUSED-* 此前与语义失败一样在 engineer 节点内
      // 直接 throw → 绕过图级 L0-B 重试（l0MaxRetry 完全未生效）→ 整轮 9 分钟成果 fail-closed。
      // 此处与语义失败同级处理：带资源归属指导回退 engineer 重做一次（独立预算，不互相挤占）。
      // 注：_autoMountUnusedBackgrounds / _autoMountUnusedIcons 已先在门禁前确定性修掉大部分漏用，
      //    这里只兜住「兜底也匹配不到挂载点」的残余场景，避免把可自愈的漏用放大成整轮失败。
      // 🛡️ P1-5 统一重试决策（2026-08-28）：策略表驱动 + 预算制 + 统一标记
      //
      // 旧实现的三个缺陷（逐一对应修复）：
      //  1. 白名单式：只有「资源未使用」「语义不完整」两类可重试，SFC 语法错误直接 fail-closed，
      //     尽管 LLM 修语法错误的成功率很高（mc-max-1787908432082 实锤：109:18 missing end tag）。
      //  2. 每类一个 if 分支 + 条件边每类一个消费分支 —— 新增类型时漏改条件边，
      //     重试标记将无处消费 → 直接进校验器 → fail-closed（此前最容易踩的坑）。
      //  3. 不区分可自愈性：max_tokens 截断重试无用，应加大预算/增分块而非原样重试。
      //
      // 现在：新增可重试类型只改 retry-policy.js，图与条件边零改动。
      const { decideRetry } = await import('./retry-policy.js');
      const decision = decideRetry(errMsg, state);
      if (decision.ok) {
        state._pendingRetry = true;
        state._pendingRetryPolicyId = decision.policy.id;
        state._retryBudget = decision.budget;
        state._l0CodeRetryGuidance =
          (state._l0CodeRetryGuidance || '') + (decision.guidance || '');
        // 🛡️ 修复 A（回退局部化）：从错误消息提取坏文件，只重做受影响 chunk，其余从磁盘恢复
        // （此前只写指导不写 _reviseFiles → 消费端退化为全局重生成，触发拐点 A 假坏中间态）
        state._reviseFiles = extractFilesFromErrorMsg(
          errMsg,
          state.generatedFiles || [],
        );
        logger.warn('🛡️ 生成失败已判定可重试，带指导回退 engineer', {
          policy: decision.policy.id,
          policyName: decision.policy.name,
          used: decision.budget[decision.policy.id],
          budget: decision.policy.budget,
          reviseFiles: state._reviseFiles,
        });
        return {
          _pendingRetry: true,
          _pendingRetryPolicyId: decision.policy.id,
          _retryBudget: decision.budget,
          _l0CodeRetryGuidance: state._l0CodeRetryGuidance,
          _reviseFiles: state._reviseFiles,
        };
      }
      if (decision.policy) {
        logger.warn(
          `🚫 放弃重试（${decision.policy.name}）：${decision.reason}`,
          { policy: decision.policy.id },
        );
      }
      throw error;
    }
  });

  // ========================================
  // 节点 5c: Style Refiner - 样式精修（执行CSS样式修改）
  // ========================================
  addNodeWithSkip('style-refiner', async (state) => {
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
        providerId: textCfg.providerId || null,
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
        'microcode',
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
  addNodeWithSkip('adversarial-checker', async (state) => {
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
      // 🚀 快速模式：SKIP_ADVERSARIAL=1 跳过对抗性检查 LLM，直接判通过（省 85~110s）
      if (
        process.env.SKIP_ADVERSARIAL === 'true' ||
        process.env.SKIP_ADVERSARIAL === '1'
      ) {
        logger.info('⏭️ 跳过对抗性检查 (SKIP_ADVERSARIAL=1)');
        state.onProgress?.({
          stage: '质量检查',
          message: '⏭️ 已跳过对抗性检查（快速模式）',
          status: 'completed',
        });
        return {
          checkResult: {
            checkResult: 'pass',
            qualityScore: 90,
            critiques: [],
            issueCategories: {},
            recommendations: [],
            summary: '快速模式跳过对抗性检查',
            authorizationViolation: null,
          },
          _screenshotPromise: null,
        };
      }

      // 文本任务：使用 textAIConfig（Claude）
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const checker = new AdversarialChecker({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        onProgress: state.onProgress,
        providerId: textCfg.providerId || null,
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
            componentType: 'microcode', //显式指定组件类型，提高可读性
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

      //提前启动 screenshot 发布 + 渲染，与 graph 引擎调度并行
      // parallel-quality-check 只需 await 已启动的 Promise
      let _screenshotPromise = null;
      const _skipVisComp =
        process.env.SKIP_VISUAL_COMPARISON === 'true' ||
        process.env.SKIP_VISUAL_COMPARISON === '1';
      if (state.outputPath && !_skipVisComp) {
        const _sid = state.sessionId || state.componentName || 'unknown';
        const _tgt = state.target || 'microcode';
        _screenshotPromise = (async () => {
          try {
            await publishQualityPreview({
              outputPath: state.outputPath,
              componentId: _sid,
              groupId: state.groupId || 'default-group',
              target: _tgt,
            });
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
            });
            logger.info('✅ 预启动截图任务完成', { sessionId: _sid });
            return r;
          } catch (e) {
            logger.warn('预启动截图任务失败（非阻塞）', { error: e.message });
            return {
              renderedImage: null,
              isStaticFallback: false,
              runtimeGate: null,
            };
          }
        })();
      }

      return {
        checkResult: result,
        _screenshotPromise, //提前启动的截图 Promise
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
  // 节点 6b: Screenshot Renderer - 渲染截图 (异步非阻塞)
  // ========================================
  addNodeWithSkip('screenshot-renderer', async (state) => {
    logger.info('节点: Screenshot Renderer - 启动异步截图任务');

    // 质量模式判断：fast 模式跳过视觉比对
    const qualityMode = state._qualityMode || 'standard';
    if (qualityMode === 'fast') {
      logger.info(' fast 模式：跳过视觉比对');
      return {
        renderedImage: null,
        visualComparisonReport: null,
        _screenshotPromise: null,
      };
    }

    // 🆕 预览图复用：如果已有 mc-preview.png（来自 previewToken），跳过截图门禁
    const previewPath = join(
      state.outputPath,
      'resources',
      'images',
      'mc-preview.png',
    );
    if (existsSync(previewPath)) {
      logger.info('⏭️ 预览图复用：已有 mc-preview.png，跳过截图渲染', {
        previewPath,
      });
      return { renderedImage: previewPath, _screenshotPromise: null };
    }

    // 环境变量开关：临时关闭视觉比对（2026-08-01）
    if (
      process.env.SKIP_VISUAL_COMPARISON === 'true' ||
      process.env.SKIP_VISUAL_COMPARISON === '1'
    ) {
      logger.info('⏭️ SKIP_VISUAL_COMPARISON=true：跳过截图渲染');
      return {
        renderedImage: null,
        visualComparisonReport: null,
        _screenshotPromise: null,
      };
    }

    // 性能优化（方案 A）：中间轮跳过截图渲染 + 视觉比对，仅最终轮执行。
    // 依据：revisionLoopCount 为闭包计数，screenshot-renderer 执行时其值 = 已完成的 revision-decision 次数
    // = 当前轮次(0-based)；当 revisionLoopCount < maxIterations-1 时为中间轮，跳过截图。
    // 下游 visual-comparator 检测到无 renderedImage 会自动跳过比对（L1197），退回纯文本分决策。
    // 避免每轮都跑 ~3min 的 Puppeteer 截图 + Vision 比对，把最贵的像素保真闭环收敛到最后一轮。
    const _maxIter = state.maxIterations || 1;
    if (revisionLoopCount < _maxIter - 1) {
      logger.info(
        `[skip-screenshot] 中间轮(${revisionLoopCount}/${_maxIter})跳过截图渲染与视觉比对`,
      );
      return {
        renderedImage: null,
        visualComparisonReport: null,
        _screenshotPromise: null,
      };
    }

    const sessionId = state.sessionId || state.componentName || 'unknown';
    const target = state.target || 'microcode';
    const previewImage = state.previewImage || null;
    const outputPath = state.outputPath;

    if (!outputPath || !previewImage) {
      logger.warn('跳过截图渲染：缺少 outputPath 或 previewImage', {
        hasOutputPath: !!outputPath,
        hasPreviewImage: !!previewImage,
      });
      return { renderedImage: null, _screenshotPromise: null };
    }

    // 启动异步截图任务，不等待结果
    const startTime = Date.now();
    logger.info('🚀 启动后台截图任务，继续执行后续节点', { sessionId, target });

    state.onProgress?.({
      stage: '视觉比对',
      message: '🚀 后台渲染组件截图...',
      status: 'running',
    });

    const screenshotPromise = (async () => {
      try {
        const result = await renderScreenshot({
          outputPath,
          sessionId,
          componentName: state.componentName,
          target,
          previewImage,
          onProgress: state.onProgress,
        });
        const duration = Date.now() - startTime;
        logger.info('✅ 后台截图任务完成', { sessionId, durationMs: duration });
        return result;
      } catch (error) {
        logger.error('后台截图任务失败（非阻塞）', {
          error: error.message,
          sessionId,
        });
        return { renderedImage: null };
      }
    })();

    // 返回 Promise 对象，让后续节点在需要时 await
    return { _screenshotPromise: screenshotPromise };
  });

  // ========================================
  // 节点 6c: Visual Comparator - 视觉比对 (异步等待截图)
  // ========================================
  addNodeWithSkip('visual-comparator', async (state) => {
    logger.info('节点: Visual Comparator - 视觉比对');

    // 环境变量开关：临时关闭视觉比对（2026-08-01）
    if (
      process.env.SKIP_VISUAL_COMPARISON === 'true' ||
      process.env.SKIP_VISUAL_COMPARISON === '1'
    ) {
      logger.info('️ SKIP_VISUAL_COMPARISON=true：跳过视觉比对');
      return { visualComparisonReport: null };
    }

    // 等待后台截图任务完成
    if (state._screenshotPromise) {
      logger.info('⏳ 等待后台截图任务完成...');
      state.onProgress?.({
        stage: '视觉比对',
        message: '⏳ 等待组件截图完成...',
        status: 'running',
      });

      const screenshotResult = await state._screenshotPromise;
      state.renderedImage = screenshotResult.renderedImage;
      state.renderedImageIsStaticFallback = screenshotResult.isStaticFallback;
      logger.info('✅ 后台截图任务已完成，继续视觉比对');
    }

    // 无截图则跳过
    if (!state.renderedImage) {
      logger.info('无渲染截图，跳过视觉比对');
      return { visualComparisonReport: null };
    }

    // 静态抽取降级 → 不进行比对（截图内容失真，比对无意义）
    if (state.renderedImageIsStaticFallback) {
      logger.info('⚠️ 截图来自静态抽取降级，跳过视觉比对（前端服务未连接）');
      state.onProgress?.({
        stage: '视觉比对',
        message:
          '⚠️ 前端服务未连接，截图采用静态抽取（含未解析模板），已跳过视觉比对',
        status: 'warning',
      });
      return { visualComparisonReport: null };
    }

    const figmaImage = state.previewImage;
    if (!figmaImage) {
      logger.warn('无 Figma 原图，跳过视觉比对');
      return { visualComparisonReport: null };
    }

    state.onProgress?.({
      stage: '视觉比对',
      message: '正在比对设计稿与渲染结果...',
      status: 'running',
    });

    try {
      const visionCfg = state.visionAIConfig || state.aiConfig || {};
      const comparator = new VisualComparator({
        apiKey: visionCfg.apiKey,
        model: visionCfg.model,
        baseURL: visionCfg.baseURL,
        temperature: visionCfg.temperature,
        providerType: visionCfg.providerType,
        providerId: visionCfg.providerId || null,
        onTokenUsage: state.onTokenUsage,
      });

      const report = await comparator.compare(figmaImage, state.renderedImage, {
        signal: state.signal || state.__abortSignal || null,
        onProgress: state.onProgress,
        requestConcurrency: state.requestConcurrency,
        requestQueueTimeoutMs: state.requestQueueTimeoutMs,
        requestTimeoutMs: state.requestTimeoutMs,
        requestMaxRetries: state.requestMaxRetries,
      });

      // FIX: 如果比对降级（如 API 失败），返回 null 避免 revision-decision 把 similarity:0 当有效分数
      if (report?.degraded) {
        logger.warn(
          '⚠️ 视觉比对降级（API 失败/渲染图缺失），跳过视觉修订逻辑',
          {
            error: report.error,
          },
        );
        state.onProgress?.({
          stage: '视觉比对',
          message: '⚠️ 视觉比对服务不可用，跳过视觉质量检查',
          status: 'warning',
        });
        return { visualComparisonReport: null };
      }

      state.onProgress?.({
        stage: '视觉比对',
        message: `视觉比对完成 (相似度: ${report.overallSimilarity}/100${report.pass ? ' | 通过' : ' | 有差异'})`,
        status: report.pass ? 'completed' : 'warning',
      });

      logger.info('视觉比对结果', {
        similarity: report.overallSimilarity,
        issueCount: report.issues?.length || 0,
        pass: report.pass,
        degraded: false,
      });

      return { visualComparisonReport: report };
    } catch (error) {
      logger.error('视觉比对节点失败（非阻塞）', { error: error.message });
      state.onProgress?.({
        stage: '视觉比对',
        message: `视觉比对失败: ${error.message}`,
        status: 'warning',
      });
      return { visualComparisonReport: null };
    }
  });

  // ========================================
  // 节点 6d: Runtime Preview Gate - 发布当前迭代产物并执行真实运行时硬门禁
  // ========================================
  addNodeWithSkip('parallel-quality-check', async (state) => {
    logger.info('节点: parallel-quality-check - 质量聚合与运行时预览门禁');
    const startTime = Date.now();
    const sessionId = state.sessionId || state.componentName || 'unknown';
    const target = state.target || 'microcode';
    const outputPath = state.outputPath;

    try {
      if (!outputPath) throw new Error('缺少 outputPath');

      let renderedImage, isStaticFallback, runtimeGate;

      //优先使用 adversarial-checker 预启动的截图 Promise（已并行执行）
      if (state._screenshotPromise) {
        logger.info('⏳ 等待预启动的截图任务完成（已并行执行）');
        const result = await state._screenshotPromise;
        renderedImage = result.renderedImage;
        isStaticFallback = result.isStaticFallback;
        runtimeGate = result.runtimeGate;
        logger.info('✅ 预启动截图任务已完成');
      } else {
        // 回退路径：预启动未触发或不可用，走原同步逻辑
        logger.info('📸 走同步截图路径（无预启动 Promise）');
        await publishQualityPreview({
          outputPath,
          componentId: sessionId,
          groupId: state.groupId || 'default-group',
          target,
        });

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
        });
        renderedImage = result.renderedImage;
        isStaticFallback = result.isStaticFallback;
        runtimeGate = result.runtimeGate;
      }

      const duration = Date.now() - startTime;
      emitMetrics('runtime-preview-gate', {
        status: runtimeGate?.status || 'BLOCK',
        issueCount: runtimeGate?.issues?.length || 0,
        hasRenderedImage: !!renderedImage,
        isStaticFallback: !!isStaticFallback,
        durationMs: duration,
        isPreStarted: !!state._screenshotPromise, //标记是否走预启动路径
      });

      state.onProgress?.({
        stage: '运行时质量门禁',
        message:
          runtimeGate?.status === 'PASS'
            ? '真实预览加载与渲染检查通过'
            : `真实预览检查未通过（${runtimeGate?.issues?.length || 1} 项阻断问题）`,
        status: runtimeGate?.status === 'PASS' ? 'completed' : 'warning',
      });

      return {
        renderedImage,
        renderedImageIsStaticFallback: isStaticFallback,
        runtimeGate,
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
      logger.error('Runtime Preview Gate 失败', { error: error.message });
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
  addNodeWithSkip('revision-decision', async (state) => {
    const { checkResult, maxIterations } = state;
    revisionLoopCount++; //闭包计数，每次进入 revision-decision +1（绕过 state.iterationCount 持久化失效）
    const iterationCount = revisionLoopCount; //权威计数来源

    // 🛡️ P0-1 修复：同步回写 state.iterationCount，保持单一事实源
    state.iterationCount = iterationCount;

    const runtimeGate = state.runtimeGate;
    if (runtimeGate?.status === 'WARN' && runtimeGate?.warning) {
      logger.warn('运行时质量门禁告警已降级，不进入修订', {
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

      logger.warn('运行时质量门禁未通过，进入增量修订', {
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

    //规范类 critique 检测：运行时已通过时，尽量避免回到 full engineer
    const critiques = Array.isArray(checkResult?.critiques)
      ? checkResult.critiques
      : [];
    const hasComplianceCategory =
      Array.isArray(categories.compliance) && categories.compliance.length > 0;
    const complianceOnlyCritiques =
      critiques.length > 0 &&
      critiques.every((critique) => {
        const category = String(critique?.category || '').toLowerCase();
        const issue = String(critique?.issue || '').toLowerCase();
        const fix = String(critique?.fix || '').toLowerCase();
        const location = String(critique?.location || '').toLowerCase();
        const text = `${category} ${issue} ${fix} ${location}`;
        return (
          category === 'standards' ||
          category === 'compliance' ||
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
        );
      });

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
    });

    //  qualityScore >= 阈值 提前退出（可配置，与 runtime-env 默认一致 90）
    const qualityScoreThreshold = state._v3Config?.qualityScoreThreshold ?? 90;
    const textScore = checkResult?.qualityScore || 0;

    //视觉比对：合并评分
    const visualReport = state.visualComparisonReport;
    //视觉比对降级（degraded，如渲染图缺失/比对 API 出错，similarity 无有效数据）时，
    // 不把 similarity:0 当"极低分"计入合并分，而是视为"无法判断"（visualScore=null），
    // 退回纯文本评分，避免 degraded 反复触发视觉修订导致无限循环。
    const visualScore =
      visualReport && !visualReport.degraded
        ? (visualReport.overallSimilarity ?? null)
        : null;
    const hasVisualHighIssue =
      visualReport?.issues?.some((i) => i.severity === 'high') ?? false;

    // 合并评分 = 文本分 × 0.5 + 视觉分 × 0.5（视觉分缺失时只用文本分）
    const qualityScore =
      visualScore !== null
        ? Math.round(textScore * 0.5 + visualScore * 0.5)
        : textScore;

    logger.info('📊 质量评分', {
      textScore,
      visualScore: visualScore ?? 'N/A',
      mergedScore: qualityScore,
      hasVisualHighIssue,
      qualityMode: state._qualityMode || 'standard',
    });

    //视觉反馈修订闸门：渲染图与 Figma 原图比对已执行（visualScore 可用）时，
    // 若视觉分低于阈值 / 存在视觉问题 / 高优视觉问题，则强制进入修订（受 maxIterations 约束），
    // 不再仅凭文本分早退——这是保真度闭环真正生效的关键。
    const minIterations = state._v3Config?.minIterations || 0;
    const reachedMinIter = (iterationCount || 0) >= minIterations;
    const visualIssues = (visualReport?.issues?.length || 0) > 0;
    //视觉反馈修订闸门：用闭包 iterationCount（绕过 state.iterationCount 持久化失效）；
    // degraded 时无有效视觉数据，不触发视觉修订（避免无限循环）。
    const needsVisualRefine =
      visualScore !== null &&
      !visualReport?.degraded &&
      iterationCount < (state._v3Config?.maxVisualIterations ?? 1) &&
      (visualScore < qualityScoreThreshold ||
        visualIssues ||
        hasVisualHighIssue);

    // 📊 结构化逐轮耗时埋点：每次修订决策输出一行可机读指标，便于下次运行直接量化
    // 「视觉保真迭代轮数 + 每轮耗时」，无需再 grep 考古（对比工具：grep '[METRICS][revision-decision]'）。
    const _elapsedSec = Math.round(
      (Date.now() - (state.startTime || Date.now())) / 1000,
    );
    logger.info(
      `[METRICS][revision-decision] componentId=${state.componentId || 'n/a'} iteration=${iterationCount} elapsedSec=${_elapsedSec} visualScore=${visualScore} needsVisualRefine=${needsVisualRefine} maxVisualIterations=${state._v3Config?.maxVisualIterations ?? 1} qualityScore=${qualityScore} violationCount=${violationCount} reachedMinIter=${reachedMinIter}`,
    );

    if (needsVisualRefine) {
      logger.info(
        `🔁 视觉反馈触发修订 (iteration=${iterationCount}, visualScore=${visualScore}, issues=${visualReport?.issues?.length || 0}, reachedMinIter=${reachedMinIter})`,
      );
      state.onProgress?.({
        stage: '迭代修订',
        message: `视觉比对发现可优化项，进入第 ${iterationCount + 2} 轮修订`,
        status: 'warning',
      });
      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount,
        _reviseTarget: 'layout',
        _lastRoutingReason: `visual-min-iter(visual=${visualScore}, issues=${visualReport?.issues?.length || 0})`,
        _noMoreIterations: false,
        _prevQualityScore: qualityScore, // 记录本轮质量分供下一轮收敛判定
      };
    }

    // 🛡️ P0-2 修复：视觉比对降级时的安全退出机制
    // 当视觉API故障（visualScore=null）且文本分持续低于阈值时，避免无限循环
    if (visualScore === null && visualReport?.degraded) {
      const degradedIterationCount = state._visualDegradedIterations || 0;
      state._visualDegradedIterations = degradedIterationCount + 1;

      // 降级状态下最多允许2轮修订，之后强制退出
      if (degradedIterationCount >= 2) {
        logger.warn(
          `🛑 P0-2: 视觉比对持续降级(${degradedIterationCount + 1}轮)，强制退出避免无限循环`,
          { textScore, qualityScore },
        );
        state.onProgress?.({
          stage: '质量检查',
          message: `⚠️ 视觉服务不可用，基于文本评分完成生成 (分数: ${qualityScore})`,
          status: 'warning',
        });
        return {
          needsRevision: false,
          violationCount,
          _visualDegradedIterations: 0, // 重置计数
        };
      }
    } else {
      // 视觉比对恢复或正常，重置降级计数
      state._visualDegradedIterations = 0;
    }

    if (
      qualityScore >= qualityScoreThreshold &&
      violationCount === 0 &&
      !hasVisualHighIssue
    ) {
      logger.info(
        `✅ P1优化: 合并评分 >= ${qualityScoreThreshold} 且无越权/无高优视觉问题，提前退出迭代`,
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

    // 🛑 P2: 质量分收敛提前退出 —— 已过最小迭代轮次、且本轮与上一轮质量分变化 < eps，
    // 说明修订已无实质收益，提前结束，避免无收益白烧整轮全量重生成（max figma 慢的根因之一）。
    const qualityConvergeEps = state._v3Config?.qualityConvergeEps ?? 1;
    if (
      reachedMinIter &&
      typeof state._prevQualityScore === 'number' &&
      Math.abs(qualityScore - state._prevQualityScore) < qualityConvergeEps
    ) {
      logger.info(
        `🛑 P2: 质量分已收敛 (prev=${state._prevQualityScore} → cur=${qualityScore}, eps=${qualityConvergeEps})，提前退出迭代`,
      );
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 质量分已收敛（${qualityScore}），完成生成`,
        status: 'completed',
      });
      return {
        needsRevision: false,
        violationCount,
        _prevQualityScore: qualityScore,
      };
    }

    // 复杂度自动路由 — 提取 adversarial-checker 评估的复杂度
    const complexity = checkResult?.complexity || 'medium';

    //单次精修标记：上次简单组件精修后，本轮直接完成不循环
    if (state._noMoreIterations) {
      logger.info(
        `🛑 简单组件单次精修已完成，结束迭代 (complexity=${complexity})`,
      );
      return {
        needsRevision: false,
        violationCount,
        _noMoreIterations: false, // 重置标记
      };
    }

    //simple 组件降低提前退出阈值（75→70，可配置）
    const simpleExitThreshold = state._v3Config?.simpleExitThreshold || 70;
    if (complexity === 'simple' && qualityScore >= simpleExitThreshold) {
      logger.info(
        `✅ #354a: 简单组件 qualityScore=${qualityScore} >= ${simpleExitThreshold}，跳过精修直接完成`,
      );
      state.onProgress?.({
        stage: '质量检查',
        message: `✅ 简单组件质量达标 (>= ${simpleExitThreshold})，完成生成`,
        status: 'completed',
      });
      return { needsRevision: false, violationCount };
    }

    // 判断是否需要修订
    const needsRevision = checkResult?.checkResult === 'needs_revision';
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
          _prevQualityScore: qualityScore, // 记录本轮质量分供下一轮收敛判定
        };
      }

      //  按问题类型精准路由
      let target = 'parallel-refine'; // 默认合并精修（更便宜，避免无谓全量重生成）
      let reason = '合并精修（默认）';
      let _reviseTarget = 'layout'; // 默认布局+样式合并精修

      // 如果有越权但未达降级阈值，也强制走 engineer
      if (hasViolation) {
        target = 'microcode-engineer';
        reason = `越权修改: ${checkResult.authorizationViolation.message}`;
        _reviseTarget = 'full';
      } else if (
        runtimeGate?.status === 'PASS' &&
        hasComplianceCategory &&
        complianceOnlyCritiques
      ) {
        target = 'parallel-refine';
        reason = `运行时已通过，规范类问题走轻修订: ${categories.compliance.join(', ')}`;
        _reviseTarget = 'layout';
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
      } else if (categories.layout && categories.layout.length > 0) {
        target = 'parallel-refine';
        reason = `纯布局问题: ${categories.layout.join(', ')}`;
        _reviseTarget = 'layout';
      } else {
        //  issueCategories 都为空但 needs_revision 时，走 layout-style-refiner 合并精修
        // 这种情况通常是视觉上有问题但分类不明确，避免走全量重做浪费 tokens
        const hasAnyIssues =
          (categories.compliance?.length || 0) +
          (categories.structural?.length || 0) +
          (categories.stylistic?.length || 0) +
          (categories.layout?.length || 0);

        if (hasAnyIssues === 0 && !hasViolation) {
          // 检查是否有 critiques（可能有未分类的问题）
          const hasCritiques =
            checkResult?.critiques && checkResult.critiques.length > 0;

          if (hasCritiques) {
            // 有 critiques 但没分类 → 走合并精修（layout-style-refiner）
            target = 'parallel-refine'; // parallel-refine 会调用 layout-style-refiner
            reason = `未分类问题（${checkResult.critiques.length} 条 critiques），走合并精修`;
            _reviseTarget = 'layout'; // 以布局为主，同时处理样式

            logger.info(
              '🎯 P1-1: issueCategories 为空但有 critiques，走合并精修',
              {
                critiqueCount: checkResult.critiques.length,
              },
            );
          } else {
            // 完全没有问题但标记为 needs_revision → 可能是 LLM 误判，直接完成
            logger.warn(
              '⚠️ P1-1: needs_revision 但无任何问题，可能是 LLM 误判，强制完成',
              {
                qualityScore,
              },
            );
            return {
              needsRevision: false,
              violationCount,
              _forceComplete: true, // 标记强制完成
            };
          }
        }
      }

      //视觉比对路由增强：当文本分类不明确时，用视觉 issue 类型辅助路由
      if (
        visualReport &&
        visualReport.issues &&
        visualReport.issues.length > 0
      ) {
        const visualColorIssues = visualReport.issues.filter(
          (i) => i.category === 'color' || i.category === 'font',
        );
        const visualLayoutIssues = visualReport.issues.filter(
          (i) =>
            i.category === 'layout' ||
            i.category === 'proportion' ||
            i.category === 'spacing',
        );
        const visualMissingIssues = visualReport.issues.filter(
          (i) =>
            i.category === 'missing_element' || i.category === 'extra_element',
        );

        if (visualMissingIssues.length > 0 && target === 'microcode-engineer') {
          // 元素缺失/多余 → 需要全量重做（保持 engineer 路由）
          reason += ` + 视觉发现元素缺失: ${visualMissingIssues.map((i) => i.description).join('; ')}`;
        } else if (
          visualColorIssues.length > 0 &&
          visualLayoutIssues.length === 0 &&
          target !== 'style-refiner'
        ) {
          // 纯颜色/字体问题 → 路由到 style-refiner
          target = 'style-refiner';
          _reviseTarget = 'stylistic';
          reason = `视觉发现颜色/字体问题: ${visualColorIssues.map((i) => i.description).join('; ')}`;
        } else if (
          visualLayoutIssues.length > 0 &&
          target !== 'parallel-refine'
        ) {
          // 布局/间距问题 → 路由到 parallel-refine
          target = 'parallel-refine';
          _reviseTarget = 'layout';
          reason = `视觉发现布局/间距问题: ${visualLayoutIssues.map((i) => i.description).join('; ')}`;
        }
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

      //  Figma 覆盖率硬阻断（默认关闭，仅 FIGMA_COVERAGE_HARD_BLOCK=true 生效）
      // 无可靠设计依据时，不再进入全量/精准重生成，直接带警告完成，避免浪费模型调用。
      if (
        state._figmaCoverageBlocked &&
        process.env.FIGMA_COVERAGE_HARD_BLOCK === 'true'
      ) {
        logger.warn(
          '🚫 P2 #3: Figma 覆盖率硬阻断 — 跳过无依据重生成，直接带警告完成',
          { rate: state._figmaCoverageRate },
        );
        return {
          needsRevision: false,
          violationCount,
          _forceComplete: true,
          _figmaCoverageBlocked: true,
        };
      }

      return {
        needsRevision: true,
        iterationCount: iterationCount + 1,
        violationCount,
        _reviseTarget, // ✅ 修复：作为新字段返回，避免状态突变
        _reviseFiles, //  仅重做这些文件，其余从磁盘保留
        retryCountByTarget, //追踪同目标重试次数
        _noMoreIterations, // 简单组件单次精修后不再循环
        _prevQualityScore: qualityScore, // 记录本轮质量分供下一轮收敛判定
      };
    }

    if (needsRevision && !canRevise) {
      logger.warn('达到最大迭代次数，停止修订');
      state.onProgress?.({
        stage: '迭代修订',
        message: '⚠️ 已达最大修订次数，停止迭代',
        status: 'warning',
      });
    }

    return { needsRevision: false };
  });

  // ========================================
  // 节点 8: 完成（增强）
  // ========================================
  addNodeWithSkip('complete', async (state) => {
    logger.info('节点: Figma阶段完成');

    // 🛡️ R5: 产物完整性硬门禁（第一步，fail-closed）
    // 此前缺失主入口只在 workspace-preview-publisher 才回滚，孤儿清理 / Less 检查 /
    // scoped 扫描全部空转一整轮。这里在收口最前端就拦截，并把上游失败原因透出。
    state.onProgress?.({
      stage: '产物校验',
      message: '🔍 校验生成产物完整性...',
      status: 'running',
    });
    const artifactIntegrity = await assertArtifactIntegrity(state.outputPath, {
      componentType: state.target || 'microcode',
    });
    if (!artifactIntegrity.ok) {
      logger.error('🚫 产物完整性硬门禁阻断（ARTIFACT_INCOMPLETE）', {
        missing: artifactIntegrity.missing,
        degradedFiles: state._degradedFiles || [],
      });
      state.onProgress?.({
        stage: '产物校验',
        message: `❌ 产物不完整：${artifactIntegrity.missing
          .map((m) => `${m.path}(${m.reason})`)
          .join('、')}`,
        status: 'failed',
      });
      const integrityError = buildArtifactIntegrityError(artifactIntegrity, {
        outputPath: state.outputPath,
        componentType: state.target,
        upstreamError:
          state._fatalError?.message || state._upstreamError || undefined,
        degradedFiles: state._degradedFiles,
      });
      // P2-1: 失败路径保留诊断上下文
      integrityError.diagnosticContext = {
        coverageReport: state._visualParserCache?.coverageReport,
        textTruthValidation: state._visualParserCache?.textTruthValidation,
        subComponentPlan: state.subComponentPlan,
        generationInput: state.generationInput,
        figmaCoverageRate: state._figmaCoverageRate,
      };
      throw integrityError;
    }
    logger.info('✅ 产物完整性硬门禁通过', {
      required: artifactIntegrity.required.length,
    });

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

    // 所有 complete 阶段后处理完成后，必须从磁盘重新读取最终产物并真实编译。
    // 任何后处理都可能改变 LESS；禁止复用 engineer 阶段的旧内存快照后直接标记完成。
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
      // P2-1: 失败路径保留诊断上下文
      error.diagnosticContext = {
        coverageReport: state._visualParserCache?.coverageReport,
        textTruthValidation: state._visualParserCache?.textTruthValidation,
        subComponentPlan: state.subComponentPlan,
        generationInput: state.generationInput,
        figmaCoverageRate: state._figmaCoverageRate,
      };
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

    // 读取生成的文件做最终扫描（复用 hasScopedLessStyle / findPrefixViolations，
    // 消除 CODE-001 / CODE-003 的第三处重复实现）
    const fs = await import('fs');
    const { join } = await import('path');
    let scopedCompliant = true;

    try {
      if (state.generatedFiles && Array.isArray(state.generatedFiles)) {
        // R0-4（2026-09-01）：CODE-003 前缀与 L0-B 同源——declare.json componentId 优先，
        // 统一走 resolveClassPrefixId（此前此处直接用 state.componentId=实例 ID，与 L0-B 判定口径不一致）。
        let finalScanPrefixId = state.componentId;
        try {
          const declareFullPath = join(state.outputPath, 'declare.json');
          if (fs.existsSync(declareFullPath)) {
            finalScanPrefixId = resolveClassPrefixId(
              { 'declare.json': fs.readFileSync(declareFullPath, 'utf-8') },
              state.componentId,
            );
          }
        } catch {
          /* declare.json 读取失败，回退 state.componentId */
        }
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
          if (f.endsWith('common.less')) {
            const fullPath = join(state.outputPath, f);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const violations = findPrefixViolations(
                content,
                finalScanPrefixId,
              );
              if (violations.length > 0) {
                logger.warn(
                  `🚨 最终扫描: ${f} 有 ${violations.length} 个 class 缺少前缀: ${violations.slice(0, 5).join(', ')}${violations.length > 5 ? '...' : ''}`,
                );
              }
            } catch (e) {}
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
      //视觉比对输出
      visualComparisonReport: state.visualComparisonReport || null,
      qualityMode: state._qualityMode || 'standard',
      runtimeGate: state.runtimeGate || null,
      //  透出 Figma 覆盖率与告警，供前端/任务结果展示
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
  addNodeWithSkip('parallel-analysis', async (state) => {
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
        onTokenUsage: state.onTokenUsage,
        providerId: textCfg.providerId || null,
        sessionId: state.sessionId || null, // 📊 透传给 agent，供日志登记当前模型
      };

      // 并行执行Layout Reviewer和Style Mapper
      // 🛡️ P0-4 修复：添加超时保护，防止单个 agent 卡死导致整个流程无限等待
      //
      // 🚨 契约修正（2026-08-28）：withTimeout(fn, ms, options) 的第一个参数必须是「函数」，
      // 它返回一个 timed(state) 异步函数，必须再调用一次才得到 Promise。
      // 旧代码误写为 `await withTimeout(Promise.all([...]), ms, '字符串')`：
      //   1) 传进去的是 Promise 而非函数，包装器内部的 fn(nextState) 根本没被调用；
      //   2) await 一个「函数」会原样返回该函数 → 解构函数触发
      //      "TypeError: (intermediate value) is not iterable"，节点在 1ms 内即失败；
      //   3) 更糟的是两个 IIFE 作为实参已被提前执行，LLM 请求在后台空转至结束（约 20s 的
      //      claude-opus 调用，token 全部浪费），而任务早已判失败。
      // 现改为与 visual-parser / adversarial-checker 一致的标准用法。
      const PARALLEL_ANALYSIS_TIMEOUT = 10 * 60 * 1000; // 10分钟总超时

      const runParallelAnalysis = withTimeout(
        // 注意：内部统一使用 nextState（由 withTimeout 注入受控 signal），
        // 这样超时或任务取消时才能真正中止在途的 LLM 请求，而不是留孤儿请求。
        (nextState) =>
          Promise.all([
            (async () => {
              const reviewer = new LayoutReviewer(textConfig);
              reviewer.onProgress = nextState.onProgress;
              return await reviewer.execute({
                layoutStructure: nextState.layoutStructure,
                onProgress: nextState.onProgress,
                signal: nextState.signal || nextState.__abortSignal || null,
                requestConcurrency: nextState.requestConcurrency,
                requestQueueTimeoutMs: nextState.requestQueueTimeoutMs,
                requestTimeoutMs: nextState.requestTimeoutMs,
                requestMaxRetries: nextState.requestMaxRetries,
              });
            })(),
            (async () => {
              const mapper = new StyleMapper(textConfig);
              mapper.onProgress = nextState.onProgress;
              return await mapper.execute({
                visualElements: nextState.visualElements,
                figmaStyles: nextState.figmaNodeData?.styles,
                //  传递 layoutStructure（用于 per-element 样式提取）
                // 传入完整 layoutStructure 而非只传 elements[]，因为 SM 的 _extractElementStyles
                // 支持直接处理 layoutStructure 对象（内部会调用 _collectElementsFromStructure）
                elements: nextState.layoutStructure,
                backgroundBrightness:
                  nextState.visualElements?.backgroundBrightness ||
                  nextState.layoutStructure?.styles?.backgroundBrightness ||
                  'dark',
                onProgress: nextState.onProgress,
                signal: nextState.signal || nextState.__abortSignal || null,
                requestConcurrency: nextState.requestConcurrency,
                requestQueueTimeoutMs: nextState.requestQueueTimeoutMs,
                requestTimeoutMs: nextState.requestTimeoutMs,
                requestMaxRetries: nextState.requestMaxRetries,
              });
            })(),
          ]),
        PARALLEL_ANALYSIS_TIMEOUT,
        { nodeName: 'parallel-analysis', onProgress: state.onProgress },
      );

      const [reviewResult, styleMappings] = await runParallelAnalysis(state);

      state.onProgress?.({
        stage: '并行分析',
        message: '✅ 并行分析完成',
        status: 'completed',
      });

      //保存 checkpoint
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
  // 节点 4d: Subcomponent Planner - 子组件规划（并行分析之后，代码生成之前）
  // 纯规则，基于 layoutStructure.sections 产出强制子组件清单
  // ========================================
  addNodeWithSkip('subcomponent-planner', async (state) => {
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
      const { subcomponentPlanner } =
        await import('../roles/subcomponent-planner.js');
      const plan = subcomponentPlanner.plan(state.layoutStructure, {
        diagnostics: {
          analysisDiagnostics: state._visualParserCache?.analysisDiagnostics || [],
          analysisFixes: state._visualParserCache?.analysisFixes || [],
          chromeSectionDiagnostics:
            state._visualParserCache?.chromeSectionDiagnostics || [],
          resourceDiagnostics: state._visualParserCache?.resourceDiagnostics || [],
          coverageReport: state._visualParserCache?.coverageReport || null,
          textTruthValidation:
            state._visualParserCache?.textTruthValidation || null,
          chartDataHints: state._visualParserCache?.chartDataHints || null,
        },
      });
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

      // 🆕 S3: 大分块拆分 — 多图表 section 按图表二次拆分为独立分块条目
      const { splitMultiChartSectionIntoChunks } =
        await import('../roles/subcomponent-planner.js');
      const s3Chunks = splitMultiChartSectionIntoChunks(finalPlan);
      const s3Applied = s3Chunks.length > 0;
      if (s3Applied) {
        logger.info(
          `🧩 S3: 多图表 section 二次拆分为 ${s3Chunks.length} 个独立分块`,
          {
            chartChunks: s3Chunks.filter(c => c.segmentType === 'chart').length,
            miscChunks: s3Chunks.filter(c => c.segmentType !== 'chart').length,
          },
        );
      }

      state.onProgress?.({
        stage: '子组件规划',
        message: `✅ 完成：${finalPlan.effectiveSections.length} 个 section${finalPlan.isForced ? '（强制拆分）' : '（不强拆）'}${injectedNav ? '（已强制注入导航 section）' : ''}${s3Applied ? `（S3 拆分为 ${s3Chunks.length} 分块）` : ''}`,
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
  addNodeWithSkip('preview-validator', async (state) => {
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
  addNodeWithSkip('parallel-refine', async (state) => {
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
        : '⚙️ 布局精修 → 样式精修 顺序执��中...',
      status: 'running',
    });

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const textConfig = {
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        providerId: textCfg.providerId || null,
        sessionId: state.sessionId || null, // 📊 透传给 agent，供日志登记当前模型
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

          // 🛡️ P0: 合并精修可能「静默失败」（execute 内部 catch 返回 {refined:false}），
          // 此前节点无条件视其为成功 → 质量分不收敛 → 被迫跑满 maxIterations 轮、整体变慢。
          // 显式判定：未生效则回退到串行 layout→style，给真实精修一次机会，而非吞掉失败。
          if (!mergedResult || mergedResult.refined !== true) {
            logger.warn(
              '⚠️ P0: 合并精修未生效（refined=false），回退串行 layout→style',
              {
                reason: mergedResult?.reason || 'unknown',
              },
            );
            state.onProgress?.({
              stage: '合并精修',
              message: `⚠️ 合并精修未生效，回退串行 layout→style`,
              status: 'warning',
            });
            // 不 return，继续走下方串行 layout→style 逻辑
          } else {
            await postRefineResourceImportGuard(
              state.outputPath,
              state.resourceDomMapping,
              'microcode',
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
              //传递合并结果给下游
              mergedRefineResult: mergedResult,
              preRefineFiles,
              _refineStart: t0,
            };
          }
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
        'microcode',
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
  addNodeWithSkip('refine-feedback', async (state) => {
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
  addNodeWithSkip('code-structure-validator', async (state) => {
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
        elementCoverage: null,
      };
    }

    // 增量校验：只对变更文件跑正则校验（未变更文件上轮已通过，跳过省时）
    // ⚠️ CODE-003（common.less 前缀）需 common.less 参与：若 common.less 未变更但其他文件变了，
    // 仍需它作校验上下文 → 校验文件集 = 变更文件 ∪ {common.less, declare.json}（若存在）。
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
    // 🛡️ D+（2026-08-31）：读 engineer 落盘的写盘门禁跳过清单（component-meta.json.gateSkippedFiles），
    // 传给 validator 让 EMPTY_ARTIFACT 区分「LLM 未生成」vs「被门禁跳过」，修复指导不再指错方向。
    let gateSkippedFiles = [];
    try {
      const metaPath = pathMod.join(state.outputPath, 'component-meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        gateSkippedFiles = Array.isArray(meta.gateSkippedFiles)
          ? meta.gateSkippedFiles
          : [];
      }
    } catch (_) {
      /* 非阻断：meta 缺失/损坏按无留痕处理 */
    }
    // ⚠️ 必须传入 resourceDomMapping：CODE-008 据此判定图片 import 是否由后处理注入，
    // 否则 validResourceFiles 为空，会把系统已注入的 `import bg1 from '../resources/images/...'`
    // 误判为「模型手写」打 BLOCK，导致合规组件被 L0-B 误杀（与 Vue3 图 mc-component-graph-vue3.js:2013 对齐）。
    const result = CodeStructureValidator.validate(
      filesForValidation,
      componentId,
      {
        target: 'microcode',
        layoutStructure: state.layoutStructure,
        visualElements: state.visualElements,
        resourceDomMapping: state.resourceDomMapping,
        previewAnalysis: state.previewAnalysis,
        // 🛡️ P0：传入根装饰真值（designFacts.root.styleEvidence），供 CODE-014 硬性校验根容器臆造装饰
        designFacts: state.designFacts || null,
        figmaNodeData: state.figmaNodeData || null,
        // 🛡️ COMP-001：传入子组件规划（effectiveSections），供模块组装覆盖校验
        // （检测「规划了 N 个 section 但 index.vue 只组装了 M<N 个」的模块整块缺失）
        componentPlan: state.subComponentPlan || null,
        // 🛡️ D+：写盘门禁跳过清单（成因判定用）
        gateSkippedFiles,
      },
    );

    // P0：逐 SFC + 共享 LESS 真实编译门禁（与 Vue3 图 mc-component-graph-vue3.js:2098 对齐）。
    // 微码组件 index.vue 内联 <style lang="less"> 此前未做任何静态校验，LESS 语法错误
    // 只能漏到运行时预览才被 RUNTIME-004 硬阻断。此处提前拦截，且 LessCompileGate 会自动
    // 补齐「漏写分号 / 未闭合块注释」等可自愈错误并写回，干净编译则视为通过。
    const filesByPath = Object.fromEntries(
      filesForCheck.map((file) => [file.path, file.content]),
    );
    const lessCompileResult = await LessCompileGate.validate(filesByPath, {
      outputPath: state.outputPath,
    });
    if (!lessCompileResult.pass) {
      const lessIssues = lessCompileResult.diagnostics.map((item) => ({
        ...item,
        severity: 'BLOCK',
      }));
      result.pass = false;
      result.issues = [...(result.issues || []), ...lessIssues];
      result.blockCount = (result.blockCount || 0) + lessIssues.length;
      result.lessCompileGate = lessCompileResult;
    } else {
      result.lessCompileGate = lessCompileResult;
    }

    //  🛡️ P0-4: flex 静态检查 + 自动修复（零 LLM）— 与 vue3 graph 同逻辑
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
          // 修复后复查：仅把「仍存在」的 flex 问题计入 result（FLEX-001 已被 autoFix 消除则不再报）
          const flexIssues = checkFlexUsage(effectiveBody);
          if (flexIssues.length === 0) continue;
          for (const fi of flexIssues) {
            result.issues = [
              ...(result.issues || []),
              {
                id: fi.id,
                severity: fi.severity,
                category: 'flex-layout',
                message: fi.message,
                file: file.path,
                hint: { suggestion: fi.suggestion },
              },
            ];
            if (fi.severity === 'BLOCK')
              result.blockCount = (result.blockCount || 0) + 1;
          }
        }
      }
      if (flexFixCount > 0) {
        logger.warn(
          `✅ P0-4 flex 自动修复: ${flexFixCount} 处缺失 min-height:0 已补齐`,
        );
      }

      // 🛡️ R0-7（2026-09-01）：FLEX-002（冗余 flex column）在 L0-B 只判不修。
      // 修复唯一归口在生成期 code-validator.validateAndFixGeneratedFiles（autoFixRedundantFlex）；
      // 此处删除重复修复器（同一问题两处修 = 双写盘分叉点，且与生成期修复口径可能漂移）。
      // 判定仍由上方 checkFlexUsage（FLEX-002，WARN）负责并计入 result.issues。
    } catch (flexErr) {
      logger.warn('P0-4 flex 检查异常（非阻断）', { error: flexErr.message });
    }

    // 🛡️ R0-7（2026-09-01）：CODE-003（common.less class 前缀）在 L0-B 只判不修。
    // 判定已由 CodeStructureValidator.validate（:3385，WARN issue）负责；
    // 修复唯一归口在生成期 code-validator.validateAndFixGeneratedFiles（autoFixPrefixViolations）。
    // 此处删除重复修复器（此前生成期修一遍、L0-B 再修一遍，且直写磁盘造成
    // workspace/candidate 内容分叉）。

    //S11: 文档页面元素覆盖率校验（有 docAnalysis.uiElements 才执行，确定性零 LLM）
    let elementCoverage = null;
    const uiElements = state.docAnalysis?.uiElements || [];
    if (uiElements.length > 0) {
      const coverageValidator = new ElementCoverageValidator();
      const filesRecord = Object.fromEntries(
        (filesForCheck || []).map((f) => [f.path, f.content]),
      );
      elementCoverage = coverageValidator.validate({
        uiElements,
        files: filesRecord,
      });

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
        ];
        result.issues = [...(result.issues || []), ...coverageIssues];
        logger.warn(`📐 元素覆盖率: ${elementCoverage.summary}`);
        state.onProgress?.({
          stage: 'L0-B校验',
          message: `⚠️ ${elementCoverage.summary}（已加入修复清单）`,
          status: 'warning',
        });
      } else {
        logger.info(`📐 元素覆盖率: ${elementCoverage.summary}`);
      }
    }

    // 降级检查：硬性 BLOCK（scoped 属性缺失 / 文件结构完整性）不可被 bypass
    const consecutiveCodeFailures = state._l0CodeConsecutiveFailures || 0;
    const bypassThreshold = state._v3Config?.l0BypassAfterFailures || 3;

    if (!result.pass && consecutiveCodeFailures >= bypassThreshold) {
      const hardBlockIssues = (result.issues || []).filter(
        (i) => i.severity === 'BLOCK' && i.id === 'CODE-001',
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
          if (issue.file) retryGuidance += `   文件: ${issue.file}\n`;
        });
        retryGuidance += '\n请确保：\n';
        retryGuidance += '- 每个 .vue 文件都有 <style lang="less" scoped>\n';
        retryGuidance +=
          "- style 块第一行是 @import '../resources/styles/index.less'\n";
        retryGuidance +=
          '- common.less 中的 class 都带组件前缀 .c-{componentId}-\n';

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
      // 条件边用 <= 比较（与 L0-A 约定一致），保证 l0MaxRetry=N 时最多 N 次重试。
      codeValidatorRetryCount:
        !result.pass && !result._bypassed
          ? (state.codeValidatorRetryCount || 0) + 1
          : 0,
      _l0CodeConsecutiveFailures: newConsecutive,
      _l0CodeDegraded: result._degraded || false,
      _l0CodeRetryGuidance: retryGuidance, //传递修复指导
      // 🛡️ 修复 A（回退局部化）：BLOCK 失败时按 issue.file 精确锁定受影响文件，只重做对应 chunk。
      // 消费端 microcode-engineer 认 _reviseFiles（数组），非空即局部重做、其余从磁盘恢复；
      // 空数组（含 (全部)/(跨文件) 占位无法定位）→ 退化为现状全局重生成，但至少可定位时不再一刀切。
      _reviseFiles:
        !result.pass && !result._bypassed
          ? [
              ...resolveTargetFilesFromIssues(
                (result.issues || []).filter((i) => i.severity === 'BLOCK'),
                state.generatedFiles || [],
              ).targetFiles,
            ]
          : [],
      //  P0-2: 结构顺序门禁结果（条件边读取决定回 engineer / complete）
      _structureOrderResult: structureOrderResult,
      //  L0-B 已读盘文件内容（供 do-not-invent-check 等后续节点复用，避免二次读盘）
      _l0FilesForCheck: filesForCheck,
      elementCoverage, //S11: 元素覆盖率结果（L2 精准路由/对抗检查消费）
    };
  });

  // ========================================
  // 终态失败节点：L0-B BLOCK 且重试耗尽（fail-closed）
  // 抛错使整个 graph run 失败，禁止把错误组件标记为 completed / 复制正式 workspace
  // ========================================
  addNodeWithSkip('l0b-fail', async (state) => {
    const r = state.codeValidationResult;
    const blockIssues = (r?.issues || []).filter((i) => i.severity === 'BLOCK');
    const err = new Error(
      `L0-B 代码结构校验未通过且重试耗尽，禁止发布组件：${blockIssues.map((i) => i.id || i.severity).join(', ') || 'unknown'}`,
    );
    err.code = 'L0B_BLOCK_EXHAUSTED';
    err.codeValidationResult = r;
    // P2-1: 失败路径保留诊断上下文
    err.diagnosticContext = {
      coverageReport: state._visualParserCache?.coverageReport,
      textTruthValidation: state._visualParserCache?.textTruthValidation,
      subComponentPlan: state.subComponentPlan,
      generationInput: state.generationInput,
      figmaCoverageRate: state._figmaCoverageRate,
    };
    throw err;
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

  // 启用 subcomponent-planner：parallel-analysis → subcomponent-planner → microcode-engineer
  // planner 是零 LLM 开销的确定性算法（把 layoutStructure.sections 机械转成强制子组件清单），
  // 让 complex 组件提前确定子组件拆分，减少 index.vue 整文件生成超时 + scriptSplit 触发。
  // 规划失败会在节点内部降级为「不强拆」，不阻断流程。
  graph.addEdge('parallel-analysis', 'subcomponent-planner');
  graph.addEdge('subcomponent-planner', 'microcode-engineer');

  // ──L0-B: engineer → code-structure-validator（校验 scoped-less 合规性）──
  // 🛡️ P1-3 深化：语义失败时带指导回退 engineer 重试一次（_semanticRetried 置位且未消费 → 回退）
  graph.addConditionalEdge('microcode-engineer', (state) => {
    // 🛡️ P1-5 统一消费（2026-08-28）：
    //  旧实现为每类可重试错误各写一个消费分支（_semanticRetried / _resourceRetried ...），
    //  新增类型时极易漏改此处——一旦漏改，重试标记无处消费，直接进校验器 → fail-closed。
    //  现统一只认 _pendingRetry，新增可重试类型只改 retry-policy.js，本函数零改动。
    if (state._pendingRetry && !state._pendingRetryConsumed) {
      state._pendingRetryConsumed = true;
      state._pendingRetry = false;
      // 🛡️ 同步消费旧标记（mc-max-1787927914106 实锤，2026-08-29）：engineer 侧
      // 判定可重试时除置统一 _pendingRetry 外，还「向后兼容」置 _semanticRetried/_resourceRetried
      // （本文件 1189-1194 行）。若此处只清 _pendingRetry、不清旧标记，下一轮生成成功后
      // 兼容分支（下方 3751 行）仍命中旧标记 → 多余回退一整轮（第 3 轮生成成功被拖进第 4 轮）。
      state._semanticRetryConsumed = true;
      state._resourceRetryConsumed = true;
      logger.info('🛡️ 重试回退 microcode-engineer（带失败指导）', {
        policy: state._pendingRetryPolicyId,
        budget: state._retryBudget,
      });
      return 'microcode-engineer';
    }
    // 兼容防御：若仍有旧路径置位了旧标记而未走统一标记，保证重试不被静默吞掉
    if (
      (state._semanticRetried && !state._semanticRetryConsumed) ||
      (state._resourceRetried && !state._resourceRetryConsumed)
    ) {
      state._semanticRetryConsumed = true;
      state._resourceRetryConsumed = true;
      logger.warn('⚠️ 命中旧式重试标记（兼容分支）→ 回退 microcode-engineer', {
        semantic: !!state._semanticRetried,
        resource: !!state._resourceRetried,
      });
      return 'microcode-engineer';
    }
    return 'code-structure-validator';
  });

  // ── L0-B 条件分流：校验结果决定下一步 ──
  graph.addConditionalEdge('code-structure-validator', (state) => {
    const r = state.codeValidationResult;
    const maxRetry = state._v3Config?.l0MaxRetry ?? 1;
    const retryCount = state.codeValidatorRetryCount || 0;

    // ✅ fail-closed: 真正的 BLOCK（未 degrade bypass）绝不进入 complete / 精修
    if (!r.pass && !r._bypassed) {
      if (retryCount <= maxRetry) {
        // 🛡️ P0-5 修复：检查修复指导是否存在
        if (
          !state._l0CodeRetryGuidance ||
          state._l0CodeRetryGuidance.trim().length === 0
        ) {
          logger.warn(
            `⚠️ P0-5: L0-B 校验失败但缺少修复指导，重试可能重复相同错误`,
            {
              retryCount,
              maxRetry,
              blockCount: r.blockCount,
            },
          );
          // 可选：记录缺少指导的情况，但仍然重试（给 LLM 一次机会）
          state._l0RetryWithoutGuidance = true;
        }

        // BLOCK 且可重试 → 回 engineer 重做（计数由 code-structure-validator 节点管理）
        logger.info(
          `L0-B 校验失败，回退 engineer 重试 (${retryCount}/${maxRetry})`,
          {
            hasGuidance: !!state._l0CodeRetryGuidance,
            guidanceLength: state._l0CodeRetryGuidance?.length || 0,
          },
        );
        return 'microcode-engineer';
      }
      // BLOCK 且重试耗尽 → 终态失败节点，禁止发布（fail-closed）
      logger.error('L0-B 校验 BLOCK 且重试耗尽，禁止发布', {
        blockIds: (r.issues || [])
          .filter((i) => i.severity === 'BLOCK')
          .map((i) => i.id),
      });
      return 'l0b-fail';
    }

    // generate 模式：L0-B 通过 / 已降级 bypass → 先跑结构顺序门禁（P0-2，零 LLM），
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
        // 🛡️ 修复 A（回退局部化）：区块顺序问题必在 index.vue 模板，锁定单一文件局部重做，
        // 避免回退后全局重生成清掉其它已还原的 chunk（拐点 A）。
        state._reviseFiles = ['package/index.vue'];
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

    // 通过/重试耗尽/降级通过 → 继续精修
    return isFeatureEnabled(mode, 'parallel-refine')
      ? 'parallel-refine'
      : 'layout-refiner-legacy';
  });

  // ========================================
  // 禁止臆造硬门禁（generate 模式）：代码落盘 / 完成前的确定性校验
  // 命中 BLOCK（核心文案篡改 / 图表系列膨胀）→ 抛错 fail-closed，禁止发布
  // ========================================
  addNodeWithSkip('do-not-invent-check', async (state) => {
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
      // P2-1: 失败路径保留诊断上下文
      err.diagnosticContext = {
        coverageReport: state._visualParserCache?.coverageReport,
        textTruthValidation: state._visualParserCache?.textTruthValidation,
        subComponentPlan: state.subComponentPlan,
        generationInput: state.generationInput,
        figmaCoverageRate: state._figmaCoverageRate,
      };
      throw err;
    }
    logger.info('✅ 禁止臆造校验通过', { issueCount: res.issues.length });
    return { doNotInventResult: res };
  });

  // ========================================
  // generate 模式一次性运行时门禁：真实预览渲染 + 运行检查（不进入精修循环）
  // BLOCK/fatal → 抛错 fail-closed；渲染基础设施异常 → 非阻塞降级（避免 Puppeteer 偶发失败阻断所有生成）
  // ========================================
  addNodeWithSkip('generate-runtime-verify', async (state) => {
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

      // 使用 classifyRuntimeGate 判断是否需要真正阻断
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

      // 根据分类结果决定是否阻断
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
        // 🛡️ P0 升级（2026-09-02，mv-max-1788359428498-ee0cbe69）+ 扩展（2026-09-10 立项统一治理）：
        // 确定性运行时缺失（X is not defined / Cannot read properties of undefined / **引用型 TDZ：
        // Cannot access X before initialization** / RUNTIME-004 errorType='vue-render' 结构化信号等）不降级——
        // 坏产物此前被当成功任务交付，generate 也要硬 BLOCK。判定口径见 utils/runtime-error-classifier.js。
        // 降级分支仅对非确定性（环境类：导航/网络/资源缺失）放行；确定性产物缺陷一律走下方硬 BLOCK。
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
          logger.error('🚫 generate 运行时门禁硬 BLOCK（确定性运行时缺失，降级会交付坏产物）', {
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

      // 如果是 incremental_fix，记录警告但不阻断
      if (action === 'incremental_fix') {
        logger.warn('generate 运行时门禁发现问题但不阻断（incremental_fix）', {
          issues: runtimeGate?.issues?.map((i) => ({
            id: i.id,
            severity: i.severity,
            message: i.message,
          })),
          reason: classification?.reason,
        });
      }

      return { runtimeGate, renderedImage: result.renderedImage };
    } catch (error) {
      if (error.code === 'GENERATE_RUNTIME_GATE_BLOCKED') throw error;
      // 渲染基础设施异常（Puppeteer 偶发）：非阻塞降级，避免阻断所有生成
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

  //视觉比对阶段重新接入（2026-08-06 修复）：parallel-quality-check → 渲染截图 → 视觉比对 → revision-decision
  // 每轮（含首轮与每次修订后）都会渲染组件截图并与 Figma 原图比对，使保真度闭环真正生效
  graph.addEdge('adversarial-checker', 'parallel-quality-check');
  graph.addEdge('parallel-quality-check', 'screenshot-renderer');
  graph.addEdge('screenshot-renderer', 'visual-comparator');
  graph.addEdge('visual-comparator', 'revision-decision');

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
  addNodeWithSkip('layout-refiner-legacy', async (state) => {
    logger.info('📦 节点: Layout Refiner (串行兼容模式/minimal)');

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const refiner = new LayoutRefiner({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        providerId: textCfg.providerId || null,
      });

      const result = await refiner.execute({
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

  addNodeWithSkip('style-refiner-legacy', async (state) => {
    logger.info('📦 节点: Style Refiner (串行兼容模式/minimal)');

    try {
      const textCfg = state.textAIConfig || state.aiConfig || {};
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey,
        model: textCfg.model,
        baseURL: textCfg.baseURL,
        onTokenUsage: state.onTokenUsage,
        providerId: textCfg.providerId || null,
      });

      const result = await refiner.execute({
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

  logger.debug(`✅ 微码组件生成管线已就绪 (模式: ${resolvedConfig.mode})`);
  logger.debug(
    '   新增节点: preview-validator, parallel-refine, refine-feedback, layout-refiner-legacy, style-refiner-legacy',
  );
  logger.debug('   新增循环: L0-A(自验), L1(反馈), L2(智能路由)');
  logger.debug(
    '   模式切换: off / minimal / full / generate (通过 V3_MODE env 或 config.v3Mode；generate=写完即停)',
  );
  logger.debug(
    `   当前默认: ${resolvedConfig.mode} | l0MaxRetry=${resolvedConfig.config.l0MaxRetry} | bypassThreshold=${resolvedConfig.config.l0BypassAfterFailures}`,
  );

  return graph;
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
    panelType, //面板类型
    figmaToken,
    aiConfig,
    visionAIConfig,
    textAIConfig,
    onProgress,
    sessionId, //用于 Token 追踪关联
    groupId, //运行时预览发布路径
    requirementDoc, //S9: 需求文档（可选，驱动文档子管线）
    docAnalysis, //S9: 预分析文档产物（可选，免重复分析）
    uiCache, //S15: UI 缓存（路径B — figma/visual 节点短路）
    _resumeData, //断点续跑数据 { stage, cachedReviewResult, cachedStyleMappings }
    pauseChecker, //分块生成前暂停检查
    onFilesReady, //完整 files map 生成后发布任务级候选快照
    generationTier, //生成档位（lite/max），由 controller 透传
    sourceType, //输入来源（screenshot/figma/html）
    componentId, //组件 ID（不带 c- 前缀，L0-B CODE-003 做 class 前缀检查用）
    skipNodes, //🆕 变体管线：要跳过的节点名数组（如 ['parallel-analysis','adversarial-checker']）
    failureGuidance, //🛡️ P1-3：任务级重试注入的上轮失败指导（首轮 engineer prompt 即生效）
  } = options;

  //断点续跑：检查点保存辅助函数
  // P2 收编：实现已移至 ../utils/save-checkpoint.js，与 vue3 graph 共用同一份。
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

  //断点续跑模式
  const resumeMode = _resumeData?.stage || null;
  if (resumeMode) {
    logger.info(`🔄 断点续跑模式: ${resumeMode}`);
  }

  logger.info('开始 Phase 2 Figma阶段生成', {
    componentName,
    fileKey,
    nodeId,
    visionModel: visionAIConfig?.model || aiConfig?.model,
    textModel: textAIConfig?.model || aiConfig?.model,
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

    // 🛡️ P0-3 修复：预算超限时设置标志，让后续节点检查并跳过 LLM 调用
    if (status.exceeded && !initialState._budgetExceeded) {
      logger.warn('🛑 Token 预算已耗尽，后续节点将降级执行', {
        used: status.used,
        budget: status.budget,
      });
      initialState._budgetExceeded = true;
    }

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

  const graph = createPhase2Graph(
    Array.isArray(options.skipNodes) && options.skipNodes.length > 0
      ? { skipNodes: options.skipNodes }
      : {},
  );

  // 🆕 真正执行时打印 summary（getPhase2Topology 调用时不打印）
  const resolvedConfig = resolveV3Mode(options);
  const resolvedMode = resolvedConfig.mode || 'generate';
  logger.info(`✅ 微码组件生成管线已就绪 (模式: ${resolvedMode})`);
  logger.info(
    '   新增节点: preview-validator, parallel-refine, refine-feedback, layout-refiner-legacy, style-refiner-legacy',
  );
  logger.info('   新增循环: L0-A(自验), L1(反馈), L2(智能路由)');
  logger.info(
    '   模式切换: off / minimal / full / generate (通过 V3_MODE env 或 config.v3Mode；generate=写完即停)',
  );
  logger.info(
    `   当前默认: ${resolvedMode} | l0MaxRetry=${resolvedConfig.config.l0MaxRetry} | bypassThreshold=${resolvedConfig.config.l0BypassAfterFailures}`,
  );

  const initialState = {
    componentName,
    // 组件 ID（L0-B CODE-003 class 前缀检查用；空则放宽为 c- 前缀即可）
    componentId: componentId || String(componentName || '').replace(/^c-/, ''),
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
    target: 'microcode',
    generationTier: generationTier || 'max',
    sourceType: sourceType || null,
    pauseChecker: pauseChecker || null,
    onFilesReady: onFilesReady || null,
    //S9: 需求文档传递（init 节点文档子管线消费）
    requirementDoc,
    docAnalysis,
    //S15: UI 缓存传递（figma-connector / visual-parser 节点短路）
    _uiCache: uiCache || null,
    //断点续跑数据
    _resumeData: _resumeData || null,
    _saveCheckpoint: saveCheckpoint,
    //🛡️ P1-3：任务级重试注入的上轮失败指导（首轮 engineer prompt 即生效；后续轮由图内 L0-B 重试闭环接管）
    _l0CodeRetryGuidance: failureGuidance || null,
    //🛡️ P1-3 深化：语义门禁失败带指导重试标记（_semanticRetried 置位且未消费 → 条件边回退 engineer 一次）
    _semanticRetried: false,
    _semanticRetryConsumed: false,
  };

  try {
    const result = await graph.run(initialState);

    logger.info('✅ Phase 2 Figma阶段完成', {
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

// ============================================
// ② 真相漂移修复：运行时拓扑导出
// 只读函数，不修改任何节点/边逻辑。
// 维护一份「拓扑视图」（供前端编辑器显示），并通过 buildTopologyValidator()
// 断言与真实 createPhase2Graph() 节点集合保持一致——真实图增删节点时断言失败，
// 提醒同步拓扑视图，消灭 graph-topology.ts 的静态副本漂移。
// ============================================

/** 布局常量（与 graph-topology.ts 保持一致） */
const TOPO_Y_MAIN = 80;
const TOPO_Y_BRANCH = 320;
const TOPO_Y_LEGACY = 560;
const TOPO_X_STEP = 220;
const TOPO_X0 = 50;

/**
 * 获取 Phase2 管线的真实拓扑（供编辑器显示）
 * 每次调用都基于 createPhase2Graph() 的真实节点集合做断言校验，
 * 保证拓扑视图与运行时真相一致。
 */
export function getPhase2Topology() {
  // 1. 构建真实图实例（只读，不执行 run()）
  const realGraph = createPhase2Graph();
  const realNodeNames = new Set(realGraph.nodes.keys());

  // 2. 拓扑视图（手动维护 label/type/position/handler）
  //    此列表必须与 createPhase2Graph() 的 addNode 调用一一对应。
  const TOPOLOGY_NODES = [
    // ── 主流程 ──
    {
      id: 'init',
      label: '初始化',
      type: 'start',
      handler: '',
      position: { x: TOPO_X0, y: TOPO_Y_MAIN },
    },
    {
      id: 'figma-connector',
      label: 'Figma 数据获取',
      type: 'agent',
      handler: 'figma-connector',
      position: { x: TOPO_X0 + TOPO_X_STEP * 1, y: TOPO_Y_MAIN },
    },
    {
      id: 'visual-parser',
      label: '视觉分析',
      type: 'agent',
      handler: 'visual-parser',
      position: { x: TOPO_X0 + TOPO_X_STEP * 2, y: TOPO_Y_MAIN },
    },
    {
      id: 'preview-validator',
      label: 'L0-A 预览校验',
      type: 'gate',
      handler: 'preview-validator',
      position: { x: TOPO_X0 + TOPO_X_STEP * 3, y: TOPO_Y_MAIN },
    },
    {
      id: 'parallel-analysis',
      label: '并行分析\n(布局审查+样式映射)',
      type: 'agent',
      handler: 'parallel-analysis',
      position: { x: TOPO_X0 + TOPO_X_STEP * 4, y: TOPO_Y_MAIN },
    },
    {
      id: 'microcode-engineer',
      label: '代码生成',
      type: 'agent',
      handler: 'microcode-engineer',
      position: { x: TOPO_X0 + TOPO_X_STEP * 5, y: TOPO_Y_MAIN },
    },
    {
      id: 'code-structure-validator',
      label: 'L0-B 代码校验',
      type: 'gate',
      handler: 'code-structure-validator',
      position: { x: TOPO_X0 + TOPO_X_STEP * 6, y: TOPO_Y_MAIN },
    },
    {
      id: 'parallel-refine',
      label: '串行精修\n(布局→样式)',
      type: 'agent',
      handler: 'parallel-refine',
      position: { x: TOPO_X0 + TOPO_X_STEP * 7, y: TOPO_Y_MAIN },
    },
    {
      id: 'refine-feedback',
      label: 'L1 精修反馈',
      type: 'agent',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 8, y: TOPO_Y_MAIN },
    },
    {
      id: 'adversarial-checker',
      label: '对抗检查',
      type: 'agent',
      handler: 'adversarial-checker',
      position: { x: TOPO_X0 + TOPO_X_STEP * 9, y: TOPO_Y_MAIN },
    },
    {
      id: 'screenshot-renderer',
      label: '截图渲染',
      type: 'agent',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 9.5, y: TOPO_Y_BRANCH },
    },
    {
      id: 'visual-comparator',
      label: '视觉比对',
      type: 'agent',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 10, y: TOPO_Y_BRANCH },
    },
    {
      id: 'parallel-quality-check',
      label: '质量聚合',
      type: 'agent',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 10.5, y: TOPO_Y_BRANCH },
    },
    {
      id: 'revision-decision',
      label: 'L2 智能路由',
      type: 'condition',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 11, y: TOPO_Y_MAIN },
    },
    {
      id: 'complete',
      label: '完成',
      type: 'end',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 12, y: TOPO_Y_MAIN },
    },
    // ── L2 路由目标（分支层）──
    {
      id: 'style-refiner',
      label: '样式精修\n(L2路由)',
      type: 'agent',
      handler: 'style-refiner',
      position: { x: TOPO_X0 + TOPO_X_STEP * 9, y: TOPO_Y_LEGACY },
    },
    // ── 兼容模式（minimal/off）──
    {
      id: 'layout-refiner-legacy',
      label: '布局精修\n(兼容模式)',
      type: 'agent',
      handler: 'layout-refiner-legacy',
      position: { x: TOPO_X0 + TOPO_X_STEP * 7, y: TOPO_Y_LEGACY },
    },
    {
      id: 'style-refiner-legacy',
      label: '样式精修\n(兼容模式)',
      type: 'agent',
      handler: 'style-refiner',
      position: { x: TOPO_X0 + TOPO_X_STEP * 8, y: TOPO_Y_LEGACY },
    },
    // ── S9 文档子管线节点（拓扑显示但不展开细节）──
    // 注：docAnalyzer 不是独立图节点（S9 文档子管线，见 getPhase2NodeRegistry），已从拓扑视图移除
    {
      id: 'subcomponent-planner',
      label: '子组件规划',
      type: 'agent',
      handler: '',
      position: { x: TOPO_X0 + TOPO_X_STEP * 4.5, y: TOPO_Y_LEGACY },
    },
    // ── 内部门禁/校验节点（真实原子节点，需纳入拓扑视图避免漂移告警）──
    {
      id: 'l0b-fail',
      label: 'L0-B 失败',
      type: 'gate',
      handler: 'l0b-fail',
      position: { x: TOPO_X0 + TOPO_X_STEP * 6.5, y: TOPO_Y_BRANCH },
    },
    {
      id: 'do-not-invent-check',
      label: '防臆造检查',
      type: 'agent',
      handler: 'do-not-invent-check',
      position: { x: TOPO_X0 + TOPO_X_STEP * 10.5, y: TOPO_Y_MAIN },
    },
    {
      id: 'generate-runtime-verify',
      label: '运行时校验',
      type: 'agent',
      handler: 'generate-runtime-verify',
      position: { x: TOPO_X0 + TOPO_X_STEP * 11, y: TOPO_Y_BRANCH },
    },
  ];

  // 3. 断言校验：拓扑视图（展开合并节点后）必须与真实图一致。
  //    拓扑视图用合并节点表示原子节点（parallel-analysis→[layout-reviewer,style-mapper] 已由
  //    parallel-analysis 包装节点内部执行、layout-refiner 已并入 parallel-refine 内部执行，
  //    真实图不再存在这些原子节点，展开列表置空），对比时需展开，否则会误报漂移。
  const topoGroupsLocal = {
    'parallel-analysis': [],
    'parallel-refine': [],
    'layout-refiner-legacy': [],
    'style-refiner-legacy': ['style-refiner'],
  };
  const expandedTopo = new Set();
  for (const id of TOPOLOGY_NODES.map((n) => n.id)) {
    expandedTopo.add(id); // 合并节点本身也是真实图节点
    const group = topoGroupsLocal[id];
    if (group && group.length) group.forEach((n) => expandedTopo.add(n));
  }
  const missingInTopology = [...realNodeNames].filter(
    (n) => !expandedTopo.has(n),
  );
  const extraInTopology = [...expandedTopo].filter(
    (n) => !realNodeNames.has(n),
  );
  if (missingInTopology.length > 0 || extraInTopology.length > 0) {
    logger.warn(
      `⚠️ 拓扑漂移检测: 真实图多出 [${missingInTopology.join(', ')}], 拓扑视图多出 [${extraInTopology.join(', ')}]。请同步 graph-topology。`,
    );
  }

  // 4. 边定义（含 condition 标签，前端可视化用）
  const TOPOLOGY_EDGES = [
    // ── 主流程直连边 ──
    { source: 'init', target: 'figma-connector' },
    { source: 'figma-connector', target: 'visual-parser' },
    { source: 'parallel-analysis', target: 'microcode-engineer' },
    { source: 'microcode-engineer', target: 'code-structure-validator' },
    { source: 'refine-feedback', target: 'adversarial-checker' },
    { source: 'adversarial-checker', target: 'parallel-quality-check' },
    { source: 'parallel-quality-check', target: 'screenshot-renderer' },
    { source: 'screenshot-renderer', target: 'visual-comparator' },
    { source: 'visual-comparator', target: 'revision-decision' },
    { source: 'style-refiner', target: 'adversarial-checker' },
    // ── 条件边: visual-parser → preview-validator | parallel-analysis ──
    {
      source: 'visual-parser',
      target: 'preview-validator',
      condition: 'l0_enabled',
      label: 'L0校验',
    },
    {
      source: 'visual-parser',
      target: 'parallel-analysis',
      condition: 'l0_disabled',
      label: '跳过L0',
    },
    // ── 条件边: preview-validator → parallel-analysis | visual-parser ──
    {
      source: 'preview-validator',
      target: 'parallel-analysis',
      condition: 'pass',
      label: '通过',
    },
    {
      source: 'preview-validator',
      target: 'visual-parser',
      condition: 'retry',
      label: '重试',
    },
    // ── 条件边: code-structure-validator → parallel-refine | microcode-engineer | layout-refiner-legacy ──
    {
      source: 'code-structure-validator',
      target: 'parallel-refine',
      condition: 'pass',
      label: '通过→精修',
    },
    {
      source: 'code-structure-validator',
      target: 'microcode-engineer',
      condition: 'retry',
      label: '重试',
    },
    {
      source: 'code-structure-validator',
      target: 'layout-refiner-legacy',
      condition: 'minimal',
      label: '兼容模式',
    },
    // ── 条件边: parallel-refine → refine-feedback | adversarial-checker ──
    {
      source: 'parallel-refine',
      target: 'refine-feedback',
      condition: 'l1_enabled',
      label: 'L1反馈',
    },
    {
      source: 'parallel-refine',
      target: 'adversarial-checker',
      condition: 'l1_disabled',
      label: '跳过L1',
    },
    // ── 条件边: revision-decision → complete | microcode-engineer | style-refiner | parallel-refine ──
    {
      source: 'revision-decision',
      target: 'complete',
      condition: 'pass',
      label: '完成',
    },
    {
      source: 'revision-decision',
      target: 'microcode-engineer',
      condition: 'full',
      label: '全量修订',
    },
    {
      source: 'revision-decision',
      target: 'style-refiner',
      condition: 'stylistic',
      label: '样式修订',
    },
    {
      source: 'revision-decision',
      target: 'parallel-refine',
      condition: 'layout',
      label: '布局修订',
    },
    // ── 兼容模式链路 ──
    { source: 'layout-refiner-legacy', target: 'style-refiner-legacy' },
    { source: 'style-refiner-legacy', target: 'adversarial-checker' },
  ];

  // 5. 组装最终拓扑 JSON（与前端编辑器契约一致）
  return {
    name: 'original-phase2',
    label: '微码组件生成管线 (Phase2)',
    description:
      'Figma 驱动的微码组件生成完整管线，含 L0-A 预览校验、L0-B 代码结构校验、L1 精修反馈、L2 智能路由（4路分发）',
    isOriginal: true,
    entryNode: 'init',
    nodes: TOPOLOGY_NODES.map((n, i) => ({
      ...n,
      config: {},
    })),
    edges: TOPOLOGY_EDGES.map((e, i) => ({
      id: `e-${i}`,
      ...e,
    })),
  };
}

export default createPhase2Graph;

/**
 * 🆕 Phase2 节点注册表（变体管线 skipNodes 计算用，轻量纯常量，不构建图）
 *
 * 拓扑视图（编辑器可见）是合并视图，真实图是原子节点，两者名称不一致：
 * - parallel-analysis（拓扑） 代表 [layout-reviewer, style-mapper]（真实节点）
 * - parallel-refine（拓扑）   代表 [layout-refiner]
 * 用户删除某个拓扑节点 → 映射到其真实节点 → 生成 skipNodes。
 *
 * @returns {{ allRealNodes: string[], realToTopo: Object<string,string> }}
 *   allRealNodes: 真实图全部节点名（含内部节点 l0b-fail 等，不可删除仅兜底）
 *   realToTopo:   真实节点名 → 所属拓扑节点 id（同名兜底自身）
 */
export function getPhase2NodeRegistry() {
  // 真实图原子节点全集（与 createPhase2Graph 的 addNode 调用对应）
  // 注：layout-reviewer / style-mapper / layout-refiner 已移除（由 parallel-analysis /
  // parallel-refine 包装节点内部执行，不再作为独立图节点注册）
  const allRealNodes = [
    'init',
    'figma-connector',
    'visual-parser',
    'microcode-engineer',
    'style-refiner',
    'adversarial-checker',
    'screenshot-renderer',
    'visual-comparator',
    'parallel-quality-check',
    'revision-decision',
    'complete',
    'parallel-analysis',
    'subcomponent-planner',
    'preview-validator',
    'parallel-refine',
    'refine-feedback',
    'code-structure-validator',
    'l0b-fail',
    'do-not-invent-check',
    'generate-runtime-verify',
    'layout-refiner-legacy',
    'style-refiner-legacy',
  ];

  // 拓扑节点 id → 真实节点名（合并视图展开）
  const topoGroups = {
    'parallel-analysis': [],
    'parallel-refine': [],
    'layout-refiner-legacy': [],
    'style-refiner-legacy': ['style-refiner'],
    docAnalyzer: [], // S9 文档子管线，非独立图节点
  };

  // 真实节点 → 宿主拓扑 id（默认同名）
  const realToTopo = {};
  for (const real of allRealNodes) realToTopo[real] = real;
  for (const [topoId, reals] of Object.entries(topoGroups)) {
    for (const real of reals) realToTopo[real] = topoId;
  }

  return { allRealNodes, realToTopo };
}

/**
 * 动态工作流图构建器
 *
 * 职责：将 WorkflowEditor 画布上编排的工作流 JSON 定义，
 *       构建为可执行的 LangGraph，让"可视化编排"真正驱动生成。
 *
 * 节点类型映射：
 *   start     → 初始化 state（透传 figmaToken/fileKey/nodeId/config 等）
 *   agent     → 实例化对应 role，用 Orchestrator 包装（重试+超时），执行 execute(state)
 *   condition → 根据上游检查结果设置 state._decision，供条件边路由
 *   end       → 标记完成
 *
 * 角色与 Provider 路由：
 *   visual-parser          → visionAIConfig（Qwen）
 *   layout-reviewer        → textAIConfig（Claude）
 *   style-mapper           → textAIConfig（Claude）
 *   microcode-engineer     → textAIConfig（Claude）
 *   adversarial-checker    → textAIConfig（Claude）
 *   figma-connector        → 无 AI（数据获取）
 */

import { Graph } from './graph.js';
import { FigmaConnector } from '../roles/figma-connector.js';
import { VisualParser } from '../roles/visual-parser.js';
import { LayoutReviewer } from '../roles/layout-reviewer.js';
import { StyleMapper } from '../roles/style-mapper.js';
import { MicrocodeEngineer } from '../roles/microcode-engineer.js';
import { AdversarialChecker } from '../roles/adversarial-checker.js';
import { HelloAgent } from '../roles/hello-agent.js';
import { UrlParserAgent } from '../roles/url-parser-agent.js';
import { LayoutRefiner } from '../roles/layout-refiner.js';
import { StyleRefiner } from '../roles/style-refiner.js';
import { LayoutStyleRefiner } from '../roles/layout-style-refiner.js';
import { Vue3Engineer } from '../roles/vue3-engineer.js';
import { DocAnalyzerAgent } from '../agents/doc-analyzer-agent.js';
import { ConfigGeneratorAgent } from '../agents/config-generator-agent.js';
import { ScreenshotRendererNode } from '../roles/screenshot-renderer-node.js';
import { VisualComparatorNode } from '../roles/visual-comparator-node.js';
import { SubcomponentPlannerNode } from '../roles/subcomponent-planner-node.js';
import { executeNode } from '../orchestrator/orchestrator.js';
import { createLogger } from '../logger/index.js';
import {
  getMaxIterations,
  getQualityScoreThreshold,
} from '../../config/runtime-env.js';
//  硬伤④修复：动态图落地真实 L0 校验门（之前 preview-validator / code-structure-validator
//  是 type:'condition' handler:'' 的空壳，运行时只路由不校验）。新增 gate 节点类型，
//  实际执行以下校验器并把结果写入 state.checkResult，供下游 condition 决策。
import { PreviewAnalysisValidator } from '../validators/preview-analysis-validator.js';
import { CodeStructureValidator } from '../validators/code-structure-validator.js';

const logger = createLogger({ name: 'dynamic-workflow-graph' });

// 视觉类角色（用 visionAIConfig）
const VISION_HANDLERS = new Set(['visual-parser']);

/**
 * 角色实例化映射（🆕 动态化：内置 case 优先，Agent Builder 动态智能体兜底）
 * 动态智能体从 config/agents/{name}.json 读取定义并 import roles/custom/{name}.js，
 * 带 mtime 时间戳打破 ESM 缓存 → 新建/编辑后免重启即可调度。
 */
async function instantiateRole(handlerName, state) {
  const isVision = VISION_HANDLERS.has(handlerName);
  const cfg = isVision
    ? state.visionAIConfig || state.aiConfig || {}
    : state.textAIConfig || state.aiConfig || {};

  const roleCfg = {
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    model: cfg.model || '', // cfg.model 来自 state.textAIConfig.model，空则下游抛错
    sessionId: state.sessionId || null, // 📊 透传给 agent，统一 invoke 出口登记「会话→模型」供日志渲染
    ...(state.workflowConfig?.[handlerName] || {}), // 节点级配置覆盖
  };

  switch (handlerName) {
    case 'figma-connector':
      return new FigmaConnector(roleCfg);
    // visual-parser 的语境以 state.target 为准（workflow.service 运行时按管线名注入：
    // original-vue3 → 'vue3'，其余 → 'microcode'），修复「Vue3 管线被锁死为微码语境」的硬伤。
    case 'visual-parser':
      return new VisualParser({
        ...roleCfg,
        target: state.target || state.componentType || 'microcode',
      });
    case 'layout-reviewer':
      return new LayoutReviewer(roleCfg);
    case 'style-mapper':
      return new StyleMapper(roleCfg);
    case 'microcode-engineer':
      return new MicrocodeEngineer(roleCfg);
    case 'adversarial-checker':
      return new AdversarialChecker(roleCfg);
    case 'hello-agent':
      return new HelloAgent(roleCfg);
    case 'url-parser-agent':
      return new UrlParserAgent(roleCfg);
    case 'layout-refiner':
      return new LayoutRefiner(roleCfg);
    case 'style-refiner':
      return new StyleRefiner(roleCfg);
    case 'layout-style-refiner':
      return new LayoutStyleRefiner(roleCfg);
    case 'vue3-engineer':
      return new Vue3Engineer(roleCfg);
    case 'doc-analyzer':
      return new DocAnalyzerAgent(roleCfg);
    case 'config-generator':
      return new ConfigGeneratorAgent(roleCfg);
    case 'screenshot-renderer':
      return new ScreenshotRendererNode(roleCfg);
    case 'visual-comparator':
      return new VisualComparatorNode(roleCfg);
    case 'subcomponent-planner':
      return new SubcomponentPlannerNode(roleCfg);
    default: {
      // 🆕 动态智能体兜底：Agent Builder 创建的自定义节点
      const { readDynamicAgentDef, instantiateDynamicAgent } =
        await import('../../agent-builder/dynamic-loader.js');
      // 视觉类动态智能体（requires.vision）用 visionAIConfig
      const dynDef = await readDynamicAgentDef(handlerName);
      if (dynDef?.requires?.vision) {
        const visionCfg = state.visionAIConfig || state.aiConfig || {};
        const visionRoleCfg = {
          apiKey: visionCfg.apiKey,
          baseURL: visionCfg.baseURL,
          model: visionCfg.model,
          ...(state.workflowConfig?.[handlerName] || {}),
        };
        const dynVision = await instantiateDynamicAgent(
          handlerName,
          visionRoleCfg,
        );
        if (dynVision) return dynVision;
      }
      const dynamic = await instantiateDynamicAgent(handlerName, roleCfg);
      if (dynamic) return dynamic;
      throw new Error(`未知的 handler: ${handlerName}`);
    }
  }
}

/**
 * 根据工作流 JSON 构建可执行 Graph
 * @param {object} workflow  { name, entryNode, nodes:[{id,type,handler,config}], edges:[{source,target,condition}] }
 * @param {object} runtime   运行时配置 { onProgress }
 * @returns {Graph}
 */
export function buildDynamicGraph(workflow, runtime = {}) {
  const { onProgress, onNodeSnapshot } = runtime;
  const graph = new Graph({ name: `dynamic-${workflow.name || 'workflow'}` });

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // 节点 id → 节点定义
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // ============ 添加节点 ============
  for (const node of nodes) {
    const handler = buildNodeHandler(node, {
      onProgress,
      onNodeSnapshot,
      nodeMap,
    });
    graph.addNode(node.id, handler);
  }

  // ============ 添加边 ============
  // 硬伤④修复：`gate` 节点和 `condition` 节点一样，是带条件出边的决策节点
  // （区别：gate 会先执行真实校验器写 checkResult，再由自身决策逻辑设 _decision）
  const isDecisionNode = (n) => n?.type === 'condition' || n?.type === 'gate';

  // 收集每个决策节点的条件出边
  const conditionOutgoing = new Map();
  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    if (isDecisionNode(src) && edge.condition) {
      if (!conditionOutgoing.has(edge.source)) {
        conditionOutgoing.set(edge.source, []);
      }
      conditionOutgoing.get(edge.source).push(edge);
    }
  }

  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    // 决策节点（condition / gate）：用 addConditionalEdge 路由（每个只加一次）
    if (isDecisionNode(src) && edge.condition) {
      // 避免重复添加：只在遇到该节点第一条边时注册路由函数
      if (graph.edges.some((e) => e.from === edge.source && e.to === null))
        continue;
      const branches = conditionOutgoing.get(edge.source) || [];
      graph.addConditionalEdge(edge.source, (state) => {
        const decision = state._decision;
        // 优先精确匹配 condition 标签
        const matched = branches.find((b) => b.condition === decision);
        if (matched) return matched.target;
        // 容错：decision 为 needs_revision 匹配 failed/needs-revision
        if (decision === 'needs_revision') {
          const alt = branches.find((b) =>
            ['failed', 'needs-revision', 'revise'].includes(b.condition),
          );
          if (alt) return alt.target;
        }
        // 默认走 passed/success 分支
        const def =
          branches.find((b) =>
            ['passed', 'success', 'done'].includes(b.condition),
          ) || branches[0];
        return def?.target || null;
      });
    } else if (!isDecisionNode(src)) {
      // 普通节点：直接连边
      if (edge.target) {
        graph.addEdge(edge.source, edge.target);
      }
    }
  }

  // ============ 入口节点 ============
  if (workflow.entryNode) {
    graph.setEntry(workflow.entryNode);
  } else {
    // 兜底：取第一个 start 节点或第一个节点
    const start = nodes.find((n) => n.type === 'start') || nodes[0];
    if (start) graph.setEntry(start.id);
  }

  logger.info('动态工作流图构建完成', {
    name: workflow.name,
    nodes: nodes.length,
    edges: edges.length,
    entry: graph.entryNode,
  });

  return graph;
}

/**
 * 为单个节点构建执行 handler
 */
function buildNodeHandler(node, { onProgress, onNodeSnapshot, nodeMap }) {
  const { type, handler, config } = node;

  // start 节点：初始化（state 已由调用方传入，这里透传）
  if (type === 'start') {
    return async (state) => {
      onProgress?.({
        stage: '初始化',
        message: '🚀 工作流开始',
        status: 'running',
      });
      return {
        iterationCount: 0,
        maxIterations: 2,
        workflowConfig: collectConfigs(nodeMap),
      };
    };
  }

  // end 节点：完成
  if (type === 'end') {
    return async (state) => {
      onProgress?.({
        stage: '完成',
        message: '✅ 工作流执行完成',
        status: 'completed',
      });
      return { workflowCompleted: true };
    };
  }

  // condition 节点：决策，设置 _decision
  // 硬伤③修复：对齐生产图的质量环路——
  //   · 修订上限从 runtime-env 读取（不再写死 3）
  //   · 当 checkResult 带质量分且达标时，即便未显式 passed 也提前放行（收敛）
  // 注意：仅修改本动态图的决策逻辑，绝不改动生产图 mc-component-graph-phase2 的 revision-decision。
  if (type === 'condition') {
    return async (state) => {
      const checkResult = state.checkResult || {};

      // 修订次数限制：与 runtime-env 一致（默认 3，线上可配）
      const MAX_REVISIONS = getMaxIterations();
      const revisionCount = state._revisionCount || 0;
      const qualityThreshold = getQualityScoreThreshold();

      let decision;
      const needsRevision = checkResult.checkResult === 'needs_revision';

      if (needsRevision) {
        // 质量分达标 → 视为已收敛，提前退出（即使上游仍标记 needs_revision）
        const score =
          typeof checkResult.qualityScore === 'number'
            ? checkResult.qualityScore
            : NaN;
        if (!Number.isNaN(score) && score >= qualityThreshold) {
          decision = 'passed';
          logger.info(`质量分(${score})≥阈值(${qualityThreshold})，提前放行`, {
            node: node.id,
            revisionCount,
            qualityScore: score,
          });
          onProgress?.({
            stage: '条件判断',
            message: `✅ 质量分 ${score}≥${qualityThreshold}，收敛通过`,
            status: 'running',
          });
        } else if (revisionCount >= MAX_REVISIONS) {
          decision = 'passed';
          logger.warn(`已达到最大修订次数(${MAX_REVISIONS})，强制通过`, {
            node: node.id,
            revisionCount,
            qualityScore: checkResult.qualityScore,
          });
          onProgress?.({
            stage: '条件判断',
            message: `⚠️ 已修订${revisionCount}次，达到上限，强制通过`,
            status: 'running',
          });
        } else {
          decision = 'needs_revision';
          logger.info('条件节点决策', {
            node: node.id,
            decision,
            revisionCount: revisionCount + 1,
            checkResult: checkResult.checkResult,
          });
          onProgress?.({
            stage: '条件判断',
            message: `🔀 需要修订(第${revisionCount + 1}次)，返回生成节点`,
            status: 'running',
          });
        }
      } else {
        decision = 'passed';
        logger.info('条件节点决策', {
          node: node.id,
          decision,
          checkResult: checkResult.checkResult,
        });
        onProgress?.({
          stage: '条件判断',
          message: '🔀 检查通过，走向完成',
          status: 'running',
        });
      }

      return {
        _decision: decision,
        _revisionCount:
          decision === 'needs_revision' ? revisionCount + 1 : revisionCount,
      };
    };
  }

  // ============ gate 节点（硬伤④）============
  // 真正执行校验器，写 state.checkResult + state._decision，供下游条件边路由。
  // handler 字段在此复用为「校验器 id」：
  //   preview-validator       → PreviewAnalysisValidator
  //   code-structure-validator → CodeStructureValidator
  // 返回结构规范一化为：{ checkResult, qualityScore?, issueCategories?, blockCount, errors }
  if (type === 'gate' && handler) {
    return async (state) => {
      const label = node.label || handler;
      const t0 = Date.now();
      onProgress?.({
        stage: label,
        message: `🔍 执行 ${label}...`,
        status: 'running',
      });

      let raw;
      try {
        if (handler === 'preview-validator') {
          // PreviewAnalysisValidator.validate(analysis) → { pass, blockCount, errors }
          const analysis =
            state.previewAnalysis || state.visualParseResult?.analysis;
          raw = PreviewAnalysisValidator.validate(analysis);
        } else if (handler === 'code-structure-validator') {
          // CodeStructureValidator.validate(files, id, opts) → { pass, issues, blockCount, summary }
          const files = state.generatedFiles || state.files;
          raw = CodeStructureValidator.validate(
            files,
            state.componentId || state.componentName,
            { target: state.target || 'microcode' },
          );
        } else {
          logger.warn(`未注册的校验器: ${handler}，按通过处理`);
          raw = { pass: true, blockCount: 0, errors: [] };
        }
      } catch (err) {
        logger.error(`校验器 ${handler} 执行失败`, { error: err.message });
        raw = {
          pass: false,
          blockCount: 1,
          errors: [{ message: err.message }],
        };
      }

      // 规范化为 condition 决策结构
      const passed = !!raw.pass;
      const checkResult = {
        checkResult: passed ? 'passed' : 'needs_revision',
        qualityScore:
          typeof raw.score === 'number'
            ? raw.score
            : passed
              ? getQualityScoreThreshold()
              : Math.max(0, getQualityScoreThreshold() - 10),
        issueCategories: categorizeValidatorErrors(raw),
        blockCount: raw.blockCount ?? 0,
        errors: raw.errors || raw.issues || [],
        source: handler,
      };

      // gate 节点自己直接决策（不再交给下游 condition）
      const decision = passed ? 'passed' : 'needs_revision';
      onProgress?.({
        stage: label,
        message: passed
          ? `✅ ${label} 通过`
          : `❌ ${label} 未通过(${checkResult.blockCount} 项阻断)`,
        status: passed ? 'completed' : 'running',
      });

      // 🆕 节点快照（可观测性）：记录输入/输出供前端调试查看
      onNodeSnapshot?.({
        nodeId: node.id,
        nodeLabel: label,
        handler,
        type: 'gate',
        inputKeys: Object.keys(state || {}),
        output: checkResult,
        status: passed ? 'completed' : 'failed',
        durationMs: Date.now() - t0,
      });

      return {
        checkResult,
        _decision: decision,
        _revisionCount:
          decision === 'needs_revision'
            ? (state._revisionCount || 0) + 1
            : state._revisionCount || 0,
      };
    };
  }

  // 🆕 parallel 并行组节点：config.handlers = [角色名,...]，子角色并行执行（Promise.all），结果合并
  // graph.js 是顺序引擎（phase2 共用不可改），并行发生在节点 handler 内部——
  // 该节点在画布上是一个普通节点，执行时内部并行跑多个子智能体。
  if (type === 'parallel') {
    const subHandlers = Array.isArray(config?.handlers)
      ? config.handlers.filter(Boolean)
      : [];
    const fn = async (state) => {
      const t0 = Date.now();
      if (subHandlers.length === 0) {
        onProgress?.({
          stage: node.label || '并行组',
          message: '⚠️ 并行组未配置子节点',
          status: 'warning',
        });
        return { parallelResult: { ok: false, reason: 'no-handlers' } };
      }
      onProgress?.({
        stage: node.label || '并行组',
        message: `⚡ 并行执行 ${subHandlers.length} 个子节点: ${subHandlers.join(', ')}`,
        status: 'running',
      });
      const merged = {};
      const results = await Promise.all(
        subHandlers.map(async (h) => {
          try {
            const role = await instantiateRole(h, state);
            const r = await role.execute(state);
            return { handler: h, ok: true, result: r || {} };
          } catch (e) {
            logger.warn(`并行子节点 ${h} 执行失败（容错）: ${e.message}`);
            return { handler: h, ok: false, error: e.message, result: {} };
          }
        }),
      );
      for (const item of results) {
        Object.assign(merged, item.result || {});
        merged[`${item.handler}_status`] = item.ok ? 'ok' : 'error';
      }
      onProgress?.({
        stage: node.label || '并行组',
        message: `✅ 并行组完成（${results.filter((r) => r.ok).length}/${results.length} 成功）`,
        status: 'completed',
      });

      // 🆕 节点快照（可观测性）
      onNodeSnapshot?.({
        nodeId: node.id,
        nodeLabel: node.label || '并行组',
        handler: 'parallel',
        type: 'parallel',
        inputKeys: Object.keys(state || {}),
        output: { parallelResult: { results, ok: results.every((r) => r.ok) } },
        status: results.every((r) => r.ok) ? 'completed' : 'warning',
        durationMs: Date.now() - t0,
      });

      return {
        parallelResult: { results, ok: results.every((r) => r.ok) },
        ...merged,
      };
    };
    return fn;
  }

  // agent/skill 节点：实例化 role + Orchestrator 包装执行
  // ⑥ 术语统一：新术语 skill 与旧术语 agent 等价
  if ((type === 'agent' || type === 'skill') && handler) {
    const nodeConfig = config || {};
    const fn = async (state) => {
      const t0 = Date.now();
      const role = await instantiateRole(handler, state);
      onProgress?.({
        stage: node.label || handler,
        message: `⚙️ 执行 ${node.label || handler}...`,
        status: 'running',
      });
      // 透传 state 供 role.execute 解构所需字段
      const result = await role.execute(state);
      // 汇报完成
      onProgress?.({
        stage: node.label || handler,
        message: `✅ ${node.label || handler} 完成`,
        status: 'completed',
      });
      // 🆕 节点快照（可观测性）：记录执行前输入键 + 执行后输出，供前端调试查看
      onNodeSnapshot?.({
        nodeId: node.id,
        nodeLabel: node.label || handler,
        handler,
        type: 'agent',
        inputKeys: Object.keys(state || {}),
        output: result || {},
        status: 'completed',
        durationMs: Date.now() - t0,
      });
      return result || {};
    };

    // 用 Orchestrator 包装：重试 + 超时
    return executeNode(handler, fn, {
      maxRetries: nodeConfig.maxRetries ?? 0,
      timeout: (nodeConfig.timeout ?? 5) * 60 * 1000,
      onProgress,
    });
  }

  // 未知类型：no-op
  return async (state) => state;
}

/**
 * 收集所有 agent/skill 节点的 config，供运行时按 handler 名查询覆盖配置
 */
function collectConfigs(nodeMap) {
  const configs = {};
  for (const [, node] of nodeMap) {
    if (
      (node.type === 'agent' || node.type === 'skill') &&
      node.handler &&
      node.config
    ) {
      configs[node.handler] = node.config;
    }
  }
  return configs;
}

/**
 * 把校验器的原始错误/问题归类到 issueCategories，便于 condition 决策与上层路由
 * （如 layout / style / structure / semantic 等）
 */
function categorizeValidatorErrors(raw) {
  const errs = raw.errors || raw.issues || [];
  const cats = new Set();
  for (const e of errs) {
    const msg = (typeof e === 'string' ? e : e?.message || '').toLowerCase();
    if (/layout|auto[- ]?layout|align|gap|padding|margin/.test(msg))
      cats.add('layout');
    else if (/style|color|font|background|border|token|theme/.test(msg))
      cats.add('style');
    else if (/import|export|syntax|parse|template|script|undefined/.test(msg))
      cats.add('structure');
    else cats.add('other');
  }
  return [...cats];
}

/**
 * 运行动态工作流
 * @param {object} workflow   工作流定义
 * @param {object} initialState  初始 state（含 figmaToken/fileKey/nodeId/各 config/onProgress）
 * @returns {Promise<object>} 最终 state
 */
export async function runDynamicWorkflow(
  workflow,
  initialState = {},
  runtime = {},
) {
  const graph = buildDynamicGraph(workflow, {
    onProgress: initialState.onProgress,
    onNodeSnapshot: runtime.onNodeSnapshot,
  });
  return await graph.run(initialState);
}

export default {
  buildDynamicGraph,
  runDynamicWorkflow,
};

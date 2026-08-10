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

import { Graph } from './graph.js'
import { FigmaConnector } from '../roles/figma-connector.js'
import { VisualParser } from '../roles/visual-parser.js'
import { LayoutReviewer } from '../roles/layout-reviewer.js'
import { StyleMapper } from '../roles/style-mapper.js'
import { MicrocodeEngineer } from '../roles/microcode-engineer.js'
import { AdversarialChecker } from '../roles/adversarial-checker.js'
import { executeNode } from '../orchestrator/orchestrator.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'dynamic-workflow-graph' })

// 视觉类角色（用 visionAIConfig）
const VISION_HANDLERS = new Set(['visual-parser'])

/**
 * 角色实例化映射
 */
function instantiateRole(handlerName, state) {
  const isVision = VISION_HANDLERS.has(handlerName)
  const cfg = isVision
    ? (state.visionAIConfig || state.aiConfig || {})
    : (state.textAIConfig || state.aiConfig || {})

  const roleCfg = {
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    model: cfg.model,
    ...(state.workflowConfig?.[handlerName] || {}) // 节点级配置覆盖
  }

  switch (handlerName) {
    case 'figma-connector': return new FigmaConnector(roleCfg)
    case 'visual-parser': return new VisualParser(roleCfg)
    case 'layout-reviewer': return new LayoutReviewer(roleCfg)
    case 'style-mapper': return new StyleMapper(roleCfg)
    case 'microcode-engineer': return new MicrocodeEngineer(roleCfg)
    case 'adversarial-checker': return new AdversarialChecker(roleCfg)
    default:
      throw new Error(`未知的 handler: ${handlerName}`)
  }
}

/**
 * 根据工作流 JSON 构建可执行 Graph
 * @param {object} workflow  { name, entryNode, nodes:[{id,type,handler,config}], edges:[{source,target,condition}] }
 * @param {object} runtime   运行时配置 { onProgress }
 * @returns {Graph}
 */
export function buildDynamicGraph(workflow, runtime = {}) {
  const { onProgress } = runtime
  const graph = new Graph({ name: `dynamic-${workflow.name || 'workflow'}` })

  const nodes = workflow.nodes || []
  const edges = workflow.edges || []

  // 节点 id → 节点定义
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // ============ 添加节点 ============
  for (const node of nodes) {
    const handler = buildNodeHandler(node, { onProgress, nodeMap })
    graph.addNode(node.id, handler)
  }

  // ============ 添加边 ============
  // 收集每个 condition 节点的条件出边
  const conditionOutgoing = new Map()
  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    if (src?.type === 'condition' && edge.condition) {
      if (!conditionOutgoing.has(edge.source)) {
        conditionOutgoing.set(edge.source, [])
      }
      conditionOutgoing.get(edge.source).push(edge)
    }
  }

  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    // condition 节点：用 addConditionalEdge 路由（每个 condition 节点只加一次）
    if (src?.type === 'condition' && edge.condition) {
      // 避免重复添加：只在遇到该 condition 节点第一条边时注册路由函数
      if (graph.edges.some(e => e.from === edge.source && e.to === null)) continue
      const branches = conditionOutgoing.get(edge.source) || []
      graph.addConditionalEdge(edge.source, (state) => {
        const decision = state._decision
        // 优先精确匹配 condition 标签
        const matched = branches.find(b => b.condition === decision)
        if (matched) return matched.target
        // 容错：decision 为 needs_revision 匹配 failed/needs-revision
        if (decision === 'needs_revision') {
          const alt = branches.find(b =>
            ['failed', 'needs-revision', 'revise'].includes(b.condition))
          if (alt) return alt.target
        }
        // 默认走 passed/success 分支
        const def = branches.find(b =>
          ['passed', 'success', 'done'].includes(b.condition)) || branches[0]
        return def?.target || null
      })
    } else if (src?.type !== 'condition') {
      // 普通节点：直接连边
      if (edge.target) {
        graph.addEdge(edge.source, edge.target)
      }
    }
  }

  // ============ 入口节点 ============
  if (workflow.entryNode) {
    graph.setEntry(workflow.entryNode)
  } else {
    // 兜底：取第一个 start 节点或第一个节点
    const start = nodes.find(n => n.type === 'start') || nodes[0]
    if (start) graph.setEntry(start.id)
  }

  logger.info('动态工作流图构建完成', {
    name: workflow.name,
    nodes: nodes.length,
    edges: edges.length,
    entry: graph.entryNode
  })

  return graph
}

/**
 * 为单个节点构建执行 handler
 */
function buildNodeHandler(node, { onProgress, nodeMap }) {
  const { type, handler, config } = node

  // start 节点：初始化（state 已由调用方传入，这里透传）
  if (type === 'start') {
    return async (state) => {
      onProgress?.({ stage: '初始化', message: '🚀 工作流开始', status: 'running' })
      return { iterationCount: 0, maxIterations: 2, workflowConfig: collectConfigs(nodeMap) }
    }
  }

  // end 节点：完成
  if (type === 'end') {
    return async (state) => {
      onProgress?.({ stage: '完成', message: '✅ 工作流执行完成', status: 'completed' })
      return { workflowCompleted: true }
    }
  }

  // condition 节点：决策，设置 _decision
  if (type === 'condition') {
    return async (state) => {
      const checkResult = state.checkResult || {}

      // 修订次数限制：默认最大3次，防止无限循环
      const MAX_REVISIONS = 3
      const revisionCount = (state._revisionCount || 0)

      let decision
      if (checkResult.checkResult === 'needs_revision') {
        if (revisionCount >= MAX_REVISIONS) {
          decision = 'passed'
          logger.warn(`已达到最大修订次数(${MAX_REVISIONS})，强制通过`, {
            node: node.id,
            revisionCount,
            qualityScore: checkResult.qualityScore
          })
          onProgress?.({
            stage: '条件判断',
            message: `⚠️ 已修订${revisionCount}次，达到上限，强制通过`,
            status: 'running'
          })
        } else {
          decision = 'needs_revision'
          logger.info('条件节点决策', {
            node: node.id,
            decision,
            revisionCount: revisionCount + 1,
            checkResult: checkResult.checkResult
          })
          onProgress?.({
            stage: '条件判断',
            message: `🔀 需要修订(第${revisionCount + 1}次)，返回生成节点`,
            status: 'running'
          })
        }
      } else {
        decision = 'passed'
        logger.info('条件节点决策', { node: node.id, decision, checkResult: checkResult.checkResult })
        onProgress?.({
          stage: '条件判断',
          message: '🔀 检查通过，走向完成',
          status: 'running'
        })
      }

      return {
        _decision: decision,
        _revisionCount: decision === 'needs_revision' ? revisionCount + 1 : revisionCount
      }
    }
  }

  // agent 节点：实例化 role + Orchestrator 包装执行
  if (type === 'agent' && handler) {
    const nodeConfig = config || {}
    const fn = async (state) => {
      const role = instantiateRole(handler, state)
      onProgress?.({
        stage: node.label || handler,
        message: `⚙️ 执行 ${node.label || handler}...`,
        status: 'running'
      })
      // 透传 state 供 role.execute 解构所需字段
      const result = await role.execute(state)
      // 汇报完成
      onProgress?.({
        stage: node.label || handler,
        message: `✅ ${node.label || handler} 完成`,
        status: 'completed'
      })
      return result || {}
    }

    // 用 Orchestrator 包装：重试 + 超时
    return executeNode(handler, fn, {
      maxRetries: nodeConfig.maxRetries ?? 0,
      timeout: (nodeConfig.timeout ?? 5) * 60 * 1000,
      onProgress
    })
  }

  // 未知类型：no-op
  return async (state) => state
}

/**
 * 收集所有 agent 节点的 config，供运行时按 handler 名查询覆盖配置
 */
function collectConfigs(nodeMap) {
  const configs = {}
  for (const [, node] of nodeMap) {
    if (node.type === 'agent' && node.handler && node.config) {
      configs[node.handler] = node.config
    }
  }
  return configs
}

/**
 * 运行动态工作流
 * @param {object} workflow   工作流定义
 * @param {object} initialState  初始 state（含 figmaToken/fileKey/nodeId/各 config/onProgress）
 * @returns {Promise<object>} 最终 state
 */
export async function runDynamicWorkflow(workflow, initialState = {}) {
  const graph = buildDynamicGraph(workflow, { onProgress: initialState.onProgress })
  return await graph.run(initialState)
}

export default {
  buildDynamicGraph,
  runDynamicWorkflow
}

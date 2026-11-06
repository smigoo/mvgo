/**
 * 简化版的 LangGraph
 * 实现基本的图结构和节点执行流程
 */

import { createLogger } from '../logger/index.js'

export class Graph {
  constructor(options = {}) {
    this.name = options.name || 'unnamed-graph'
    this.nodes = new Map()
    this.edges = []
    this.entryNode = null
    this.state = {}

    this.logger = createLogger({
      name: `graph:${this.name}`
    })
  }

  /**
   * 添加节点
   */
  addNode(name, handler) {
    if (this.nodes.has(name)) {
      throw new Error(`Node ${name} already exists`)
    }

    this.nodes.set(name, {
      name,
      handler
    })

    this.logger.debug('节点已添加', { name })
    return this
  }

  /**
   * 添加边
   */
  addEdge(from, to, condition = null) {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node ${from} does not exist`)
    }

    if (!this.nodes.has(to)) {
      throw new Error(`Target node ${to} does not exist`)
    }

    this.edges.push({
      from,
      to,
      condition
    })

    this.logger.debug('边已添加', { from, to })
    return this
  }

  /**
   * 添加条件边
   */
  addConditionalEdge(from, condition) {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node ${from} does not exist`)
    }

    this.edges.push({
      from,
      to: null,
      condition
    })

    this.logger.debug('条件边已添加', { from })
    return this
  }

  /**
   * 设置入口节点
   */
  setEntry(nodeName) {
    if (!this.nodes.has(nodeName)) {
      throw new Error(`Entry node ${nodeName} does not exist`)
    }

    this.entryNode = nodeName
    this.logger.debug('入口节点已设置', { entry: nodeName })
    return this
  }

  /**
   * 运行图
   */
  async run(initialState = {}) {
    if (!this.entryNode) {
      throw new Error('Entry node not set')
    }

    this.state = { ...initialState }
    this.logger.info('开始执行图')

    let currentNode = this.entryNode
    const visitCounts = new Map()
    const maxIterations = 100
    // 单个节点最大访问次数：正常 revision 重访微码引擎 ≤4 次，
    // 超过即判定为不收敛循环，强制终止（防止失控空转烧 Token）
    const maxNodeVisits = 12
    let iterations = 0

    while (currentNode && iterations < maxIterations) {
      iterations++

      // 防止单个节点被无限重复访问（循环检测）
      const nodeVisits = (visitCounts.get(currentNode) || 0) + 1
      visitCounts.set(currentNode, nodeVisits)
      if (nodeVisits > maxNodeVisits) {
        this.logger.error('检测到疑似不收敛循环，强制终止图运行', { node: currentNode, limit: maxNodeVisits })
        break
      }

      // 执行当前节点
      this.logger.info('执行节点', { node: currentNode, iteration: iterations })
      await this.executeNode(currentNode)

      // 获取下一个节点
      currentNode = this.getNextNode(currentNode)
    }

    if (iterations >= maxIterations) {
      this.logger.error('达到最大迭代次数')
      throw new Error('Max iterations reached')
    }

    this.logger.info('图执行完成', { iterations })
    return this.state
  }

  /**
   * 执行节点
   * @private
   */
  async executeNode(nodeName) {
    const node = this.nodes.get(nodeName)
    if (!node) {
      throw new Error(`Node ${nodeName} not found`)
    }

    try {
      const result = await node.handler(this.state)

      if (result) {
        this.state = { ...this.state, ...result }
      }

      this.logger.debug('节点执行成功', { node: nodeName })
    } catch (error) {
      this.logger.error('节点执行失败', {
        node: nodeName,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取下一个节点
   * @private
   */
  getNextNode(currentNode) {
    // 找到从当前节点出发的所有边
    const outgoingEdges = this.edges.filter(edge => edge.from === currentNode)

    if (outgoingEdges.length === 0) {
      // 没有出边，结束
      return null
    }

    // 查找第一个满足条件的边
    for (const edge of outgoingEdges) {
      if (edge.condition) {
        // 条件边
        const nextNode = edge.condition(this.state)
        if (nextNode) {
          return nextNode
        }
      } else if (edge.to) {
        // 普通边
        return edge.to
      }
    }

    return null
  }

  /**
   * 获取图信息
   */
  getInfo() {
    return {
      name: this.name,
      nodes: Array.from(this.nodes.keys()),
      edges: this.edges.map(e => ({
        from: e.from,
        to: e.to || 'conditional'
      })),
      entryNode: this.entryNode
    }
  }

  /**
   * 可视化图结构（简单文本表示）
   */
  visualize() {
    const lines = [`Graph: ${this.name}`, '']

    lines.push('Nodes:')
    for (const name of this.nodes.keys()) {
      const marker = name === this.entryNode ? ' (entry)' : ''
      lines.push(`  - ${name}${marker}`)
    }

    lines.push('')
    lines.push('Edges:')
    for (const edge of this.edges) {
      const condition = edge.condition ? ' [conditional]' : ''
      const target = edge.to || '?'
      lines.push(`  ${edge.from} -> ${target}${condition}`)
    }

    return lines.join('\n')
  }

  /**
   * 导出为 Mermaid 图表格式
   */
  toMermaid() {
    const lines = ['graph TD']

    // 添加入口节点样式
    if (this.entryNode) {
      lines.push(`    ${this.entryNode}[["🚀 ${this.entryNode}"]]`)
      lines.push(`    style ${this.entryNode} fill:#e1f5e1,stroke:#4caf50,stroke-width:3px`)
    }

    // 添加所有节点
    for (const name of this.nodes.keys()) {
      if (name !== this.entryNode) {
        lines.push(`    ${name}["⚙️ ${name}"]`)
      }
    }

    lines.push('')

    // 添加边
    for (const edge of this.edges) {
      if (edge.condition) {
        // 条件边
        lines.push(`    ${edge.from} -->|"🔀 条件判断"| decision{判断}`)
        lines.push(`    style decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px`)
      } else if (edge.to) {
        // 普通边
        lines.push(`    ${edge.from} --> ${edge.to}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * 导出为 JSON 格式（用于前端渲染）
   */
  toJSON() {
    return {
      name: this.name,
      nodes: Array.from(this.nodes.keys()).map(name => ({
        id: name,
        label: name,
        isEntry: name === this.entryNode
      })),
      edges: this.edges.map((edge, index) => ({
        id: `edge-${index}`,
        source: edge.from,
        target: edge.to || 'conditional',
        isConditional: !!edge.condition
      })),
      entryNode: this.entryNode
    }
  }

  /**
   * 从 JSON 配置构建图（静态工厂方法）
   * @param {Object} json - 工作流 JSON 配置
   * @param {Object} handlerMap - Handler 名称到函数的映射
   */
  static fromJSON(json, handlerMap = {}) {
    const graph = new Graph({ name: json.name || 'workflow' })

    // 添加节点
    for (const node of json.nodes || []) {
      const handler = handlerMap[node.handler] || (async (s) => s)
      graph.addNode(node.id, handler)
    }

    // 添加边
    for (const edge of json.edges || []) {
      if (edge.condition) {
        // 条件边：根据 condition 值返回下一节点
        graph.addConditionalEdge(edge.source, (state) => {
          // 查找当前节点的条件边匹配
          const outgoingConditional = json.edges.filter(
            e => e.source === edge.source && e.condition
          )
          // 尝试使用 state 中的决策字段
          const decision = state._decision || state.decision
          if (decision && outgoingConditional.some(e => e.condition === decision)) {
            return outgoingConditional.find(e => e.condition === decision).target
          }
          // 默认取第一个条件边的目标
          return edge.target
        })
      } else {
        graph.addEdge(edge.source, edge.target)
      }
    }

    // 设置入口节点
    if (json.entryNode) {
      graph.setEntry(json.entryNode)
    }

    return graph
  }
}

/**
 * Handler 注册表（全局）
 * 在运行时注册可用的 handler 函数
 */
const globalHandlerRegistry = new Map()

/**
 * 注册一个 handler
 */
export function registerHandler(name, handlerFn) {
  globalHandlerRegistry.set(name, handlerFn)
}

/**
 * 获取已注册的 handler 映射
 */
export function getHandlerMap() {
  const map = {}
  for (const [name, fn] of globalHandlerRegistry) {
    map[name] = fn
  }
  return map
}

/**
 * 从 JSON 创建图实例（使用全局注册的 handler）
 */
export function createGraphFromJSON(json, extraHandlers = {}) {
  const handlerMap = { ...getHandlerMap(), ...extraHandlers }
  return Graph.fromJSON(json, handlerMap)
}

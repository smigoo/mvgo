/**
 * Hello Agent - 最小可执行智能体示例
 *
 * 从零创建的第一个智能体：不调用 LLM（纯确定性逻辑），
 * 用于验证「注册表 → 编辑器 → 调度器 → execute → 结果合并」整条链路。
 * 后期可在此模板上扩展：加 prompt 模板、加 LLM 调用、加工具。
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'hello-agent' })

export class HelloAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'hello-agent',
      description: '最小智能体示例：透传组件名并输出欢迎信息（不调用 LLM）',
      model: config.model || 'gpt-4o-mini',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 1024,
      skipLLM: true, // 纯确定性智能体：不构建 LLM 客户端，无 API key 也能运行
      ...config,
    })
    logger.info('Hello Agent 已初始化')
  }

  /**
   * 调度器入口：dynamic-workflow-graph 会调用 role.execute(state)，
   * 返回对象会自动合并回 state，供下游节点消费。
   */
  async execute(params) {
    const {
      componentName,
      fileKey,
      nodeId,
      onProgress = null,
    } = params

    onProgress?.({
      stage: 'hello-agent',
      message: '👋 Hello Agent 执行中...',
      status: 'running',
    })

    logger.info('Hello Agent 执行', { componentName, fileKey, nodeId })

    const greeting = this.config?.greeting || 'Hello'
    return {
      helloResult: {
        message: `${greeting}! 组件 ${componentName || 'unknown'} 来自 Figma ${fileKey || '?'}#${nodeId || '?'}`,
        componentName: componentName || null,
        executedAt: Date.now(),
      },
    }
  }

  /** BaseAgent 要求实现 */
  parseOutput(rawOutput) {
    return rawOutput
  }
}

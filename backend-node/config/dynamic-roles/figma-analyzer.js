/**
 * Figma 组件分析（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.068Z
 * 输入: figmaNodeData
 * 输出: componentCount, components
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'figma-analyzer' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'figma-analyzer',
      description: '从 Figma 设计稿节点树分析组件数量与清单',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'figma-analyzer',
      message: 'Figma 组件分析 执行中（LLM）...',
      status: 'running',
    })
    try {


      const inputSummary = JSON.stringify({ figmaNodeData: params.figmaNodeData })
      const prompt = [
        '你是 Figma 设计稿分析师。从输入的节点树中识别出有几个独立的组件/模块（通常是顶层 FRAME 或命名含 component 的分组）。输出 JSON：componentCount（组件数量数字）、components（数组，每项含 name/type/description）。只输出 JSON 不要其他内容。',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: componentCount, components。不要输出其他内容。',
      ].join('\n')
      const response = await this.llm.invoke([new HumanMessage(prompt)])
      const text = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.content || '')
      let parsed
      try {
        const cleaned = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { result: text }
      }
      onProgress?.({ stage: 'figma-analyzer', message: '✅ Figma 组件分析 完成', status: 'completed' })
      return { componentCount: parsed["componentCount"] ?? null, components: parsed["components"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('figma-analyzer LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'figma-analyzer', message: '⚠️ Figma 组件分析 失败: ' + e.message, status: 'failed' })
      return { componentCount: null, components: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 代码分析（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.061Z
 * 输入: code
 * 输出: analysis
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'code-analyzer' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'code-analyzer',
      description: '分析组件代码结构',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'code-analyzer',
      message: '代码分析 执行中（LLM）...',
      status: 'running',
    })
    try {


      const inputSummary = JSON.stringify({ code: params.code })
      const prompt = [
        '你是资深前端架构师。分析组件代码，输出 JSON：structure（模板/脚本/样式概览）、props（props 列表及含义）、api（调用接口）、logic（核心逻辑说明）、extensionPoints（可扩展点）。只输出 JSON。',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: analysis。不要输出其他内容。',
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
      onProgress?.({ stage: 'code-analyzer', message: '✅ 代码分析 完成', status: 'completed' })
      return { analysis: parsed["analysis"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('code-analyzer LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'code-analyzer', message: '⚠️ 代码分析 失败: ' + e.message, status: 'failed' })
      return { analysis: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

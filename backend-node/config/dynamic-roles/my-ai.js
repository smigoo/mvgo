/**
 * 我的AI分析（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.144Z
 * 输入: input
 * 输出: result
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'my-ai' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-ai',
      description: 'AI测试',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-ai',
      message: '我的AI分析 执行中（LLM）...',
      status: 'running',
    })
    try {


      const inputSummary = JSON.stringify({ input: params.input })
      const prompt = [
        '你是分析师，分析输入并输出JSON',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: result。不要输出其他内容。',
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
      onProgress?.({ stage: 'my-ai', message: '✅ 我的AI分析 完成', status: 'completed' })
      return { result: parsed["result"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('my-ai LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-ai', message: '⚠️ 我的AI分析 失败: ' + e.message, status: 'failed' })
      return { result: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

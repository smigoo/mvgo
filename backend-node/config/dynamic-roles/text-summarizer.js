/**
 * 文本总结（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.181Z
 * 输入: text
 * 输出: summary, keyPoints
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'text-summarizer' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'text-summarizer',
      description: '对抓取/输入的长文本输出结构化总结',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'text-summarizer',
      message: '文本总结 执行中（LLM）...',
      status: 'running',
    })
    try {


      const inputSummary = JSON.stringify({ text: params.text })
      const prompt = [
        '你是专业文档分析师。对输入文本输出 JSON：summary（150字以内中文摘要）、keyPoints（3-5 个要点数组）。只输出 JSON。',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: summary, keyPoints。不要输出其他内容。',
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
      onProgress?.({ stage: 'text-summarizer', message: '✅ 文本总结 完成', status: 'completed' })
      return { summary: parsed["summary"] ?? null, keyPoints: parsed["keyPoints"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('text-summarizer LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'text-summarizer', message: '⚠️ 文本总结 失败: ' + e.message, status: 'failed' })
      return { summary: null, keyPoints: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

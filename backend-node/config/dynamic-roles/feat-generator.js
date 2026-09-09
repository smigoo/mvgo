/**
 * 功能组件生成（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.064Z
 * 输入: analysis, requirement
 * 输出: componentCode, notes
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'feat-generator' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'feat-generator',
      description: '基于代码分析和需求生成新组件代码',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'feat-generator',
      message: '功能组件生成 执行中（LLM）...',
      status: 'running',
    })
    try {


      const inputSummary = JSON.stringify({ analysis: params.analysis, requirement: params.requirement })
      const prompt = [
        '你是资深 Vue 前端工程师。基于输入的代码分析（analysis）和新的功能需求（requirement），输出新组件完整代码。输出 JSON：componentCode（完整 .vue 单文件组件代码字符串，保持与源组件风格一致，仅实现需求描述的功能）、notes（实现说明/依赖/注意点）。只输出 JSON。',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: componentCode, notes。不要输出其他内容。',
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
      onProgress?.({ stage: 'feat-generator', message: '✅ 功能组件生成 完成', status: 'completed' })
      return { componentCode: parsed["componentCode"] ?? null, notes: parsed["notes"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('feat-generator LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'feat-generator', message: '⚠️ 功能组件生成 失败: ' + e.message, status: 'failed' })
      return { componentCode: null, notes: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 规范驱动分析（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer | 创建: 2026-09-02T16:56:35.177Z
 * 输入: componentName
 * 输出: spec
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'p2-ai-spec' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = [{"name":"组件规范.md","url":"/Users/smigoo/工作/mvgo/backend-node/config/agent-resources/组件规范.md","type":"md"}]

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-ai-spec',
      description: '带组件规范参考的AI节点',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-ai-spec',
      message: '规范驱动分析 执行中（LLM）...',
      status: 'running',
    })
    try {

      const refDocs = []
      for (const rf of REF_FILES) {
        if (/(png|jpe?g|gif|webp|svg|pdf)$/i.test(rf.type || '')) {
          refDocs.push('# 参考图片: ' + rf.name + '（已上传，路径: ' + rf.url + '）')
          continue
        }
        try {
          const _fs = await import('node:fs')
          const c = _fs.readFileSync(rf.url, 'utf-8')
          refDocs.push('# 参考文档: ' + rf.name + '\n' + c.slice(0, 8000))
        } catch (e) { logger.warn('读取参考文档失败 ' + rf.name + ': ' + e.message) }
      }


      const inputSummary = JSON.stringify({ componentName: params.componentName })
      const prompt = [
        '你是组件开发规范专家，根据组件名和参考文档输出组件实现要点JSON',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 参考文档（创建时上传，需严格遵循其规范）',
        ...refDocs,
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: spec。不要输出其他内容。',
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
      onProgress?.({ stage: 'p2-ai-spec', message: '✅ 规范驱动分析 完成', status: 'completed' })
      return { spec: parsed["spec"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('p2-ai-spec LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-ai-spec', message: '⚠️ 规范驱动分析 失败: ' + e.message, status: 'failed' })
      return { spec: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 双图比对（Agent Builder 自动生成，请勿手改）
 * 模板: vision-compare（视觉模式） | 创建: 2026-09-02T16:56:35.178Z
 * 输入: figmaImage, renderedImage
 * 输出: similarity, differences
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'p2-cmp' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-cmp',
      description: '',
      model: config.model || 'qwen3.7-plus',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-cmp',
      message: '双图比对 执行中（LLM·视觉）...',
      status: 'running',
    })
    try {


      //  视觉模式：读取图片 → base64 data URL → 多模态消息
      const images = []
      
      if (params.figmaImage) {
        try {
          const fs = await import('node:fs')
          const b64 = fs.readFileSync(params.figmaImage).toString('base64')
          const ext = String(params.figmaImage).split('.').pop() || 'png'
          images.push({ type: 'image_url', image_url: { url: 'data:image/' + ext + ';base64,' + b64 } })
        } catch (e) { logger.warn('读取图片失败 figmaImage: ' + e.message) }
      }

      if (params.renderedImage) {
        try {
          const fs = await import('node:fs')
          const b64 = fs.readFileSync(params.renderedImage).toString('base64')
          const ext = String(params.renderedImage).split('.').pop() || 'png'
          images.push({ type: 'image_url', image_url: { url: 'data:image/' + ext + ';base64,' + b64 } })
        } catch (e) { logger.warn('读取图片失败 renderedImage: ' + e.message) }
      }
      if (images.length === 0) return { similarity: null, differences: null, error: '缺少图片输入（image 字段）' }

      const inputSummary = JSON.stringify({ figmaImage: params.figmaImage, renderedImage: params.renderedImage })
      const prompt = [
        '对比两图输出similarity与differences',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: similarity, differences。不要输出其他内容。',
      ].join('\n')
      const response = await this.llm.invoke([new HumanMessage([{ type: 'text', text: prompt }, ...images])])
      const text = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.content || '')
      let parsed
      try {
        const cleaned = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { result: text }
      }
      onProgress?.({ stage: 'p2-cmp', message: '✅ 双图比对 完成', status: 'completed' })
      return { similarity: parsed["similarity"] ?? null, differences: parsed["differences"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('p2-cmp LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-cmp', message: '⚠️ 双图比对 失败: ' + e.message, status: 'failed' })
      return { similarity: null, differences: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

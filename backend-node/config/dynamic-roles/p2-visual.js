/**
 * 视觉分析（Agent Builder 自动生成，请勿手改）
 * 模板: llm-analyzer（视觉模式） | 创建: 2026-09-02T16:56:35.181Z
 * 输入: previewImage, designTree
 * 输出: layoutStructure
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: 'p2-visual' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = []

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-visual',
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
      stage: 'p2-visual',
      message: '视觉分析 执行中（LLM·视觉）...',
      status: 'running',
    })
    try {


      //  视觉模式：读取图片 → base64 data URL → 多模态消息
      const images = []
      
      if (params.previewImage) {
        try {
          const fs = await import('node:fs')
          const b64 = fs.readFileSync(params.previewImage).toString('base64')
          const ext = String(params.previewImage).split('.').pop() || 'png'
          images.push({ type: 'image_url', image_url: { url: 'data:image/' + ext + ';base64,' + b64 } })
        } catch (e) { logger.warn('读取图片失败 previewImage: ' + e.message) }
      }
      if (images.length === 0) return { layoutStructure: null, error: '缺少图片输入（image 字段）' }

      const inputSummary = JSON.stringify({ previewImage: params.previewImage, designTree: params.designTree })
      const prompt = [
        '你是UI布局分析师，根据预览图与设计树输出布局结构JSON',
        '',
        '# 输入数据',
        '```json',
        inputSummary,
        '```',
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: layoutStructure。不要输出其他内容。',
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
      onProgress?.({ stage: 'p2-visual', message: '✅ 视觉分析 完成', status: 'completed' })
      return { layoutStructure: parsed["layoutStructure"] ?? null, raw: parsed }
    } catch (e) {
      logger.warn('p2-visual LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-visual', message: '⚠️ 视觉分析 失败: ' + e.message, status: 'failed' })
      return { layoutStructure: null, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

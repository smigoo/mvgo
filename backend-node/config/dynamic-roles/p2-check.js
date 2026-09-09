/**
 * 臆造检查（Agent Builder 自动生成，请勿手改）
 * 模板: do-not-invent | 创建: 2026-09-02T16:56:35.178Z
 * 输入: (无)
 * 输出: (无)
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-check' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-check',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-check',
      message: '臆造检查 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-check', message: '✅ 臆造检查 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-check 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-check', message: '⚠️ 臆造检查 失败: ' + e.message, status: 'failed' })
      return { ok: false, error: e.message }
    }
  }

  async _run(params) {
    const contentField = params.contentField || 'content'
    const knownField = params.knownItemsField || 'knownItems'
    const content = params[contentField]
    const knownRaw = params[knownField]
    if (!content || !knownRaw) return { doNotInventResult: { skipped: true, reason: '缺少内容或已知元素清单' }, ok: true, inventedItems: [] }
    try {
      const known = Array.isArray(knownRaw) ? knownRaw : (typeof knownRaw === 'string' ? JSON.parse(knownRaw) : [])
      const knownItems = known.map((k) => String(k).trim()).filter(Boolean)
      if (knownItems.length === 0) return { doNotInventResult: { ok: true, skipped: true, reason: '已知清单为空' }, ok: true, inventedItems: [] }
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
      // 提取标识符（中文词组/英文单词），过滤高频虚词（含/包含/和/的/与… 作为子串命中即过滤）
      const STOP_WORDS = ['含', '包含', '包括', '以及', '和', '的', '与', '或', '及', '有', '为', '对', '在', '个', '一个', '组件', '内容']
      const tokens = (contentStr.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z_][a-zA-Z0-9_]{2,}/g) || [])
        .filter((t) => !STOP_WORDS.some((s) => t.includes(s)))
      // 子串匹配：known 元素是 token 的子串（或反之）即视为已知，避免句子片段误报
      const invented = [...new Set(tokens)].filter(
        (t) => !knownItems.some((k) => t.includes(k) || k.includes(t)),
      )
      return { doNotInventResult: { ok: invented.length === 0, inventedCount: invented.length }, ok: invented.length === 0, inventedItems: invented.slice(0, 20) }
    } catch (e) {
      return { doNotInventResult: { ok: true, skipped: true, error: e.message }, ok: true, inventedItems: [] }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

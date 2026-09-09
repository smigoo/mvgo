/**
 * 我的URL解析（Agent Builder 自动生成，请勿手改）
 * 模板: url-parser | 创建: 2026-09-02T16:56:35.176Z
 * 输入: figmaUrl
 * 输出: fileKey, nodeId
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-url' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-url',
      description: '测试创建',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-url',
      message: '我的URL解析 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-url', message: '✅ 我的URL解析 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-url 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-url', message: '⚠️ 我的URL解析 失败: ' + e.message, status: 'failed' })
      return { fileKey: null, nodeId: null, error: e.message }
    }
  }

  async _run(params) {
    const { figmaUrl, onProgress } = params
    if (!figmaUrl) return { fileKey: null, nodeId: null, ok: false, error: '缺少 figmaUrl' }
    try {
      const u = new URL(figmaUrl)
      const m = u.pathname.match(/\/(file|design)\/([^/]+)/)
      const fileKey = m ? m[2] : null
      const raw = u.searchParams.get('node-id') || u.searchParams.get('nodeId') || ''
      const nodeId = raw ? decodeURIComponent(raw) : null
      return { fileKey, nodeId, cleanUrl: fileKey ? `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(nodeId || '')}` : null, ok: !!fileKey && !!nodeId }
    } catch (e) {
      return { fileKey: null, nodeId: null, ok: false, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

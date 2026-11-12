/**
 * Figma取数（Agent Builder 自动生成，请勿手改）
 * 模板: figma-fetch | 创建: 2026-11-12T04:34:15.604Z
 * 输入: (无)
 * 输出: (无)
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-fetch' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-fetch',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-fetch',
      message: 'Figma取数 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-fetch', message: '✅ Figma取数 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-fetch 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-fetch', message: '⚠️ Figma取数 失败: ' + e.message, status: 'failed' })
      return { ok: false, error: e.message }
    }
  }

  async _run(params) {
    const { fileKey, nodeId, figmaUrl, figmaToken, onProgress } = params
    let fk = fileKey
    let nid = nodeId
    if (!fk && figmaUrl) {
      try {
        const u = new URL(figmaUrl)
        const m = u.pathname.match(/\/(file|design)\/([^/]+)/)
        if (m) fk = m[2]
        const raw = u.searchParams.get('node-id') || u.searchParams.get('nodeId') || ''
        if (raw) nid = decodeURIComponent(raw)
      } catch (e) { /* ignore */ }
    }
    if (!fk || !nid) return { fetchResult: { ok: false, error: '缺少 fileKey/nodeId' }, fileKey: null, nodeId: null }
    // 🔴 2026-11-12 用户指令（零兜底）：删除 env 兜底（原会静默套用服务端部署级 token，属跨用户串号），仅认调用方显式传入的 figmaToken
    const token = figmaToken || ''
    if (!token) return { fetchResult: { ok: false, error: '缺少 Figma token（请在参数 figmaToken 中显式传入）' }, fileKey: fk, nodeId: nid }
    try {
      const url = 'https://api.figma.com/v1/files/' + encodeURIComponent(fk) + '/nodes?ids=' + encodeURIComponent(nid)
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      if (!res.ok) return { fetchResult: { ok: false, error: 'Figma API HTTP ' + res.status }, fileKey: fk, nodeId: nid }
      const data = await res.json()
      const nodes = (data && data.nodes) || {}
      return { fetchResult: { ok: true, nodeCount: Object.keys(nodes).length }, figmaNodeData: data, fileKey: fk, nodeId: nid }
    } catch (e) {
      return { fetchResult: { ok: false, error: e.message }, fileKey: fk, nodeId: nid }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 文档抓取（Agent Builder 自动生成，请勿手改）
 * 模板: web-fetch | 创建: 2026-09-02T16:56:35.175Z
 * 输入: url
 * 输出: text, title, ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-fetch' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-fetch',
      description: '抓网页转文本',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-fetch',
      message: '文档抓取 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-fetch', message: '✅ 文档抓取 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-fetch 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-fetch', message: '⚠️ 文档抓取 失败: ' + e.message, status: 'failed' })
      return { text: null, title: null, ok: null, error: e.message }
    }
  }

  async _run(params) {
    const { url, maxLength = 20000 } = params
    if (!url) return { text: null, title: null, ok: null, ok: false, error: '缺少 url' }
    if (_blockedUrl(url)) return { text: null, title: null, ok: null, ok: false, error: 'SSRF 防护: 禁止请求本地/内网地址' }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'mvgo-web-fetch/1.0' },
      })
      if (!res.ok) return { text: null, title: null, ok: null, ok: false, error: 'HTTP ' + res.status }
      const html = await res.text()
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || ''
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim()
      const out = { title, text: text.slice(0, Number(maxLength) || 20000), url, ok: true, status: res.status }
      return { text: out["text"], title: out["title"], ok: out["ok"] }
    } catch (e) {
      return { text: null, title: null, ok: null, ok: false, error: '抓取失败: ' + e.message }
    }

function _blockedUrl(u) {
  try {
    const host = new URL(u).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true
    if (host.endsWith('.local') || host.endsWith('.internal')) return true
    if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  } catch { return true }
  return false
}
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

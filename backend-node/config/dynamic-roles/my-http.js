/**
 * HTTP 请求（Agent Builder 自动生成，请勿手改）
 * 模板: http-request | 创建: 2026-09-02T16:56:35.175Z
 * 输入: url, method
 * 输出: status, data, ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-http' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-http',
      description: '通用调第三方API',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-http',
      message: 'HTTP 请求 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-http', message: '✅ HTTP 请求 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-http 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-http', message: '⚠️ HTTP 请求 失败: ' + e.message, status: 'failed' })
      return { status: null, data: null, ok: null, error: e.message }
    }
  }

  async _run(params) {
    const { url, method = 'GET', headers = {}, body, timeout = 10000 } = params
    if (!url) return { status: null, data: null, ok: null, ok: false, error: '缺少 url' }
    if (_blockedUrl(url)) return { status: null, data: null, ok: null, ok: false, error: 'SSRF 防护: 禁止请求本地/内网地址' }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Number(timeout) || 10000)
    try {
      const m = String(method || 'GET').toUpperCase()
      const hdrs = typeof headers === 'string' ? (JSON.parse(headers) || {}) : (headers || {})
      const res = await fetch(url, {
        method: m,
        headers: hdrs,
        body: body != null && m !== 'GET' && m !== 'HEAD' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: ctrl.signal,
      })
      const text = await res.text()
      let data = text
      try { data = JSON.parse(text) } catch { /* 非 JSON 保留原文 */ }
      const out = { status: res.status, ok: res.ok, data, headers: Object.fromEntries(res.headers.entries()) }
      return { status: out["status"], data: out["data"], ok: out["ok"] }
    } catch (e) {
      return { status: null, data: null, ok: null, ok: false, error: '请求失败: ' + e.message }
    } finally {
      clearTimeout(timer)
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

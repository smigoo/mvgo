/**
 * 我的校验器（Agent Builder 自动生成，请勿手改）
 * 模板: validator | 创建: 2026-09-02T16:56:35.173Z
 * 输入: score
 * 输出: ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-check' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-check',
      description: '测试',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-check',
      message: '我的校验器 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-check', message: '✅ 我的校验器 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-check 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-check', message: '⚠️ 我的校验器 失败: ' + e.message, status: 'failed' })
      return { ok: null, error: e.message }
    }
  }

  async _run(params) {
    const required = ['score']
    const missing = required.filter((k) => params[k] == null || params[k] === '')
    const errors = []
    if (missing.length) errors.push('缺少必填字段: ' + missing.join(', '))
    if (typeof params.score === 'number' && params.score < 80) errors.push('score 低于阈值 80')
    const ok = errors.length === 0
    return { ok, valid: ok, errors, passed: ok, ok: ok }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

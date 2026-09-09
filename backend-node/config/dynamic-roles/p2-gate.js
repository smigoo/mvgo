/**
 * 失败阻断（Agent Builder 自动生成，请勿手改）
 * 模板: l0b-fail | 创建: 2026-09-02T16:56:35.179Z
 * fail-closed：校验不通过时抛错阻断管线，禁止发布坏产物。
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-gate' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-gate',
      description: '',
      skipLLM: true,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    const check = params.checkResult || params.check || {}
    const failed =
      check.pass === false ||
      check.ok === false ||
      check.valid === false ||
      (check.blockCount || 0) > 0
    onProgress?.({
      stage: 'p2-gate',
      message: failed ? '❌ 校验未通过，阻断发布（fail-closed）' : '✅ 校验通过',
      status: failed ? 'failed' : 'completed',
    })
    if (failed) {
      const raw = check.errors || check.issues || []
      const detail = raw.slice(0, 5).map((e) => (typeof e === 'string' ? e : (e.message || JSON.stringify(e)))).join('; ')
      logger.warn('L0 校验未通过，阻断发布: ' + detail)
      throw new Error('L0 校验未通过，已阻断发布: ' + (detail || '未知原因'))
    }
    return { gate: 'passed', blockCount: 0, checkResult: check }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

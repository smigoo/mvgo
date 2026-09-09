/**
 * 截图渲染（Agent Builder 自动生成，请勿手改）
 * 模板: screenshot | 创建: 2026-09-02T16:56:35.180Z
 * 输入: (无)
 * 输出: (无)
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-shot' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-shot',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-shot',
      message: '截图渲染 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-shot', message: '✅ 截图渲染 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-shot 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-shot', message: '⚠️ 截图渲染 失败: ' + e.message, status: 'failed' })
      return { ok: false, error: e.message }
    }
  }

  async _run(params) {
    const { componentName, outputPath, target, onProgress } = params
    if (!componentName) return { screenshotResult: { skipped: true, reason: '缺少 componentName' }, screenshotPath: null }
    try {
      const { renderScreenshot } = await import('../screenshot-renderer.js')
      const result = await renderScreenshot({
        componentName,
        sessionId: params.sessionId || ('dyn-' + Date.now()),
        groupId: params.groupId || 'custom',
        target: target || 'microcode',
        outputPath,
      })
      return { screenshotResult: result || {}, screenshotPath: (result && result.screenshotPath) || null }
    } catch (e) {
      return { screenshotResult: { skipped: true, error: e.message }, screenshotPath: null }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 格式化器（Agent Builder 自动生成，请勿手改）
 * 模板: formatter | 创建: 2026-09-02T16:56:35.175Z
 * 输入: name, count
 * 输出: text
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-formatter' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-formatter',
      description: 'HTTP测试',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-formatter',
      message: '格式化器 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-formatter', message: '✅ 格式化器 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-formatter 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-formatter', message: '⚠️ 格式化器 失败: ' + e.message, status: 'failed' })
      return { text: null, error: e.message }
    }
  }

  async _run(params) {
    const tpl = "组件 {name} 共 {count} 个"
    const filled = tpl.replace(/\{?\{\s*(\w+)\s*\}?\}/g, (_, k) => params[k] != null ? String(params[k]) : '')
    return { text: filled, text: filled }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 产物发布（Agent Builder 自动生成，请勿手改）
 * 模板: complete | 创建: 2026-09-02T16:56:35.179Z
 * 输入: (无)
 * 输出: (无)
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-pub' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-pub',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-pub',
      message: '产物发布 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-pub', message: '✅ 产物发布 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-pub 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-pub', message: '⚠️ 产物发布 失败: ' + e.message, status: 'failed' })
      return { ok: false, error: e.message }
    }
  }

  async _run(params) {
    const { outputPath, componentName, onProgress } = params
    if (!outputPath) return { finalizeResult: { ok: false, error: '缺少 outputPath' }, publishedPath: null }
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const src = path.join(outputPath, 'package')
      if (!fs.existsSync(src)) return { finalizeResult: { ok: false, error: '产物 package 目录不存在: ' + src }, publishedPath: null }
      const destRoot = params.targetWorkspace || path.join(outputPath, '..', '..', 'workspace')
      const dest = path.join(destRoot, componentName || ('comp-' + Date.now()))
      fs.cpSync(src, dest, { recursive: true })
      return { finalizeResult: { ok: true, publishedPath: dest }, publishedPath: dest }
    } catch (e) {
      return { finalizeResult: { ok: false, error: e.message }, publishedPath: null }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

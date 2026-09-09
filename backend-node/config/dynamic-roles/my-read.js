/**
 * 读组件（Agent Builder 自动生成，请勿手改）
 * 模板: file-read | 创建: 2026-09-02T16:56:35.176Z
 * 输入: sourcePath
 * 输出: content, ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-read' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-read',
      description: '读组件代码',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-read',
      message: '读组件 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-read', message: '✅ 读组件 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-read 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-read', message: '⚠️ 读组件 失败: ' + e.message, status: 'failed' })
      return { content: null, ok: null, error: e.message }
    }
  }

  async _run(params) {
    const { filePath, sourcePath } = params
    const path = filePath || sourcePath
    if (!path) return { content: null, ok: null, ok: false, error: '缺少 filePath/sourcePath' }
    if (!path.includes('/workspace/')) return { content: null, ok: null, ok: false, error: '安全限制: 仅允许读取 workspace 下的组件文件' }
    try {
      const fs = await import('node:fs')
      const stat = fs.statSync(path)
      if (stat.size > 200 * 1024) return { content: null, ok: null, ok: false, error: '文件超过 200KB，请直接指定子文件' }
      const content = fs.readFileSync(path, 'utf-8')
      const name = path.split('/').pop() || ''
      const out = { content, name, size: stat.size, ok: true }
      return { content: out["content"], ok: out["ok"] }
    } catch (e) {
      return { content: null, ok: null, ok: false, error: '读取失败: ' + e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 写文件（Agent Builder 自动生成，请勿手改）
 * 模板: text-writer | 创建: 2026-09-02T16:56:35.177Z
 * 输入: outputPath, content
 * 输出: written, path, ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-write' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-write',
      description: '生成代码落盘',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-write',
      message: '写文件 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-write', message: '✅ 写文件 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-write 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-write', message: '⚠️ 写文件 失败: ' + e.message, status: 'failed' })
      return { written: null, path: null, ok: null, error: e.message }
    }
  }

  async _run(params) {
    const { filePath, content = '', outputPath } = params
    const target = filePath || outputPath
    if (!target) return { written: null, path: null, ok: null, ok: false, error: '缺少 filePath/outputPath' }
    if (!target.includes('/workspace/')) return { written: null, path: null, ok: null, ok: false, error: '安全限制: 仅允许写入 workspace 下的文件' }
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, String(content), 'utf-8')
      const out = { written: true, size: String(content).length, path: target, ok: true }
      return { written: out["written"], path: out["path"], ok: out["ok"] }
    } catch (e) {
      return { written: null, path: null, ok: null, ok: false, error: '写入失败: ' + e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

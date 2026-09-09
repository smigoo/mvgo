/**
 * 运行时验证（Agent Builder 自动生成，请勿手改）
 * 模板: runtime-verify | 创建: 2026-09-02T16:56:35.180Z
 * 输入: outputPath
 * 输出: pass, errors
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-verify' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-verify',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-verify',
      message: '运行时验证 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-verify', message: '✅ 运行时验证 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-verify 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-verify', message: '⚠️ 运行时验证 失败: ' + e.message, status: 'failed' })
      return { pass: null, errors: null, error: e.message }
    }
  }

  async _run(params) {
    const { outputPath, files, onProgress } = params
    const errors = []
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const pkgDir = outputPath ? path.join(outputPath, 'package') : null
      if (pkgDir && !fs.existsSync(pkgDir)) errors.push('产物 package 目录不存在: ' + pkgDir)
      const checkList = Array.isArray(files) && files.length > 0 ? files : (pkgDir ? ['index.vue'] : [])
      for (const f of checkList) {
        const fp = pkgDir ? path.join(pkgDir, f) : f
        try {
          const st = fs.statSync(fp)
          if (st.size === 0) errors.push('产物为空文件: ' + f)
        } catch {
          if (pkgDir) errors.push('缺少产物文件: ' + f)
        }
      }
    } catch (e) {
      errors.push('运行时验证失败: ' + e.message)
    }
    const pass = errors.length === 0
    return { runtimeVerifyResult: { pass, errors }, pass, errors, valid: pass }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

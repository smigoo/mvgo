/**
 * Excel 解析（Agent Builder 自动生成，请勿手改）
 * 模板: excel-parse | 创建: 2026-09-02T16:56:35.174Z
 * 输入: filePath
 * 输出: rows, sheetNames, ok
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'my-excel' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'my-excel',
      description: '解析 xlsx 文件',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'my-excel',
      message: 'Excel 解析 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'my-excel', message: '✅ Excel 解析 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('my-excel 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'my-excel', message: '⚠️ Excel 解析 失败: ' + e.message, status: 'failed' })
      return { rows: null, sheetNames: null, ok: null, error: e.message }
    }
  }

  async _run(params) {
    const { filePath } = params
    if (!filePath) return { rows: null, sheetNames: null, ok: null, ok: false, error: '缺少 filePath（服务器本地文件路径）' }
    try {
      const mod = await import('xlsx')
      const XLSX = mod.default && mod.default.readFile ? mod.default : mod
      const wb = XLSX.readFile(filePath)
      const sheetNames = wb.SheetNames
      const first = sheetNames[0] || ''
      const rows = first ? XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' }) : []
      const out = { rows, sheetNames, sheetCount: sheetNames.length, ok: true }
      return { rows: out["rows"], sheetNames: out["sheetNames"], ok: out["ok"] }
    } catch (e) {
      return { rows: null, sheetNames: null, ok: null, ok: false, error: '解析失败: ' + e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

/**
 * 代码结构校验（Agent Builder 自动生成，请勿手改）
 * 模板: code-structure | 创建: 2026-09-02T16:56:35.178Z
 * 输入: code
 * 输出: pass, errors
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'

const logger = createLogger({ name: 'p2-cs' })

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'p2-cs',
      description: '',
      skipLLM: true, // 纯确定性，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: 'p2-cs',
      message: '代码结构校验 执行中...',
      status: 'running',
    })
    try {
      const result = await this._run(params)
      onProgress?.({ stage: 'p2-cs', message: '✅ 代码结构校验 完成', status: 'completed' })
      return result
    } catch (e) {
      logger.warn('p2-cs 执行失败（容错返回）: ' + e.message)
      onProgress?.({ stage: 'p2-cs', message: '⚠️ 代码结构校验 失败: ' + e.message, status: 'failed' })
      return { pass: null, errors: null, error: e.message }
    }
  }

  async _run(params) {
    const { code, classPrefix, onProgress } = params
    if (!code) return { validationResult: { pass: false, blockCount: 1, errors: [{ message: '缺少 code（组件代码）' }] }, pass: false, blockCount: 1, errors: [{ message: '缺少 code' }] }
    const errors = []
    // 规则1: <style lang="less" scoped>（主组件/有 style 块的子组件）
    if (/<style[^>]*>/i.test(code)) {
      if (!/<style[^>]*lang=["']less["'][^>]*scoped/i.test(code) && !/<style[^>]*scoped[^>]*lang=["']less["']/i.test(code)) {
        errors.push({ message: 'CODE-001: style 块必须为 <style lang="less" scoped>' })
      }
    }
    // 规则2: @import index.less
    if (/<style/i.test(code) && (!/@import/.test(code) || !/index\.less/.test(code))) {
      errors.push({ message: 'CODE-002: style 块必须 @import ...index.less' })
    }
    // 规则3: class 前缀 c-（classPrefix 参数可指定）
    const prefix = classPrefix || 'c-'
    const classes = code.match(/class=["'][^"']+["']/g) || []
    const badClasses = classes
      .map((c) => c.replace(/class=["']/, '').replace(/["']$/, '').split(/\s+/).filter(Boolean))
      .flat()
      .filter((cls) => cls.startsWith('c-') && prefix !== 'c-' ? !cls.startsWith(prefix) : false)
      .slice(0, 5)
    if (prefix !== 'c-' && badClasses.length > 0) {
      errors.push({ message: 'CODE-003: 类名必须以 ' + prefix + ' 为前缀: ' + badClasses.join(', ') })
    }
    const pass = errors.length === 0
    return { validationResult: { pass, blockCount: errors.length, errors }, pass, blockCount: errors.length, errors }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}

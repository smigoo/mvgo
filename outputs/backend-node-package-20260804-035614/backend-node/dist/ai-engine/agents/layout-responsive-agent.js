/**
 * 布局响应式生成 Agent
 * 
 * 输入：空间分析报告 + 原始布局数据
 * 输出：{ vueCode, analysisResult } — Vue 3 组件代码 + 布局策略分析
 */

import { BaseAgent } from './base-agent.js'

export class LayoutResponsiveAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'layout-responsive-agent',
      description: '分析绝对定位大屏布局，生成响应式 Vue 3 页面代码',
      model: config.model || undefined,        // 使用 BaseAgent 默认模型
      temperature: config.temperature ?? 0.15,  // 低温度提高一致性
      maxTokens: config.maxTokens || 16384,     // 需要足够大来生成完整 Vue 组件
      promptTemplate: 'prompts/layout-responsive-prompt.md',
      ...config,
    })
  }

  /**
   * 构建最终 Prompt，注入空间分析报告 + 原始布局数据
   * @param {Object} input
   * @param {Object} input.spatialReport - 规则引擎输出的空间分析报告
   * @param {Object} input.layoutData - 原始 ScreenLayout JSON
   * @param {Object} [input.context] - 附加上下文（如目标名称等）
   */
  buildPrompt(input) {
    let prompt = this.promptTemplate

    // 替换参考文件占位符
    for (const [filePath, content] of Object.entries(this.referenceFiles)) {
      const placeholder = `{{${filePath}}}`
      prompt = prompt.replace(placeholder, content)
    }

    // 注入空间分析报告
    const spatialReportStr = input.spatialReport
      ? JSON.stringify(input.spatialReport, null, 2)
      : '{}'
    prompt = prompt.replace('{{spatialReport}}', spatialReportStr)

    // 注入原始布局数据
    const layoutDataStr = input.layoutData
      ? JSON.stringify(input.layoutData, null, 2)
      : '{}'
    prompt = prompt.replace('{{layoutData}}', layoutDataStr)

    // 注入上下文
    const contextStr = input.context
      ? JSON.stringify(input.context, null, 2)
      : '{}'
    prompt = prompt.replace('{{context}}', contextStr)

    // 替换通用输入占位符（兜底）
    prompt = prompt.replace('{{input}}', JSON.stringify(input, null, 2))

    return prompt
  }

  /**
   * 解析 LLM 输出，提取分析 JSON + Vue 代码
   * @param {string} rawOutput
   * @returns {{ vueCode: string, analysisResult: Object|null }}
   */
  parseOutput(rawOutput) {
    if (typeof rawOutput !== 'string') {
      rawOutput = String(rawOutput)
    }

    const result = {
      vueCode: '',
      analysisResult: null,
      rawOutput,
    }

    // 1. 提取 JSON 分析报告
    const jsonMatch = rawOutput.match(/```json\s*\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      try {
        result.analysisResult = JSON.parse(jsonMatch[1])
      } catch (e) {
        this.logger.warn('无法解析分析报告 JSON，使用原始文本', { error: e.message })
        // 尝试从非围栏 JSON 块解析
        const altMatch = rawOutput.match(/\{[\s\S]*"layoutStrategy"[\s\S]*\}/)
        if (altMatch) {
          try {
            result.analysisResult = JSON.parse(altMatch[0])
          } catch (_) { /* 放弃 */ }
        }
      }
    }

    // 2. 提取 Vue 代码块
    const vueMatch = rawOutput.match(/```vue\s*\n([\s\S]*?)\n```/)
    if (vueMatch) {
      result.vueCode = vueMatch[1]
    } else {
      // 尝试匹配不带语言标识的代码块（以 <template> 开头）
      const genericMatch = rawOutput.match(/```\s*\n(<template>[\s\S]*?<\/style>)\s*\n```/)
      if (genericMatch) {
        result.vueCode = genericMatch[1]
      } else {
        // 最终兜底：取 <template> 到 </style> 之间的内容
        const fallbackMatch = rawOutput.match(/(<template>[\s\S]*?<\/style>)/)
        if (fallbackMatch) {
          result.vueCode = fallbackMatch[1]
        } else {
          this.logger.warn('无法从输出中提取 Vue 组件代码，返回原始输出')
          result.vueCode = rawOutput
        }
      }
    }

    return result
  }
}

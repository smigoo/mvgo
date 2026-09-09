/**
 * 配置生成 Agent
 * 基于文档分析结果生成四个配置章节
 */

import { BaseAgent } from './base-agent.js'
import { HumanMessage } from '@langchain/core/messages'
import { coerceLLMText } from '../utils/model-config.js'

export class ConfigGeneratorAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'config-generator',
      description: '基于文档分析结果生成四个配置章节（businessEvents、businessStatuses、businessConfig、cssVariableConfig）',
      model: config.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 4096,
      promptTemplate: '../../../prompts/config-generator-prompt.md',
      referenceFiles: [
        'docs/MICROCODE-CONFIG-SPEC.md',
        'docs/examples/sample-output.md'
      ],
      ...config
    })
  }

  /**
   * 统一执行入口（dynamic-workflow-graph 调度器调用）
   * 从 state 解构上游 docAnalyzer 的 docAnalysis，生成配置章节
   * @param {Object} params - { docAnalysis, originalDoc, onProgress }
   */
  async execute(params = {}) {
    const { docAnalysis, analysisResult, originalDoc = '', onProgress = null } = params
    const result = docAnalysis || analysisResult
    onProgress?.({
      stage: 'config-generator',
      message: '⚙️ 生成业务配置章节...',
      status: 'running',
    })
    const configs = await this.generate(result, originalDoc)
    return { configs }
  }

  /**
   * 生成配置
   * @param {Object} analysisResult - 文档分析结果
   * @param {string} originalDoc - 原始文档
   * @returns {Promise<Object>} 生成的配置
   */
  async generate(analysisResult, originalDoc) {
    this.logger.info('开始生成配置...')

    try {
      // 构建生成请求
      const prompt = this.buildGenerationPrompt(analysisResult, originalDoc)

      // 调用 LLM
      const response = await this.llm.invoke([
        new HumanMessage(prompt)
      ])

      // 解析响应
      const configs = this.parseConfigs(response.content)

      this.logger.info('配置生成完成')

      return configs
    } catch (error) {
      this.logger.error('配置生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 构建生成 Prompt
   */
  buildGenerationPrompt(analysisResult, originalDoc) {
    let prompt = this.promptTemplate || ''

    // 添加参考文档
    if (this.referenceFiles && Object.keys(this.referenceFiles).length > 0) {
      prompt += '\n\n## 参考文档\n\n'
      for (const [name, content] of Object.entries(this.referenceFiles)) {
        prompt += `### ${name}\n\`\`\`\n${content}\n\`\`\`\n\n`
      }
    }

    // 添加分析结果
    prompt += '\n\n## 文档分析结果\n\n```json\n'
    prompt += JSON.stringify(analysisResult, null, 2)
    prompt += '\n```\n\n'

    // 添加原始文档（用于确定标题层级）
    prompt += '\n\n## 原始文档\n\n```markdown\n'
    prompt += originalDoc
    prompt += '\n```\n\n'

    prompt += '请基于上述分析结果和原始文档，生成四个配置章节的Markdown内容。\n'
    prompt += '注意：标题层级应该比"微码组件设计"章节多一个#。\n\n'
    prompt += '请以JSON格式输出，包含以下字段：\n'
    prompt += '- businessEvents: string\n'
    prompt += '- businessStatuses: string\n'
    prompt += '- businessConfig: string\n'
    prompt += '- cssVariableConfig: string'

    return prompt
  }

  /**
   * 解析配置结果
   */
  parseConfigs(content) {
    try {
      // 规整为纯文本字符串（兼容 Anthropic 数组式 content blocks）
      content = coerceLLMText(content)

      // 尝试提取 JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0]
        return JSON.parse(jsonStr)
      }

      // 如果没有 JSON，返回原始内容
      return {
        businessEvents: content,
        businessStatuses: '',
        businessConfig: '',
        cssVariableConfig: ''
      }
    } catch (error) {
      this.logger.warn('解析配置结果失败', { error: error.message })
      return {
        businessEvents: content,
        businessStatuses: '',
        businessConfig: '',
        cssVariableConfig: ''
      }
    }
  }
}

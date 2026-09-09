/**
 * 文档分析 Agent
 * 分析微码组件需求文档，提取关键信息
 */

import { BaseAgent } from './base-agent.js'
import { HumanMessage } from '@langchain/core/messages'
import { coerceLLMText } from '../utils/model-config.js'

export class DocAnalyzerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'doc-analyzer',
      description: '分析微码组件需求文档，提取页面元素、交互设计、接口配置等信息',
      model: config.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 4096,
      promptTemplate: '../../../prompts/doc-analyzer-prompt.md',
      referenceFiles: [
        'docs/MICROCODE-CONFIG-SPEC.md',
        'docs/examples/sample-input.md',
        'docs/examples/sample-output.md'
      ],
      ...config
    })
  }

  /**
   * 统一执行入口（dynamic-workflow-graph 调度器调用）
   * 从 state 解构文档内容，调用 analyze，返回 docAnalysis
   * @param {Object} params - { document | requirementDoc | docContent, onProgress }
   */
  async execute(params = {}) {
    const { document, requirementDoc, docContent, onProgress = null } = params
    const doc = document || requirementDoc || docContent || ''
    onProgress?.({
      stage: 'doc-analyzer',
      message: '📄 分析需求文档...',
      status: 'running',
    })
    const docAnalysis = await this.analyze(doc)
    return { docAnalysis }
  }

  /**
   * 分析文档
   * @param {string} document - 原始文档内容
   * @returns {Promise<Object>} 分析结果
   */
  async analyze(document) {
    this.logger.info('开始分析文档...')

    try {
      // 构建分析请求
      const prompt = this.buildAnalysisPrompt(document)

      // 调用 LLM
      const response = await this.llm.invoke([
        new HumanMessage(prompt)
      ])

      // 解析响应
      const result = this.parseAnalysisResult(response.content)

      this.logger.info('文档分析完成', {
        pageElementsCount: result.pageElements?.length || 0,
        interactionsCount: result.interactions?.length || 0
      })

      return result
    } catch (error) {
      this.logger.error('文档分析失败', { error: error.message })
      throw error
    }
  }

  /**
   * 构建分析 Prompt
   */
  buildAnalysisPrompt(document) {
    let prompt = this.promptTemplate || ''

    // 添加参考文档
    if (this.referenceFiles && Object.keys(this.referenceFiles).length > 0) {
      prompt += '\n\n## 参考文档\n\n'
      for (const [name, content] of Object.entries(this.referenceFiles)) {
        prompt += `### ${name}\n\`\`\`\n${content}\n\`\`\`\n\n`
      }
    }

    // 添加待分析文档
    prompt += '\n\n## 待分析文档\n\n```markdown\n' + document + '\n```\n\n'
    prompt += '请分析上述文档，按照JSON格式输出分析结果。'

    return prompt
  }

  /**
   * 解析分析结果
   */
  parseAnalysisResult(content) {
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
        pageElements: [],
        interactions: [],
        interfaces: [],
        initParams: [],
        rawContent: content
      }
    } catch (error) {
      this.logger.warn('解析分析结果失败，返回原始内容', { error: error.message })
      return {
        pageElements: [],
        interactions: [],
        interfaces: [],
        initParams: [],
        rawContent: content
      }
    }
  }
}

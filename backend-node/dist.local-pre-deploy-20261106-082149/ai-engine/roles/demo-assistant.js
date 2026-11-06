import { BaseAgent } from '../agents/base-agent.js'

/**
 * Demo Assistant Agent
 * 微码组件预览助手 - 帮助用户理解和优化组件
 */
export class DemoAssistant extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'demo-assistant',
      role: 'Demo Assistant',
      description: '微码组件预览助手',
      ...config
    })
  }

  /**
   * 处理用户对话
   */
  async chat({ message, componentId, componentCode, currentConfig, history = [] }) {
    const prompt = this.buildPrompt({ message, componentId, componentCode, currentConfig, history })

    try {
      const response = await this.invoke(prompt)
      return this.parseResponse(response)
    } catch (error) {
      this.logger.error('DemoAssistant chat error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        response: error.response || 'no response'
      })
      return {
        content: '抱歉，我暂时无法回答这个问题。',
        actions: []
      }
    }
  }

  /**
   * 构建Prompt
   */
  buildPrompt({ message, componentId, componentCode, currentConfig, history = [] }) {
    // 构建历史对话部分
    let historyText = ''
    if (history.length > 0) {
      historyText = '\n**对话历史**:\n'
      // 只保留最近5轮对话，避免prompt过长
      const recentHistory = history.slice(-10)
      recentHistory.forEach(msg => {
        const role = msg.role === 'user' ? '用户' : 'AI助手'
        // 移除HTML标签，只保留文本内容
        const content = msg.content.replace(/<[^>]*>/g, '').trim()
        historyText += `${role}: ${content}\n`
      })
      historyText += '\n'
    }

    return `你是一个微码组件预览助手，帮助用户理解和优化组件。
${historyText}
**当前组件**: ${componentId || '未知'}

**当前配置**:
\`\`\`json
${JSON.stringify(currentConfig || {}, null, 2)}
\`\`\`

**用户问题**: ${message}

请根据组件信息和对话历史提供有帮助的回答。回答要简洁明了，使用中文。

如果可以提供具体的配置建议，请按以下JSON格式返回：
\`\`\`json
{
  "content": "你的回答内容（可以使用HTML格式）",
  "actions": [
    {
      "type": "apply-style",
      "label": "应用此样式",
      "data": { "themeType": "dark" }
    }
  ]
}
\`\`\`

如果不需要操作按钮，只返回文本即可。
`
  }

  /**
   * 解析AI响应
   */
  parseResponse(response) {
    // 处理response可能是对象或字符串的情况
    let responseText = ''

    if (typeof response === 'string') {
      responseText = response
    } else if (response && typeof response === 'object') {
      // 检测Extended Thinking格式（在顶层）
      if (response.type === 'thinking' || response.signature || response.thinking) {
        this.logger.warn('[parseResponse] 检测到Extended Thinking格式（顶层）')
        return {
          content: '抱歉，我现在无法正常回答。请尝试重新提问。',
          actions: []
        }
      }

      // 提取rawOutput或content字段
      responseText = response.rawOutput || response.content || JSON.stringify(response)

      // 检测Extended Thinking格式（在rawOutput里）
      if (typeof responseText === 'string' &&
          (responseText.includes('"signature"') || responseText.includes('"thinking"')) &&
          responseText.includes('"type":"thinking"')) {
        this.logger.warn('[parseResponse] 检测到Extended Thinking格式（rawOutput内）')
        return {
          content: '抱歉，AI暂时无法处理您的问题。请尝试换一种方式提问。',
          actions: []
        }
      }
    } else {
      responseText = String(response || '')
    }

    // 尝试解析JSON格式的响应
    try {
      // 提取JSON内容（如果包含在markdown代码块中）
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }

      // 尝试直接解析
      const parsed = JSON.parse(responseText)
      if (parsed.content) {
        return parsed
      }
    } catch (error) {
      // 解析失败，返回纯文本格式
    }

    // 返回纯文本格式
    return {
      content: responseText.replace(/```json[\s\S]*?```/g, '').trim(),
      actions: []
    }
  }
}

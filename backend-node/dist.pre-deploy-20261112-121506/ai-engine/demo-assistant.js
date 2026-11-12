/**
 * Demo页面AI助手
 * 用于处理组件调试页面的AI对话
 */
class DemoAssistant {
  constructor() {
    this.conversationHistory = []
  }

  /**
   * 处理用户消息
   * @param {Object} params - 参数对象
   * @param {string} params.message - 用户消息
   * @param {string} params.componentId - 组件ID
   * @param {Array} params.selectedFiles - 选中的文件列表
   * @param {Object} params.currentConfig - 当前配置
   * @returns {Object} AI响应
   */
  async chat({ message, componentId, selectedFiles = [], currentConfig }) {
    // 保存对话历史
    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    })

    // 构建上下文信息
    let context = `组件ID: ${componentId}\n\n`

    if (selectedFiles && selectedFiles.length > 0) {
      context += '已选择的文件:\n'
      selectedFiles.forEach(file => {
        context += `\n--- ${file.name} (${file.path}) ---\n`
        context += file.content
        context += '\n'
      })
    }

    // 这里应该调用真实的AI模型API（如OpenAI、Claude等）
    // 目前返回模拟响应
    const response = {
      content: this.generateResponse(message, context),
      actions: []
    }

    this.conversationHistory.push({
      role: 'assistant',
      content: response.content,
      timestamp: Date.now()
    })

    return response
  }

  /**
   * 生成响应（模拟）
   * 实际使用时应该调用真实的AI API
   */
  generateResponse(message, context) {
    const lowerMessage = message.toLowerCase()

    // 简单的关键词匹配响应
    if (lowerMessage.includes('帮助') || lowerMessage.includes('help')) {
      return '我是AI助手，可以帮助您：\n1. 分析代码问题\n2. 提供修改建议\n3. 解答技术问题\n\n请选择要分析的文件，然后告诉我您的需求。'
    }

    if (lowerMessage.includes('错误') || lowerMessage.includes('bug')) {
      return '我注意到您遇到了问题。请提供以下信息：\n1. 具体的错误信息\n2. 出错时的操作步骤\n3. 选择相关的代码文件\n\n这样我可以更好地帮助您定位问题。'
    }

    if (lowerMessage.includes('优化') || lowerMessage.includes('改进')) {
      if (context.includes('---')) {
        return '我已经查看了您选择的文件。基于代码分析，我建议：\n\n1. 代码结构看起来不错\n2. 可以考虑添加注释以提高可读性\n3. 如果有性能问题，可以针对具体场景优化\n\n请告诉我您想优化的具体方面，我会提供更详细的建议。'
      }
      return '请先选择需要优化的文件，然后我可以提供具体的优化建议。'
    }

    // 默认响应
    return `我收到了您的消息："${message}"\n\n${context.includes('---') ? '我已经查看了您选择的文件。' : '建议您选择相关文件，这样我可以提供更准确的帮助。'}\n\n请告诉我您需要什么帮助，比如：\n- 分析代码\n- 修复错误\n- 优化性能\n- 添加功能`
  }

  /**
   * 清除对话历史
   */
  clearHistory() {
    this.conversationHistory = []
  }
}

export { DemoAssistant }

/**
 * Style Agent - 样式生成智能体
 * 职责：将视觉样式描述转换为具体的CSS代码
 * 输入：colors/background/decorations/emphasis
 * 输出：结构化的CSS规则（JSON格式）
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'style-agent' })

export class StyleAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'style-agent',
      description: '视觉样式CSS生成器',
      model: config.model || '',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 4096,
      ...config
    })
  }

  /**
   * 生成CSS样式规则
   */
  async generate(input) {
    const { visualElements, componentName } = input
    logger.info('开始生成CSS样式', { componentName })

    // 如果没有样式数据，返回空结果
    const style = visualElements?.visualStyle || visualElements?.styles || visualElements
    if (!style || (!style.colors && !style.background && !style.decorations && !style.emphasis)) {
      logger.warn('没有样式数据，返回空CSS')
      return { cssRules: [] }
    }

    try {
      const result = await this.invoke(input)

      // parseOutput 无法解析时会返回 { rawOutput }，此处兜底
      if (!result || !Array.isArray(result.cssRules)) {
        logger.warn('CSS样式输出格式异常，返回空数组', { result })
        return { cssRules: [] }
      }

      logger.info('✅ CSS样式生成成功', { rulesCount: result.cssRules.length })
      return result
    } catch (error) {
      logger.error('CSS样式生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 构建prompt
   */
  buildPrompt(input) {
    const { visualElements, componentName } = input

    // 兼容三种来源：visualElements本身 / .visualStyle / .styles
    const style = visualElements?.visualStyle || visualElements?.styles || visualElements

    const colors = style.colors || {}
    const background = style.background || ''
    const decorations = style.decorations || []
    const emphasis = style.emphasis || []

    return `# 任务：生成组件CSS样式规则

你是一个CSS样式专家，负责将视觉样式描述转换为具体的CSS代码。

## 组件信息
组件名：${componentName}

## 视觉样式要求

### 主题色
\`\`\`json
${JSON.stringify(colors, null, 2)}
\`\`\`

### 背景效果
${background || '(无)'}

### 装饰元素
${Array.isArray(decorations) && decorations.length > 0 ? decorations.map(d => `- ${d}`).join('\n') : '(无)'}

### 强调手法
${Array.isArray(emphasis) && emphasis.length > 0 ? emphasis.map(e => `- ${e}`).join('\n') : '(无)'}

## 输出要求

**你只需要输出CSS规则的JSON数组，不要生成完整的Vue代码。**

### CSS规则格式：
每条规则包含：
- \`selector\`: CSS选择器（例如：".container"、".title"、".icon"）
- \`properties\`: CSS属性对象

### 转换规则：
1. **颜色**：直接使用提供的颜色值
2. **背景**：将描述转换为CSS渐变
   - "深色渐变背景" → \`linear-gradient(...)\`
   - "从X到Y" → 确定渐变方向和颜色
3. **光晕/发光效果**：使用 box-shadow、text-shadow、filter
   - "光晕效果" → \`box-shadow: 0 0 20px rgba(...), filter: drop-shadow(...)\`
4. **装饰元素**：使用伪元素
   - "装饰线条" → \`::before { content: ''; border: ...; }\`
5. **3D效果**：使用 transform、perspective

### 示例输出：
\`\`\`json
{
  "cssRules": [
    {
      "selector": ".container",
      "properties": {
        "background": "linear-gradient(to bottom, #051a1f, #0a2730)",
        "box-shadow": "0 0 30px rgba(0, 240, 255, 0.3)"
      }
    },
    {
      "selector": ".title",
      "properties": {
        "color": "#00f0ff",
        "text-shadow": "0 0 10px rgba(0, 240, 255, 0.5)"
      }
    }
  ]
}
\`\`\`

**记住：只输出JSON格式的cssRules数组，不要生成Vue代码！**
`
  }
}

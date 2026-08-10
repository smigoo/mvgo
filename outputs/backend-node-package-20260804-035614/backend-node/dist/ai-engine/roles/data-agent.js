/**
 * Data Agent - 数据结构生成智能体
 * 职责：只生成组件的数据结构和变量定义，输出JSON格式
 * 优点：任务单一、prompt简洁、AI行为稳定
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { formatResourceIndex } from '../utils/resource-mapping-formatter.js'

const logger = createLogger({ name: 'data-agent' })

export class DataAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'data-agent',
      description: '组件数据结构生成器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 4096,
      ...config
    })
  }

  /**
   * 生成组件数据结构
   * 复用 BaseAgent.invoke()：buildPrompt -> LLM -> parseOutput(提取JSON)
   */
  async generate(input) {
    const { componentName } = input
    logger.info('开始生成数据结构', { componentName })

    try {
      const result = await this.invoke(input)

      // parseOutput 无法解析时会返回 { rawOutput }，此处兜底
      if (!result || !Array.isArray(result.data)) {
        logger.warn('数据结构输出格式异常，返回空数组', { result })
        return { data: [] }
      }

      logger.info('✅ 数据结构生成成功', { count: result.data.length })
      return result
    } catch (error) {
      logger.error('数据结构生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 构建prompt
   */
  buildPrompt(input) {
    const { layoutStructure, visualElements, componentName, resourceDomMapping } = input

    return `# 任务：生成组件数据结构

你是一个数据结构专家，只负责生成Vue组件的数据部分，不生成任何代码。

## 组件信息
组件名：${componentName}

## 布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

## 视觉元素
\`\`\`json
${JSON.stringify(visualElements, null, 2)}
\`\`\`

${resourceDomMapping && resourceDomMapping.length > 0 ? `
## 可用资源索引
${formatResourceIndex(resourceDomMapping)}
` : ''}

## 输出要求

**你只需要输出数据结构的JSON，不要生成任何Vue代码。**

### 数据结构规则：
1. 根据layoutStructure和visualElements提取数据项
2. 每个数据项包含：label、value
3. 如果有图标资源，添加iconIndex字段（从1开始）
4. iconIndex对应上面"可用资源索引"中的编号
5. 不要臆造数据，严格根据输入生成

### 示例输出：
\`\`\`json
{
  "data": [
    { "label": "主线", "value": "185.6 km", "iconIndex": 1 },
    { "label": "隧道", "value": "1 条", "iconIndex": 2 }
  ]
}
\`\`\`

**记住：只输出JSON数据结构，不要生成Vue代码！**
`
  }

}

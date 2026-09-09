/**
 * 代码审查智能体
 * 对抗式检查生成的代码质量
 */

import { createLogger } from '../logger/index.js'
import { getMaxTokens, coerceLLMText } from '../utils/model-config.js'
import { TEXT_DEFAULTS } from '../utils/ai-defaults.js'
import { attachUnifiedInvoke, executeModelRequest } from '../utils/ai-request-gateway.js'
import { buildChatUrl } from '../utils/chat-url.js'
import { isOpenAICompatibleBaseURL } from '../utils/provider-utils.js'

const logger = createLogger({ name: 'code-reviewer-agent' })

/**
 * 代码审查智能体
 */
export class CodeReviewerAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY || TEXT_DEFAULTS.apiKey
    this.baseURL = options.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL || TEXT_DEFAULTS.baseURL
    this.model = options.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL || TEXT_DEFAULTS.model
  }

  /**
   * 审查 Preview 阶段代码（微码组件，向后兼容）
   * @param {string} vueCode - Vue组件代码
   * @param {object} analysis - Preview分析结果
   * @returns {Promise<{passed: boolean, issues: string[], suggestions: string[]}>}
   */
  async reviewPreviewCode(vueCode, analysis) {
    logger.info('开始审查 Preview 阶段代码（微码）')

    const prompt = this.buildMicrocodePreviewReviewPrompt(vueCode, analysis)
    const response = await this.callAI(prompt, 'code-reviewer.preview.microcode')
    const result = this.parseReviewResponse(response)

    logger.info('Preview 代码审查完成（微码）', {
      passed: result.passed,
      issuesCount: result.issues.length
    })

    return result
  }

  /**
   * 审查 Preview 阶段代码（Vue3 组件，专属逻辑）
   * @param {string} vueCode - Vue3组件代码
   * @param {object} analysis - Preview分析结果
   * @returns {Promise<{passed: boolean, issues: string[], suggestions: string[]}>}
   */
  async reviewVue3PreviewCode(vueCode, analysis) {
    logger.info('开始审查 Preview 阶段代码（Vue3）')

    const prompt = this.buildVue3PreviewReviewPrompt(vueCode, analysis)
    const response = await this.callAI(prompt, 'code-reviewer.preview.vue3')
    const result = this.parseReviewResponse(response)

    logger.info('Preview 代码审查完成（Vue3）', {
      passed: result.passed,
      issuesCount: result.issues.length
    })

    return result
  }

  /**
   * 审查 Figma 阶段代码
   * @param {string} vueCode - 精修后的Vue组件代码
   * @param {object} figmaData - Figma数据
   * @param {object} styles - 提取的样式
   * @returns {Promise<{passed: boolean, issues: string[], suggestions: string[]}>}
   */
  async reviewFigmaCode(vueCode, figmaData, styles) {
    logger.info('开始审查 Figma 阶段代码')

    const prompt = this.buildFigmaReviewPrompt(vueCode, figmaData, styles)
    const response = await this.callAI(prompt, 'code-reviewer.figma')
    const result = this.parseReviewResponse(response)

    logger.info('Figma 代码审查完成', {
      passed: result.passed,
      issuesCount: result.issues.length
    })

    return result
  }

  /**
   * 构建 Preview 审查 prompt（微码组件，专属逻辑）
   */
  buildMicrocodePreviewReviewPrompt(vueCode, analysis) {
    return `# 代码审查任务：Preview 阶段（微码组件）

你是一个严格的代码审查专家，对抗式检查生成的**微码组件**代码质量。

## 待审查的代码

\`\`\`vue
${vueCode}
\`\`\`

## 设计稿分析结果

${JSON.stringify(analysis, null, 2)}

## 审查标准

### 必须通过的检查项（Critical）

1. **微码组件规范**：
   - ✅ 使用 \`<base-panel>\` 作为根容器
   - ✅ 正确调用 \`$mcComponentBuilder()\` 并解构
   - ✅ 在 \`onMounted\` 中触发 \`onload\` 事件
   - ✅ 使用 \`<script setup>\` 语法
   - ✅ 使用 \`declare.json\` 声明组件元数据
   - ✅ 使用 \`component.js\` 注册组件

2. **代码结构完整性**：
   - ✅ template 部分有实际内容（非空占位）
   - ✅ script 部分有响应式数据定义
   - ✅ style 部分有至少30行样式代码
   - ✅ 样式使用 Less，并 \`@import\` 主题变量文件

3. **与设计稿匹配度**：
   - ✅ 实现了分析中提到的主要布局结构
   - ✅ 包含了分析中提到的视觉元素
   - ✅ 至少有3个以上的语义化div结构

### 应当关注的检查项（Warning）

1. **代码质量**：
   - 变量命名是否语义化
   - 是否有明显的逻辑错误
   - 样式是否合理组织

2. **可维护性**：
   - 组件结构是否清晰
   - 是否有适当的注释
   - 样式是否使用主题变量

## 审查结果格式

返回 JSON 格式：

\`\`\`json
{
  "passed": true/false,
  "issues": [
    "问题1描述",
    "问题2描述"
  ],
  "suggestions": [
    "改进建议1",
    "改进建议2"
  ],
  "score": {
    "规范遵守": 85,
    "结构完整性": 90,
    "设计还原度": 80,
    "代码质量": 75
  }
}
\`\`\`

**审查规则**：
- 如果有任何 Critical 级别的问题，\`passed\` 必须为 \`false\`
- 如果只有 Warning 级别的问题，\`passed\` 可以为 \`true\`，但需要在 \`suggestions\` 中给出改进建议
- \`issues\` 中只列出实际存在的问题，不要列出"无问题"

现在开始严格审查代码！
`
  }

  /**
   * 构建 Preview 审查 prompt（Vue3 组件，专属逻辑）
   */
  buildVue3PreviewReviewPrompt(vueCode, analysis) {
    return `# 代码审查任务：Preview 阶段（Vue3 标准组件）

你是一个严格的代码审查专家，对抗式检查生成的**Vue3 标准组件**代码质量。

## 待审查的代码

\`\`\`vue
${vueCode}
\`\`\`

## 设计稿分析结果

${JSON.stringify(analysis, null, 2)}

## 审查标准

### 必须通过的检查项（Critical）

1. **Vue3 SFC 规范**：
   - ✅ 使用标准 \`<template>\` + \`<script setup>\` + \`<style scoped>\` 结构
   - ✅ \`<script setup>\` 使用 JavaScript（非 TypeScript）
   - ✅ **禁止**出现微码特有内容：
     - ❌ \`<base-panel>\` 组件
     - ❌ \`$mcComponentBuilder\` / \`runtimeBuilder\` / \`$createMcDeclare\`
     - ❌ \`panelKey\` / 具名插槽 \`#title-left\` / \`#title-right\` / \`#header-right\`
     - ❌ \`declare.json\` / \`component.js\` / \`@import '../resources/styles/index.less'\`

2. **代码结构完整性**：
   - ✅ template 部分有实际内容（非空占位）
   - ✅ script 部分有响应式数据定义（ref / reactive / computed）
   - ✅ style 部分有至少30行样式代码
   - ✅ 样式全部写在 \`<style scoped>\` 内（可带 \`lang="less"\`，但不得 @import 外部 less 文件）

3. **与设计稿匹配度**：
   - ✅ 实现了分析中提到的主要布局结构
   - ✅ 包含了分析中提到的视觉元素
   - ✅ 面板头部（标题栏、副标题、时间戳、控件）真实渲染为 DOM
   - ✅ 背景图/背景色精确还原（background-size / background-position / background-repeat）

### 应当关注的检查项（Warning）

1. **代码质量**：
   - 变量命名是否语义化（kebab-case for class, camelCase for variables）
   - 是否有明显的逻辑错误
   - 样式是否合理组织（BEM 或 scoped class）

2. **可维护性**：
   - 组件结构是否清晰（必要时拆分子组件）
   - 是否有适当的注释
   - 是否使用了 Vue3 Composition API 最佳实践

3. **性能与生命周期**：
   - 图表实例是否在 \`onUnmounted\` 中 dispose
   - 事件监听是否在 \`onUnmounted\` 中移除
   - 列表渲染是否绑定稳定 key

## 审查结果格式

返回 JSON 格式：

\`\`\`json
{
  "passed": true/false,
  "issues": [
    "问题1描述",
    "问题2描述"
  ],
  "suggestions": [
    "改进建议1",
    "改进建议2"
  ],
  "score": {
    "规范遵守": 85,
    "结构完整性": 90,
    "设计还原度": 80,
    "代码质量": 75
  }
}
\`\`\`

**审查规则**：
- 如果有任何 Critical 级别的问题，\`passed\` 必须为 \`false\`
- 如果只有 Warning 级别的问题，\`passed\` 可以为 \`true\`，但需要在 \`suggestions\` 中给出改进建议
- \`issues\` 中只列出实际存在的问题，不要列出"无问题"
- **特别注意**：如果发现代码中出现了微码特有内容（如 \`<base-panel>\`、\`$mcComponentBuilder\`），必须标记为 Critical 问题

现在开始严格审查代码！
`
  }

  /**
   * 构建 Figma 审查 prompt
   */
  buildFigmaReviewPrompt(vueCode, figmaData, styles) {
    return `# 代码审查任务：Figma 精修阶段

你是一个严格的代码审查专家，对抗式检查 Figma 精修后的代码质量。

## 待审查的代码

\`\`\`vue
${vueCode}
\`\`\`

## Figma 数据

- 节点名称: ${figmaData.name}
- 节点类型: ${figmaData.type}
- 尺寸: ${styles.width} x ${styles.height}

## 提取的样式

### 填充色
${JSON.stringify(styles.fills, null, 2)}

### 描边
${JSON.stringify(styles.strokes, null, 2)}

### 文字样式
${JSON.stringify(styles.typography?.slice(0, 3) || [], null, 2)}

## 审查标准

### 必须通过的检查项（Critical）

1. **Figma 样式应用**：
   - ✅ 使用了提取的填充色作为背景色
   - ✅ 应用了提取的描边样式
   - ✅ 使用了提取的文字样式（字号、字重）

2. **样式组织**：
   - ✅ 样式文件存在且有内容
   - ✅ 使用了 CSS/Less 变量或主题变量
   - ✅ 样式代码行数 > 50行

3. **代码完整性**：
   - ✅ 没有使用占位注释（如 "TODO", "待填充"）
   - ✅ 所有样式都有具体的值
   - ✅ 没有空的 content-section

### 应当关注的检查项（Warning）

1. **样式还原度**：
   - 背景色是否与 Figma 一致
   - 圆角、边框是否还原
   - 文字样式是否匹配

2. **主题支持**：
   - 是否提供了主题变量
   - 是否支持 dark/light 主题切换

## 审查结果格式

返回 JSON 格式：

\`\`\`json
{
  "passed": true/false,
  "issues": [
    "问题1描述",
    "问题2描述"
  ],
  "suggestions": [
    "改进建议1",
    "改进建议2"
  ],
  "score": {
    "Figma样式应用": 85,
    "样式还原度": 90,
    "代码完整性": 80,
    "主题支持": 75
  }
}
\`\`\`

**审查规则**：
- 如果有任何 Critical 级别的问题，\`passed\` 必须为 \`false\`
- 如果样式文件不存在或为空，\`passed\` 必须为 \`false\`
- 如果代码中有大量占位内容，\`passed\` 必须为 \`false\`

现在开始严格审查代码！
`
  }

  /**
   * 调用 AI 进行审查
   */
  async callAI(prompt, context = 'code-reviewer-agent') {
    const isOpenAICompatible = isOpenAICompatibleBaseURL(this.baseURL)

    let responseContent

    if (isOpenAICompatible) {
      const axios = (await import('axios')).default

      try {
        const response = await executeModelRequest({
          context,
          provider: 'openai-compatible',
          model: this.model,
          operation: ({ signal }) => axios.post(
            buildChatUrl(this.baseURL),
            {
              model: this.model,
              messages: [
                {
                  role: 'system',
                  content: '你是一个严格的代码审查专家，专注于Vue组件和微码规范的审查。'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.1,
              max_tokens: getMaxTokens(this.model, 2048)
            },
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
              },
              signal,
            }
          ),
        })
        responseContent = coerceLLMText(response.data.choices[0].message.content)
      } catch (error) {
        logger.error('AI 审查调用失败', {
          error: error.message,
          status: error.response?.status
        })
        throw new Error(`AI 审查调用失败: ${error.message}`)
      }
    } else {
      // Claude API
      const { ChatAnthropic } = await import('@langchain/anthropic')
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')

      const llm = new ChatAnthropic({
        modelName: this.model,
        anthropicApiKey: this.apiKey,
        anthropicApiUrl: this.baseURL,
        temperature: 0.1,
        maxTokens: getMaxTokens(this.model, 2048),
        streaming: true,
      })
      attachUnifiedInvoke(llm, {
        context,
        provider: 'anthropic',
        model: this.model,
      })

      const response = await llm.invoke([
        new SystemMessage({ content: '你是一个严格的代码审查专家，专注于Vue组件和微码规范的审查。' }),
        new HumanMessage({ content: prompt })
      ], {
        __mvgoRequestOptions: {
          context,
        },
      })
      responseContent = coerceLLMText(response.content)
    }

    return responseContent
  }

  /**
   * 解析审查响应
   */
  parseReviewResponse(responseContent) {
    try {
      // 尝试提取 JSON
      let jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/)

      if (!jsonMatch) {
        jsonMatch = responseContent.match(/```\n([\s\S]*?)\n```/)
      }

      let parsed
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        parsed = JSON.parse(responseContent)
      }

      // 确保返回格式正确
      return {
        passed: parsed.passed || false,
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        score: parsed.score || {}
      }
    } catch (error) {
      logger.error('解析审查响应失败', {
        error: error.message,
        response: responseContent.substring(0, 500)
      })
      // 如果解析失败，默认不通过
      return {
        passed: false,
        issues: ['审查响应解析失败'],
        suggestions: ['请检查AI返回格式'],
        score: {}
      }
    }
  }
}

export default CodeReviewerAgent

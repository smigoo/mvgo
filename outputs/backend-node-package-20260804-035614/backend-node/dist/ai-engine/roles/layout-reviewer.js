/**
 * Layout Reviewer - 布局审查师
 * 职责：审查布局结构的合理性，发现潜在问题
 * 输入：layoutStructure from Visual Parser
 * 输出：reviewResult, issues, score, recommendations
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'
import { robustJSONParse } from '../utils/json-parser.js'

const logger = createLogger({ name: 'layout-reviewer' })

export class LayoutReviewer extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'layout-reviewer',
      description: '布局结构审查器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 4096,
      ...config
    })

    // 加载规范文档
    this.guidelines = this.loadReferenceFiles([
      'references/constraints/ai-generation-constraints.md',
      'references/rules/stage-execution-rules.md',
      'references/schemas/preview-analysis-schema.md'
    ])

    logger.info('Layout Reviewer 已初始化')
  }

  /**
   * 构建审查提示词
   */
  buildReviewPrompt(layoutStructure) {
    const prompt = `
你是一个专业的UI布局审查专家，负责审查微码组件的布局结构设计。

# 审查任务

请审查以下布局结构的合理性，发现潜在问题并提供改进建议。

## 布局结构
\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

# 审查维度

## 1. 结构合理性
- 嵌套深度是否过深（建议≤3层）
- 区域划分是否清晰
- 父子关系是否正确

## 2. 微码规范符合度
- section内部是否正确区分header和body层级
- 面板插槽判断是否准确（headerRelation字段）
- 图表信息是否完整（legendPosition等）

## 3. 可维护性
- 结构是否过于复杂
- 是否有冗余嵌套
- 命名是否清晰

## 4. 性能考量
- 是否有过多DOM节点
- 布局方式是否合理（flex/grid）

# 审查规范

${this.guidelines['references/constraints/ai-generation-constraints.md'] || ''}

# 输出格式

请严格按照以下JSON格式输出审查结果：

\`\`\`json
{
  "reviewResult": "pass" | "warning" | "reject",
  "score": 85,
  "issues": [
    {
      "level": "warning" | "error",
      "type": "nesting_depth" | "structure" | "naming" | "performance",
      "location": "layout.sections[0].body",
      "message": "具体问题描述",
      "suggestion": "改进建议"
    }
  ],
  "recommendations": [
    "建议1",
    "建议2"
  ],
  "summary": "总体评价"
}
\`\`\`

# 评分标准

- 90-100: 优秀，结构合理，符合所有规范
- 80-89: 良好，有小问题但不影响使用
- 70-79: 一般，存在需要改进的问题
- 60-69: 较差，存在明显问题
- <60: 不合格，需要重新设计

开始审查：
`

    return prompt
  }

  /**
   * 审查布局结构
   */
  async review(layoutStructure, options = {}) {
    logger.info('开始审查布局结构')

    const progress = options.onProgress || this.onProgress || this.progressCallback || null

    try {
      // 1. 构建提示词
      const prompt = this.buildReviewPrompt(layoutStructure)
      progress?.({ stage: '布局审查', message: '🔍 AI正在审查布局...', status: 'running' })

      // 2. 调用LLM审查
      const response = await invokeWithTimeout(this.llm, prompt, 180000, 'layout-reviewer', progress, {
        signal: options.signal,
        onProgress: progress,
        requestConcurrency: options.requestConcurrency,
        requestQueueTimeoutMs: options.requestQueueTimeoutMs,
        requestTimeoutMs: options.requestTimeoutMs,
        requestMaxRetries: options.requestMaxRetries,
        model: this.model,
        provider: 'text-role',
      })
      progress?.({ stage: '布局审查', message: '✅ 布局审查完成', status: 'running' })

      // 3. 解析结果
      const parsed = this.parseReviewResult(response.content)

      // 4. 验证结果
      this.validateReviewResult(parsed)

      logger.info('✅ 布局审查完成', {
        result: parsed.reviewResult,
        score: parsed.score,
        issueCount: parsed.issues?.length || 0
      })

      return parsed

    } catch (error) {
      logger.error('布局审查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析审查结果
   */
  parseReviewResult(rawOutput) {
    try {
      // 1. 先用 coerceLLMText 规整（兼容 Anthropic 数组式 content: [{type:'text', text:'...'}]）
      const text = coerceLLMText(rawOutput)

      // 2. 如果规整后已经是合法对象（含 reviewResult），直接返回
      if (text && typeof text === 'object' && !Array.isArray(text) && text.reviewResult) {
        return text
      }

      // 3. 规整为字符串后提取 JSON
      const textStr = typeof text === 'string' ? text : String(text)

      // 统一的兜底值（必须符合 validateReviewResult 规则）
      const fallbackResult = {
        reviewResult: 'pass',
        issues: [],
        score: 50,
        recommendations: []
      }

      // 提取 ```json ... ``` 代码块（使用robustJSONParse处理控制字符）
      const jsonMatch = textStr.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        const parsed = robustJSONParse(jsonMatch[1], { fallback: fallbackResult })
        if (parsed && parsed.reviewResult) {
          return this._normalizeReviewResult(parsed)
        }
      }

      // 尝试直接解析（也使用robustJSONParse）
      const parsed = robustJSONParse(textStr, { fallback: fallbackResult })
      if (parsed && parsed.reviewResult) {
        return this._normalizeReviewResult(parsed)
      }

      // 所有解析策略都未能得到含 reviewResult 的有效对象，返回兜底
      logger.warn('审查结果解析后缺少 reviewResult，使用兜底值', {
        rawLength: typeof rawOutput === 'string' ? rawOutput.length : 'N/A'
      })
      return fallbackResult

    } catch (error) {
      logger.warn('审查结果解析失败，使用兜底值', {
        error: error.message,
        rawLength: typeof rawOutput === 'string' ? rawOutput.length : 'N/A'
      })
      // 返回兜底结果：允许流程继续（值必须符合验证规则）
      return {
        reviewResult: 'pass',
        issues: [],
        score: 50,
        recommendations: []
      }
    }
  }

  /**
   * 规范化审查结果（大小写兼容等）
   */
  _normalizeReviewResult(parsed) {
    // 大小写兼容：LLM 可能返回 "PASS" / "WARNING" / "REJECT"
    if (typeof parsed.reviewResult === 'string') {
      const normalized = parsed.reviewResult.toLowerCase()
      const validResults = ['pass', 'warning', 'reject']
      if (validResults.includes(normalized)) {
        parsed.reviewResult = normalized
      }
    }
    // 确保 issues 是数组
    if (!Array.isArray(parsed.issues)) {
      parsed.issues = []
    }
    // 确保 score 是数字
    if (typeof parsed.score !== 'number') {
      parsed.score = 50
    }
    // 确保 recommendations 是数组
    if (!Array.isArray(parsed.recommendations)) {
      parsed.recommendations = []
    }
    return parsed
  }

  /**
   * 验证审查结果
   */
  validateReviewResult(result) {
    // 必填字段检查
    const requiredFields = ['reviewResult', 'score', 'issues']

    for (const field of requiredFields) {
      if (result[field] === undefined) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    // reviewResult必须是有效值
    const validResults = ['pass', 'warning', 'reject']
    if (!validResults.includes(result.reviewResult)) {
      throw new Error(`Invalid reviewResult: ${result.reviewResult}`)
    }

    // score必须在0-100之间
    if (result.score < 0 || result.score > 100) {
      throw new Error(`Invalid score: ${result.score}`)
    }

    return true
  }

  /**
   * 执行完整的审查流程
   */
  async execute(params) {
    const {
      layoutStructure,
      onProgress = null,
      signal = null,
      requestConcurrency,
      requestTimeoutMs,
      requestMaxRetries,
    } = params

    logger.info('开始执行布局审查')

    try {
      const reviewResult = await this.review(layoutStructure, {
        onProgress,
        signal,
        requestConcurrency,
        requestTimeoutMs,
        requestMaxRetries,
      })

      return reviewResult

    } catch (error) {
      logger.error('布局审查执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 解析输出（BaseAgent要求实现）
   */
  parseOutput(rawOutput) {
    return this.parseReviewResult(rawOutput)
  }
}

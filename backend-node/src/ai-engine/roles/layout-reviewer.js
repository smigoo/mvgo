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
      maxTokens: config.maxTokens || 8192,
      ...config
    })

    // 🛡️ 移除外部规范加载（原 4 文件 ~48KB 与布局审查任务错配，且其中 3 个从未使用）。
    // 审查标准已内嵌在 buildReviewPrompt 的「审查维度 + layoutStructure 字段速查」中，
    // 无需再注入面向代码生成阶段的 ai-generation-constraints.md。

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

# 审查规范（layoutStructure 字段语义速查）

- **section 分层**：每个 section 可含可选 header（标题/控件）与必须 body（内容区），body 内 children 承载数据卡片/图表/列表。
- **headerRelation**：标记标题与内容的位置关系（如 content-below-title），影响是否应映射为 base-panel 具名插槽。
- **slotCandidate**：面板标题栏的交互控件/附加信息应映射到插槽（title-left / title-right / header-right），无证据不得臆造插槽元素。
- **charts 完整性**：每个 chart 应含 legendPosition、坐标轴/系列结构等关键字段，缺失则提示。
- **嵌套深度**：建议 ≤3 层，过深说明结构冗余，需合并或拆分。
- **父子关系**：stat-item 的 children 结构决定 DOM 结构（如 [icon, container] → icon + text-group），不拆分 container 子元素到外层。

# 输出格式

⚠️ **格式要求**（必须严格遵守）：
1. 输出必须是**纯 JSON 对象**，不要包含 markdown 代码块标记（如 \`\`\`json ... \`\`\`）
2. 不要输出任何前言、后记或解释文字，只输出 JSON 本身
3. 所有字符串值使用双引号
4. 确保 JSON 结构完整，所有括号配对正确
5. **长度限制**：issues 最多 5 条，每条 message ≤80 字；recommendations 最多 3 条；summary ≤100 字。宁缺毋滥，只写高置信度问题

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
  "recommendations": ["建议1", "建议2"],
  "summary": "总体评价"
}
\`\`\`

再次强调：请直接输出 JSON 对象，不要包裹在代码块标记中。

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

      // 3. 解析结果（兼容 streaming 数组格式）
      let content = response?.content ?? ''
      if (Array.isArray(content)) {
        const parts = []
        for (const it of content) {
          if (it && typeof it === 'object' && 'text' in it) parts.push(it.text || '')
          else if (typeof it === 'string') parts.push(it)
        }
        content = parts.join('')
      } else if (typeof content !== 'string') {
        const { coerceLLMText } = await import('../utils/model-config.js')
        content = coerceLLMText(content)
      }
      
      // 诊断：如果 content 为空，记录 response 结构用于排查
      if (!content || content.trim().length === 0) {
        logger.warn('layout-reviewer 收到空响应内容', {
          responseType: typeof response,
          contentKeys: response ? Object.keys(response).join(',') : 'null',
          stopReason: response?.stop_reason || response?.additional_kwargs?.stop_reason,
          usage: response?.usage || response?.usage_metadata,
        })
      }
      
      const parsed = await this.parseReviewResult(content)

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
  async parseReviewResult(rawOutput) {
    try {
      // 1. 先用 coerceLLMText 规整（兼容 Anthropic 数组式 content: [{type:'text', text:'...'}]）
      const text = coerceLLMText(rawOutput)

      // 2. 如果规整后已经是合法对象（含 reviewResult），直接返回
      if (text && typeof text === 'object' && !Array.isArray(text) && text.reviewResult) {
        return text
      }

      // 3. 规整为字符串后提取 JSON
      const textStr = typeof text === 'string' ? text : String(text)

      // 🔧 降级结果（解析失败/缺 reviewResult 时返回）：不得伪装 pass。
      // reviewResult 用 'warning' + degraded:true 显式标记「结果不可信」，score=0，
      // 下游据此知道布局审查未得到有效结论，而不是被 pass/50 分骗过继续生成。
      const degradedResult = {
        reviewResult: 'warning',
        issues: [
          {
            id: 'response_parse_failed',
            type: 'response_parse_failed',
            severity: 'warning',
            message: '布局审查响应解析失败，结果不可信',
          },
        ],
        score: 0,
        recommendations: [],
        degraded: true,
      }

      // 提取 ```json ... ``` 代码块（使用robustJSONParse处理控制字符）
      // 🛡️ 指定关键字段用于部分提取（layout-reviewer 的关键字段是 reviewResult/score）
      const parseOptions = {
        fallback: degradedResult,
        criticalFields: ['reviewResult', 'score'],  // layout-reviewer 专用
        _context: 'layout-reviewer'
      }
      const jsonMatch = textStr.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        const parsed = robustJSONParse(jsonMatch[1], parseOptions)
        if (parsed && parsed.reviewResult && !parsed.degraded) {
          return this._normalizeReviewResult(parsed)
        }
      }

      // 尝试直接解析（也使用robustJSONParse）
      const parsed = robustJSONParse(textStr, parseOptions)
      if (parsed && parsed.reviewResult && !parsed.degraded) {
        return this._normalizeReviewResult(parsed)
      }

      // 所有解析策略都未能得到含 reviewResult 的有效对象，返回降级结果（不伪装 pass）
      // 🛡️ 保存原始输出到日志文件用于离线分析
      await this._saveRawOutputForAnalysis(rawOutput, 'parse_failed')

      const rawPreview = typeof rawOutput === 'string' ? rawOutput.slice(0, 200) : 'N/A'
      logger.warn('审查结果解析后缺少有效 reviewResult，降级为 degraded', {
        rawLength: typeof rawOutput === 'string' ? rawOutput.length : 'N/A',
        rawPreview,
      })
      return degradedResult

    } catch (error) {
      logger.warn('审查结果解析失败，降级为 degraded', {
        error: error.message,
        rawLength: typeof rawOutput === 'string' ? rawOutput.length : 'N/A',
      })
      // 返回降级结果：明确标记不可信，而非 pass 伪装成功
      return {
        reviewResult: 'warning',
        issues: [
          {
            id: 'response_parse_failed',
            type: 'response_parse_failed',
            severity: 'warning',
            message: `布局审查响应解析异常: ${error.message}`,
          },
        ],
        score: 0,
        recommendations: [],
        degraded: true,
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
   * 保存原始输出用于离线分析（解析失败时）
   * 保存到 outputPath/.mc-gen/layout-reviewer-raw-{timestamp}.txt
   */
  async _saveRawOutputForAnalysis(rawOutput, reason) {
    try {
      // 获取 outputPath（从 this.outputPath 或 options）
      const outputPath = this.outputPath || this.config?.outputPath
      if (!outputPath) return

      const fs = await import('fs/promises')
      const path = await import('path')
      
      const mcGenDir = path.join(outputPath, '.mc-gen')
      await fs.mkdir(mcGenDir, { recursive: true })
      
      const timestamp = Date.now()
      const filename = `layout-reviewer-raw-${timestamp}.txt`
      const filepath = path.join(mcGenDir, filename)
      
      const content = typeof rawOutput === 'string' 
        ? rawOutput 
        : JSON.stringify(rawOutput, null, 2)
      
      const header = `# Layout Reviewer 原始输出\n` +
                     `# 时间: ${new Date().toISOString()}\n` +
                     `# 原因: ${reason}\n` +
                     `# 长度: ${content.length}\n\n`
      
      await fs.writeFile(filepath, header + content, 'utf-8')
      logger.debug(`已保存原始输出用于分析: ${filepath}`)
    } catch (err) {
      // 保存失败不影响主流程
      logger.debug(`保存原始输出失败: ${err.message}`)
    }
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
  async parseOutput(rawOutput) {
    return await this.parseReviewResult(rawOutput)
  }
}

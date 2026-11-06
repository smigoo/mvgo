/**
 * Visual Comparator - 视觉比对节点
 * 职责：将 Figma 原图 + 渲染截图发给 Vision AI，输出结构化差异报告
 *
 * 输入: figmaImage (Figma 原始预览图) + renderedImage (Puppeteer 渲染截图)
 * 输出: { overallSimilarity, issues[], pass }
 *
 * 差异报告 Schema:
 * {
 *   overallSimilarity: 0-100,
 *   issues: [{
 *     severity: "high" | "medium" | "low",
 *     category: "color" | "spacing" | "layout" | "missing_element" | "extra_element" | "proportion" | "font",
 *     region: string,
 *     description: string,
 *     suggestion: string
 *   }],
 *   pass: boolean
 * }
 */

import { VisionAgent } from '../agents/vision-agent.js'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { getVisualSimilarityThreshold } from '../../config/runtime-env.js'
import { robustJSONParse } from '../utils/json-parser.js'

const logger = createLogger({ name: 'visual-comparator' })

const COMPARISON_PROMPT = `你是一个专业的 UI 视觉质检专家。请对比以下两张图片：

- **左图（图1）**：Figma 设计稿原始截图（设计目标）
- **右图（图2）**：代码渲染生成的组件截图（实际产出）

请逐维度对比并输出结构化的差异报告。

## 对比维度

1. **颜色 (color)**：文字颜色、背景色、边框色是否一致
2. **间距 (spacing)**：元素间距、内边距、外边距是否一致
3. **布局 (layout)**：元素位置、排列方向、对齐方式是否一致
4. **元素完整性 (missing_element)**：设计稿中有但渲染结果缺失的元素
5. **多余元素 (extra_element)**：渲染结果中有但设计稿中没有的元素
6. **比例 (proportion)**：元素宽高比、整体尺寸比例是否一致
7. **字体 (font)**：字号、字重、行高是否一致

## 输出格式（严格 JSON）

\`\`\`json
{
  "overallSimilarity": 85,
  "issues": [
    {
      "severity": "high",
      "category": "color",
      "region": "顶部标题区域",
      "description": "标题颜色不一致，设计稿为深灰色，渲染结果为蓝色",
      "suggestion": "将 .title 的 color 属性改为 #333333"
    },
    {
      "severity": "medium",
      "category": "spacing",
      "region": "中间卡片区域",
      "description": "卡片间距偏大，设计稿约 8px，渲染约 16px",
      "suggestion": "将 .card-container 的 gap 调整为 8px"
    }
  ],
  "pass": false
}
\`\`\`

## 评分规则

- **overallSimilarity**: 0-100 的整数，表示整体视觉相似度
- **pass**: true 当且仅当 overallSimilarity >= 85 且没有 high 级别问题
- **severity 判定**:
  - high: 明显的视觉差异，用户一眼能看出（颜色错误、元素缺失、布局错位）
  - medium: 需要仔细对比才能发现（间距偏差、字号细微差异）
  - low: 非常细微的差异（抗锯齿、亚像素级偏移）

## 注意事项

- 只报告**实际存在的差异**，不要为了凑数而编造问题
- 如果两张图几乎一致，issues 可以为空数组
- suggestion 必须包含具体的 CSS 属性和目标值
- 忽略抗锯齿、字体渲染引擎差异等不可控因素

请直接返回 JSON，不要包含额外解释。`

export class VisualComparator {
  constructor(config = {}) {
    this.visionAgent = config.visionAgent || new VisionAgent(config)
    // 阈值优先级：显式传参 > VISUAL_SIMILARITY_THRESHOLD 环境变量 > 默认 85
    // 提高阈值可让更多迭代进入 refiner 修正，追求更高保真度（配合 MAX_ITERATIONS）
    this.similarityThreshold =
      config.similarityThreshold ||
      getVisualSimilarityThreshold()

    logger.info('Visual Comparator 已初始化', { similarityThreshold: this.similarityThreshold })
  }

  /**
   * 比对两张图片
   * @param {string} figmaImagePath - Figma 原始预览图路径
   * @param {string} renderedImagePath - 渲染截图路径
   * @returns {Promise<Object>} 差异报告
   */
  async compare(figmaImagePath, renderedImagePath, options = {}) {
    logger.info('开始视觉比对', { figmaImagePath, renderedImagePath })

    try {
      // 调用 Vision AI 比对
      const rawResult = await this.visionAgent.compareImages(
        figmaImagePath,
        renderedImagePath,
        COMPARISON_PROMPT,
        options
      )

      // 归一化返回值
      let resultText = coerceLLMText(rawResult)
      if (typeof resultText !== 'string') {
        resultText = JSON.stringify(resultText)
      }

      // 解析 JSON
      const report = this._parseReport(resultText)

      // 验证并补全
      this._validateReport(report)

      logger.info('视觉比对完成', {
        similarity: report.overallSimilarity,
        issueCount: report.issues.length,
        pass: report.pass,
      })

      return report
    } catch (error) {
      logger.error('视觉比对失败', { error: error.message })

      // 降级：返回安全默认值（不阻塞主流程）
      return {
        overallSimilarity: 0,
        issues: [],
        pass: false,
        error: error.message,
        degraded: true,
      }
    }
  }

  /**
   * 解析差异报告
   */
  _parseReport(rawText) {
    // 尝试直接解析
    let parsed = robustJSONParse(rawText)
    if (parsed && typeof parsed === 'object') {
      this._guardDegradedReport(parsed, rawText)  // 截断守卫
      return parsed
    }

    // 尝试提取 JSON 代码块
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      parsed = robustJSONParse(codeBlockMatch[1])
      if (parsed) {
        this._guardDegradedReport(parsed, rawText)
        return parsed
      }
    }

    // 尝试提取第一个 { ... } 块
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = robustJSONParse(jsonMatch[0])
      if (parsed) {
        this._guardDegradedReport(parsed, rawText)
        return parsed
      }
    }

    logger.warn('无法解析视觉比对结果，返回默认值', { rawLength: rawText.length })
    return {
      overallSimilarity: 0,
      issues: [],
      pass: false,
      parseError: true,
    }
  }

  /**
   * 截断守卫：检测半截/不完整 JSON 经 robustJSONParse 部分提取后产出的伪对象。
   * 半截 JSON 可能产出"有 overallSimilarity 但缺 issues 数组"或"issues 非数组"的对象。
   * 这类结果不能给出可信的相似度分数，应抛异常让外层返回 degraded。
   * @param {Object} report - 解析后的报告
   * @param {string} rawText - 原始响应文本（用于诊断）
   * @throws {Error} 如果报告不完整
   */
  _guardDegradedReport(report, rawText) {
    if (!report || typeof report !== 'object') {
      throw new Error('报告为空或非对象')
    }

    // overallSimilarity 必须是数字（0-1 范围）
    if (typeof report.overallSimilarity !== 'number') {
      throw new Error(
        `overallSimilarity 缺失或非数字（值=${report.overallSimilarity}），疑似 JSON 截断`,
      )
    }

    // issues 必须是数组（或不存在时允许，但存在时必须为数组）
    if (report.issues !== undefined && !Array.isArray(report.issues)) {
      throw new Error(
        `issues 字段存在但非数组（类型=${typeof report.issues}），疑似 JSON 截断`,
      )
    }

    // 额外防护：如果 rawText 明显被截断（以不完整 JSON 结尾），主动拒绝
    // 例如：以 "..." 或 ", " 结尾，或缺少闭合的 } 
    const trimmed = rawText.trim()
    if (
      trimmed.length > 100 &&
      (trimmed.endsWith('...') ||
        trimmed.endsWith(', ') ||
        (trimmed.startsWith('{') && !trimmed.endsWith('}')))
    ) {
      throw new Error(
        `原始响应明显被截断（长度=${trimmed.length}，结尾="${trimmed.slice(-20)}"）`,
      )
    }
  }

  /**
   * 验证并补全报告字段
   */
  _validateReport(report) {
    if (!report) report = {}

    // 确保数值类型
    report.overallSimilarity = Math.max(0, Math.min(100, parseInt(report.overallSimilarity) || 0))

    // 确保 issues 是数组
    if (!Array.isArray(report.issues)) {
      report.issues = []
    }

    // 验证每个 issue 的字段
    const validCategories = ['color', 'spacing', 'layout', 'missing_element', 'extra_element', 'proportion', 'font']
    const validSeverities = ['high', 'medium', 'low']

    report.issues = report.issues.filter(issue => {
      if (!issue || typeof issue !== 'object') return false
      issue.category = validCategories.includes(issue.category) ? issue.category : 'layout'
      issue.severity = validSeverities.includes(issue.severity) ? issue.severity : 'medium'
      issue.region = issue.region || '未指定区域'
      issue.description = issue.description || '未提供描述'
      issue.suggestion = issue.suggestion || '无具体建议'
      return true
    })

    // 计算 pass
    const hasHighIssue = report.issues.some(i => i.severity === 'high')
    report.pass = report.overallSimilarity >= this.similarityThreshold && !hasHighIssue

    return report
  }

  /**
   * 将差异报告格式化为 refiner 可用的提示词段落
   */
  static formatForRefiner(report) {
    if (!report || !report.issues || report.issues.length === 0) {
      return null
    }

    const lines = ['## 视觉比对发现的问题\n', '以下问题已通过视觉模型确认，请优先修复：\n']

    // 按 severity 排序：high → medium → low
    const severityOrder = { high: 0, medium: 1, low: 2 }
    const sorted = [...report.issues].sort((a, b) =>
      (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3)
    )

    sorted.forEach((issue, i) => {
      const icon = issue.severity === 'high' ? '[high]' : issue.severity === 'medium' ? '[medium]' : '[low]'
      lines.push(`${i + 1}. ${icon} ${issue.category} - ${issue.region}`)
      lines.push(`   ${issue.description}`)
      if (issue.suggestion) {
        lines.push(`   修复建议: ${issue.suggestion}`)
      }
      lines.push('')
    })

    return lines.join('\n')
  }
}

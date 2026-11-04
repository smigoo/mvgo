/**
 * Figma 布局分析智能体
 * 
 * 职责：基于 Figma 节点树，通过 LLM 分析并输出结构化的布局描述。
 * 输入：优化后的 Figma 节点数据（JSON）
 * 输出：{ page, layout, assets, summary } 布局结构描述
 * 
 * 继承 BaseAgent，复用 Prompt 模板、LLM 调用、JSON 解析等能力
 */

import { BaseAgent } from './base-agent.js'
import { createLogger } from '../logger/index.js'
import {
  NODE_TYPES,
  ATTRIBUTES,
  RESPONSIVE_RULES,
  parseNodeName,
  isMergedNode,
  isBackgroundNode,
  isIconNode
} from '../config/figma-layout-config.js'

const logger = createLogger({ name: 'agent:figma-layout-analyzer' })

export class FigmaLayoutAnalyzerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'figma-layout-analyzer',
      description: '分析 Figma 节点树，提取大屏布局结构',
      model: config.model || '',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 8192,
      promptTemplate: 'src/prompts/figma-layout-system-prompt.md',
      ...config
    })

    this.logger = logger
  }

  /**
   * 构建 Prompt：将 Figma 节点树 JSON 注入到系统提示词中
   */
  buildPrompt(input) {
    const { nodeData, fileKey, nodeId } = input

    // 预处理：提取节点树摘要（减少 LLM Token 消耗）
    const summary = this.extractNodeTreeSummary(nodeData)
    const assetsPreview = this.extractAssetsPreview(nodeData)

    let prompt = this.promptTemplate

    // 注入节点树摘要
    prompt += '\n\n## 当前任务输入\n\n'
    prompt += `**Figma 文件**: ${fileKey}\n`
    prompt += `**节点 ID**: ${nodeId}\n\n`

    prompt += '### 节点树摘要（关键节点）\n\n'
    prompt += '```json\n' + JSON.stringify(summary, null, 2) + '\n```\n\n'

    prompt += '### 资源节点预览\n\n'
    prompt += '```json\n' + JSON.stringify(assetsPreview, null, 2) + '\n```\n\n'

    prompt += '请分析上述节点树，输出结构化的布局描述 JSON。'

    return prompt
  }

  /**
   * 解析 LLM 输出为布局结构
   */
  parseOutput(rawOutput) {
    // 调用基类的 JSON 解析能力
    const parsed = super.parseOutput(rawOutput)

    // 验证必需字段
    if (!parsed.page) {
      throw new Error('LLM 输出缺少 page 字段，无法解析布局结构')
    }
    if (!parsed.layout) {
      throw new Error('LLM 输出缺少 layout 字段，无法解析布局结构')
    }

    // 补充默认值
    parsed.page.responsive = parsed.page.responsive ?? false
    parsed.page.designWidth = parsed.page.designWidth || 1920
    parsed.page.designHeight = parsed.page.designHeight || 1080

    parsed.summary = parsed.summary || {}
    parsed.assets = parsed.assets || []

    return parsed
  }

  /**
   * 从原始 Figma 节点数据中提取关键节点摘要
   * 目的：减少 Token 消耗，只保留布局分析需要的信息
   */
  extractNodeTreeSummary(node, depth = 0) {
    if (!node || depth > 6) return null // 限制深度，避免无限递归

    const name = node.name || ''
    const parsed = parseNodeName(name)
    const isImportant = parsed.hasType || isMergedNode(name) || isBackgroundNode(name) || isIconNode(name)

    const summary = {
      name,
      type: node.type || 'UNKNOWN',
      nodeType: parsed.type?.type || null
    }

    // 只对重要节点保留尺寸和布局信息
    if (isImportant || depth <= 1) {
      if (node.absoluteBoundingBox) {
        summary.bbox = {
          x: Math.round(node.absoluteBoundingBox.x),
          y: Math.round(node.absoluteBoundingBox.y),
          w: Math.round(node.absoluteBoundingBox.width),
          h: Math.round(node.absoluteBoundingBox.height)
        }
      }
      if (node.layoutMode && node.layoutMode !== 'NONE') {
        summary.layoutMode = node.layoutMode
      }
      if (parsed.hasAttributes) {
        summary.attributes = parsed.attributes.map(a => a.name)
      }
      // 背景色
      if (node.backgroundColor) {
        const { r, g, b } = node.backgroundColor
        summary.bgColor = rgbToHex(r, g, b)
      } else if (node.fills && node.fills.length > 0) {
        const solidFill = node.fills.find(f => f.type === 'SOLID' && f.color)
        if (solidFill) {
          const { r, g, b } = solidFill.color
          summary.bgColor = rgbToHex(r, g, b)
        }
      }
    }

    // 处理子节点
    if (node.children && Array.isArray(node.children)) {
      // 对非重要节点，只保留有类型的子节点
      const children = node.children
        .map(child => this.extractNodeTreeSummary(child, depth + 1))
        .filter(Boolean)

      if (children.length > 0) {
        // 限制直接子节点数量，避免 prompt 过长
        summary.children = depth <= 3 ? children : children.slice(0, 30)
        if (children.length > 30 && depth > 3) {
          summary._truncated = `${children.length - 30} more children omitted`
        }
      }
    }

    // 文本内容
    if (node.characters && isImportant) {
      summary.text = node.characters.substring(0, 50)
    }

    return summary
  }

  /**
   * 提取资源节点预览（合并/背景/图标节点）
   */
  extractAssetsPreview(node, collected = []) {
    if (!node) return collected

    const name = node.name || ''
    const isAsset = isMergedNode(name) || isBackgroundNode(name) || isIconNode(name)

    // 也检查 VECTOR 类型的图标节点
    const isVectorAsset = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE'].includes(node.type)

    if ((isAsset || isVectorAsset) && node.id) {
      const parsed = parseNodeName(name)
      collected.push({
        id: node.id,
        name,
        type: isBackgroundNode(name) ? 'background'
             : isIconNode(name) ? 'icon'
             : isVectorAsset ? 'vector-icon'
             : 'merged',
        nodeType: node.type,
        bbox: node.absoluteBoundingBox ? {
          w: Math.round(node.absoluteBoundingBox.width),
          h: Math.round(node.absoluteBoundingBox.height)
        } : null
      })
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.extractAssetsPreview(child, collected)
      }
    }

    return collected
  }

  /**
   * 执行分析
   * @param {Object} input - { nodeData, fileKey, nodeId }
   * @returns {Object} 布局结构描述
   */
  async analyze(input) {
    this.logger.info('开始分析 Figma 布局结构', {
      fileKey: input.fileKey,
      nodeId: input.nodeId
    })

    const startTime = Date.now()

    try {
      const result = await this.invoke(input)

      const duration = Date.now() - startTime
      this.logger.info('布局分析完成', {
        duration: `${duration}ms`,
        containers: result.summary?.containerCount,
        components: result.summary?.componentCount,
        assets: result.assets?.length
      })

      return result

    } catch (error) {
      const duration = Date.now() - startTime
      this.logger.error('布局分析失败', {
        duration: `${duration}ms`,
        error: error.message
      })
      throw error
    }
  }
}

/**
 * RGB（0-1 范围）转 Hex
 */
function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round((c ?? 0) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return '#' + toHex(r) + toHex(g) + toHex(b)
}

export default FigmaLayoutAnalyzerAgent

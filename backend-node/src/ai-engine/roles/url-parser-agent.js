/**
 * UrlParser Agent - Figma URL 解析器（确定性智能体示例 #2）
 *
 * 输入：figmaUrl（https://www.figma.com/file/<fileKey>/...?node-id=<id>）
 * 输出：fileKey / nodeId / cleanUrl
 *
 * 真实场景：WorkflowEditor 运行对话框每次手填 fileKey/nodeId，
 * 此节点放进管线自动解析，下游 figma-connector 直接消费。
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'url-parser-agent' })

export class UrlParserAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'url-parser-agent',
      description: '解析 Figma 链接为 fileKey/nodeId，供下游 figma-connector 使用',
      model: config.model || 'gpt-4o-mini',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 1024,
      skipLLM: true, // 纯确定性：无 LLM 依赖
      ...config,
    })
    logger.info('UrlParser Agent 已初始化')
  }

  /**
   * 解析 Figma URL
   * 支持格式：
   *   https://www.figma.com/file/abc123/design-name?node-id=1%3A2
   *   https://www.figma.com/design/abc123/design-name?node-id=1:2
   * @param {string} url
   * @returns {{fileKey: string|null, nodeId: string|null, cleanUrl: string|null, ok: boolean}}
   */
  parseFigmaUrl(url = '') {
    if (!url || typeof url !== 'string') {
      return { fileKey: null, nodeId: null, cleanUrl: null, ok: false }
    }
    try {
      const u = new URL(url)
      const m = u.pathname.match(/\/(file|design)\/([^/]+)/)
      if (!m) {
        return { fileKey: null, nodeId: null, cleanUrl: url, ok: false }
      }
      const fileKey = m[2]
      const rawNodeId = u.searchParams.get('node-id') || u.searchParams.get('nodeId') || ''
      // 规范化：URL 编码的冒号 → 原始冒号（1%3A2 → 1:2）
      const nodeId = rawNodeId ? decodeURIComponent(rawNodeId) : null
      return {
        fileKey,
        nodeId,
        cleanUrl: `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(nodeId || '')}`,
        ok: !!fileKey && !!nodeId,
      }
    } catch (e) {
      logger.warn('Figma URL 解析失败', { url, error: e.message })
      return { fileKey: null, nodeId: null, cleanUrl: url, ok: false }
    }
  }

  async execute(params) {
    const { figmaUrl, onProgress = null } = params

    onProgress?.({
      stage: 'url-parser-agent',
      message: '🔗 解析 Figma 链接...',
      status: 'running',
    })

    const result = this.parseFigmaUrl(figmaUrl)
    logger.info('UrlParser 执行', { figmaUrl, ...result })

    return {
      urlParseResult: {
        ...result,
        message: result.ok
          ? `解析成功: fileKey=${result.fileKey} nodeId=${result.nodeId}`
          : '解析失败: 无法从链接中提取 fileKey/nodeId',
      },
      // 直接注入下游字段（figma-connector 消费）
      fileKey: result.fileKey,
      nodeId: result.nodeId,
    }
  }

  /** BaseAgent 要求实现 */
  parseOutput(rawOutput) {
    return rawOutput
  }
}

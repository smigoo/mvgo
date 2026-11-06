/**
 * FigmaAdapter —— Figma 来源归一
 *
 * 复用旧管线的 FigmaConnector（只读，不修改），把节点树与预览图归一成 IR。
 * FigmaConnector 惰性加载：配置解析与 dry-run 阶段无需拉起它。
 *
 * 与截图来源的唯一差异是多产出一份 figmaData（结构化节点树），
 * 它让 visual-parser 能拿到精确的层级与样式值，而不是只靠像素推断。
 */

import fs from 'fs'
import path from 'path'

/**
 * 解析 Figma URL 取 fileKey / nodeId
 *
 * 支持两种官方格式：
 *   https://www.figma.com/file/<fileKey>/<name>?node-id=1-234
 *   https://www.figma.com/design/<fileKey>/<name>?node-id=1-234
 *
 * 注意：URL 中的 node-id 用连字符（1-234），Figma API 需要冒号（1:234）。
 */
export function parseFigmaUrl(url) {
  if (typeof url !== 'string' || !url.includes('figma.com')) {
    throw new Error(`无法识别的 Figma URL：${url}`)
  }

  const keyMatch = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/.exec(url)
  if (!keyMatch) {
    throw new Error(`Figma URL 中未找到 fileKey：${url}`)
  }

  let nodeId = null
  const nodeMatch = /[?&]node-id=([^&#]+)/.exec(url)
  if (nodeMatch) {
    nodeId = decodeURIComponent(nodeMatch[1]).replace(/-/g, ':')
  }

  return { fileKey: keyMatch[1], nodeId }
}

/**
 * @param {object} input {
 *   figmaUrl?, fileKey?, nodeId?, figmaToken, componentName, workspaceDir
 * }
 * @returns {Promise<object>} IR
 */
export async function figmaAdapter(input = {}) {
  const { figmaUrl, figmaToken, componentName, workspaceDir } = input
  let { fileKey, nodeId } = input

  // URL 与 fileKey/nodeId 二选一：前端已解析时直接用，否则此处解析
  if ((!fileKey || !nodeId) && figmaUrl) {
    const parsed = parseFigmaUrl(figmaUrl)
    fileKey = fileKey || parsed.fileKey
    nodeId = nodeId || parsed.nodeId
  }

  if (!fileKey) throw new Error('Figma 来源缺少 fileKey（或可解析出 fileKey 的 figmaUrl）')
  if (!nodeId) throw new Error('Figma 来源缺少 nodeId（URL 需带 node-id 参数）')
  if (!figmaToken) throw new Error('Figma 来源缺少 figmaToken')
  if (!workspaceDir) throw new Error('缺少 workspaceDir，无法保存预览图')

  fs.mkdirSync(workspaceDir, { recursive: true })

  // 惰性加载：只在真正走 figma 链路时才拉起 connector
  const { FigmaConnector } = await import('../../../ai-engine/roles/figma-connector.js')
  const connector = new FigmaConnector({ figmaToken, accessToken: figmaToken })

  const safeNodeId = nodeId.replace(/[:]/g, '-')
  const outputPath = path.join(workspaceDir, `figma-${fileKey}-${safeNodeId}.png`)

  const result = await connector.execute({ fileKey, nodeId, outputPath })

  const imagePath = result?.imagePath || result?.previewImagePath || outputPath
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Figma 预览图下载失败，路径不存在：${imagePath}`)
  }

  const figmaData = result?.figmaData || result?.nodeData || result?.node || null
  if (!figmaData) {
    throw new Error('FigmaConnector 未返回节点树数据（figmaData）')
  }

  return {
    sourceType: 'figma',
    imagePath,
    imageBase64: null,
    figmaData,
    componentName: componentName || figmaData?.name || `figma-${safeNodeId}`,
    meta: {
      fileKey,
      nodeId,
      figmaUrl: figmaUrl || null
    }
  }
}

export default figmaAdapter

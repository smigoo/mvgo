/**
 * Figma URL 解析工具
 * 从 Figma URL 中提取 file key、node-id 等信息
 */

/**
 * 从 Figma URL 中提取信息
 * @param {string} url - Figma URL
 * @returns {Object} 包含 fileKey, nodeId, fileName, versionId 等信息
 *
 * @example
 * const info = parseFigmaUrl('https://www.figma.com/file/abc123/MyDesign?node-id=2:7952')
 * // { fileKey: 'abc123', nodeId: '2:7952', fileName: 'MyDesign' }
 */
function parseFigmaUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: URL must be a non-empty string')
  }

  try {
    const urlObj = new URL(url)

    // 检查是否是 Figma URL
    if (!urlObj.hostname.includes('figma.com')) {
      throw new Error('Invalid URL: Not a Figma URL')
    }

    const result = {
      fileKey: null,
      nodeId: null,
      fileName: null,
      versionId: null,
      originalUrl: url
    }

    // 提取 file key 和 file name
    // 路径格式: /file/{fileKey}/{fileName} 或 /design/{fileKey}/{fileName}
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)(?:\/([^/]+))?/)

    if (pathMatch) {
      result.fileKey = pathMatch[2]
      result.fileName = pathMatch[3] ? decodeURIComponent(pathMatch[3]) : null
    }

    // 提取 node-id
    const nodeIdParam = urlObj.searchParams.get('node-id')
    if (nodeIdParam) {
      // node-id 可能是 "2:7952" 或 "2-7952" 格式
      result.nodeId = nodeIdParam.replace('-', ':')
    }

    // 提取 version-id
    const versionIdParam = urlObj.searchParams.get('version-id')
    if (versionIdParam) {
      result.versionId = versionIdParam
    }

    // 验证是否成功提取 fileKey
    if (!result.fileKey) {
      throw new Error('Invalid URL: Could not extract file key')
    }

    return result
  } catch (error) {
    if (error.message.includes('Invalid URL')) {
      throw error
    }
    throw new Error(`Failed to parse Figma URL: ${error.message}`)
  }
}

/**
 * 从 Figma 分享链接中提取信息（处理短链接）
 * @param {string} url - Figma 分享链接
 * @returns {Promise<Object>} 包含 fileKey, nodeId 等信息
 *
 * @example
 * const info = await parseFigmaShareUrl('https://figma.com/proto/abc123')
 */
async function parseFigmaShareUrl(url) {
  // 如果是短链接，需要先解析重定向
  if (url.includes('figma.com/proto/') || url.includes('fig.ma/')) {
    // 这里需要实际发送请求来跟踪重定向
    // 简化处理：直接返回错误提示
    throw new Error('Share URL requires redirect resolution. Please use the full Figma URL instead.')
  }

  return parseFigmaUrl(url)
}

/**
 * 验证 Figma node-id 格式
 * @param {string} nodeId - 节点 ID
 * @returns {boolean} 是否有效
 *
 * @example
 * isValidNodeId('2:7952') // true
 * isValidNodeId('2-7952') // true
 * isValidNodeId('invalid') // false
 */
function isValidNodeId(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') {
    return false
  }

  // node-id 格式: "数字:数字" 或 "数字-数字"
  return /^\d+[:-]\d+$/.test(nodeId)
}

/**
 * 规范化 node-id 格式（统一为 ":" 分隔）
 * @param {string} nodeId - 节点 ID
 * @returns {string} 规范化后的 node-id
 *
 * @example
 * normalizeNodeId('2-7952') // '2:7952'
 * normalizeNodeId('2:7952') // '2:7952'
 * normalizeNodeId('1518-4980-1') // '1518:4980:1'
 */
function normalizeNodeId(nodeId) {
  if (!nodeId) {
    return null
  }
  // 使用全局替换，将所有连字符替换为冒号
  return nodeId.replace(/-/g, ':')
}

/**
 * 构建 Figma URL
 * @param {Object} params - 参数对象
 * @param {string} params.fileKey - 文件 key
 * @param {string} [params.fileName] - 文件名（可选）
 * @param {string} [params.nodeId] - 节点 ID（可选）
 * @param {string} [params.versionId] - 版本 ID（可选）
 * @returns {string} 完整的 Figma URL
 *
 * @example
 * buildFigmaUrl({ fileKey: 'abc123', nodeId: '2:7952' })
 * // 'https://www.figma.com/file/abc123?node-id=2:7952'
 */
function buildFigmaUrl({ fileKey, fileName, nodeId, versionId }) {
  if (!fileKey) {
    throw new Error('fileKey is required')
  }

  let url = `https://www.figma.com/file/${fileKey}`

  if (fileName) {
    url += `/${encodeURIComponent(fileName)}`
  }

  const params = new URLSearchParams()

  if (nodeId) {
    // 统一使用 "-" 分隔符（Figma URL 标准格式）
    params.append('node-id', nodeId.replace(':', '-'))
  }

  if (versionId) {
    params.append('version-id', versionId)
  }

  const queryString = params.toString()
  if (queryString) {
    url += `?${queryString}`
  }

  return url
}

/**
 * 批量解析多个 Figma URL
 * @param {string[]} urls - URL 数组
 * @returns {Object[]} 解析结果数组
 */
function parseFigmaUrls(urls) {
  if (!Array.isArray(urls)) {
    throw new Error('Input must be an array of URLs')
  }

  return urls.map((url, index) => {
    try {
      return {
        index,
        success: true,
        ...parseFigmaUrl(url)
      }
    } catch (error) {
      return {
        index,
        success: false,
        error: error.message,
        originalUrl: url
      }
    }
  })
}

export {
  parseFigmaUrl,
  parseFigmaShareUrl,
  isValidNodeId,
  normalizeNodeId,
  buildFigmaUrl,
  parseFigmaUrls
}

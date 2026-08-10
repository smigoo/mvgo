/**
 * Figma API 客户端
 * 封装 Figma REST API 调用，处理认证、错误、重试
 */

import https from 'https'

export class FigmaClient {
  constructor(config = {}) {
    this.token = config.token || process.env.FIGMA_ACCESS_TOKEN
    this.baseUrl = 'https://api.figma.com/v1'
    this.timeout = config.timeout || 30000
    this.retries = config.retries || 3
    this.retryDelay = config.retryDelay || 1000

    if (!this.token) {
      throw new Error('Figma access token is required. Set FIGMA_ACCESS_TOKEN environment variable.')
    }
  }

  /**
   * 获取 Figma 节点数据
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<Object>} 节点数据
   */
  async getNode(fileKey, nodeId) {
    const url = `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeId}`

    try {
      const response = await this.request(url)

      if (response.err) {
        throw new Error(`Figma API 错误: ${response.err}`)
      }

      const nodeData = response.nodes[nodeId]
      if (!nodeData) {
        throw new Error(`节点不存在: ${nodeId}`)
      }

      return nodeData.document
    } catch (error) {
      this.handleError(error)
    }
  }

  /**
   * 获取文件信息
   * @param {string} fileKey - Figma 文件 Key
   * @returns {Promise<Object>} 文件数据
   */
  async getFile(fileKey) {
    const url = `${this.baseUrl}/files/${fileKey}`
    return await this.request(url)
  }

  /**
   * 导出图片
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID
   * @param {Object} options - 导出选项
   * @returns {Promise<string>} 图片 URL
   */
  async exportImage(fileKey, nodeId, options = {}) {
    const format = options.format || 'png'
    const scale = options.scale || 2

    const url = `${this.baseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`

    try {
      const response = await this.request(url)

      if (response.err) {
        throw new Error(`Figma API 错误: ${response.err}`)
      }

      if (!response.images || !response.images[nodeId]) {
        throw new Error(`无法导出图片，节点 ID: ${nodeId}`)
      }

      return response.images[nodeId]
    } catch (error) {
      this.handleError(error)
    }
  }

  /**
   * 执行 HTTP 请求（带重试）
   * @private
   */
  async request(url, attempt = 1) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'X-Figma-Token': this.token },
        timeout: this.timeout
      }, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const json = JSON.parse(data)

            // 处理 HTTP 错误
            if (res.statusCode >= 400) {
              const error = new Error(json.err || `HTTP ${res.statusCode}`)
              error.statusCode = res.statusCode
              reject(error)
              return
            }

            resolve(json)
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`))
          }
        })
      })

      req.on('error', async (error) => {
        // 重试
        if (attempt < this.retries) {
          await this.sleep(this.retryDelay * attempt)
          try {
            const result = await this.request(url, attempt + 1)
            resolve(result)
          } catch (retryError) {
            reject(retryError)
          }
        } else {
          reject(error)
        }
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
    })
  }

  /**
   * 错误处理
   * @private
   */
  handleError(error) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      throw new Error('Figma Token 无效或权限不足，请检查 FIGMA_ACCESS_TOKEN')
    }
    if (error.statusCode === 404) {
      throw new Error('Figma 文件或节点不存在')
    }
    throw error
  }

  /**
   * 延迟函数
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

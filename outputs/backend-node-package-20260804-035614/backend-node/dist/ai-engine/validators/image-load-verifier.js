/**
 * 图片加载验证器
 * 确保图片真的被加载，避免 AI 幻觉
 */

import https from 'https'
import http from 'http'
import { createHash } from 'crypto'

export class ImageLoadVerifier {
  constructor() {
    this.cache = new Map() // 缓存已验证的图片
  }

  /**
   * 验证图片是否可以正常加载
   * @param {string} imageUrl - 图片 URL
   * @returns {Promise<Object>} 验证结果
   */
  async verify(imageUrl) {
    // 1. 检查缓存
    const cacheKey = this.getCacheKey(imageUrl)
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }

    try {
      // 2. 尝试加载图片
      const result = await this.loadImage(imageUrl)

      // 3. 验证图片属性
      const verification = {
        loaded: true,
        url: imageUrl,
        size: result.size,
        contentType: result.contentType,
        hash: this.calculateHash(result.data),
        valid: this.isValidImage(result),
        timestamp: new Date().toISOString()
      }

      // 4. 缓存结果
      this.cache.set(cacheKey, verification)

      return verification

    } catch (error) {
      const verification = {
        loaded: false,
        url: imageUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      }

      return verification
    }
  }

  /**
   * 加载图片数据
   */
  async loadImage(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const chunks = []

      client.get(url, (res) => {
        // 检查状态码
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        // 检查 Content-Type
        const contentType = res.headers['content-type']
        if (!contentType || !contentType.startsWith('image/')) {
          reject(new Error(`Invalid content type: ${contentType}`))
          return
        }

        res.on('data', (chunk) => chunks.push(chunk))

        res.on('end', () => {
          const data = Buffer.concat(chunks)
          resolve({
            data,
            size: data.length,
            contentType
          })
        })

      }).on('error', reject)
    })
  }

  /**
   * 验证图片是否有效
   */
  isValidImage(result) {
    // 1. 检查大小（至少 1KB，最多 50MB）
    if (result.size < 1024) {
      return { valid: false, reason: '图片太小（可能是错误页面）' }
    }
    if (result.size > 50 * 1024 * 1024) {
      return { valid: false, reason: '图片太大' }
    }

    // 2. 检查格式
    const validFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!validFormats.includes(result.contentType)) {
      return { valid: false, reason: `不支持的格式: ${result.contentType}` }
    }

    // 3. 检查魔数（PNG/JPEG 签名）
    const magicNumbers = {
      png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
      jpeg: Buffer.from([0xFF, 0xD8, 0xFF])
    }

    const isPNG = result.data.slice(0, 4).equals(magicNumbers.png)
    const isJPEG = result.data.slice(0, 3).equals(magicNumbers.jpeg)

    if (!isPNG && !isJPEG && result.contentType.includes('png')) {
      return { valid: false, reason: '声称是 PNG 但签名不匹配' }
    }
    if (!isJPEG && result.contentType.includes('jpeg')) {
      return { valid: false, reason: '声称是 JPEG 但签名不匹配' }
    }

    return { valid: true, reason: '验证通过' }
  }

  /**
   * 计算图片哈希（用于缓存和验证）
   */
  calculateHash(data) {
    return createHash('md5').update(data).digest('hex')
  }

  /**
   * 获取缓存键
   */
  getCacheKey(url) {
    return createHash('md5').update(url).digest('hex')
  }

  /**
   * 生成验证报告
   */
  generateReport(verification) {
    if (!verification.loaded) {
      return {
        canProceed: false,
        error: `图片加载失败: ${verification.error}`,
        recommendation: '请检查图片 URL 是否有效、网络是否正常、权限是否足够'
      }
    }

    if (!verification.valid.valid) {
      return {
        canProceed: false,
        error: `图片无效: ${verification.valid.reason}`,
        recommendation: '请确保提供有效的图片文件'
      }
    }

    return {
      canProceed: true,
      message: '图片验证通过',
      details: {
        size: `${(verification.size / 1024).toFixed(2)} KB`,
        type: verification.contentType,
        hash: verification.hash
      }
    }
  }
}

/**
 * 使用示例
 */
export async function verifyImageBeforeAI(imageUrl) {
  const verifier = new ImageLoadVerifier()
  const verification = await verifier.verify(imageUrl)
  const report = verifier.generateReport(verification)

  if (!report.canProceed) {
    throw new Error(`❌ 无法继续：${report.error}\n建议：${report.recommendation}`)
  }

  console.log(`✅ 图片验证通过: ${report.details.size}, ${report.details.type}`)
  return verification
}

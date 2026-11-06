/**
 * ScreenshotAdapter —— 截图来源归一
 *
 * 最简来源，几乎无转换成本：把上传的图片落到工作区，产出 IR。
 * 不做任何 spec 相关判断 —— 规范差异全部在下游节点生效。
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const SUPPORTED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 从 data URL 或裸 base64 中提取 buffer 与扩展名 */
function parseBase64Image(input) {
  const m = /^data:image\/([a-zA-Z]+);base64,(.+)$/s.exec(input)
  if (m) {
    const ext = m[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${m[1].toLowerCase()}`
    return { buffer: Buffer.from(m[2], 'base64'), ext }
  }
  return { buffer: Buffer.from(input, 'base64'), ext: '.png' }
}

/**
 * @param {object} input  { screenshot, componentName, workspaceDir }
 *        screenshot 支持：本地路径 string / Buffer / data-url / 裸 base64
 * @returns {Promise<object>} IR
 */
export async function screenshotAdapter(input = {}) {
  const { screenshot, componentName, workspaceDir } = input

  if (!screenshot) {
    throw new Error('截图来源必须提供 screenshot（路径 / Buffer / base64）')
  }
  if (!workspaceDir) {
    throw new Error('缺少 workspaceDir，无法落盘截图')
  }

  fs.mkdirSync(workspaceDir, { recursive: true })

  let buffer
  let ext = '.png'
  let originalPath = null

  if (Buffer.isBuffer(screenshot)) {
    buffer = screenshot
  } else if (typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
    ;({ buffer, ext } = parseBase64Image(screenshot))
  } else if (typeof screenshot === 'string' && fs.existsSync(screenshot)) {
    originalPath = path.resolve(screenshot)
    ext = path.extname(originalPath).toLowerCase() || '.png'
    if (!SUPPORTED_EXT.has(ext)) {
      throw new Error(`不支持的图片格式 "${ext}"，支持：${[...SUPPORTED_EXT].join(', ')}`)
    }
    buffer = fs.readFileSync(originalPath)
  } else if (typeof screenshot === 'string') {
    ;({ buffer, ext } = parseBase64Image(screenshot))
  } else {
    throw new Error('screenshot 类型无法识别，应为 路径 / Buffer / base64')
  }

  if (!buffer?.length) {
    throw new Error('截图内容为空')
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `截图体积 ${(buffer.length / 1024 / 1024).toFixed(1)}MB 超过上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`
    )
  }

  // 内容哈希命名：同一张图重复提交可命中下游缓存
  const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12)
  const imagePath = path.join(workspaceDir, `source-${hash}${ext}`)
  if (!fs.existsSync(imagePath)) {
    fs.writeFileSync(imagePath, buffer)
  }

  return {
    sourceType: 'screenshot',
    imagePath,
    imageBase64: null,
    figmaData: null,
    componentName: componentName || `component-${hash}`,
    meta: {
      hash,
      bytes: buffer.length,
      ext,
      originalPath
    }
  }
}

export default screenshotAdapter

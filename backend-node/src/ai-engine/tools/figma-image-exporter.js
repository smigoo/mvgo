/**
 * Figma 合并节点图片导出器
 *
 * 从 figma2code/figma-ops-bk/scripts/auto-export-merged-images.cjs 移植
 * 功能：
 * 1. 自动识别合并节点（-合并、背景元素-、图片-、VECTOR 图标）
 * 2. 自动调用 Figma REST API 批量导出图片
 * 3. 生成 asset-mapping.json 映射文件
 */

import axios from 'axios'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import { createLogger } from '../logger/index.js'
import {
  parseNodeName,
  isMergedNode,
  isBackgroundNode,
  isIconNode,
  isImageNode,
  classifyPublicNode,
  NODE_TYPES
} from '../config/figma-layout-config.js'

const logger = createLogger({ name: 'tool:figma-image-exporter' })

/**
 * 递归查找需要导出的节点
 * @param {Object} node - Figma 节点
 * @param {Array} collected - 收集结果
 * @returns {Array}
 */
function findExportNodes(node, collected = []) {
  if (!node) return collected

  const name = node.name || ''
  const nodeType = node.type || ''
  const parsed = parseNodeName(name)

  // 使用统一分类函数识别资源节点类型
  // 支持中文前缀（背景元素-、图片-、图标-）和英文前缀（bg-、img-、icon-）
  const classifiedType = classifyPublicNode(name)

  // 需要导出为图片的节点类型：
  // 1. 含 -合并 属性的节点
  // 2. 背景元素节点（中文/英文前缀）
  // 3. 图片节点（中文/英文前缀）
  // 4. 图标节点（中文/英文前缀）
  // 5. VECTOR/BOOLEAN 类型的图标节点
  const needsExport =
    isMergedNode(name) ||
    classifiedType !== null ||
    (['VECTOR', 'BOOLEAN_OPERATION'].includes(nodeType))

  if (needsExport && node.id) {
    // 确定输出类型和路径
    // 注意：所有资源最终都存储在 resources/images/ 目录（与 figma-connector 保持一致）
    let exportType = 'image'
    let outputDir = 'resources/images'
    let fileNamePrefix = ''

    if (classifiedType === 'background') {
      exportType = 'background'
      fileNamePrefix = 'bg-'
    } else if (classifiedType === 'icon') {
      exportType = 'icon'
      fileNamePrefix = 'icon-'
    } else if (classifiedType === 'image') {
      exportType = 'image'
      fileNamePrefix = 'img-'
    } else if (['VECTOR', 'BOOLEAN_OPERATION'].includes(nodeType)) {
      // VECTOR/BOOLEAN 类型默认作为图标处理
      exportType = 'icon'
      fileNamePrefix = 'vector-'
    }

    // 生成语义化文件名
    const cleanName = parsed.name
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
      .toLowerCase()
      .replace(/[-_]+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      || 'unnamed'

    const nodeIdSuffix = `-${node.id.replace(/:/g, '-')}`
    const fileName = fileNamePrefix + cleanName + nodeIdSuffix + '.png'

    collected.push({
      id: node.id,
      name,
      type: exportType,
      outputPath: join(outputDir, fileName),
      fileName,
      bbox: node.absoluteBoundingBox ? {
        w: node.absoluteBoundingBox.width,
        h: node.absoluteBoundingBox.height
      } : undefined
    })
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      findExportNodes(child, collected)
    }
  }

  return collected
}

/**
 * 导出合并节点图片
 * @param {Object} params
 * @param {string} params.fileKey - Figma 文件 Key
 * @param {string} params.figmaToken - Figma Token
 * @param {Object} params.nodeData - Figma 节点数据
 * @param {string} params.outputDir - 输出目录
 * @param {Object} params.progressCallback - 进度回调
 * @returns {Object} { assets, mapping, stats }
 */
export async function exportMergedImages(params) {
  const {
    fileKey,
    figmaToken,
    nodeData,
    outputDir,
    progressCallback
  } = params

  logger.info('开始导出合并节点图片', { outputDir })

  // 1. 识别需要导出的节点
  const exportNodes = findExportNodes(nodeData)
  logger.info(`识别到 ${exportNodes.length} 个需要导出的节点`)

  if (exportNodes.length === 0) {
    logger.info('无需导出图片')
    return { assets: [], mapping: {}, stats: { total: 0, success: 0, failed: 0 } }
  }

  progressCallback?.({ stage: 'export-images', message: `识别到 ${exportNodes.length} 个需要导出的节点，开始导出...` })

  // 2. 确保输出目录存在
  mkdirSync(join(outputDir, 'resources/images'), { recursive: true })

  // 3. 批量获取图片 URL（每次最多 10 个）
  const batchSize = 10
  const allImageUrls = {}
  const totalBatches = Math.ceil(exportNodes.length / batchSize)

  for (let i = 0; i < exportNodes.length; i += batchSize) {
    const batch = exportNodes.slice(i, i + batchSize)
    const nodeIds = batch.map(n => n.id).join(',')
    const batchNum = Math.floor(i / batchSize) + 1

    progressCallback?.({
      stage: 'export-images',
      message: `获取图片 URL (${batchNum}/${totalBatches})...`
    })

    try {
      const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeIds}&format=png&scale=2`
      const response = await axios.get(apiUrl, {
        headers: { 'X-Figma-Token': figmaToken }
      })

      if (response.data.images) {
        Object.assign(allImageUrls, response.data.images)
      }
    } catch (error) {
      logger.warn(`批次 ${batchNum} 获取 URL 失败`, { error: error.message })
    }
  }

  logger.info(`获取到 ${Object.keys(allImageUrls).length} 个图片 URL`)

  // 4. 下载图片
  const results = []
  let successCount = 0
  let failedCount = 0

  for (let i = 0; i < exportNodes.length; i++) {
    const node = exportNodes[i]
    const imageUrl = allImageUrls[node.id]

    if (!imageUrl) {
      logger.warn(`跳过 ${node.name}，无图片 URL`)
      results.push({ ...node, success: false, error: 'No image URL' })
      failedCount++
      continue
    }

    progressCallback?.({
      stage: 'export-images',
      message: `下载图片 (${i + 1}/${exportNodes.length}): ${node.name}`
    })

    try {
      const outputPath = join(outputDir, node.outputPath)
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 120000 //  30s → 120s
      })

      writeFileSync(outputPath, imageResponse.data)
      const size = imageResponse.data.byteLength

      logger.info(`✓ 导出成功: ${node.name} → ${basename(node.outputPath)} (${(size / 1024).toFixed(1)}KB)`)
      results.push({ ...node, success: true, size, localPath: outputPath })
      successCount++
    } catch (error) {
      logger.error(`✗ 导出失败: ${node.name}`, { error: error.message })
      results.push({ ...node, success: false, error: error.message })
      failedCount++
    }
  }

  // 5. 生成映射文件
  const mapping = {}
  for (const r of results) {
    if (r.success) {
      mapping[r.id] = basename(r.outputPath)
    }
  }

  const mappingPath = join(outputDir, 'figma-exports/asset-mapping.json')
  mkdirSync(dirname(mappingPath), { recursive: true })
  writeFileSync(mappingPath, JSON.stringify(mapping, null, 2))

  logger.info('图片导出完成', { total: exportNodes.length, success: successCount, failed: failedCount })

  return {
    assets: results,
    mapping,
    stats: {
      total: exportNodes.length,
      success: successCount,
      failed: failedCount
    }
  }
}

export default exportMergedImages

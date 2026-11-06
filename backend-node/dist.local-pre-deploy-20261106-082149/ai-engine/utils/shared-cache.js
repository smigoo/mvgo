/**
 * 全局共享缓存（S3）——按 fileKey+nodeId 跨任务复用 Figma 数据 / 视觉分析 / 资源映射。
 *
 * 背景：checkpoint（.checkpoint/）按 outputPath（含 sessionId）定位，任务重试/重新提交会换
 * outputPath，导致旧缓存不可见、全部重来。本模块按「同源标识（fileKey+nodeId）」建立全局索引，
 * 任何同源任务（重新提交 Figma URL、换模型、换 sessionId）都能命中复用，跳过最贵的 Figma API
 * 拉取 + Vision AI 调用。
 *
 * 缓存目录：{tempComponentsRoot}/_shared-cache/{fileKey}/{nodeId}/
 *   - meta.json   缓存元信息（fileKey/nodeId/cachedAt，TTL 24h）
 *   - figma.json  Figma 节点数据（optimizedFigmaData）
 *   - visual.json 视觉分析产物（previewAnalysis）
 *   - mapping.json 资源映射（resourceDomMapping）
 *
 * 本文件是纯 ESM，由 graph（.js）动态 import；不依赖 TS 编译产物（backend-root 等），
 * 通过 outputPath 反推 temp 根目录（outputPath 形如 temp-components/{groupId}/{sessionId}-{name}）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h（与 UiCacheService 一致，Figma 可能变更）

function getSharedDir(outputPath, fileKey, nodeId) {
  // outputPath = temp-components/{groupId}/{sessionId}-{name}
  // 祖父目录 = temp-components；共享缓存挂在其下的 _shared-cache/
  return join(dirname(dirname(outputPath)), '_shared-cache', String(fileKey), String(nodeId))
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 保存共享缓存（增量：只覆盖提供的字段，已有字段保留）。
 * @param {string} outputPath 当前任务输出目录（用于反推 temp 根）
 * @param {string} fileKey
 * @param {string} nodeId
 * @param {{figmaNodeData?:any, previewAnalysis?:any, resourceDomMapping?:any}} data
 */
export function saveSharedCache(outputPath, fileKey, nodeId, data = {}) {
  if (!outputPath || !fileKey || !nodeId) return
  try {
    const dir = getSharedDir(outputPath, fileKey, nodeId)
    // meta 每次都更新 cachedAt（任一字段写入都刷新新鲜度）
    writeJson(join(dir, 'meta.json'), { fileKey, nodeId, cachedAt: new Date().toISOString() })
    if (data.figmaNodeData) writeJson(join(dir, 'figma.json'), data.figmaNodeData)
    if (data.previewAnalysis) writeJson(join(dir, 'visual.json'), data.previewAnalysis)
    if (data.resourceDomMapping) writeJson(join(dir, 'mapping.json'), data.resourceDomMapping)
  } catch {
    // 共享缓存写失败不阻断生成
  }
}

/**
 * 加载共享缓存（命中且未过期返回数据，否则 null）。
 * @param {string} outputPath 当前任务输出目录（用于反推 temp 根）
 * @param {string} fileKey
 * @param {string} nodeId
 * @returns {{figmaNodeData:any, previewAnalysis:any, resourceDomMapping:any, cachedAt:string}|null}
 */
export function loadSharedCache(outputPath, fileKey, nodeId) {
  if (!outputPath || !fileKey || !nodeId) return null
  try {
    const dir = getSharedDir(outputPath, fileKey, nodeId)
    const meta = readJson(join(dir, 'meta.json'))
    if (!meta) return null

    // TTL 校验：过期视为 miss（设计稿可能已变更）
    if (meta.cachedAt) {
      const age = Date.now() - new Date(meta.cachedAt).getTime()
      if (!Number.isNaN(age) && age > MAX_AGE_MS) return null
    }

    const figmaNodeData = readJson(join(dir, 'figma.json'))
    const previewAnalysis = readJson(join(dir, 'visual.json'))
    const resourceDomMapping = readJson(join(dir, 'mapping.json'))
    if (!figmaNodeData && !previewAnalysis) return null

    return { figmaNodeData, previewAnalysis, resourceDomMapping, cachedAt: meta.cachedAt }
  } catch {
    return null
  }
}

export default { saveSharedCache, loadSharedCache }

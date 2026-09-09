/**
 * Figma 源信息组件级缓存
 *
 * fileKey 和 nodeId 永远从 URL 获取，走 API 请求传入。
 * 成功后写入组件目录的 .figma-meta.json，供后续查询和审计使用。
 *
 * 缓存文件位置: {MC_COMPONENTS_ROOT}/{componentName}/.figma-meta.json
 */

import fs from 'fs'
import path from 'path'

const META_FILENAME = '.figma-meta.json'

/**
 * 获取组件的 Figma 元数据缓存文件路径
 * @param {string} componentName
 * @param {string} mcRoot - MC_COMPONENTS_ROOT（组件根目录）
 * @returns {string|null}
 */
export function getMetaPath(componentName, mcRoot) {
  if (!mcRoot) return null
  return path.join(mcRoot, componentName, META_FILENAME)
}

/**
 * 读取组件的 Figma 元数据缓存
 * @param {string} componentName
 * @param {string} mcRoot - MC_COMPONENTS_ROOT
 * @returns {{ fileKey: string, nodeId: string, lastUpdated: string }|null}
 */
export function loadFigmaMeta(componentName, mcRoot) {
  const metaPath = getMetaPath(componentName, mcRoot)
  if (!metaPath) return null
  try {
    if (!fs.existsSync(metaPath)) return null
    const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    if (!data.fileKey || !data.nodeId) return null
    return data
  } catch {
    return null
  }
}

/**
 * 保存组件的 Figma 元数据到缓存文件
 * @param {string} componentName
 * @param {string} mcRoot - MC_COMPONENTS_ROOT
 * @param {string} fileKey
 * @param {string} nodeId
 */
export function saveFigmaMeta(componentName, mcRoot, fileKey, nodeId) {
  const metaPath = getMetaPath(componentName, mcRoot)
  if (!metaPath) return false
  try {
    const dir = path.dirname(metaPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const meta = {
      fileKey,
      nodeId,
      lastUpdated: new Date().toISOString()
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

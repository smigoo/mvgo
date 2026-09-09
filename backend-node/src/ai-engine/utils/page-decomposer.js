/**
 * Page Decomposer — 页面级组件拆解器
 * 从 Figma 页面节点树中递归识别 cp-xxx 组件
 *
 * 核心规则：
 * - 递归遍历节点树，匹配 name.startsWith('cp-')
 * - 找到 cp-xxx 即停止递归（cp-xxx 是最小单位）
 * - 输出组件列表供 BatchOrchestrator 逐个生成
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'page-decomposer' })

/**
 * 从 Figma 节点树中识别所有 cp-xxx 组件
 * @param {Object} nodeTree - Figma API 返回的节点树（document 结构）
 * @returns {Array<{figmaNodeId: string, componentName: string, componentType: string, folderName: string}>}
 */
export function findCpComponents(nodeTree) {
  if (!nodeTree) {
    logger.warn('⚠️ 节点树为空，无法拆解')
    return []
  }

  const components = []

  function traverse(node) {
    if (!node || !node.name) return

    // 匹配 cp-xxx 前缀 → 这是一个组件，停止递归
    if (node.name.startsWith('cp-')) {
      const parsed = parseCpName(node.name)

      // 🔥 从子节点中提取 panel-header 的中文标题（优先级最高）
      const headerTitle = extractHeaderTitle(node)

      // 🔥 提取 Figma 原始尺寸（供预览按实际宽高渲染）
      const bbox = node.absoluteBoundingBox
      const figmaWidth = bbox ? Math.round(bbox.width) : null
      const figmaHeight = bbox ? Math.round(bbox.height) : null

      components.push({
        figmaNodeId: node.id,
        componentName: headerTitle || parsed.name,
        componentType: parsed.type,
        folderName: parsed.folderName,
        figmaNodeName: node.name,
        panelKey: parsed.panelKey,
        // 附带尺寸信息
        ...(figmaWidth ? { figmaWidth } : {}),
        ...(figmaHeight ? { figmaHeight } : {}),
      })
      logger.info(`📋 发现组件: ${node.name} → ${parsed.folderName}` +
        ` (nodeId: ${node.id})` +
        `${headerTitle ? ` [标题: ${headerTitle}]` : ''}` +
        `${figmaWidth ? ` [尺寸: ${figmaWidth}×${figmaHeight}]` : ''}`)
      return  // 不再递归内部
    }

    // 否则继续往下找
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  traverse(nodeTree)

  logger.info(`📊 页面拆解完成: 共发现 ${components.length} 个 cp-xxx 组件`)
  return components
}

/**
 * 🔥 从 cp-xxx 节点的子节点中提取 panel-header 标题文字
 *
 * 查找规则：
 * 1. 递归查找名为 "panel-header" 或含 "header" 的子节点（不区分大小写）
 * 2. 在 header 节点内查找 TEXT 类型的子节点
 * 3. 提取 `characters` 属性作为标题
 * 4. 若无 panel-header，则查找任何可见的 TEXT 节点提取中文
 *
 * @param {Object} cpNode - cp-xxx 的 Figma 节点
 * @returns {string|null} 提取到的中文标题，或 null
 */
function extractHeaderTitle(cpNode) {
  if (!cpNode || !cpNode.children) return null

  /**
   * 深度优先搜索，找到第一个匹配名称的节点
   */
  function findNodeByName(node, pattern) {
    if (!node) return null
    if (node.name && pattern.test(node.name)) return node
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findNodeByName(child, pattern)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 在节点的直接子节点中查找 TEXT 类型节点
   */
  function findFirstTextChild(node) {
    if (!node || !node.children) return null
    for (const child of node.children) {
      if (child.type === 'TEXT' && child.characters && child.characters.trim()) {
        return child
      }
      // 递归查找
      const sub = findFirstTextChild(child)
      if (sub) return sub
    }
    return null
  }

  // 策略1：查找 "panel-header" 节点 → 提取其中文标题
  const headerNode = findNodeByName(cpNode, /^panel[-_]?header$/i)
  if (headerNode) {
    const textNode = findFirstTextChild(headerNode)
    if (textNode && textNode.characters) {
      const title = extractChineseTitle(textNode.characters)
      if (title) return title
    }
  }

  // 策略2：兜底 — 在整个 cp-xxx 中查找第一个中文 TEXT 节点
  const anyTextNode = findFirstTextChild(cpNode)
  if (anyTextNode && anyTextNode.characters) {
    const title = extractChineseTitle(anyTextNode.characters)
    if (title) return title
  }

  return null
}

/**
 * 🔥 从文本中提取有意义的中文标题
 * 去除纯数字、纯英文、Frame 前缀、空白符
 *
 * @param {string} text - 原始文本
 * @returns {string|null} 提取的中文标题
 */
function extractChineseTitle(text) {
  if (!text || typeof text !== 'string') return null

  // 去掉首尾空白
  const trimmed = text.trim()
  if (!trimmed) return null

  // 跳过纯"Frame xxx" 格式（Figma 默认节点名）
  if (/^Frame\s*\d+$/i.test(trimmed)) return null

  // 提取中文部分（去掉英文、数字、标点前缀）
  const chineseMatch = trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf][\u4e00-\u9fff\u3400-\u4dbf\s\d]*/)
  if (chineseMatch) {
    return chineseMatch[0].trim()
  }

  // 若无中文但有英文且有意义（不是纯哈希/数字），使用原文
  if (/[a-zA-Z]{3,}/.test(trimmed) && !/^[a-f0-9]{6,}$/i.test(trimmed)) {
    return trimmed
  }

  return null
}

/**
 * 解析 cp-xxx 命名，提取组件信息
 *
 * 支持两种命名格式：
 * - cp-panel-guanxia → type=panel, name=guanxia, folderName=c-guanxia
 * - cp-guanxia       → type=unknown, name=guanxia, folderName=c-guanxia
 *
 * @param {string} cpName - Figma 节点名，如 "cp-panel-guanxia"
 * @returns {{type: string, name: string, folderName: string, panelKey: string|null}}
 */
export function parseCpName(cpName) {
  // 去掉 'cp-' 前缀
  const rest = cpName.slice(3)
  const parts = rest.split('-')

  // 已知的组件类型 → panelKey 映射
  const typeMap = {
    'panel': 'aio-panel',
    'aio': 'aio-panel',
    'table': null,
    'sidebar': null,
    'nav': null,
    'modal': 'model-panels',
    'dialog': 'model-panels',
  }

  // 判断第一个 part 是否是已知类型
  const firstPart = parts[0].toLowerCase()
  const isKnownType = typeMap.hasOwnProperty(firstPart)

  if (isKnownType && parts.length > 1) {
    // cp-panel-guanxia → type=panel, name=guanxia
    const type = firstPart
    const name = parts.slice(1).join('-')
    return {
      type,
      name,
      folderName: `c-${name}`,
      panelKey: typeMap[type] || null,
    }
  }

  // cp-guanxia → type=unknown, name=guanxia
  return {
    type: 'unknown',
    name: rest,
    folderName: `c-${rest}`,
    panelKey: null,
  }
}

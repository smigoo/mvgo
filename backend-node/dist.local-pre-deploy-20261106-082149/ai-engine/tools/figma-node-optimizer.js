/**
 * Figma 节点数据优化器
 *
 * 从 figma2code/figma-ops-bk/scripts/optimize-figma-data.cjs 移植
 * 功能：优化 Figma 节点数据，减少 95% 文件大小，只保留代码生成必需的属性
 *
 * 优化内容：
 * - 删除所有空数组 []
 * - 删除背景节点的所有子元素（背景导出为图片）
 * - 只保留代码生成必需的属性
 * - 简化数字精度（保留 2 位小数）
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'tool:figma-node-optimizer' })

// 需要保留的关键属性
const ESSENTIAL_FIELDS = [
  'id', 'name', 'type',
  'absoluteBoundingBox',   // 位置和尺寸
  'layoutMode',             // Auto Layout 方向
  'layoutGrow',             // 自适应增长
  'layoutAlign',            // 对齐方式
  'constraints',            // 约束
  'itemSpacing',            // 间距
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', // 内边距
  'primaryAxisAlignItems',  // 主轴对齐
  'counterAxisAlignItems',  // 交叉轴对齐
  'backgroundColor',        // 背景色
  'fills',                  // 填充
  'strokes',                // 边框
  'strokeWeight',           // 边框宽度
  'cornerRadius',           // 圆角
  'effects',                // 阴影/模糊
  'characters',             // 文本内容
  'style',                  // 文本样式
  'fontSize', 'fontName', 'fontWeight', 'textAlignHorizontal', 'lineHeight', // 字体
  'opacity',                // 透明度
  'clipsContent',           // 裁剪
  'children',               // 子节点
  'exportSettings'          // 导出设置
]

/**
 * 优化节点数据（激进模式）
 * @param {Object} nodeData - 原始 Figma 节点数据
 * @param {Object} options - 配置项 { mode: 'aggressive' | 'normal' }
 * @returns {Object} 优化后的节点数据
 */
export function optimizeFigmaData(nodeData, options = {}) {
  const { mode = 'aggressive' } = options

  logger.info('开始优化 Figma 节点数据', { mode })

  const startTime = Date.now()
  const originalSize = JSON.stringify(nodeData).length

  const optimized = pruneNode(nodeData, 0, mode)

  const optimizedSize = JSON.stringify(optimized).length
  const reductionPercent = ((1 - optimizedSize / originalSize) * 100).toFixed(1)

  logger.info('节点数据优化完成', {
    originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
    optimizedSize: `${(optimizedSize / 1024).toFixed(1)}KB`,
    reduction: `${reductionPercent}%`
  })

  return {
    data: optimized,
    stats: {
      originalSize,
      optimizedSize,
      reductionPercent: parseFloat(reductionPercent)
    }
  }
}

/**
 * 递归剪枝节点
 */
function pruneNode(node, depth, mode) {
  if (!node || typeof node !== 'object') return node

  // 数组类型：过滤空数组
  if (Array.isArray(node)) {
    return node
  }

  const pruned = {}

  for (const [key, value] of Object.entries(node)) {
    // 跳过空数组（激进模式）
    if (mode === 'aggressive' && Array.isArray(value) && value.length === 0) {
      continue
    }

    // 只保留关键字段
    if (!ESSENTIAL_FIELDS.includes(key)) {
      continue
    }

    // 简化数字精度
    if (typeof value === 'number') {
      pruned[key] = Math.round(value * 100) / 100
      continue
    }

    // 递归处理对象和数组
    if (typeof value === 'object' && value !== null) {
      if (mode === 'aggressive' && key === 'children') {
        // 激进模式：过滤背景节点的子元素
        pruned[key] = pruneChildren(value, depth + 1, mode)
      } else {
        pruned[key] = pruneNode(value, depth + 1, mode)
      }
      continue
    }

    // 其他值直接保留
    pruned[key] = value
  }

  return pruned
}

/**
 * 递归剪枝子节点（激进模式过滤背景元素子节点）
 */
function pruneChildren(children, depth, mode) {
  if (!Array.isArray(children)) return children

  return children
    .filter(child => {
      const name = (child.name || '').toLowerCase()
      // 不跳过含关键信息的子节点
      return true
    })
    .map(child => {
      const name = (child.name || '')
      const isBackground = /背景元素|背景样式|background/i.test(name)

      // 激进模式：背景节点的子元素全部删除（背景会导出为图片）
      if (mode === 'aggressive' && isBackground && child.children && child.children.length > 0) {
        const filtered = {
          ...pruneNode(child, depth + 1, mode),
          children: [] // 清空背景节点的子元素
        }
        return filtered
      }

      return pruneNode(child, depth + 1, mode)
    })
}

/**
 * 统计优化前后节点数量
 */
export function countNodes(node) {
  if (!node) return 0
  let count = 1
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

export default optimizeFigmaData

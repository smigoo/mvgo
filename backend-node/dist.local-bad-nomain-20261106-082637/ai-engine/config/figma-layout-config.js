/**
 * Figma 大屏布局生成配置
 * 
 * 从 figma2code 项目移植的命名规范与代码生成规则，
 * 用于 LLM Agent 分析 Figma 节点结构并生成 Vue 3 布局代码。
 * 
 * 配置来源：figma-ops-bk/config/naming-rules.yaml + code-generation.yaml
 */

// ==================== 节点类型定义 ====================
export const RESOURCE_NODE_TYPES = {
  background: {
    aliases: ['bg', 'background', '背景元素', '背景样式'],
    description: '容器背景、背景装饰或可用 CSS 复现的背景样式'
  },
  icon: {
    aliases: ['icon', '图标'],
    description: '功能图标、状态图标或小型装饰图标'
  },
  image: {
    aliases: ['img', 'image', '图片'],
    description: '内容图片、照片或独立展示的位图资源'
  }
}

export const NODE_TYPES = {
  '页面': {
    prefix: '页面-',
    cssClass: 'page',
    level: 1,
    description: '页面根节点，表示整个大屏的顶层容器',
    allowChildren: ['容器', '组件']
  },
  '容器': {
    prefix: '容器-',
    cssClass: 'container',
    level: 2,
    description: '区域容器，负责布局和组织（如 header、main、sidebar 等）',
    allowChildren: ['组件', '模块', '元素', '数据', '交互控件']
  },
  '组件': {
    prefix: '组件-',
    cssClass: 'component',
    level: 3,
    description: '独立业务组件（如天气预报、交通监控等）',
    allowChildren: ['数据', '交互控件', '元素', '背景元素', '背景样式']
  },
  '模块': {
    prefix: '模块-',
    cssClass: 'module',
    level: 3,
    description: '功能模块分组，具有独立业务功能'
  },
  '元素': {
    prefix: '元素-',
    cssClass: 'element',
    level: 4,
    description: '基础 UI 元素（文本、标题等）'
  },
  '数据': {
    prefix: '数据-',
    cssClass: 'data',
    level: 4,
    description: '数据展示内容（数值、时间等）'
  },
  '交互控件': {
    prefix: '交互控件-',
    cssClass: 'control',
    level: 4,
    description: '交互控件（按钮、链接等）'
  },
  '图片': {
    prefix: '图片-',
    cssClass: 'image',
    level: 4,
    description: '图片资源（包含 Image 和 Icon）'
  },
  '背景元素': {
    prefix: '背景元素-',
    cssClass: 'background-element',
    level: 4,
    description: '复杂背景（需导出为图片）'
  },
  '背景样式': {
    prefix: '背景样式-',
    cssClass: 'background-style',
    level: 4,
    description: '直接 CSS 背景（颜色/渐变）'
  }
}

// ==================== 属性定义 ====================
export const ATTRIBUTES = {
  layout: {
    自适应: { name: '自适应', description: '响应式布局', cssModifier: 'responsive' },
    合并: { name: '合并', description: '合并导出为图片', cssModifier: 'merged' }
  },
  interaction: {
    点击: { name: '点击', description: '点击交互', cssModifier: 'clickable' },
    悬停: { name: '悬停', description: '悬停交互', cssModifier: 'hoverable' }
  },
  state: {
    默认: { name: '默认', cssModifier: 'default' },
    选中: { name: '选中', cssModifier: 'selected' },
    禁用: { name: '禁用', cssModifier: 'disabled' },
    加载: { name: '加载', cssModifier: 'loading' }
  },
  background: {
    合并: { name: '合并', description: '多元素合并导出为图片', cssModifier: 'merged' },
    直接: { name: '直接', description: '直接 CSS 背景', cssModifier: 'direct' },
    独立: { name: '独立', description: '作为独立元素', cssModifier: 'independent' }
  }
}

// ==================== 响应式布局规则 ====================
export const RESPONSIVE_RULES = {
  designSize: { width: 1920, height: 1080 },
  // 宽度转换
  width: {
    responsive: 'vw',
    fixed: 'px',
    // px ÷ 1920 × 100 = vw
    toVw: (px) => ((px / 1920) * 100).toFixed(2) + 'vw',
    // px ÷ 1920 × 100 = %（用于 flex 子元素）
    toPercent: (px) => ((px / 1920) * 100).toFixed(1) + '%'
  },
  // 高度转换
  height: {
    responsive: 'vh',
    fixed: 'px',
    // px ÷ 1080 × 100 = vh
    toVh: (px) => ((px / 1080) * 100).toFixed(2) + 'vh'
  },
  // 字体固定使用 px
  fontSize: { unit: 'px' }
}

// ==================== 合并节点处理规则 ====================
export const MERGED_NODE_RULES = {
  // 背景合并 → CSS background-image
  background: {
    pattern: /背景/,
    generateHtml: false,
    applyTo: 'parentAsBackgroundImage'
  },
  // 图标/图片合并 → 独立 img 元素
  icon: {
    pattern: /图标|icon|图片|image/i,
    generateHtml: true,
    htmlTag: 'img',
    applyTo: 'selfAsImage'
  },
  // 其他合并 → CSS background-image
  other: {
    generateHtml: false,
    applyTo: 'parentAsBackgroundImage'
  }
}

// ==================== 命名解析工具函数 ====================

/**
 * 根据前缀识别节点类型
 */
export function identifyNodeType(nodeName) {
  if (!nodeName) return null
  for (const [typeName, config] of Object.entries(NODE_TYPES)) {
    // 支持 - 和 _ 两种分隔符
    const pattern = new RegExp(`^${config.prefix.replace('-', '[-_]')}`, 'i')
    if (pattern.test(nodeName)) {
      return { type: typeName, ...config }
    }
  }
  return null
}

/**
 * 提取节点属性
 */
export function extractAttributes(nodeName) {
  if (!nodeName) return []
  const found = []
  for (const [category, items] of Object.entries(ATTRIBUTES)) {
    for (const [key, attr] of Object.entries(items)) {
      const pattern = new RegExp(`[-_]${attr.name}$`, 'i')
      if (pattern.test(nodeName)) {
        found.push({ category, key, ...attr })
      }
    }
  }
  return found
}

/**
 * 清理节点名称（移除前缀和属性后缀）
 */
export function cleanNodeName(nodeName) {
  if (!nodeName) return ''
  let cleaned = nodeName

  // 移除类型前缀
  for (const cfg of Object.values(NODE_TYPES)) {
    cleaned = cleaned.replace(new RegExp(`^${cfg.prefix.replace('-', '[-_]')}`, 'i'), '')
  }
  // 移除属性后缀
  for (const items of Object.values(ATTRIBUTES)) {
    for (const attr of Object.values(items)) {
      cleaned = cleaned.replace(new RegExp(`[-_]${attr.name}$`, 'i'), '')
    }
  }
  // 清理首尾分隔符
  cleaned = cleaned.replace(/^[-_]+|[-_]+$/g, '')
  return cleaned
}

/**
 * 完整解析节点名称
 */
export function parseNodeName(nodeName) {
  const nodeType = identifyNodeType(nodeName)
  const attributes = extractAttributes(nodeName)
  const cleanName = cleanNodeName(nodeName)
  return {
    original: nodeName,
    type: nodeType,
    name: cleanName,
    attributes,
    hasType: nodeType !== null,
    hasAttributes: attributes.length > 0
  }
}

/**
 * 判断是否为合并节点
 */
export function isMergedNode(nodeName) {
  const attrs = extractAttributes(nodeName)
  return attrs.some(a => a.name === '合并')
}

/**
 * 判断是否为背景节点
 */
export function isBackgroundNode(nodeName) {
  return classifyPublicNode(nodeName) === 'background'
}

/**
 * 判断是否为图标节点
 *
 * 注：历史上曾错误地复用“图片-”前缀，这里已修正：
 * 现在仅当节点名属于“icon/图标”别名集合或独立识别为 icon 时才返回 true。
 */
export function isIconNode(nodeName) {
  return classifyPublicNode(nodeName) === 'icon'
}

/**
 * 判断是否为图片节点（独立展示的内容图片）
 */
export function isImageNode(nodeName) {
  return classifyPublicNode(nodeName) === 'image'
}

/**
 * 统一识别静态资源节点（bg/img/image/icon）
 *
 * - 优先使用 NODE_TYPES 中的结构化中文前缀匹配
 * - 兼容 Figma 中常见的英文别名（bg-/img-/icon-/image-/background）
 * - 不做视觉属性推断，仅用于名称层面的分类
 */
export function classifyPublicNode(nodeName) {
  if (!nodeName) return null
  const lower = String(nodeName).trim().toLowerCase()
  if (!lower) return null

  const legacyType = identifyNodeType(nodeName)?.type
  if (legacyType === '背景元素' || legacyType === '背景样式') return 'background'
  if (legacyType === '图片') return 'image'

  if (lower === 'bg' || lower.startsWith('bg-') || lower.startsWith('bg_') ||
      lower === 'background' || lower.startsWith('background-') || lower.startsWith('background_')) {
    return 'background'
  }

  if (lower === 'img' || lower === 'image' ||
      lower.startsWith('img-') || lower.startsWith('img_') ||
      lower.startsWith('image-') || lower.startsWith('image_')) {
    return 'image'
  }

  if (lower.includes('icon') || lower.includes('图标') ||
      lower.startsWith('icon-') || lower.startsWith('icon_')) {
    return 'icon'
  }

  return null
}

/**
 * 面向资源识别的兜底分类，用于含英文/中文混合场景的通用识别。
 * 优先使用明确前缀；对模糊词（如同时包含 icon 与 image）按优先级回退。
 */
export function classifyPublicNodeWithFallback(nodeName, node = null) {
  const direct = classifyPublicNode(nodeName)
  if (direct) return direct

  if (!nodeName) return null
  const lower = String(nodeName).toLowerCase()

  if (lower.includes('背景') || lower.includes('background')) return 'background'
  if (lower.includes('图片') || lower.includes('image')) return 'image'
  if (lower.includes('icon') || lower.includes('图标')) return 'icon'

  if (node) {
    const fills = Array.isArray(node.fills) ? node.fills : []
    const bbox = node.absoluteBoundingBox
    const hasImageFill = fills.some(f => f?.type === 'IMAGE')
    const width = bbox?.width
    const height = bbox?.height

    if (hasImageFill && typeof width === 'number' && typeof height === 'number') {
      return (width > 200 || height > 200) ? 'background' : 'image'
    }
  }

  return null
}

// ==================== 代码生成样式规则 ====================
export const STYLE_GENERATION_RULES = {
  container: {
    include: ['width', 'height', 'padding', 'margin', 'display', 'flex-direction',
              'justify-content', 'align-items', 'background-color', 'background-image',
              'border', 'box-shadow', 'overflow']
  },
  component: {
    include: ['width', 'height', 'padding', 'display', 'flex-direction',
              'background-color', 'background-image'],
    exclude: ['内部装饰性样式', '内部字体样式', '内部内容样式']
  },
  element: {
    include: ['font-size', 'color', 'font-weight', 'font-family', 'line-height',
              'letter-spacing', 'background-gradient', 'text-shadow',
              'border', 'border-radius']
  }
}

// ==================== 导出 ====================
export default {
  NODE_TYPES,
  RESOURCE_NODE_TYPES,
  ATTRIBUTES,
  RESPONSIVE_RULES,
  MERGED_NODE_RULES,
  STYLE_GENERATION_RULES,
  identifyNodeType,
  extractAttributes,
  cleanNodeName,
  parseNodeName,
  isMergedNode,
  isBackgroundNode,
  isIconNode,
  isImageNode,
  classifyPublicNode,
  classifyPublicNodeWithFallback
}

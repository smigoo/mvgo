/**
 * 技术栈节点样式提取工具
 *
 * 核心思路：视觉识别驱动
 * - 只提取节点本身的视觉属性（背景、边框、圆角、阴影等）
 * - 不递归子节点
 * - 不使用 deep 样式穿透
 *
 * 使用场景：@ant/select、@echarts/bar 等技术栈节点
 */

/**
 * 判断节点是否为技术栈节点
 * @param {string} nodeName - 节点名称
 * @returns {boolean}
 */
export function isTechStackNode(nodeName) {
  if (!nodeName || typeof nodeName !== 'string') return false
  // 匹配 @字母 开头（排除 @2x 等分辨率后缀）
  return /@[a-zA-Z]/.test(nodeName)
}

/**
 * 解析技术栈标记
 * @param {string} nodeName - 节点名称（如 @ant/select、@echarts/bar）
 * @returns {Object|null} { library, component, fullHint } 或 null
 */
export function parseTechStackHint(nodeName) {
  if (!nodeName || typeof nodeName !== 'string') return null

  // 匹配 @技术栈/组件 格式
  const match = nodeName.match(/@([^/\s]+)(?:\/([^\s]+))?/)
  if (!match) return null

  return {
    library: match[1],      // 例如：ant, echarts, element
    component: match[2],    // 例如：select, bar, button
    fullHint: match[0]      // 例如：@ant/select
  }
}

/**
 * 判断技术栈节点是否需要 deep 样式
 *
 * 默认规则：所有 UI 组件库、图表库、地图库都不需要 deep
 * 原因：
 * 1. 组件库自带完整样式系统
 * 2. 自定义组件已有 scoped 隔离
 * 3. 使用 deep 可能破坏组件库的样式逻辑
 *
 * @param {Object} techStackHint - 技术栈提示对象 { library, component }
 * @returns {boolean} 是否需要 deep
 */
export function needsDeepStyles(techStackHint) {
  if (!techStackHint) return false

  const { library } = techStackHint

  // UI 组件库：不需要 deep
  const UI_LIBRARIES = ['ant', 'antd', 'element', 'el', 'vant', 'naive', 'arco']
  if (UI_LIBRARIES.includes(library.toLowerCase())) {
    return false
  }

  // 图表库：不需要 deep
  const CHART_LIBRARIES = ['echarts', 'chart', 'g2', 'highcharts', 'chartjs']
  if (CHART_LIBRARIES.includes(library.toLowerCase())) {
    return false
  }

  // 地图库：不需要 deep
  const MAP_LIBRARIES = ['amap', 'bmap', 'mapbox', 'leaflet', 'google']
  if (MAP_LIBRARIES.includes(library.toLowerCase())) {
    return false
  }

  // 默认：不需要 deep（保守策略）
  return false
}

/**
 * RGB(A) 颜色转 Hex 字符串
 * @param {Object} color - Figma 颜色对象 { r, g, b, a? }
 * @param {number} opacity - 透明度（0-1）
 * @returns {string} Hex 颜色字符串
 */
function rgbaToHex(color, opacity = 1) {
  if (!color) return '#000000'

  const r = Math.round((color.r || 0) * 255)
  const g = Math.round((color.g || 0) * 255)
  const b = Math.round((color.b || 0) * 255)
  const a = opacity !== undefined ? opacity : (color.a !== undefined ? color.a : 1)

  const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')

  // 如果有透明度且不是 1，返回 rgba 格式
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`
  }

  return hex
}

/**
 * 转换渐变为 CSS 格式
 * @param {Object} fill - Figma 渐变填充对象
 * @returns {string} CSS 渐变字符串
 */
function convertGradient(fill) {
  if (!fill || !fill.gradientStops) return 'transparent'

  const stops = fill.gradientStops
    .map(stop => {
      const color = rgbaToHex(stop.color)
      const position = (stop.position * 100).toFixed(1)
      return `${color} ${position}%`
    })
    .join(', ')

  if (fill.type === 'GRADIENT_LINEAR') {
    // 线性渐变：简化为从上到下（可以后续增强角度计算）
    return `linear-gradient(180deg, ${stops})`
  } else if (fill.type === 'GRADIENT_RADIAL') {
    // 径向渐变
    return `radial-gradient(circle, ${stops})`
  }

  return 'transparent'
}

/**
 * 转换阴影为 CSS box-shadow
 * @param {Object} effect - Figma 阴影效果对象
 * @returns {string} CSS box-shadow 字符串
 */
function convertShadow(effect) {
  if (!effect) return ''

  const x = effect.offset?.x || 0
  const y = effect.offset?.y || 0
  const blur = effect.radius || 0
  const spread = effect.spread || 0
  const color = rgbaToHex(effect.color)

  const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''

  return `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`
}

/**
 * 判断背景图是否应该保留
 *
 * 规则：
 * - 纯色/渐变：直接保留（肯定是容器背景）
 * - 背景图：根据宽高比判断
 *   - 宽高比 0.8-5.0：可能是有意义的容器背景，保留
 *   - 其他：可能是装饰图案，跳过
 *
 * @param {Object} node - Figma 节点
 * @param {Object} fill - 填充对象
 * @returns {boolean} 是否应该保留
 */
function shouldPreserveBackground(node, fill) {
  if (!fill) return false

  // 纯色/渐变：直接保留
  if (fill.type === 'SOLID' || fill.type.startsWith('GRADIENT')) {
    return true
  }

  // 背景图：判断宽高比
  if (fill.type === 'IMAGE') {
    if (!node.width || !node.height) return false

    const aspectRatio = node.width / node.height

    // 宽高比接近常见 UI 容器（0.8-5.0）→ 保留
    if (aspectRatio > 0.8 && aspectRatio < 5) {
      return true
    }

    // 其他：可能是装饰图案，跳过
    return false
  }

  return false
}

/**
 * 通过视觉识别提取技术栈节点的容器样式
 *
 * 核心原则：
 * 1. 只看节点本身的视觉属性
 * 2. 不递归子节点
 * 3. 只提取容器级别样式（背景、边框、圆角、阴影、尺寸、间距）
 *
 * @param {Object} node - Figma 技术栈节点（如 @ant/select）
 * @returns {Object} 容器样式对象
 */
export function extractVisualContainerStyles(node) {
  if (!node) return {}

  const styles = {}

  // ✅ 背景色/背景渐变（只看节点本身的 fills）
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]

    if (fill.visible !== false && shouldPreserveBackground(node, fill)) {
      if (fill.type === 'SOLID') {
        // 纯色背景
        styles.background = rgbaToHex(fill.color, fill.opacity)
      } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
        // 渐变背景
        styles.background = convertGradient(fill)
      } else if (fill.type === 'IMAGE') {
        // 背景图（已通过 shouldPreserveBackground 判断）
        styles.backgroundImage = `url(${fill.imageRef || ''})`
        styles.backgroundSize = 'cover'
        styles.backgroundPosition = 'center'
      }
    }
  }

  // ✅ 边框（只看节点本身的 strokes）
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0]
    if (stroke.visible !== false) {
      const width = node.strokeWeight || 1
      const color = rgbaToHex(stroke.color)
      styles.border = `${width}px solid ${color}`
    }
  }

  // ✅ 圆角（视觉属性）
  if (node.cornerRadius) {
    styles.borderRadius = `${node.cornerRadius}px`
  } else if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
    // 四个角不同圆角
    styles.borderRadius = node.rectangleCornerRadii.map(r => `${r}px`).join(' ')
  }

  // ✅ 阴影（视觉属性）
  if (node.effects && Array.isArray(node.effects)) {
    const shadows = node.effects.filter(e =>
      e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW')
    )
    if (shadows.length > 0) {
      styles.boxShadow = shadows.map(s => convertShadow(s)).join(', ')
    }
  }

  // ✅ 透明度（视觉属性）
  if (node.opacity !== undefined && node.opacity !== 1) {
    styles.opacity = node.opacity
  }

  // ✅ 文字颜色（仅当节点本身是 TEXT 类型）
  if (node.type === 'TEXT' && node.fills && node.fills.length > 0) {
    const textFill = node.fills[0]
    if (textFill.visible !== false && textFill.type === 'SOLID') {
      styles.color = rgbaToHex(textFill.color)
    }
  }

  // ✅ 尺寸（布局属性，容器需要）
  if (node.width) {
    styles.width = `${Math.round(node.width)}px`
  }
  if (node.height) {
    styles.height = `${Math.round(node.height)}px`
  }

  // ✅ 内边距（布局属性，容器需要）
  const haspadding = node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom
  if (haspadding) {
    const top = node.paddingTop || 0
    const right = node.paddingRight || 0
    const bottom = node.paddingBottom || 0
    const left = node.paddingLeft || 0

    // 简化：如果四边相同，用简写
    if (top === right && right === bottom && bottom === left) {
      styles.padding = `${top}px`
    } else if (top === bottom && left === right) {
      styles.padding = `${top}px ${right}px`
    } else {
      styles.padding = `${top}px ${right}px ${bottom}px ${left}px`
    }
  }

  // ❌ 明确跳过的属性
  // - layoutMode / itemSpacing：内部布局由组件库控制
  // - 子节点的任何样式：不递归

  return styles
}

/**
 * 格式化容器样式为 CSS 字符串
 * @param {Object} styles - 样式对象
 * @returns {string} CSS 字符串
 */
export function formatContainerStylesAsCSS(styles) {
  if (!styles || typeof styles !== 'object') return ''

  const entries = Object.entries(styles)
  if (entries.length === 0) return ''

  return entries
    .map(([key, value]) => {
      // 转换驼峰命名为 kebab-case
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      return `  ${cssKey}: ${value};`
    })
    .join('\n')
}

export default {
  isTechStackNode,
  parseTechStackHint,
  needsDeepStyles,
  extractVisualContainerStyles,
  formatContainerStylesAsCSS,
}

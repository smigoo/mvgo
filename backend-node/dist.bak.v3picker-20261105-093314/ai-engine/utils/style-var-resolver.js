/**
 * 样式变量解析器（2026-09-28）
 * 
 * 背景：样式评分时，产物大量使用 Less 变量（@color-primary 等），
 * 但 Figma 期望是字面量（#559eff 等），导致匹配率极低。
 * 
 * 本模块把产物中的变量引用解析成字面量，提高样式评分准确性。
 * 
 * 设计原则：
 * - 纯函数，零副作用
 * - 支持 Less 变量（@xxx）
 * - 支持变量引用链（最多 3 层，避免循环）
 * - 失败时返回原始内容（fail-open）
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * 从 Less 文件提取变量定义
 * 
 * @param {string} content Less 文件内容
 * @returns {Map<string, string>} 变量名 → 原始值映射
 */
export function extractLessVariables(content) {
  const varMap = new Map()
  if (!content || typeof content !== 'string') return varMap
  
  // 匹配 @variable-name: value; 或 @variable-name: value // comment
  // 支持多行值（如 rgba(...)）
  // 排除 @import、@media 等 CSS/Less 关键字
  const varRe = /@(?!import|media|keyframes|font-face|charset|namespace|supports|document|page|counter-style|font-feature-values|property)([\w-]+)\s*:\s*([^;}{]+);/g
  let m
  while ((m = varRe.exec(content))) {
    const varName = m[1]
    // 清理值：去除注释、多余空白
    let varValue = m[2]
      .replace(/\/\/.*$/, '') // 去除行尾注释
      .replace(/\/\*[\s\S]*?\*\//g, '') // 去除块注释
      .trim()
    
    if (varValue) {
      varMap.set(varName, varValue)
    }
  }
  
  return varMap
}

/**
 * 解析样式变量为字面量
 * 
 * @param {Array} files 产物文件列表
 * @param {string} [themeVarsPath] theme-vars.less 路径（可选）
 * @returns {Map<string, string>} 变量名 → 字面量映射
 */
export function resolveStyleVariables(files, themeVarsPath = null) {
  const varMap = new Map()
  
  // 1. 从 theme-vars.less 提取主题变量（优先级最高）
  if (themeVarsPath && existsSync(themeVarsPath)) {
    try {
      const themeContent = readFileSync(themeVarsPath, 'utf8')
      const themeVars = extractLessVariables(themeContent)
      for (const [name, value] of themeVars) {
        varMap.set(name, value)
      }
    } catch (err) {
      console.warn('[style-var-resolver] 读取 theme-vars.less 失败:', err.message)
    }
  }
  
  // 2. 从产物文件提取变量（common.less 等）
  for (const f of files || []) {
    if (!f.path?.endsWith('.less')) continue
    const content = f.content || ''
    const fileVars = extractLessVariables(content)
    for (const [name, value] of fileVars) {
      // 不覆盖已有的（theme-vars 优先级更高）
      if (!varMap.has(name)) {
        varMap.set(name, value)
      }
    }
  }
  
  // 3. 递归解析变量引用（最多 3 层，避免循环）
  for (let i = 0; i < 3; i++) {
    let changed = false
    for (const [name, value] of varMap.entries()) {
      // 如果值包含变量引用（@xxx），尝试替换
      const resolved = value.replace(/@([\w-]+)/g, (match, refName) => {
        if (varMap.has(refName)) {
          const refValue = varMap.get(refName)
          // 避免循环引用：如果引用的值还是变量，跳过
          if (!refValue.startsWith('@')) {
            changed = true
            return refValue
          }
        }
        return match
      })
      if (resolved !== value) {
        varMap.set(name, resolved)
      }
    }
    if (!changed) break
  }
  
  return varMap
}

/**
 * 把样式内容中的变量引用替换为字面量
 * 
 * @param {string} content 样式内容
 * @param {Map<string, string>} varMap 变量映射
 * @returns {string} 替换后的内容
 */
export function substituteVariables(content, varMap) {
  if (!content || typeof content !== 'string' || !varMap || varMap.size === 0) {
    return content
  }
  
  // 排除 Vue 指令（@click、@change 等）和 CSS 关键字（@import、@media 等）
  const vueDirectives = new Set(['click', 'change', 'input', 'submit', 'focus', 'blur', 'keydown', 'keyup', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove', 'scroll', 'resize', 'load', 'error', 'abort'])
  const cssKeywords = new Set(['import', 'media', 'keyframes', 'font-face', 'charset', 'namespace', 'supports', 'document', 'page', 'counter-style', 'font-feature-values', 'property'])
  
  return content.replace(/@([\w-]+)/g, (match, varName) => {
    // 跳过 Vue 指令和 CSS 关键字
    if (vueDirectives.has(varName) || cssKeywords.has(varName)) {
      return match
    }
    if (varMap.has(varName)) {
      const value = varMap.get(varName)
      // 避免替换变量定义本身（@xxx: value）
      // 检查前面是否是 "@xxx:" 模式
      const beforeIndex = content.lastIndexOf(match)
      const before = content.slice(Math.max(0, beforeIndex - 1), beforeIndex)
      if (before === ':') {
        return match // 这是变量定义，不替换
      }
      return value
    }
    return match
  })
}

/**
 * 从产物文件中提取已解析的样式字面量
 * 
 * 与 extractDeclaredStyleLiterals 类似，但先替换变量
 * 
 * @param {Array} files 产物文件列表
 * @param {Map<string, string>} varMap 变量映射
 * @returns {object} { color, spacing, font, radius }
 */
export function extractResolvedStyleLiterals(files = [], varMap = null) {
  const colors = []
  const spacing = []
  const fonts = []
  const radii = []
  
  const colorRe = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(\s*[\d.,%\s]+\)/g
  const spaceRe = /(?:gap|row-gap|column-gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}{]+)/gi
  const fontRe = /font-size\s*:\s*([^;}{]+)/gi
  const radiusRe = /border-radius\s*:\s*([^;}{]+)/gi
  
  for (const f of files) {
    let content = String(f?.content || '')
    const p = String(f?.path || '')
    
    // 如果提供了变量映射，先替换变量
    if (varMap) {
      content = substituteVariables(content, varMap)
    }
    
    // 只扫描样式上下文：.less/.css 全文 + .vue 的 <style> 块
    let styleContent = ''
    if (/\.less$/i.test(p) || /\.css$/i.test(p)) {
      styleContent = content
    } else if (/\.vue$/i.test(p)) {
      // 提取所有 <style> 块
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        styleContent += m[1] + '\n'
      }
    } else {
      continue
    }
    
    if (!styleContent) continue
    
    let m
    colorRe.lastIndex = 0
    while ((m = colorRe.exec(styleContent))) {
      colors.push(m[0].replace(/\s+/g, ''))
    }
    
    spaceRe.lastIndex = 0
    while ((m = spaceRe.exec(styleContent))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok)) spacing.push(tok)
      }
    }
    
    fontRe.lastIndex = 0
    while ((m = fontRe.exec(styleContent))) {
      const px = parsePx(m[1])
      if (px != null) fonts.push(`${px}px`)
    }
    
    radiusRe.lastIndex = 0
    while ((m = radiusRe.exec(styleContent))) {
      for (const tok of m[1].split(/\s+/)) {
        if (/px$/i.test(tok) || tok === '0') radii.push(tok)
      }
    }
  }
  
  return {
    color: uniqueStrings(colors),
    spacing: uniqueStrings(spacing),
    font: uniqueStrings(fonts),
    radius: uniqueStrings(radii),
  }
}

// 辅助函数
function parsePx(value) {
  const m = String(value || '').match(/(-?\d+(?:\.\d+)?)px/i)
  return m ? Number(m[1]) : null
}

function uniqueStrings(list) {
  return [...new Set((list || []).map((x) => String(x).trim()).filter(Boolean))]
}

/**
 * P1 模糊匹配层（2026-09-28）
 * 
 * 背景：Figma 提取的值常有浮点精度问题（如 17.600000381469727px），
 * 产物可能用 18px；Figma 颜色可能带透明度，产物用纯色。
 * 需要模糊匹配提高匹配率。
 */

/**
 * 解析颜色为 RGBA 对象
 * 
 * @param {string} color 颜色字符串（#hex / rgb() / rgba()）
 * @returns {{r: number, g: number, b: number, a: number} | null}
 */
export function parseColor(color) {
  const s = String(color || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  
  // #hex 格式
  const hex = s.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 8) {
      // #RRGGBBAA
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: parseInt(h.slice(6, 8), 16) / 255,
      }
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1,
      }
    }
    return null
  }
  
  // rgb() / rgba() 格式
  const rgb = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/)
  if (rgb) {
    return {
      r: +rgb[1],
      g: +rgb[2],
      b: +rgb[3],
      a: rgb[4] != null ? +rgb[4] : 1,
    }
  }
  
  return null
}

/**
 * 计算两个颜色的欧氏距离（忽略透明度）
 * 
 * @param {string} color1 
 * @param {string} color2 
 * @returns {number} 距离，Infinity 表示无法解析
 */
export function colorDistance(color1, color2) {
  const c1 = parseColor(color1)
  const c2 = parseColor(color2)
  if (!c1 || !c2) return Infinity
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2)
}

/**
 * 颜色模糊匹配（支持透明度误差）
 * 
 * @param {string} expected 期望颜色
 * @param {string[]} actuals 实际颜色列表
 * @param {object} options 选项
 * @param {number} options.maxDelta 最大欧氏距离（默认 24）
 * @param {number} options.alphaTolerance 透明度容差（默认 0.1）
 * @returns {boolean}
 */
export function colorFuzzyMatch(expected, actuals, options = {}) {
  const { maxDelta = 24, alphaTolerance = 0.1 } = options
  const expColor = parseColor(expected)
  if (!expColor) return false
  
  for (const actual of actuals || []) {
    const actColor = parseColor(actual)
    if (!actColor) continue
    
    // RGB 距离
    const rgbDist = colorDistance(expected, actual)
    if (rgbDist > maxDelta) continue
    
    // 透明度差异（如果都有透明度信息）
    const alphaDiff = Math.abs(expColor.a - actColor.a)
    if (alphaDiff <= alphaTolerance) return true
    
    // 如果 RGB 距离很近（< 10），即使透明度差异大也认为匹配
    // （因为 Figma 可能提取到半透明覆盖层，产物用纯色 + opacity 实现）
    if (rgbDist < 10) return true
  }
  
  return false
}

/**
 * 解析数值（支持 px/em/rem 单位）
 * 
 * @param {string} value 
 * @param {number} baseFontSize 基准字号（用于 em/rem 转换，默认 16）
 * @returns {number | null} px 值
 */
export function parseNumericValue(value, baseFontSize = 16) {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return null
  
  // px
  const pxMatch = s.match(/^(-?\d+(?:\.\d+)?)px?$/)
  if (pxMatch) return +pxMatch[1]
  
  // em
  const emMatch = s.match(/^(-?\d+(?:\.\d+)?)em$/)
  if (emMatch) return +emMatch[1] * baseFontSize
  
  // rem
  const remMatch = s.match(/^(-?\d+(?:\.\d+)?)rem$/)
  if (remMatch) return +remMatch[1] * baseFontSize
  
  // 纯数字（默认 px）
  const numMatch = s.match(/^(-?\d+(?:\.\d+)?)$/)
  if (numMatch) return +numMatch[1]
  
  return null
}

/**
 * 数值模糊匹配（支持浮点精度 + 单位转换）
 * 
 * @param {string|number} expected 期望值
 * @param {Array<string|number>} actuals 实际值列表
 * @param {object} options 选项
 * @param {number} options.tolerance 数值容差（默认 2）
 * @param {number} options.relativeTolerance 相对容差（默认 0.1 = 10%）
 * @param {number} options.baseFontSize 基准字号（用于 em/rem 转换）
 * @returns {boolean}
 */
export function numericFuzzyMatch(expected, actuals, options = {}) {
  const {
    tolerance = 2,
    relativeTolerance = 0.1,
    baseFontSize = 16,
  } = options
  
  const expVal = typeof expected === 'number' 
    ? expected 
    : parseNumericValue(expected, baseFontSize)
  if (!Number.isFinite(expVal)) return false
  
  for (const actual of actuals || []) {
    const actVal = typeof actual === 'number'
      ? actual
      : parseNumericValue(actual, baseFontSize)
    if (!Number.isFinite(actVal)) continue
    
    // 绝对误差
    const absDiff = Math.abs(expVal - actVal)
    if (absDiff <= tolerance) return true
    
    // 相对误差（对于大值更有效）
    const relDiff = absDiff / Math.max(Math.abs(expVal), 1)
    if (relDiff <= relativeTolerance) return true
    
    // 四舍五入后比较（处理浮点精度问题）
    // 如 17.600000381469727 → 18，18 → 18
    const expRounded = Math.round(expVal)
    const actRounded = Math.round(actVal)
    if (Math.abs(expRounded - actRounded) <= 1) return true
  }
  
  return false
}

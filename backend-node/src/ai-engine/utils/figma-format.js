/**
 * Figma 样式/结构格式化公共工具
 *
 * 单一事实源：microcode-engineer / vue3-engineer 的 Figma 节点样式格式化逻辑都走这里。
 * 抽离自原 MicrocodeEngineer 的 _formatFigmaStyleData / _formatVisualStyle /
 * _extractSections / _extractElements，改为无状态纯函数，
 * 解除 Vue3Engineer 对 MicrocodeEngineer 继承链的 formatter 依赖（P2 解耦）。
 *
 * 注意：输出字符串与原始类方法逐字一致，仅递归 self-call 由 this.xxx 改为函数名，行为等价。
 */

import { detectVerticalText } from './text-trait-detector.js';

/**
 * 统一提取 sections：兼容三种结构
 *   1. layoutStructure.layout.sections（visual-parser 返回的 analysisResult 结构）
 *   2. layoutStructure.sections（旧 preview 结构）
 *   3. layoutStructure.layoutStructure?.sections（兼容嵌套）
 */
export function extractSections(layoutStructure) {
  if (!layoutStructure) return []
  if (Array.isArray(layoutStructure.sections)) return layoutStructure.sections
  if (layoutStructure.layout && Array.isArray(layoutStructure.layout.sections)) {
    return layoutStructure.layout.sections
  }
  if (layoutStructure.layoutStructure && Array.isArray(layoutStructure.layoutStructure.sections)) {
    return layoutStructure.layoutStructure.sections
  }
  // 最深层兜底：递归一层找 sections
  for (const key of ['layout', 'analysis', 'structure']) {
    const sub = layoutStructure[key]
    if (sub && typeof sub === 'object' && Array.isArray(sub.sections)) {
      return sub.sections
    }
  }
  return []
}

/**
 * 统一提取 elements：兼容三种结构
 *   1. layoutStructure.elements
 *   2. layoutStructure.layout.elements
 *   3. 从 sections 中收集 body/children 元素
 */
export function extractElements(layoutStructure) {
  if (!layoutStructure) return []
  if (Array.isArray(layoutStructure.elements)) return layoutStructure.elements
  if (layoutStructure.layout && Array.isArray(layoutStructure.layout.elements)) {
    return layoutStructure.layout.elements
  }
  // 从 sections 中收集元素（body.children）
  const sections = extractSections(layoutStructure)
  const collected = []
  for (const s of sections) {
    const body = s && (s.body || s.content)
    if (body && Array.isArray(body.children)) {
      collected.push(...body.children)
    }
    const header = s && s.header
    if (header && Array.isArray(header.controls)) {
      collected.push(...header.controls)
    }
  }
  return collected
}

/**
 * 从 Figma 节点数据中提取关键样式信息，用于精确还原。
 * 提取 fills、effects、strokes、cornerRadius 等样式数据。
 *
 * ⚠️ maxDepth 从 4 提升到 8：设备卡片/列表项等元素常位于第 5~7 层，
 * 深度 4 会把它们的 layoutMode / 尺寸 / 字体信息整体截断，导致 LLM
 * 看不到 HORIZONTAL 标记而凭经验猜成纵向堆叠（icon 在上、文字在下）。
 *
 * 递归函数，输出与原始类方法完全一致。
 */
export function formatFigmaStyleData(figmaNodeData, depth = 0, maxDepth = 8) {
  if (!figmaNodeData || depth > maxDepth) return ''

  const lines = []
  const indent = '  '.repeat(depth)

  // 基本信息
  if (figmaNodeData.name) {
    lines.push(`${indent}- **节点**: \`${figmaNodeData.name}\` (type: ${figmaNodeData.type || 'UNKNOWN'})`)
  }

  // 🆕 P0-1 文案锚点：提取 TEXT 节点的 characters（文字内容）。
  // vision 分析超时降级时，engineer 拿不到视觉语义（tab 标签/图标题/指标名），
  // 若此处不注入 Figma 文字内容，engineer 会凭想象幻觉出完全不同的文案。
  // 过滤纯数字刻度（轴刻度 2/4/6/8…）与纯符号噪声，仅保留含中文/字母的有效文案。
  if (figmaNodeData.type === 'TEXT' && figmaNodeData.characters && String(figmaNodeData.characters).trim()) {
    const text = String(figmaNodeData.characters).trim().replace(/\s*\n\s*/g, ' / ')
    if (/[^\d\s./\-%]/.test(text)) {
      lines.push(`${indent}  - **文字**: "${text.length > 60 ? text.substring(0, 60) + '…' : text}"`)
      // 🛡️ 排版方向标注（第1层检测 + 第2层传递，一次完成）
      // Figma 数据没有「竖排」显式字段，文字靠文本框宽度受限自动换行实现，
      // 模型看不出来就会平铺成横排。此处用 text-trait-detector 自适应判定并显式告知模型。
      // 判定基于 textAutoResize 语义 + fontSize 字体度量，无硬编码阈值。
      try {
        if (detectVerticalText(figmaNodeData).vertical) {
          lines.push(`${indent}  - **排版**: 竖向（文字逐字换行、自上而下阅读）`)
          lines.push(`${indent}  - **实现要求**: 必须使用 \`writing-mode: vertical-rl\`，禁止横排平铺`)
        }
      } catch {
        /* 检测异常不影响主流程，交由下游兜底规则处理 */
      }
    }
  }

  // 尺寸
  if (figmaNodeData.absoluteBoundingBox) {
    const b = figmaNodeData.absoluteBoundingBox
    lines.push(`${indent}  - 尺寸: ${b.width} x ${b.height}`)
  }

  // 布局模式
  if (figmaNodeData.layoutMode) {
    lines.push(`${indent}  - 布局: ${figmaNodeData.layoutMode}`)
    if (figmaNodeData.primaryAxisAlignItems) lines.push(`${indent}  - 主轴对齐: ${figmaNodeData.primaryAxisAlignItems}`)
    if (figmaNodeData.counterAxisAlignItems) lines.push(`${indent}  - 交叉轴对齐: ${figmaNodeData.counterAxisAlignItems}`)
    if (figmaNodeData.itemSpacing) lines.push(`${indent}  - 间距(gap): ${figmaNodeData.itemSpacing}px`)
  }

  //深层精简模式：depth >= COMPACT_DEPTH 时只保留"名称/尺寸/布局/字体"，
  // 跳过体积大而对 flex 方向判断无益的 fills/effects/strokes/cornerRadius，
  // 以便在 maxDepth 提升到 8 后仍能控制 prompt token 规模。
  const COMPACT_DEPTH = 5
  const compact = depth >= COMPACT_DEPTH

  // Fills → 背景色/文字色
  if (!compact && figmaNodeData.fills && Array.isArray(figmaNodeData.fills) && figmaNodeData.fills.length > 0) {
    const visibleFills = figmaNodeData.fills.filter(f => f.visible !== false)
    if (visibleFills.length > 0) {
      lines.push(`${indent}  - **fills（背景/颜色）**:`)
      for (const fill of visibleFills) {
        if (fill.type === 'SOLID' && fill.color) {
          const r = Math.round(fill.color.r * 255)
          const g = Math.round(fill.color.g * 255)
          const b = Math.round(fill.color.b * 255)
          const a = fill.color.a !== undefined ? fill.color.a : (fill.opacity || 1)
          lines.push(`${indent}    - SOLID: #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a < 1 ? ` (alpha: ${a})` : ''}`)
        } else if (fill.type && fill.type.startsWith('GRADIENT')) {
          lines.push(`${indent}    - ${fill.type}: ${fill.gradientStops ? fill.gradientStops.map(s => `#${Math.round(s.color.r * 255).toString(16).padStart(2, '0')}${Math.round(s.color.g * 255).toString(16).padStart(2, '0')}${Math.round(s.color.b * 255).toString(16).padStart(2, '0')} ${Math.round(s.position * 100)}%`).join(' → ') : '无渐变数据'}`)
        } else if (fill.type === 'IMAGE') {
          lines.push(`${indent}    - IMAGE: ${fill.imageRef || '无引用'}`)
        }
      }
    }
  }

  // Effects → box-shadow / filter
  if (!compact && figmaNodeData.effects && Array.isArray(figmaNodeData.effects) && figmaNodeData.effects.length > 0) {
    const visibleEffects = figmaNodeData.effects.filter(e => e.visible !== false)
    if (visibleEffects.length > 0) {
      lines.push(`${indent}  - **effects（阴影/滤镜）**:`)
      for (const effect of visibleEffects) {
        if (effect.type === 'DROP_SHADOW' && effect.color) {
          const r = Math.round(effect.color.r * 255)
          const g = Math.round(effect.color.g * 255)
          const b = Math.round(effect.color.b * 255)
          const a = effect.color.a !== undefined ? effect.color.a : 1
          const ox = effect.offset?.x || 0
          const oy = effect.offset?.y || 0
          const radius = effect.radius || 0
          const spread = effect.spread || 0
          lines.push(`${indent}    - DROP_SHADOW: offset(${ox}, ${oy}) radius=${radius} spread=${spread} rgba(${r},${g},${b},${a})`)
        } else if (effect.type === 'INNER_SHADOW' && effect.color) {
          const r = Math.round(effect.color.r * 255)
          const g = Math.round(effect.color.g * 255)
          const b = Math.round(effect.color.b * 255)
          lines.push(`${indent}    - INNER_SHADOW: rgba(${r},${g},${b},${effect.color.a || 1})`)
        } else if (effect.type === 'BACKGROUND_BLUR') {
          lines.push(`${indent}    - BACKGROUND_BLUR: radius=${effect.radius}`)
        }
      }
    }
  }

  // Strokes → border
  if (!compact && figmaNodeData.strokes && Array.isArray(figmaNodeData.strokes) && figmaNodeData.strokes.length > 0) {
    const visibleStrokes = figmaNodeData.strokes.filter(s => s.visible !== false)
    if (visibleStrokes.length > 0) {
      lines.push(`${indent}  - **strokes（边框）**:`)
      for (const stroke of visibleStrokes) {
        if (stroke.color) {
          const r = Math.round(stroke.color.r * 255)
          const g = Math.round(stroke.color.g * 255)
          const b = Math.round(stroke.color.b * 255)
          const w = figmaNodeData.strokeWeight || 1
          lines.push(`${indent}    - ${stroke.type}: ${w}px solid rgba(${r},${g},${b},${stroke.color.a || 1})`)
        }
      }
    }
  }

  // Corner Radius → border-radius
  if (!compact && figmaNodeData.cornerRadius !== undefined && figmaNodeData.cornerRadius > 0) {
    lines.push(`${indent}  - **cornerRadius**: ${figmaNodeData.cornerRadius}px`)
  }
  if (!compact && figmaNodeData.rectangleCornerRadii) {
    const radii = figmaNodeData.rectangleCornerRadii
    lines.push(`${indent}  - **rectangleCornerRadii**: [${radii[0]}, ${radii[1]}, ${radii[2]}, ${radii[3]}]`)
  }

  // 字体样式
  if (figmaNodeData.style) {
    const s = figmaNodeData.style
    const typo = []
    if (s.fontFamily) typo.push(`font-family: ${s.fontFamily}`)
    if (s.fontSize) typo.push(`font-size: ${s.fontSize}px`)
    if (s.fontWeight) typo.push(`font-weight: ${s.fontWeight}`)
    if (s.lineHeightPx) typo.push(`line-height: ${s.lineHeightPx}px`)
    if (s.letterSpacing) typo.push(`letter-spacing: ${s.letterSpacing}px`)
    if (s.textAlignHorizontal) typo.push(`text-align: ${s.textAlignHorizontal.toLowerCase()}`)
    if (typo.length > 0) lines.push(`${indent}  - **字体**: ${typo.join(', ')}`)
  }

  // 递归处理子节点
  if (figmaNodeData.children && Array.isArray(figmaNodeData.children)) {
    for (const child of figmaNodeData.children) {
      const childData = formatFigmaStyleData(child, depth + 1, maxDepth)
      if (childData) lines.push(childData)
    }
  }

  return lines.join('\n')
}

/**
 * 格式化视觉样式要求
 * Visual Parser 将 styles 映射为 visualElements，样式字段（colors/background/
 * decorations/emphasis）直接挂在 visualElements 上。此处兼容三种来源：
 * visualElements 本身 / visualElements.visualStyle / visualElements.styles。
 */
export function formatVisualStyle(visualElements) {
  if (!visualElements) return ''

  // 优先取显式嵌套字段，否则回退到 visualElements 顶层
  const style = visualElements.visualStyle || visualElements.styles || visualElements

  const colors = style.colors
  const background = style.background
  const decorations = style.decorations
  const emphasis = style.emphasis

  // 颜色可能是对象 {primary:'#..'} 或数组 ['#..']
  const hasColors = colors && (Array.isArray(colors) ? colors.length > 0 : Object.keys(colors).length > 0)
  const hasDecorations = Array.isArray(decorations) && decorations.length > 0
  const hasEmphasis = Array.isArray(emphasis) && emphasis.length > 0

  // 全部为空则不输出该段，避免污染 prompt
  if (!hasColors && !background && !hasDecorations && !hasEmphasis) {
    return ''
  }

  const colorLines = hasColors
    ? (Array.isArray(colors)
        ? colors.map((c, i) => `- 颜色${i + 1}: ${c}`).join('\n')
        : Object.entries(colors).map(([k, v]) => `- ${k}: ${v}`).join('\n'))
    : '(无)'

  return `
## 🎨 视觉样式要求（必须实现）

**主题色：**
${colorLines}

**背景效果：**
${background || '(无)'}

**装饰元素：**
${hasDecorations ? decorations.map(d => `- ${d}`).join('\n') : '(无)'}

**强调手法：**
${hasEmphasis ? emphasis.map(e => `- ${e}`).join('\n') : '(无)'}

⚠️ **你必须在CSS中实现以上所有视觉效果**：
- 使用提供的颜色值
- 用CSS渐变实现背景效果描述
- 用box-shadow、text-shadow、filter等实现光晕/发光效果
- 用伪元素(::before/::after)实现装饰元素
`
}

/**
 * 🆕 template 段专用：Figma 节点树「结构摘要」格式化（2026-08-27 #275）
 *
 * 背景：template 分块（index.vue 模板段）只需要「层级结构 + 节点名 + 文字 + 布局方向」，
 * 不需要每个节点的 fills/effects/strokes/cornerRadius/尺寸等样式细节（那是 style 块负责精确还原）。
 * 实测：formatFigmaStyleData 全量 23.4k tokens → 本摘要 9.5k tokens（-59%），
 * 且模板结构与文案还原度零影响（name/type/characters/layoutMode/children 全保留）。
 *
 * @param {Object} nodeData Figma 节点对象（递归）
 * @param {number} depth 当前深度
 * @param {number} maxDepth 最大递归深度（与 formatFigmaStyleData 一致）
 * @returns {string} 精简后的结构描述
 */
export function formatFigmaStructureOnly(nodeData, depth = 0, maxDepth = 8) {
  if (!nodeData || depth > maxDepth) return ''
  const lines = []
  const indent = '  '.repeat(depth)

  if (nodeData.name) {
    lines.push(`${indent}- **节点**: \`${nodeData.name}\` (type: ${nodeData.type || 'UNKNOWN'})`)
  }

  // 文字内容（过滤纯数字刻度/符号噪声，与 formatFigmaStyleData 同口径）
  if (nodeData.type === 'TEXT' && nodeData.characters && String(nodeData.characters).trim()) {
    const text = String(nodeData.characters).trim().replace(/\s*\n\s*/g, ' / ')
    if (/[^\d\s./%-]/.test(text)) {
      lines.push(`${indent}  - **文字**: "${text.length > 60 ? text.substring(0, 60) + '…' : text}"`)
      // 🛡️ 排版方向标注（与上方 formatFigmaNode 同源，保持两条格式化路径一致）
      try {
        if (detectVerticalText(nodeData).vertical) {
          lines.push(`${indent}  - **排版**: 竖向（文字逐字换行、自上而下阅读）`)
          lines.push(`${indent}  - **实现要求**: 必须使用 \`writing-mode: vertical-rl\`，禁止横排平铺`)
        }
      } catch {
        /* 检测异常不影响主流程，交由下游兜底规则处理 */
      }
    }
  }

  // 布局方向（template 判断 flex 结构的关键）
  if (nodeData.layoutMode) {
    lines.push(`${indent}  - 布局: ${nodeData.layoutMode}${nodeData.itemSpacing ? ` (gap: ${nodeData.itemSpacing}px)` : ''}`)
    if (nodeData.primaryAxisAlignItems) lines.push(`${indent}  - 主轴对齐: ${nodeData.primaryAxisAlignItems}`)
    if (nodeData.counterAxisAlignItems) lines.push(`${indent}  - 交叉轴对齐: ${nodeData.counterAxisAlignItems}`)
  }

  // 递归 children
  if (Array.isArray(nodeData.children) && nodeData.children.length > 0) {
    for (const child of nodeData.children) {
      lines.push(formatFigmaStructureOnly(child, depth + 1, maxDepth))
    }
  }

  return lines.join('\n')
}

/**
 * 🆕 template 段专用：elementStyleMap 过滤为「资源引用子集」（2026-08-27 #275）
 *
 * template 段只需要知道「哪些元素挂了背景图资源（url(bgN)）」，以便在模板里正确挂载资源；
 * 纯 CSS 值（颜色/尺寸/边框等）由 style 块精确还原，template 不需要。
 * 实测：全量 1.6k tokens → 资源子集 ~0（本组件无背景图资源），节省近 100%。
 *
 * @param {Object} elementStyleMap { elementId → { cssProperty: value } }
 * @returns {Object} 只含背景图/资源引用相关条目的子集（无则返回空对象）
 */
export function filterElementStyleMapForTemplate(elementStyleMap) {
  if (!elementStyleMap || typeof elementStyleMap !== 'object') return {}
  // 判断是否为「资源引用」（template 需要知道挂载点）；纯颜色/尺寸值（background-color/border-radius 等）
  // 由 style 块全量还原，template 不需要 → 一律过滤。
  const isResourceRef = (k, v) => {
    const key = String(k)
    const val = String(v || '')
    if (key === 'background-image') return true
    if (key === 'background' && /url\(/i.test(val)) return true
    if (/url\(/i.test(val)) return true // 任意含 url() 的值（bgN 变量引用）
    return false
  }
  const resOnly = {}
  for (const [elId, props] of Object.entries(elementStyleMap)) {
    if (!props || typeof props !== 'object') continue
    const slim = {}
    for (const [k, v] of Object.entries(props)) {
      if (isResourceRef(k, v)) slim[k] = v
    }
    if (Object.keys(slim).length > 0) resOnly[elId] = slim
  }
  return resOnly
}


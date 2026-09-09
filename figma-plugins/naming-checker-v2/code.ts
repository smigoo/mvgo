/**
 * Figma 管线助手 v2 - 智能整理 + 合规检查
 * 集成 TidyUp 能力 + 管线命名映射 + 规范检查
 * 工作流：Stage 1 智能整理 → Stage 2 管线映射 → Stage 3 合规检查
 */

// ==================== 类型定义 ====================
interface CheckItem {
  id: string
  name: string
  severity: 'error' | 'warning' | 'info'
  message: string
  nodeIds: string[]
  suggestion: string
}

interface CheckResult {
  totalNodes: number
  errors: CheckItem[]
  warnings: CheckItem[]
  infos: CheckItem[]
  passed: boolean
  stats: { renamed: number, sorted: number, cleaned: number }
}

// ==================== 节点类型策略（单一扩展点） ====================
// 新增 / 调整节点类型支持，只需在此登记，所有遍历逻辑自动生效。
// 设计原则：未知类型一律安全跳过 + 记录，绝不整批中断。
const TIDY_SKIP_TYPES = new Set<string>([
  'IMAGE',       // 位图无结构，不参与整理（截图/粘贴图等）
  'SLICE',       // 导出切片
  'CONNECTOR',   // 连线
  'WASHI_TAPE',  // 便签胶带
  'STICKY',      // 便签
  'EMBED',       // 嵌入网页
  'MEDIA',       // 媒体
  'LINK_UNFURL', // 链接预览
])
const PRESERVE_NAME_TYPES = new Set<string>([
  'INSTANCE', 'COMPONENT', // 保留设计稿原名
])
// 被跳过的节点，用于向用户反馈（替代静默失败 / 崩溃）
const tidySkipped: { id: string; name: string; type: string }[] = []

// ==================== Stage 1: TidyUp 智能整理 ====================

/**
 * 递归收集所有子节点（深度优先）
 */
function collectAllNodes(root: SceneNode): SceneNode[] {
  const all: SceneNode[] = []
  function collect(n: SceneNode) {
    all.push(n)
    if ('children' in n) {
      (n as FrameNode).children?.forEach(collect)
    }
  }
  collect(root)
  return all
}

/**
 * 基于结构/属性检测节点角色（TidyUp 核心逻辑简化版）
 */
function detectRole(node: SceneNode): { role: string, label: string } {
  // 1. 组件实例保留原名
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
    return { role: 'component', label: node.name }
  }

  // 2. 背景检测：大尺寸 + 图片填充 或 纯色填充且无子元素
  if ('fills' in node && node.fills && node.fills !== figma.mixed) {
    const fills = node.fills as ReadonlyArray<Paint>
    const hasImage = fills.some((f: Paint) => f.type === 'IMAGE')
    const isLarge = 'width' in node && 'height' in node &&
                    (node as any).width > 100 && (node as any).height > 100

    if (hasImage) return { role: 'background', label: 'bg' }
    if (isLarge && node.type === 'RECTANGLE' && !('children' in node)) {
      return { role: 'background', label: 'bg-solid' }
    }
  }

  // 3. 图标检测：矢量/布尔运算/小尺寸组件
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
    return { role: 'icon', label: 'icon' }
  }
  if ('width' in node) {
    const w = (node as any).width
    const h = (node as any).height
    if (w <= 32 && h <= 32) return { role: 'icon', label: 'icon' }
  }

  // 4. 按钮检测：小圆角 Auto Layout + 包含文字
  if ((node.type === 'FRAME' || node.type === 'COMPONENT_SET') && 'cornerRadius' in node) {
    const frame = node as FrameNode
    const hasText = frame.children?.some((c: SceneNode) => c.type === 'TEXT')
    const isSmall = 'width' in node && (node as any).width < 300
    const cornerRadius = (frame as any).cornerRadius
    // cornerRadius 在四角不一致时为 figma.mixed（Symbol），与 number 比较会抛
    // "cannot convert symbol to number"，必须显式守卫后再比较
    if (hasText && isSmall && cornerRadius !== figma.mixed && cornerRadius && cornerRadius > 4) {
      const textNode = frame.children.find((c: SceneNode) => c.type === 'TEXT') as TextNode
      const text = textNode?.characters?.trim() || 'action'
      return { role: 'button', label: text }
    }
  }

  // 5. 标题检测：大尺寸文字
  if (node.type === 'TEXT') {
    const text = node as TextNode
    const fontSize = text.fontSize
    // fontSize 在文本样式不一致（混排）时为 figma.mixed（Symbol），比较前必须守卫
    if (fontSize !== figma.mixed && fontSize >= 24) return { role: 'heading', label: text.characters.trim().slice(0, 20) }
    if (text.characters.length <= 10) return { role: 'label', label: text.characters.trim() }
    return { role: 'body', label: text.characters.trim().slice(0, 25) }
  }

  // 6. 容器检测：有子元素的 Frame 或 Group
  if ((node.type === 'FRAME' || node.type === 'GROUP') && 'children' in node) {
    const frame = node as FrameNode
    const firstText = frame.children?.find((c: SceneNode) => c.type === 'TEXT') as TextNode
    if (firstText) {
      return { role: 'container', label: firstText.characters.trim().slice(0, 15) }
    }
  }

  // 兜底：未知类型安全返回，绝不抛错
  return { role: 'unknown', label: node.name }
}

/**
 * 智能重命名（TidyUp 能力 + 管线映射）
 */
function autoRename(nodes: ReadonlyArray<SceneNode>): number {
  let count = 0

  // 递归收集所有子节点
  const allNodes: SceneNode[] = []
  nodes.forEach(n => allNodes.push(...collectAllNodes(n)))

  allNodes.forEach(node => {
    // 跳过锁定的节点
    if (node.locked) return

    // 位图/切片等不参与整理，记录后跳过（可见反馈，避免整批失败）
    if (TIDY_SKIP_TYPES.has(node.type)) {
      tidySkipped.push({ id: node.id, name: node.name, type: node.type })
      return
    }

    // 组件实例保留设计稿原名
    if (PRESERVE_NAME_TYPES.has(node.type)) return

    // 跳过已有规范命名的节点
    if (/^(cp-|bg-|icon-|btn-|tab-|@echarts|@chart)/.test(node.name)) return

    const { role, label } = detectRole(node)
    const safeLabel = label.replace(/[^a-zA-Z00-\u9fa5-]/g, '-').toLowerCase()

    let newName = node.name
    switch (role) {
      case 'background': newName = `bg-${safeLabel || 'root'}`; break
      case 'icon': newName = `icon-${safeLabel || 'default'}`; break
      case 'button': newName = `btn-${safeLabel || 'action'}`; break
      case 'heading': newName = `heading-${safeLabel || 'title'}`; break
      case 'label': newName = `label-${safeLabel || 'text'}`; break
      case 'body': newName = `text-${safeLabel || 'content'}`; break
      case 'container': newName = `section-${safeLabel || 'block'}`; break
      default: {
        // 兜底：默认命名（Type N 模式）按类型前缀重命名
        // 例：Rectangle 8 → rectangle-8, Group 2136637067 → group-2136637067
        const m = node.name.match(/^(Rectangle|Group|Frame|Ellipse|Line|Polygon|Star|Vector|Boolean Operation|Component)\s*(\d+)$/i)
        if (m) {
          const typeKey = m[1].toLowerCase().replace(/\s+/g, '')
          newName = `${typeKey}-${m[2]}`
        } else {
          console.log(`[tidy] noop ${node.type} "${node.name}" (role=unknown, no default-name match)`)
          return
        }
        break
      }
    }

    if (newName !== node.name) {
      try {
        node.name = newName
        count++
        console.log(`[tidy] rename ${node.type} "${node.name}" → "${newName}" (role=${role})`)
      } catch (error) {
        console.warn(`[tidy] rename failed: ${node.type} "${node.name}" → "${newName}" — ${String(error)}`)
      }
    }
  })
  return count
}

/**
 * 自动排序：按阅读顺序（Y 轴优先，X 轴次之），背景沉底
 */
function autoSort(nodes: ReadonlyArray<SceneNode>): number {
  let count = 0
  nodes.forEach(node => {
    if (!('children' in node)) return
    if (node.type !== 'FRAME' && node.type !== 'GROUP') return
    const frame = node as FrameNode
    // Auto Layout（FRAME）或 GROUP 自动排序时不干预
    if ('layoutMode' in frame && frame.layoutMode !== 'NONE') return

    const children = [...frame.children]
    children.sort((a, b) => {
      // 背景沉底
      const aBg = detectRole(a).role === 'background'
      const bBg = detectRole(b).role === 'background'
      if (aBg && !bBg) return -1
      if (!aBg && bBg) return 1

      // Y 轴优先，X 轴次之
      const yDiff = (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0)
      if (Math.abs(yDiff) > 10) return yDiff
      return (a.absoluteBoundingBox?.x || 0) - (b.absoluteBoundingBox?.x || 0)
    })

    // 应用排序
    children.forEach((child, i) => {
      if (frame.children[i] !== child) {
        try {
          child.parent?.insertChild(i, child)
          count++
        } catch (e) {
          // 忽略只读模式错误
        }
      }
    })
  })
  return count
}

/**
 * 清理垃圾层：空 Frame、0x0 节点、画布外节点
 */
function cleanupJunk(nodes: ReadonlyArray<SceneNode>): number {
  let count = 0
  const toDelete: SceneNode[] = []

  // 递归收集所有子节点
  const allNodes: SceneNode[] = []
  nodes.forEach(n => allNodes.push(...collectAllNodes(n)))

  allNodes.forEach(node => {
    if (TIDY_SKIP_TYPES.has(node.type)) return // 位图/切片等不参与清理
    // 空 Frame/Group
    if ((node.type === 'FRAME' || node.type === 'GROUP') && 'children' in node) {
      const f = node as FrameNode
      if (f.children.length === 0 && !node.locked) {
        toDelete.push(node)
        count++
      }
    }
    // 0x0 节点
    if ('width' in node && 'height' in node) {
      if ((node as any).width === 0 && (node as any).height === 0 && !node.locked) {
        toDelete.push(node)
        count++
      }
    }
  })

  toDelete.forEach(n => {
    try { n.remove() } catch (e) { /* 忽略只读模式错误 */ }
  })
  return count
}

// ==================== Stage 2: 管线映射增强 ====================

/**
 * 将 TidyUp 通用命名映射为管线约定
 */
function applyPipelineMapping(nodes: ReadonlyArray<SceneNode>): number {
  let count = 0

  // 递归收集所有子节点
  const allNodes: SceneNode[] = []
  nodes.forEach(n => allNodes.push(...collectAllNodes(n)))

  allNodes.forEach(node => {
    if (node.locked) return
    if (TIDY_SKIP_TYPES.has(node.type)) return // 位图/切片等不改名
    if (PRESERVE_NAME_TYPES.has(node.type)) return // 组件实例保留原名

    let newName: string | null = null

    // 根容器映射
    if (node.parent?.type === 'PAGE') {
      if (/^frame\s*\d+$/i.test(node.name) || /^group\s*\d+$/i.test(node.name)) {
        newName = `cp-component-${node.id.slice(0, 4)}`
      }
    }
    // 图表容器映射（基于子元素特征）
    if (node.type === 'FRAME' && !/^@echarts/.test(node.name)) {
      const f = node as FrameNode
      const hasBars = f.children?.some((c: SceneNode) =>
        c.type === 'RECTANGLE' && 'width' in c && (c as any).width < 20 && (c as any).height > 40
      )
      if (hasBars) {
        newName = `@echarts/bar-${node.id.slice(0, 4)}`
      }
    }

    if (newName && newName !== node.name) {
      try {
        node.name = newName
        count++
      } catch (e) {
        // 忽略只读模式错误
      }
    }
  })
  return count
}

// ==================== Stage 3: 合规检查 ====================

const MEANINGLESS_PATTERNS = [/^frame\s*\d+$/i, /^group\s*\d+$/i, /^rectangle\s*\d+$/i]
const VALID_BG = [/^bg$/i, /^bg-.*$/i, /背景/]
const VALID_ICON = [/^icon$/i, /^icon-.*$/i, /图标 | arrow|箭头/]
const VALID_CHART = [/^@echarts\/.*$/i, /^@chart\/.*$/i]
const VALID_BTN = [/^btn-.*$/i, /^button-.*$/i]
const VALID_TAB = [/^tab-.*$/i]

function isMeaningless(name: string) { return MEANINGLESS_PATTERNS.some(p => p.test(name)) }

function hasImageFill(n: SceneNode): boolean {
  if (!('fills' in n) || !n.fills || n.fills === figma.mixed) return false
  const fills = n.fills as ReadonlyArray<Paint>
  return fills.some((f: Paint) => f.type === 'IMAGE')
}

function isVector(n: SceneNode) { return n.type === 'VECTOR' || n.type === 'STAR' || n.type === 'LINE' }
function isComponent(n: SceneNode) { return n.type === 'COMPONENT' || n.type === 'INSTANCE' }

function runChecks(nodes: ReadonlyArray<SceneNode>): CheckResult {
  const res: CheckResult = { totalNodes: 0, errors: [], warnings: [], infos: [], passed: true, stats: { renamed: 0, sorted: 0, cleaned: 0 } }

  function count(n: SceneNode): number {
    let c = 1
    if ('children' in n) c += (n as FrameNode).children?.reduce((s: number, ch: SceneNode) => s + count(ch), 0) || 0
    return c
  }

  function check(n: SceneNode, depth: number) {
    res.totalNodes++

    // 1. 根容器命名
    if (depth === 0 && n.type === 'FRAME' && isMeaningless(n.name)) {
      res.errors.push({ id: 'root-name', name: '根容器命名', severity: 'error', message: `使用无意义命名：${n.name}`, nodeIds: [n.id], suggestion: '改为 cp-xxx 语义化命名' })
    }
    // 2. 背景图命名
    if (hasImageFill(n) && !VALID_BG.some(p => p.test(n.name))) {
      res.warnings.push({ id: 'bg-name', name: '背景图命名', severity: 'warning', message: `未规范命名：${n.name}`, nodeIds: [n.id], suggestion: '改为 bg 或 bg-*' })
    }
    // 3. 图标命名
    if ((isVector(n) || isComponent(n)) && 'width' in n && (n as any).width > 12 && !VALID_ICON.some(p => p.test(n.name))) {
      res.warnings.push({ id: 'icon-name', name: '图标命名', severity: 'warning', message: `未规范命名：${n.name}`, nodeIds: [n.id], suggestion: '改为 icon 或 icon-*' })
    }
    // 4. 图表标记
    if (n.type === 'FRAME') {
      const f = n as FrameNode
      const hasChart = f.children?.some((c: SceneNode) => c.type === 'RECTANGLE' && 'width' in c && (c as any).width < 20 && (c as any).height > 50)
      if (hasChart && !VALID_CHART.some(p => p.test(n.name))) {
        res.warnings.push({ id: 'chart-mark', name: '图表标记', severity: 'warning', message: `未标记 @echarts：${n.name}`, nodeIds: [n.id], suggestion: '改为 @echarts/bar 等' })
      }
    }
    // 5. 根容器 Auto Layout
    if (depth === 0 && n.type === 'FRAME') {
      const f = n as FrameNode
      if (!f.layoutMode || f.layoutMode === 'NONE') {
        res.errors.push({ id: 'root-layout', name: '根容器布局', severity: 'error', message: '缺少 Auto Layout', nodeIds: [n.id], suggestion: '选中按 Shift+A' })
      }
    }
    // 6. 按钮/Tab 命名 (Info)
    if (n.type === 'FRAME' && 'cornerRadius' in n) {
      const f = n as FrameNode
      if (f.children?.some((c: SceneNode) => c.type === 'TEXT') && (f as any).width < 300) {
        if (!VALID_BTN.some(p => p.test(n.name)) && !VALID_TAB.some(p => p.test(n.name))) {
          res.infos.push({ id: 'btn-name', name: '按钮命名', severity: 'info', message: `建议语义化：${n.name}`, nodeIds: [n.id], suggestion: '改为 btn-*' })
        }
      }
    }

    if ('children' in n) (n as FrameNode).children?.forEach((ch: SceneNode) => check(ch, depth + 1))
  }

  nodes.forEach(n => { res.totalNodes += count(n); check(n, 0) })
  res.passed = res.errors.length === 0
  return res
}

// ==================== 主流程与通信 ====================

figma.on('run', () => {
  try {
    console.log('[Pipeline Assistant] Plugin running, showing UI...')
    figma.showUI(__html__, { width: 640, height: 520 })

    const selection = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : [figma.currentPage]
    console.log('[Pipeline Assistant] Selection count:', selection.length)
    figma.ui.postMessage({ type: 'ready', count: selection.length })

    figma.notify('✅ Figma 管线助手已加载，请选择图层后点击按钮')
  } catch (error) {
    console.error('[Pipeline Assistant] Error on run:', error)
    figma.notify(' 插件加载失败：' + String(error))
  }
})

figma.ui.onmessage = async (msg: any) => {
  try {
    tidySkipped.length = 0
    let nodes: ReadonlyArray<SceneNode>
    if (figma.currentPage.selection.length > 0) {
      nodes = figma.currentPage.selection as ReadonlyArray<SceneNode>
    } else {
      // 没有选中时使用当前页面的子节点
      nodes = figma.currentPage.children as ReadonlyArray<SceneNode>
    }

    // 扫描总数：便于区分「已规范无需整理」与「未实际运行」
    const scanned = nodes.reduce((s: number, n: SceneNode) => s + collectAllNodes(n).length, 0)

    if (msg.type === 'organize') {
      figma.notify('🧹 开始智能整理...')
      const renamed = autoRename(nodes)
      const sorted = autoSort(nodes)
      const cleaned = cleanupJunk(nodes)
      const mapped = applyPipelineMapping(nodes)
      const skipInfo = tidySkipped.length
        ? `，跳过 ${tidySkipped.length} 个不参与整理的节点（图片/切片等）`
        : ''
      figma.notify(`✅ 整理完成：扫描 ${scanned} 个，重命名 ${renamed + mapped} 个，排序 ${sorted} 个，清理 ${cleaned} 个${skipInfo}`)
      figma.ui.postMessage({
        type: 'organize-done',
        stats: {
          scanned,
          renamed: renamed + mapped,
          sorted,
          cleaned,
          skippedCount: tidySkipped.length,
        }
      })
    }

    if (msg.type === 'check') {
      figma.notify('🔍 开始合规检查...')
      const result = runChecks(nodes)
      figma.ui.postMessage({ type: 'check-done', result })
    }

    if (msg.type === 'fix-all') {
      figma.notify('🛠 自动修复中...')
      autoRename(nodes)
      autoSort(nodes)
      cleanupJunk(nodes)
      applyPipelineMapping(nodes)
      const result = runChecks(nodes)
      const skipInfo = tidySkipped.length ? `，跳过 ${tidySkipped.length} 个节点` : ''
      figma.notify(result.passed
        ? `✅ 修复完成：扫描 ${scanned} 个，检查通过${skipInfo}`
        : `⚠️ 修复完成：扫描 ${scanned} 个，剩余 ${result.errors.length} 个错误需手动处理${skipInfo}`)
      figma.ui.postMessage({ type: 'fix-done', result })
    }
  } catch (error) {
    console.error('[Pipeline Assistant] 整理中断：', error)
    figma.notify(' 整理中断：' + String(error))
    figma.ui.postMessage({ type: 'error', message: String(error) })
  }
}

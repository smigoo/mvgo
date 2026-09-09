/**
 * Figma 管线规范检查插件 - 主逻辑
 * 检查命名规范和 Auto Layout 完整性
 */

// 检查项定义
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
}

// 无意义命名模式
const MEANINGLESS_NAME_PATTERNS = [
  /^frame\s*\d+$/i,
  /^group\s*\d+$/i,
  /^rectangle\s*\d+$/i,
  /^vector\s*\d+$/i,
  /^component\s*\d+$/i,
]

// 规范命名模式
const VALID_BG_PATTERNS = [
  /^bg$/i,
  /^bg-.*$/i,
  /背景/,
]

const VALID_ICON_PATTERNS = [
  /^icon$/i,
  /^icon-.*$/i,
  /图标/,
  /arrow/i,
  /箭头/,
]

const VALID_CHART_PATTERNS = [
  /^@echarts\/.*$/i,
  /^@chart\/.*$/i,
]

const VALID_BUTTON_PATTERNS = [
  /^btn-.*$/i,
  /^button-.*$/i,
]

const VALID_TAB_PATTERNS = [
  /^tab-.*$/i,
]

/**
 * 检查节点命名是否有意义
 */
function isMeaninglessName(name: string): boolean {
  return MEANINGLESS_NAME_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 检查是否为有效的背景命名
 */
function isValidBgName(name: string): boolean {
  return VALID_BG_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 检查是否为有效的图标命名
 */
function isValidIconName(name: string): boolean {
  return VALID_ICON_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 检查是否为有效的图表标记
 */
function isValidChartName(name: string): boolean {
  return VALID_CHART_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 检查是否为有效的按钮命名
 */
function isValidButtonName(name: string): boolean {
  return VALID_BUTTON_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 检查是否为有效的 Tab 命名
 */
function isValidTabName(name: string): boolean {
  return VALID_TAB_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 判断节点是否可能包含背景图
 */
function hasImageFill(node: SceneNode): boolean {
  if ('fills' in node && node.fills) {
    return node.fills.some(fill => fill.type === 'IMAGE')
  }
  return false
}

/**
 * 判断节点是否为矢量图形
 */
function isVectorNode(node: SceneNode): boolean {
  return node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'LINE'
}

/**
 * 判断节点是否为组件实例
 */
function isComponentNode(node: SceneNode): boolean {
  return node.type === 'COMPONENT' || node.type === 'INSTANCE'
}

/**
 * 判断节点是否为按钮或 Tab（基于子节点结构）
 */
function isButtonOrTab(node: SceneNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'GROUP') return false
  
  const frame = node as FrameNode
  const children = frame.children
  
  // 按钮/Tab 通常包含文本 + 图标
  const hasText = children.some(child => child.type === 'TEXT')
  const hasIcon = children.some(child => isVectorNode(child) || isComponentNode(child))
  
  return hasText && hasIcon
}

/**
 * 计算节点树深度
 */
function calculateDepth(node: SceneNode, currentDepth = 1): number {
  if ('children' in node) {
    const frame = node as FrameNode
    if (frame.children && frame.children.length > 0) {
      return Math.max(...frame.children.map(child => calculateDepth(child, currentDepth + 1)))
    }
  }
  return currentDepth
}

/**
 * 递归检查节点
 */
function checkNodeRecursive(node: SceneNode, results: CheckResult, path: string[] = []) {
  const currentPath = [...path, node.name]
  
  // 1. 检查根容器命名（仅根节点）
  if (path.length === 0 && node.type === 'FRAME') {
    if (isMeaninglessName(node.name)) {
      results.errors.push({
        id: 'root-naming',
        name: '根容器命名不规范',
        severity: 'error',
        message: `根容器使用了无意义命名：${node.name}`,
        nodeIds: [node.id],
        suggestion: '建议：使用语义化命名，如 cp-流量监测、cp-traffic-monitor',
      })
    }
  }
  
  // 2. 检查背景图命名
  if (hasImageFill(node)) {
    if (!isValidBgName(node.name)) {
      results.warnings.push({
        id: 'bg-naming',
        name: '背景图命名不规范',
        severity: 'warning',
        message: `背景图未规范命名：${node.name}`,
        nodeIds: [node.id],
        suggestion: '建议：命名为 bg、bg-* 或包含「背景」关键词',
      })
    }
  }
  
  // 3. 检查图标命名
  if (isVectorNode(node) || isComponentNode(node)) {
    // 跳过小尺寸装饰性元素（≤12px）
    const isSmall = 'width' in node && 'height' in node && 
                    (node as any).width <= 12 && (node as any).height <= 12
    
    if (!isSmall && !isValidIconName(node.name)) {
      results.warnings.push({
        id: 'icon-naming',
        name: '图标命名不规范',
        severity: 'warning',
        message: `图标未规范命名：${node.name}`,
        nodeIds: [node.id],
        suggestion: '建议：命名为 icon、icon-* 或包含「图标」「箭头」关键词',
      })
    }
  }
  
  // 4. 检查图表区域标记
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    const frame = node as FrameNode
    const children = frame.children
    
    // 检测是否包含多个柱状/饼图元素（简化判断）
    const hasChartElements = children.some(child => {
      if (child.type === 'RECTANGLE' || child.type === 'VECTOR') {
        // 窄而高的矩形可能是柱状图
        const rect = child as RectangleNode
        if ('width' in rect && 'height' in rect) {
          return (rect.width < 20 && rect.height > 50)
        }
      }
      return false
    })
    
    if (hasChartElements && !isValidChartName(node.name)) {
      results.warnings.push({
        id: 'chart-marking',
        name: '图表区域未标记',
        severity: 'warning',
        message: `图表区域未标记 @echarts：${node.name}`,
        nodeIds: [node.id],
        suggestion: '建议：命名为 @echarts/bar、@echarts/line、@echarts/pie 等',
      })
    }
  }
  
  // 5. 检查按钮/Tab 命名
  if (isButtonOrTab(node)) {
    if (!isValidButtonName(node.name) && !isValidTabName(node.name)) {
      results.infos.push({
        id: 'button-tab-naming',
        name: '按钮/Tab 命名建议',
        severity: 'info',
        message: `按钮或 Tab 未语义化命名：${node.name}`,
        nodeIds: [node.id],
        suggestion: '建议：按钮命名为 btn-*，Tab 命名为 tab-*',
      })
    }
  }
  
  // 6. 检查 Auto Layout（仅 Frame）
  if (node.type === 'FRAME') {
    const frame = node as FrameNode
    
    // 根容器必须有 Auto Layout
    if (path.length === 0) {
      if (!frame.layoutMode || frame.layoutMode === 'NONE') {
        results.errors.push({
          id: 'auto-layout-root',
          name: '根容器缺少 Auto Layout',
          severity: 'error',
          message: '根容器未添加 Auto Layout',
          nodeIds: [node.id],
          suggestion: '操作：选中根容器，按 Shift+A 添加 Auto Layout，设置 layoutMode 为 HORIZONTAL 或 VERTICAL',
        })
      } else {
        // 检查 Auto Layout 属性完整性
        const hasPadding = frame.paddingLeft > 0 || frame.paddingRight > 0 || 
                          frame.paddingTop > 0 || frame.paddingBottom > 0
        const hasSpacing = frame.itemSpacing > 0
        
        if (!hasPadding || !hasSpacing) {
          results.infos.push({
            id: 'auto-layout-properties',
            name: 'Auto Layout 属性不完整',
            severity: 'info',
            message: `Auto Layout 属性可能不完整：${node.name}`,
            nodeIds: [node.id],
            suggestion: `建议：设置 padding ≥ 8px，itemSpacing ≥ 8px（当前 padding: ${frame.paddingLeft}/${frame.paddingRight}/${frame.paddingTop}/${frame.paddingBottom}, itemSpacing: ${frame.itemSpacing}）`,
          })
        }
      }
    }
  }
  
  // 7. 递归检查子节点
  if ('children' in node) {
    const frame = node as FrameNode
    if (frame.children && frame.children.length > 0) {
      frame.children.forEach(child => checkNodeRecursive(child, results, currentPath))
    }
  }
}

/**
 * 主检查函数
 */
function runChecks(): CheckResult {
  const results: CheckResult = {
    totalNodes: 0,
    errors: [],
    warnings: [],
    infos: [],
    passed: true,
  }
  
  const currentPage = figma.currentPage
  const selection = figma.selection
  
  // 如果没有选中任何节点，检查当前页面
  const nodesToCheck = selection.size > 0 ? Array.from(selection) : [currentPage]
  
  nodesToCheck.forEach(node => {
    // 计算节点总数
    function countNodes(n: SceneNode): number {
      let count = 1
      if ('children' in n) {
        const frame = n as FrameNode
        if (frame.children) {
          count += frame.children.reduce((sum, child) => sum + countNodes(child), 0)
        }
      }
      return count
    }
    results.totalNodes += countNodes(node)
    
    // 执行检查
    checkNodeRecursive(node, results, [])
  })
  
  // 检查层级深度
  nodesToCheck.forEach(node => {
    const depth = calculateDepth(node)
    if (depth > 4) {
      results.warnings.push({
        id: 'depth-warning',
        name: '节点层级过深',
        severity: 'warning',
        message: `节点树深度为 ${depth} 层（建议 ≤ 4 层）`,
        nodeIds: [node.id],
        suggestion: '建议：扁平化结构，减少嵌套层级',
      })
    }
  })
  
  // 判定是否通过
  results.passed = results.errors.length === 0
  
  return results
}

/**
 * 格式化检查结果为 Markdown
 */
function formatResults(results: CheckResult): string {
  let md = `# Figma 管线规范检查报告\n\n`
  md += `**检查节点总数**: ${results.totalNodes}\n\n`
  
  if (results.passed) {
    md += `## ✅ 检查通过\n\n`
    md += `恭喜！所有必查项均已符合规范。\n\n`
  } else {
    md += `## ❌ 检查未通过\n\n`
    md += `发现 **${results.errors.length}** 个错误，需要修复后才能提交生成。\n\n`
  }
  
  if (results.errors.length > 0) {
    md += `## 错误（${results.errors.length}）\n\n`
    results.errors.forEach((item, index) => {
      md += `### ${index + 1}. ${item.name}\n`
      md += `- **问题**: ${item.message}\n`
      md += `- **${item.suggestion}**\n\n`
    })
  }
  
  if (results.warnings.length > 0) {
    md += `## ️ 警告（${results.warnings.length}）\n\n`
    results.warnings.forEach((item, index) => {
      md += `### ${index + 1}. ${item.name}\n`
      md += `- **问题**: ${item.message}\n`
      md += `- **${item.suggestion}**\n\n`
    })
  }
  
  if (results.infos.length > 0) {
    md += `## 💡 建议（${results.infos.length}）\n\n`
    results.infos.forEach((item, index) => {
      md += `### ${index + 1}. ${item.name}\n`
      md += `- **问题**: ${item.message}\n`
      md += `- **${item.suggestion}**\n\n`
    })
  }
  
  md += `---\n\n`
  md += `## 📋 提交前自检清单\n\n`
  md += `- [ ] 根容器语义化命名（不是 Frame 123 / bg）\n`
  md += `- [ ] 所有图标命名为 icon / icon-*\n`
  md += `- [ ] 图表区域标记 @echarts/*\n`
  md += `- [ ] 根容器有 Auto Layout（Shift+A）\n`
  md += `- [ ] layoutMode 为 HORIZONTAL 或 VERTICAL\n`
  
  return md
}

/**
 * 高亮问题节点
 */
function highlightNodes(nodeIds: string[]) {
  figma.currentPage.selection = []
  
  nodeIds.forEach(id => {
    const node = figma.getNodeById(id)
    if (node) {
      figma.currentPage.selection = [...figma.currentPage.selection, node]
      figma.viewport.scrollAndZoomIntoView(node)
    }
  })
  
  if (nodeIds.length > 0) {
    figma.notify(`已高亮 ${nodeIds.length} 个问题节点`, { type: 'success' })
  }
}

// 主执行流程
async function main() {
  figma.notify('开始检查 Figma 管线规范...', { type: 'processing' })
  
  try {
    const results = runChecks()
    const reportMd = formatResults(results)
    
    // 发送结果到 UI
    figma.ui.show()
    figma.ui.resize(600, 500)
    figma.ui.postMessage({
      type: 'check-result',
      results,
      reportMd,
    })
    
    // 如果有错误，高亮第一个问题的节点
    if (results.errors.length > 0) {
      setTimeout(() => {
        highlightNodes(results.errors[0].nodeIds)
      }, 500)
    }
    
    figma.notify(
      results.passed 
        ? `✅ 检查通过！共检查 ${results.totalNodes} 个节点` 
        : `❌ 发现 ${results.errors.length} 个错误，${results.warnings.length} 个警告`,
      { type: results.passed ? 'success' : 'error' }
    )
  } catch (error) {
    figma.notify(`检查失败：${error.message}`, { type: 'error' })
    figma.ui.postMessage({
      type: 'check-error',
      error: error.message,
    })
  }
}

main()

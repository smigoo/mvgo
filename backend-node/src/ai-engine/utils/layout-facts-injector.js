/**
 * 🛡️ 布局事实直接注入器（2026-09-19 治本）
 * 
 * 根据 nodeLayoutFacts 直接注入 display/flex-direction，覆盖 LLM 生成的值。
 * 解决两个问题：
 * 1. 后处理方向纠正：检测并纠正错误的 flex-direction
 * 2. 布局事实直接注入：不让 LLM 写 display/flex-direction，后处理根据约束直接注入
 */

import { buildNodeLayoutFactsReinforcement } from './constraint-reinforcement.js'
import { stripIllegalCssValues } from './css-sanitizer.js'

/**
 * 从 CSS/LESS 内容中提取指定 class 的 display 和 flex-direction
 * @param {string} cssContent - CSS/LESS 内容
 * @param {string} className - class 名（如 .c-device-monitor-tabs）
 * @returns {{display: string|null, flexDirection: string|null, blockStart: number, blockEnd: number}|null}
 */
function extractFlexProps(cssContent, className) {
  // 转义 class 名中的特殊字符
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const classRegex = new RegExp(`${escapedClass}\\s*\\{([^}]*)\\}`, 's')
  const match = cssContent.match(classRegex)
  if (!match) return null

  const blockContent = match[1]
  const blockStart = match.index
  const blockEnd = blockStart + match[0].length

  const displayMatch = blockContent.match(/display\s*:\s*([^;]+);/)
  const flexDirectionMatch = blockContent.match(/flex-direction\s*:\s*([^;]+);/)

  return {
    display: displayMatch ? displayMatch[1].trim() : null,
    flexDirection: flexDirectionMatch ? flexDirectionMatch[1].trim() : null,
    blockStart,
    blockEnd,
    blockContent,
  }
}

/**
 * 🛡️ R2 命名后缀变体匹配（2026-09-22 · c-device-monitor-be31dcf3 实锤）：
 * buildLayoutMapping 由 Figma 节点名推断 class（如 name='tabs' → .c-device-monitor-tabs），
 * 但 R2 规则生成的子组件根 class 带语义后缀（.c-device-monitor-tabs-section）——
 * 精确匹配失败 → LAYOUT-FACTS-INJECT 对 tabs 容器空转 → 6 个 tab 横排挤一行。
 * 治本：精确 class 未命中时，尝试「同前缀 + 语义后缀」变体（-section/-wrap/-list/-box/
 * -con/-container），命中即返回该变体名（供 updateFlexProps 定位同一选择器）。
 * 纪律：仅当变体选择器**唯一**存在时采用；多重命中放弃（宁可漏报不误杀）。
 */
const LAYOUT_SUFFIX_VARIANTS = ['-section', '-wrap', '-list', '-box', '-con', '-container'];

function matchClassWithSuffixVariant(cssContent, className) {
  const direct = extractFlexProps(cssContent, className)
  if (direct) return { className, extracted: direct }

  if (!className.startsWith('.')) return null
  const base = className.slice(1)
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const suffix of LAYOUT_SUFFIX_VARIANTS) {
    const variant = `${base}${suffix}`
    const variantRe = new RegExp(`\\.${escapedBase}${suffix}\\b(?![-\\w])`, 'm')
    const found = cssContent.match(variantRe)
    if (!found) continue
    // 唯一性校验：变体名只能出现一种后缀形态（-con 与 -container 前缀重叠，取首个命中即可，
    // 但同后缀多次出现仍允许——同一 class 多块本就罕见；跨后缀多命中视为歧义放弃）
    const extracted = extractFlexProps(cssContent, `.${variant}`)
    if (extracted) return { className: `.${variant}`, extracted }
  }
  return null
}

/**
 * 更新 CSS/LESS 中指定 class 的 display 和 flex-direction
 * @param {string} cssContent - CSS/LESS 内容
 * @param {string} className - class 名
 * @param {string} display - 新的 display 值
 * @param {string} flexDirection - 新的 flex-direction 值
 * @returns {string} 更新后的 CSS/LESS 内容
 */
function updateFlexProps(cssContent, className, display, flexDirection) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const classRegex = new RegExp(`(${escapedClass}\\s*\\{)([^}]*)(\\})`, 's')

  // 🛡️ 2026-09-22 · c-device-monitor-e2ad7497 实锤：
  //   grid 容器本无 flex 方向，fact.flexDirection 为 undefined 时，旧逻辑仍注入
  //   `flex-direction: undefined;`（非法值），浏览器丢弃整条声明且破坏布局。
  //   治本：只有合法 flex 方向（row/column/reverse）才注入；其余一律不写，
  //   并清掉可能存在的非法残留（undefined/null/NaN）。
  const hasValidDirection =
    typeof flexDirection === 'string' &&
    /^(row|column|row-reverse|column-reverse)$/.test(flexDirection.trim())

  return cssContent.replace(classRegex, (match, prefix, blockContent, suffix) => {
    let newBlock = blockContent

    // 更新或添加 display
    if (newBlock.match(/display\s*:/)) {
      newBlock = newBlock.replace(/display\s*:\s*[^;]+;/, `display: ${display};`)
    } else {
      newBlock = `  display: ${display};\n${newBlock}`
    }

    if (hasValidDirection) {
      // 更新或添加 flex-direction
      if (newBlock.match(/flex-direction\s*:/)) {
        newBlock = newBlock.replace(/flex-direction\s*:\s*[^;]+;/, `flex-direction: ${flexDirection};`)
      } else {
        // 在 display 后面插入
        newBlock = newBlock.replace(/(display\s*:\s*[^;]+;)/, `$1\n  flex-direction: ${flexDirection};`)
      }
    } else {
      // 🛡️ 无合法方向事实：绝不写 flex-direction: undefined；清掉历史/LLM 残留的非法值
      newBlock = newBlock.replace(/[ \t]*flex-direction\s*:\s*(?:undefined|null|NaN)\s*;?/g, '')
    }

    return prefix + newBlock + suffix
  })
}

/**
 * 🛡️ 网格事实注入（2026-09-22 · mc-1790058609462 实锤）：display:grid + grid-template-columns。
 * 与 updateFlexProps 不同：清掉 flex-direction（grid 无此概念），但**保留 gap**（网格卡间距
 * 是 Figma 真值，绝不能清——清 gap 会让卡片紧贴，与视觉真值「保留间距」矛盾）。
 */
function updateGridProps(cssContent, className, gridColumns) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const classRegex = new RegExp(`(${escapedClass}\\s*\\{)([^}]*)(\\})`, 's')
  return cssContent.replace(classRegex, (match, prefix, blockContent, suffix) => {
    let newBlock = blockContent
    // 幂等：已是 grid 且列数一致 → 不动
    const colsM = newBlock.match(/grid-template-columns\s*:\s*repeat\(\s*(\d+)/)
    if (/display\s*:\s*grid/.test(newBlock) && colsM && Number(colsM[1]) === gridColumns) {
      return match
    }
    // 清 flex 布局声明（保留 gap、padding、width 等）；同时清已有的 display:grid/display:flex，
    // 避免原块已是 grid 时追加后出现重复的 `display: grid;`。
    newBlock = newBlock
      .replace(/flex-direction\s*:\s*(row|column);?/g, '')
      .replace(/display\s*:\s*(flex|inline-flex|grid);?/g, '')
      .replace(/align-items\s*:\s*[^;]+;?/g, '')
      .replace(/justify-content\s*:\s*[^;]+;?/g, '')
    newBlock = newBlock.replace(/\s*$/, '')
    newBlock += `\n  display: grid;\n  grid-template-columns: repeat(${gridColumns}, 1fr);\n  grid-auto-rows: 1fr;`
    return prefix + newBlock + suffix
  })
}

/**
 * 根据布局事实注入 display/flex-direction
 * @param {string} cssContent - CSS/LESS 内容
 * @param {Object} layoutMapping - 布局映射表（className → {display, flexDirection}）
 * @param {Object} options - 选项
 * @param {boolean} options.forceOverride - 是否强制覆盖（即使已有值）
 * @param {Object} options.logger - 日志记录器
 * @returns {{content: string, fixes: Array<{code: string, className: string, detail: string}>}}
 */
export function injectLayoutFacts(cssContent, layoutMapping, options = {}) {
  const { forceOverride = false, logger = null } = options
  const fixes = []
  let content = cssContent

  for (const [className, fact] of Object.entries(layoutMapping)) {
    // 🛡️ R2 后缀变体匹配（2026-09-22）：.c-x-tabs 未命中时尝试 .c-x-tabs-section 等变体
    const matched = matchClassWithSuffixVariant(content, className)
    if (!matched) {
      // class（含变体）不存在，跳过
      continue
    }
    const effectiveClassName = matched.className
    const extracted = matched.extracted

    // 🛡️ 网格事实（2026-09-22 治本）：nodeLayoutFacts 几何聚类命中均匀网格 → 注入 grid，
    //   而非 flex-direction（side-by-side 判据对网格系统性误判 column）。
    if (fact.display === 'grid' && fact.gridColumns >= 2) {
      content = updateGridProps(content, effectiveClassName.slice(1), fact.gridColumns)
      fixes.push({
        code: 'LAYOUT-FACTS-INJECT',
        className: effectiveClassName,
        detail: `display: grid; grid-template-columns: repeat(${fact.gridColumns}, 1fr)（Figma 均匀网格 ${fact.gridColumns} 列）`,
      })
      if (logger) {
        logger.info(`🛡️ LAYOUT-FACTS-INJECT: ${effectiveClassName} → display:grid repeat(${fact.gridColumns},1fr)`)
      }
      continue
    }

    const { display, flexDirection } = extracted

    // 🛡️ grid 块保护（2026-09-22 · mc-1790042773505-32d00272 实锤）：
    // forceOverride 会把 LLM 正确写的 display:grid 强改成 flex（grid 是更强的
    // 布局事实——子节点已聚列成网格，flex-direction 对 grid 容器无意义）。
    // 块内含 grid-template-* 属性时：display 保留不动；flex-direction 不注入。
    const hasGridTemplate = /(^|[^@\w-])grid-template-(?:columns|rows|areas)\s*:/.test(
      extracted.blockContent || '',
    )
    if (hasGridTemplate) {
      continue
    }

    const needsDisplay = forceOverride || !display
    const needsFlexDirection = forceOverride || !flexDirection

    // 检查是否需要修复
    const displayMismatch = needsDisplay && display !== fact.display
    const flexDirectionMismatch = needsFlexDirection && flexDirection !== fact.flexDirection

    if (displayMismatch || flexDirectionMismatch) {
      const newDisplay = displayMismatch ? fact.display : display
      const newFlexDirection = flexDirectionMismatch ? fact.flexDirection : flexDirection

      content = updateFlexProps(content, effectiveClassName.slice(1), newDisplay, newFlexDirection)

      const fixDetail = []
      if (displayMismatch) {
        fixDetail.push(`display: ${display || '(缺失)'} → ${fact.display}`)
      }
      if (flexDirectionMismatch) {
        fixDetail.push(`flex-direction: ${flexDirection || '(缺失)'} → ${fact.flexDirection}`)
      }

      fixes.push({
        code: 'LAYOUT-FACTS-INJECT',
        className: effectiveClassName,
        detail: fixDetail.join(', ') + (effectiveClassName !== className ? `（R2 后缀变体：${className} → ${effectiveClassName}）` : ''),
      })

      if (logger) {
        logger.info(`🛡️ LAYOUT-FACTS-INJECT: ${effectiveClassName} ${fixDetail.join(', ')}`)
      }
    }
  }

  return { content, fixes }
}

/**
 * 从 nodeLayoutFacts 构建布局映射表
 * @param {Object} nodeLayoutFacts - 节点布局事实
 * @param {Object} figmaNodeData - Figma 节点数据
 * @param {string} componentName - 组件名
 * @returns {Object} 布局映射表（className → {display, flexDirection}）
 */
export function buildLayoutMapping(nodeLayoutFacts, figmaNodeData, componentName) {
  return buildNodeLayoutFactsReinforcement(nodeLayoutFacts, figmaNodeData, componentName, true)
}

/**
 * 处理所有样式文件（.vue 的 <style> 块和 .less 文件）
 * @param {Object} files - 文件映射表（filePath → content）
 * @param {Object} layoutMapping - 布局映射表
 * @param {Object} options - 选项
 * @returns {{fixedFiles: Object, fixes: Array}}
 */
export function processAllStyleFiles(files, layoutMapping, options = {}) {
  const { logger = null } = options
  const fixedFiles = {}
  const allFixes = []

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue

    let fileContent = content
    let fileFixes = []

    if (filePath.endsWith('.vue')) {
      // 处理 .vue 文件的 <style> 块
      const styleMatches = fileContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []
      
      for (const styleTag of styleMatches) {
        const bodyMatch = styleTag.match(/>([\s\S]*?)<\/style>/i)
        if (!bodyMatch) continue
        
        const styleBody = bodyMatch[1]
        const { content: updatedBody, fixes } = injectLayoutFacts(styleBody, layoutMapping, { 
          forceOverride: true, 
          logger 
        })
        
        if (fixes.length > 0) {
          fileContent = fileContent.replace(styleTag, styleTag.replace(styleBody, updatedBody))
          fileFixes.push(...fixes)
        }
      }
    } else if (filePath.endsWith('.less') || filePath.endsWith('.css')) {
      // 处理 .less/.css 文件
      const { content: updatedContent, fixes } = injectLayoutFacts(fileContent, layoutMapping, { 
        forceOverride: true, 
        logger 
      })
      
      if (fixes.length > 0) {
        fileContent = updatedContent
        fileFixes.push(...fixes)
      }
    }

    // 🛡️ 全局收口：清除任何遗漏的非法 CSS 值（undefined/null/NaN）。
    //   注入器已按事实取值，但 LLM 产物仍可能残留哨兵串，最终产物层面兜底一次。
    fileContent = stripIllegalCssValues(fileContent)

    if (fileFixes.length > 0 || fileContent !== content) {
      fixedFiles[filePath] = fileContent
      allFixes.push(...fileFixes.map(f => ({
        ...f,
        filePath,
      })))
    }
  }

  return { fixedFiles, fixes: allFixes }
}

export default {
  injectLayoutFacts,
  buildLayoutMapping,
  processAllStyleFiles,
}

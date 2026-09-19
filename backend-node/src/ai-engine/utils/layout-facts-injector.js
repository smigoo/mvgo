/**
 * 🛡️ 布局事实直接注入器（2026-09-19 治本）
 * 
 * 根据 nodeLayoutFacts 直接注入 display/flex-direction，覆盖 LLM 生成的值。
 * 解决两个问题：
 * 1. 后处理方向纠正：检测并纠正错误的 flex-direction
 * 2. 布局事实直接注入：不让 LLM 写 display/flex-direction，后处理根据约束直接注入
 */

import { buildNodeLayoutFactsReinforcement } from './constraint-reinforcement.js'

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
  
  return cssContent.replace(classRegex, (match, prefix, blockContent, suffix) => {
    let newBlock = blockContent
    
    // 更新或添加 display
    if (newBlock.match(/display\s*:/)) {
      newBlock = newBlock.replace(/display\s*:\s*[^;]+;/, `display: ${display};`)
    } else {
      newBlock = `  display: ${display};\n${newBlock}`
    }
    
    // 更新或添加 flex-direction
    if (newBlock.match(/flex-direction\s*:/)) {
      newBlock = newBlock.replace(/flex-direction\s*:\s*[^;]+;/, `flex-direction: ${flexDirection};`)
    } else {
      // 在 display 后面插入
      newBlock = newBlock.replace(/(display\s*:\s*[^;]+;)/, `$1\n  flex-direction: ${flexDirection};`)
    }
    
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
    const extracted = extractFlexProps(content, className)
    
    if (!extracted) {
      // class 不存在，跳过
      continue
    }

    const { display, flexDirection } = extracted
    const needsDisplay = forceOverride || !display
    const needsFlexDirection = forceOverride || !flexDirection

    // 检查是否需要修复
    const displayMismatch = needsDisplay && display !== fact.display
    const flexDirectionMismatch = needsFlexDirection && flexDirection !== fact.flexDirection

    if (displayMismatch || flexDirectionMismatch) {
      const newDisplay = displayMismatch ? fact.display : display
      const newFlexDirection = flexDirectionMismatch ? fact.flexDirection : flexDirection
      
      content = updateFlexProps(content, className, newDisplay, newFlexDirection)
      
      const fixDetail = []
      if (displayMismatch) {
        fixDetail.push(`display: ${display || '(缺失)'} → ${fact.display}`)
      }
      if (flexDirectionMismatch) {
        fixDetail.push(`flex-direction: ${flexDirection || '(缺失)'} → ${fact.flexDirection}`)
      }
      
      fixes.push({
        code: 'LAYOUT-FACTS-INJECT',
        className,
        detail: fixDetail.join(', '),
      })
      
      if (logger) {
        logger.info(`🛡️ LAYOUT-FACTS-INJECT: ${className} ${fixDetail.join(', ')}`)
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

    if (fileFixes.length > 0) {
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

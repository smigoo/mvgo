/**
 * Component Assembler - 组件组装器
 * 职责：将各智能体输出组装成最终的Vue组件代码（零臆造）
 * 输入：Data Agent结果 + Style Agent结果 + resourceDomMapping
 * 输出：完整的Vue组件文件
 */

import { createLogger } from '../logger/index.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const logger = createLogger({ name: 'component-assembler' })

export class ComponentAssembler {
  /**
   * 组装组件
   */
  async assemble(input) {
    const {
      componentName,
      dataAgentResult,
      styleAgentResult,
      resourceDomMapping,
      layoutStructure,
      outputPath
    } = input

    // 🔍 调试：查看接收到的layoutStructure
    logger.info('🔍 assemble接收到的数据', {
      hasLayoutStructure: !!layoutStructure,
      layoutStructureKeys: Object.keys(layoutStructure || {}),
      hasBody: !!(layoutStructure?.body),
      bodyKeys: Object.keys(layoutStructure?.body || {})
    })

    logger.info('开始组装组件', { componentName })

    try {
      // 1. 生成import语句
      const imports = this.generateImports(dataAgentResult, resourceDomMapping)

      // 2. 生成data部分
      const dataSection = this.generateDataSection(dataAgentResult, resourceDomMapping)

      // 3. 生成CSS样式
      const styles = this.generateStyles(styleAgentResult, layoutStructure)

      // 4. 生成模板
      const template = this.generateTemplate(dataAgentResult, layoutStructure)

      // 5. 组装最终代码
      const vueCode = this.assembleVueFile({
        imports,
        dataSection,
        template,
        styles
      })

      const files = {
        'package/index.vue': vueCode
      }

      // 6. 写入文件到磁盘
      const writtenFiles = this.writeFiles(files, outputPath)

      logger.info('✅ 组件组装成功')

      return {
        files,
        writtenFiles
      }

    } catch (error) {
      logger.error('组件组装失败', { error: error.message })
      throw error
    }
  }

  /**
   * 清理文件内容中的 markdown 代码围栏
   */
  _sanitizeFileContent(content) {
    if (!content || typeof content !== 'string') return content

    // 去除开头的 markdown 代码围栏（``` 或 ```less 等）
    let sanitized = content.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')

    // 去除结尾的 markdown 代码围栏（单独成行的 ```）
    sanitized = sanitized.replace(/\n?\s*```\s*$/g, '')

    // 去除中间可能出现的独立 markdown 围栏行（整行只有 ``` 或 ```lang）
    sanitized = sanitized.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')

    return sanitized.trim()
  }

  /**
   * 写入文件到磁盘
   */
  writeFiles(files, outputPath) {
    const writtenPaths = []

    Object.entries(files).forEach(([relativePath, content]) => {
      const fullPath = join(outputPath, relativePath)
      const dir = dirname(fullPath)

      // 创建目录
      mkdirSync(dir, { recursive: true })

      // 写入文件（清理 markdown 围栏）
      const sanitizedContent = this._sanitizeFileContent(content)
      writeFileSync(fullPath, sanitizedContent, 'utf-8')
      writtenPaths.push(fullPath)

      logger.info(`📝 文件已写入: ${relativePath}`)
    })

    return writtenPaths
  }

  /**
   * 生成import语句
   */
  generateImports(dataAgentResult, resourceDomMapping) {
    const imports = ["import { ref } from 'vue'"]

    // 🆕 仅使用成功下载的资源
    const available = (resourceDomMapping || []).filter(m => m.downloadStatus === 'success')

    if (available.length === 0) {
      return imports
    }

    // 生成资源import（仅可用资源）
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    const bgMappings = available.filter(m => m.previewAnalysisRole === 'bg')
    const imgMappings = available.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

    // 提取data中使用的iconIndex
    const usedIconIndexes = new Set()
    if (dataAgentResult?.data && Array.isArray(dataAgentResult.data)) {
      dataAgentResult.data.forEach(item => {
        if (item.iconIndex) {
          usedIconIndexes.add(item.iconIndex)
        }
      })
    }

    // 只导入实际使用的icon
    usedIconIndexes.forEach(index => {
      const mapping = iconMappings[index - 1] // iconIndex从1开始
      if (mapping && mapping.resourceFile) {
        imports.push(`import icon${index} from '${mapping.resourceFile}'`)
      }
    })

    // 导入所有bg资源
    bgMappings.forEach((mapping, index) => {
      if (mapping.resourceFile) {
        imports.push(`import bg${index + 1} from '${mapping.resourceFile}'`)
      }
    })

    // 导入所有img资源
    imgMappings.forEach((mapping, index) => {
      if (mapping.resourceFile) {
        imports.push(`import img${index + 1} from '${mapping.resourceFile}'`)
      }
    })

    return imports
  }

  /**
   * 生成data部分
   */
  generateDataSection(dataAgentResult, resourceDomMapping) {
    if (!dataAgentResult || !dataAgentResult.data) {
      return 'const data = ref([])'
    }

    // 🆕 仅使用成功下载的icon资源
    const available = (resourceDomMapping || []).filter(m => m.downloadStatus === 'success')
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')

    // 将iconIndex转换为实际的icon变量
    const dataItems = dataAgentResult.data.map(item => {
      const newItem = { ...item }
      if (item.iconIndex && iconMappings[item.iconIndex - 1]) {
        newItem.icon = `icon${item.iconIndex}` // 变量名，不加引号
        delete newItem.iconIndex
      }
      return newItem
    })

    // 生成代码字符串
    const dataStr = JSON.stringify(dataItems, null, 2)
      .replace(/"icon":\s*"(icon\d+)"/g, '"icon": $1') // 移除icon变量的引号，支持空格

    return `const data = ref(${dataStr})`
  }

  /**
   * 生成CSS样式
   */
  generateStyles(styleAgentResult, layoutStructure) {
    const styleLines = []

    // 🔍 调试：检查layoutStructure
    logger.info('🔍 generateStyles接收到的layoutStructure', {
      hasLayoutStructure: !!layoutStructure,
      layoutStructureKeys: Object.keys(layoutStructure || {}),
      hasBody: !!(layoutStructure?.body),
      hasSections: !!(layoutStructure?.sections),
      bodyLayout: layoutStructure?.body?.layout
    })

    // 🆕 第一步：生成基础布局CSS（必须先生成，确保布局正确）
    // 兼容多种数据结构：
    // 1. section有body属性：使用section.body
    // 2. section有layout+items属性：使用section本身作为bodyData
    // 3. 使用layoutStructure.body
    let bodyData = null
    if (layoutStructure?.sections && Array.isArray(layoutStructure.sections)) {
      // 优先找有body属性的section
      const sectionWithBody = layoutStructure.sections.find(s => s.body)
      if (sectionWithBody) {
        bodyData = sectionWithBody.body
      } else {
        // 找有layout和items属性的section（扁平结构）
        const sectionWithLayout = layoutStructure.sections.find(s => s.layout && s.items)
        if (sectionWithLayout) {
          bodyData = sectionWithLayout  // 直接使用section作为bodyData
        }
      }
    } else {
      bodyData = layoutStructure?.body || {}
    }

    if (bodyData && bodyData.layout) {
      // 🔧 兼容layout对象和字符串两种格式
      const bodyLayout = typeof bodyData.layout === 'object'
        ? bodyData.layout.direction
        : bodyData.layout
      const layoutStr = bodyLayout || 'vertical'
      const isHorizontal = typeof layoutStr === 'string' && layoutStr.includes('horizontal')

      // .body 容器的基础布局
      styleLines.push('.body {')
      styleLines.push('  display: flex;')
      styleLines.push('  gap: 20px;')
      styleLines.push('  padding: 20px;')
      if (isHorizontal) {
        styleLines.push('  flex-direction: row;')
        styleLines.push('  justify-content: space-around;')
        styleLines.push('  align-items: center;')
      } else {
        styleLines.push('  flex-direction: column;')
      }
      styleLines.push('}')
      styleLines.push('')

      // .item 的基础布局
      styleLines.push('.item {')
      styleLines.push('  display: flex;')
      styleLines.push('  flex-direction: column;')
      styleLines.push('  align-items: center;')
      styleLines.push('  gap: 10px;')
      styleLines.push('}')
      styleLines.push('')

      // 🆕 .item-container 的基础布局（item的内部容器）
      styleLines.push('.item-container {')
      styleLines.push('  display: flex;')
      styleLines.push('  gap: 10px;')
      styleLines.push('  align-items: center;')
      styleLines.push('}')
      styleLines.push('')
      styleLines.push('.item-container.horizontal {')
      styleLines.push('  flex-direction: row;')
      styleLines.push('}')
      styleLines.push('')
      styleLines.push('.item-container.vertical {')
      styleLines.push('  flex-direction: column;')
      styleLines.push('}')
      styleLines.push('')

      // 🆕 动态分析textAlign，设置对应的align-items
      const detectTextAlign = (items) => {
        if (!items || !Array.isArray(items)) return 'left'

        // 遍历所有items，收集textAlign值
        const alignments = []
        items.forEach(item => {
          if (item.content && item.content.elements) {
            item.content.elements.forEach(el => {
              if (el.style && el.style.textAlign) {
                alignments.push(el.style.textAlign)
              }
            })
          }
        })

        // 如果所有元素的textAlign一致，返回该值；否则返回'left'作为默认值
        const uniqueAligns = [...new Set(alignments)]
        return uniqueAligns.length === 1 ? uniqueAligns[0] : 'left'
      }

      const detectedAlign = detectTextAlign(bodyData.items)
      const alignItemsValue = detectedAlign === 'center' ? 'center'
                            : detectedAlign === 'right' ? 'flex-end'
                            : 'flex-start'

      // .content 的基础布局
      styleLines.push('.content {')
      styleLines.push('  display: flex;')
      styleLines.push('  gap: 5px;')
      styleLines.push('}')
      styleLines.push('')
      styleLines.push('.content.vertical {')
      styleLines.push('  flex-direction: column;')
      styleLines.push(`  align-items: ${alignItemsValue};`)
      styleLines.push('}')
      styleLines.push('')
      styleLines.push('.content.horizontal {')
      styleLines.push('  flex-direction: row;')
      styleLines.push('  align-items: center;')
      styleLines.push('}')
      styleLines.push('')

      // 🆕 icon的光效样式（默认值，可被inline style覆盖）
      styleLines.push('.icon {')
      styleLines.push('  display: block;')
      styleLines.push('  object-fit: contain;')
      styleLines.push('}')
      styleLines.push('')

      // 🆕 bg-container的背景样式（默认值）
      styleLines.push('.bg-container {')
      styleLines.push('  background-size: cover;')
      styleLines.push('  background-position: center;')
      styleLines.push('  background-repeat: no-repeat;')
      styleLines.push('}')
      styleLines.push('')
    }

    // 第二步：生成Style Agent的装饰性CSS
    if (!styleAgentResult || !styleAgentResult.cssRules || styleAgentResult.cssRules.length === 0) {
      return styleLines.join('\n')
    }

    styleAgentResult.cssRules.forEach(rule => {
      const selector = rule.selector || ''

      // 🔧 特殊处理 @keyframes 规则
      if (selector.startsWith('@keyframes')) {
        styleLines.push(`${selector} {`)
        // keyframes 内部的每个属性（如 "0%", "50%", "100%"）都是一个独立的块
        Object.entries(rule.properties).forEach(([percentage, frames]) => {
          styleLines.push(`  ${percentage} {`)
          if (typeof frames === 'object' && frames !== null) {
            Object.entries(frames).forEach(([prop, value]) => {
              const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase()
              styleLines.push(`    ${cssProp}: ${value};`)
            })
          }
          styleLines.push(`  }`)
        })
        styleLines.push('}')
        styleLines.push('')
        return
      }

      // 普通CSS规则
      styleLines.push(`${selector} {`)
      Object.entries(rule.properties).forEach(([prop, value]) => {
        // 如果value是对象，递归处理
        if (typeof value === 'object' && value !== null) {
          styleLines.push(`  ${prop} {`)
          Object.entries(value).forEach(([nestedProp, nestedValue]) => {
            const cssProp = nestedProp.replace(/([A-Z])/g, '-$1').toLowerCase()
            styleLines.push(`    ${cssProp}: ${nestedValue};`)
          })
          styleLines.push(`  }`)
        } else {
          // 将驼峰命名转换为短横线命名
          const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase()
          styleLines.push(`  ${cssProp}: ${value};`)
        }
      })
      styleLines.push('}')
      styleLines.push('')
    })

    return styleLines.join('\n')
  }

  /**
   * 🆕 生成header插槽模板
   */
  generateHeaderTemplate(headerData) {
    if (!headerData) return ''

    const title = headerData.text || headerData.title || ''
    const controls = headerData.controls || []
    const hasIcon = headerData.hasIcon || false

    if (!title && controls.length === 0 && !hasIcon) return ''

    // 🆕 应用header的style属性（background、borderBottom等）
    const headerStyle = this.styleObjToString(headerData.style || {})
    let template = `  <div class="header"${headerStyle}>\n`

    // 左侧：装饰图标（如果有）
    if (hasIcon) {
      template += `    <div class="header-left">\n`
      template += `      <div class="header-icon"></div>\n`
      template += `    </div>\n`
    }

    // 中间：标题
    if (title) {
      template += `    <h2 class="title">${title}</h2>\n`
    }

    // 右侧：控件（dropdown、tabs等）
    if (controls.length > 0) {
      template += `    <div class="header-right">\n`
      controls.forEach(control => {
        const role = control.role || 'button'
        const value = control.value || control.name || ''
        if (role === 'dropdown') {
          template += `      <div class="control-dropdown">${value}</div>\n`
        } else if (role === 'tab-switch') {
          template += `      <div class="control-tabs">${value}</div>\n`
        } else {
          template += `      <div class="control-item">${value}</div>\n`
        }
      })
      template += `    </div>\n`
    }

    template += `  </div>\n`
    return template
  }

  /**
   * 🆕 生成多section模板
   */
  generateMultiSectionTemplate(sections, dataAgentResult, layoutStructure) {
    // 标准面板架构：sections总是从上到下堆叠（body内部）
    let template = `<div class="sections-container">\n`

    // 遍历每个section，各自使用自己的布局
    sections.forEach((section, index) => {
      const bodyData = section.body || {}
      const headerData = section.header || {}

      // 每个section的布局方向
      let sectionLayout = bodyData?.layout
      if (typeof sectionLayout === 'string') {
        sectionLayout = sectionLayout
      } else if (typeof sectionLayout === 'object') {
        sectionLayout = sectionLayout?.direction || 'vertical'
      } else {
        sectionLayout = 'vertical'
      }

      const sectionClass = sectionLayout.includes('horizontal') ? 'section horizontal' : 'section vertical'
      template += `  <div class="${sectionClass}">\n`

      // 标题
      const headerText = headerData?.text || headerData?.title || ''
      if (headerText) {
        template += `    <div class="header"><h2 class="title">${headerText}</h2></div>\n`
      }

      // 内容
      template += `    <div class="body">\n`
      template += `      <div v-for="(item, idx) in data" :key="idx" class="item">\n`
      template += `        <span class="label">{{ item.label }}</span>\n`
      template += `        <span class="value">{{ item.value }}</span>\n`
      template += `      </div>\n`
      template += `    </div>\n`
      template += `  </div>\n`
    })

    template += '</div>'
    return template
  }

  /**
   * 🆕 生成详细的items结构模板（v2.0）
   */
  generateDetailedTemplate(section, dataAgentResult) {
    // 🔧 兼容layout对象和字符串两种格式
    const layoutData = section.body?.layout || 'horizontal'
    const bodyLayout = typeof layoutData === 'object' ? layoutData.direction : layoutData
    const items = section.body?.items || []

    // 🔍 调试日志
    logger.info('generateDetailedTemplate调用', {
      bodyLayout,
      hasItems: items.length > 0,
      sectionBodyKeys: Object.keys(section.body || {})
    })

    let template = '<div class="component-container">\n'

    // 🆕 生成header（使用新的插槽方法）
    template += this.generateHeaderTemplate(section.header)

    // 生成body容器（根据布局方向添加对应class）
    const bodyClass = bodyLayout.includes('horizontal') ? 'body horizontal' : 'body vertical'
    template += `  <div class="${bodyClass}">\n`

    // 遍历每个item，生成对应的HTML结构
    template += `    <div v-for="(item, index) in data" :key="index" class="item">\n`

    // 🆕 使用递归方法生成item内部结构（基于Visual Parser的分析结果）
    if (items.length > 0) {
      const firstItem = items[0]
      const itemContent = this.generateItemTemplate(firstItem, '      ')
      template += itemContent + '\n'
    }

    template += `    </div>\n`
    template += `  </div>\n`
    template += '</div>'

    return template
  }

  /**
   * 🆕 将样式对象转换为style属性字符串
   * @param {Object} styleObj - 样式对象 {fontSize: 'large', color: '#fff'}
   * @returns {String} - style="font-size: large; color: #fff;"
   */
  styleObjToString(styleObj) {
    if (!styleObj || typeof styleObj !== 'object') return ''

    const stylePairs = []
    Object.entries(styleObj).forEach(([key, value]) => {
      // 转换驼峰命名为CSS属性名
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      stylePairs.push(`${cssKey}: ${value}`)
    })

    return stylePairs.length > 0 ? ` style="${stylePairs.join('; ')}"` : ''
  }

  /**
   * 🆕 递归生成item的内部结构（零硬编码）
   * @param {Object} itemStructure - item的结构定义（来自Visual Parser）
   * @param {String} indent - 缩进字符串
   * @returns {String} - 生成的HTML模板
   */
  generateItemTemplate(itemStructure, indent = '      ') {
    if (!itemStructure) return ''

    const lines = []

    // 🔧 兼容layout对象和字符串
    const layoutData = itemStructure.layout
    const layout = typeof layoutData === 'object' ? layoutData.direction : (layoutData || 'vertical')
    const itemClass = typeof layout === 'string' && layout.includes('horizontal')
      ? 'item-container horizontal'
      : 'item-container vertical'

    // 生成item容器
    lines.push(`${indent}<div class="${itemClass}">`)

    // 🆕 兼容新旧两种JSON结构
    // 新结构：itemStructure.elements = [{type: "icon"}, {type: "content"}]
    // 旧结构：itemStructure.icon / itemStructure.content

    let iconData = null
    let contentData = null

    if (itemStructure.elements && Array.isArray(itemStructure.elements)) {
      // 新结构：从elements数组中提取
      iconData = itemStructure.elements.find(el => el.type === 'icon')
      contentData = itemStructure.elements.find(el => el.type === 'content')
    } else {
      // 旧结构：直接使用
      iconData = itemStructure.icon
      contentData = itemStructure.content
    }

    // 处理icon
    if (iconData) {
      const iconPosition = iconData.position || 'left'
      // 合并icon的所有样式属性：width/height + style对象
      const iconStyleObj = {
        ...(iconData.width && { width: iconData.width }),
        ...(iconData.height && { height: iconData.height }),
        ...(iconData.style || {})
      }
      const iconStyle = this.styleObjToString(iconStyleObj)
      lines.push(`${indent}  <img v-if="item.icon" :src="item.icon" class="icon icon-${iconPosition}"${iconStyle} />`)
    }

    // 处理content区域（递归处理elements）
    if (contentData) {
      const contentLayoutData = contentData.layout
      const contentLayout = typeof contentLayoutData === 'object'
        ? contentLayoutData.direction
        : (contentLayoutData || 'vertical')
      const contentClass = contentLayout === 'vertical' ? 'content vertical' : 'content horizontal'
      lines.push(`${indent}  <div class="${contentClass}">`)

      // 遍历content中的elements
      const elements = contentData.elements || []
      elements.forEach(element => {
        const elementStyle = this.styleObjToString(element.style)

        if (element.type === 'label') {
          lines.push(`${indent}    <span class="label"${elementStyle}>{{ item.label }}</span>`)
        } else if (element.type === 'value') {
          // 🆕 支持parts数组（多段样式）或整体text
          if (element.parts && Array.isArray(element.parts)) {
            // 多段样式：渲染每个part为独立span
            const partsHtml = element.parts.map((part, partIndex) => {
              const partStyle = this.styleObjToString(part.style)
              return `<span class="value-part"${partStyle}>${part.text}</span>`
            }).join('')
            lines.push(`${indent}    ${partsHtml}`)
          } else {
            // 整体样式：使用item.value
            lines.push(`${indent}    <span class="value"${elementStyle}>{{ item.value }}</span>`)
          }
        }
      })

      lines.push(`${indent}  </div>`)
    }

    lines.push(`${indent}</div>`)
    return lines.join('\n')
  }

  /**
   * 生成模板
   */
  generateTemplate(dataAgentResult, layoutStructure) {
    if (!dataAgentResult || !dataAgentResult.data || dataAgentResult.data.length === 0) {
      return '<div class="container">暂无数据</div>'
    }

    // 🆕 支持多section场景
    const sections = layoutStructure?.sections

    // 🔧 检查是否是标准的header+content结构
    let headerData = null
    let bodyData = null

    if (sections && Array.isArray(sections)) {
      // 🔍 详细调试日志
      logger.info('🔍 sections数组调试', {
        sectionsLength: sections.length,
        firstSectionKeys: sections[0] ? Object.keys(sections[0]) : [],
        hasTypeProperty: sections.some(s => s.type),
        hasHeaderProperty: sections.some(s => s.header),
        hasBodyProperty: sections.some(s => s.body)
      })

      // 🆕 兼容两种JSON结构
      // 结构1（旧）: sections = [{type: "header", ...}, {type: "body", ...}]
      // 结构2（新）: sections = [{header: {...}, body: {...}}]

      // 尝试旧结构
      let headerSection = sections.find(s => s.type === 'header')
      let contentSection = sections.find(s => s.type === 'content' || s.type === 'body')

      // 尝试新结构
      if (!headerSection && !contentSection && sections.length === 1 && sections[0].header && sections[0].body) {
        logger.info('✅ 识别到新结构（单对象包含header+body）')
        headerData = sections[0].header
        bodyData = sections[0].body
      }
      // 旧结构：标准的header + content/body
      else if (headerSection && contentSection && sections.length === 2) {
        logger.info('✅ 识别到旧结构（两个对象分别为header和body）')
        headerData = headerSection.content || headerSection
        bodyData = contentSection
      }
      // 非标准多section结构
      else if (sections.length > 1) {
        logger.info('⚠️ 非标准多section结构，使用generateMultiSectionTemplate', {
          reason: !headerSection && !contentSection ? '无法识别header/body结构' :
                  !headerSection ? 'headerSection不存在' :
                  !contentSection ? 'contentSection不存在' :
                  `sections.length=${sections.length}而非2`
        })
        return this.generateMultiSectionTemplate(sections, dataAgentResult, layoutStructure)
      }
    }

    // 🔧 兼容多种数据结构（单section或扁平结构）
    if (!bodyData) {
      const section = sections?.[0] || {}
      bodyData = section.body || layoutStructure?.body || {}
    }
    if (!headerData) {
      const section = sections?.[0] || {}
      headerData = section.header || layoutStructure?.header || {}
    }

    // 🔍 调试日志
    logger.info('🔍 generateTemplate数据检查', {
      hasSections: !!sections,
      sectionsLength: sections?.length || 0,
      hasBodyData: !!bodyData,
      bodyDataKeys: Object.keys(bodyData || {}),
      hasBodyItems: !!(bodyData?.items),
      bodyItemsLength: bodyData?.items?.length || 0,
      bodyLayout: bodyData?.layout
    })

    // 🆕 检查是否有详细的items结构（v2.0）
    const hasDetailedItems = bodyData?.items && Array.isArray(bodyData.items)

    // 如果有详细items结构，使用新的生成逻辑
    if (hasDetailedItems) {
      logger.info('✅ 使用generateDetailedTemplate分支')
      return this.generateDetailedTemplate({ body: bodyData, header: headerData }, dataAgentResult)
    }

    logger.info('⚠️ 使用简化逻辑分支')

    // 否则使用原有的简化逻辑
    const hasIcons = dataAgentResult.data.some(item => item.icon || item.iconIndex)
    const headerText = headerData?.text || headerData?.title || ''

    // 🔧 兼容layout字段为字符串或对象的情况
    const layoutData = bodyData?.layout
    let bodyLayout
    if (typeof layoutData === 'string') {
      bodyLayout = layoutData
    } else if (typeof layoutData === 'object') {
      bodyLayout = layoutData?.direction || 'vertical'
    } else {
      bodyLayout = 'vertical'
    }
    const isHorizontal = bodyLayout.includes('horizontal')

    let template = '<div class="component-container">\n'

    // 🆕 生成header（支持插槽）
    template += this.generateHeaderTemplate(headerData)

    // 生成内容区域
    const bodyClass = isHorizontal ? 'body horizontal' : 'body vertical'
    template += `  <div class="${bodyClass}">\n`
    template += `    <div v-for="(item, index) in data" :key="index" class="item">\n`
    if (hasIcons) {
      template += `      <img v-if="item.icon" :src="item.icon" class="icon" />\n`
    }
    template += `      <span class="label">{{ item.label }}</span>\n`
    template += `      <span class="value">{{ item.value }}</span>\n`
    template += `    </div>\n`
    template += `  </div>\n`
    template += '</div>'

    return template
  }

  /**
   * 组装Vue文件
   */
  assembleVueFile({ imports, dataSection, template, styles }) {
    return `<template>
${template}
</template>

<script setup>
${imports.join('\n')}

${dataSection}
</script>

<style scoped>
${styles}
</style>
`
  }
}

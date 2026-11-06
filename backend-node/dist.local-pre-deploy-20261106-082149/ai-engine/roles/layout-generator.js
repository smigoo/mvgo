/**
 * 布局代码生成器 Role
 *
 * 职责：基于 Figma 布局分析结果，生成 Vue 3 布局组件代码。
 * 不是 AI Role——这是一个纯代码生成器，将结构化布局描述编译为代码文件。
 *
 * 输入：{ layoutAnalysis, assetMapping, outputDir }
 * 输出：生成的 Vue 文件列表
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { RESPONSIVE_RULES } from '../config/figma-layout-config.js'

const logger = createLogger({ name: 'role:layout-generator' })

export class LayoutGenerator {
  constructor(config = {}) {
    this.config = config
  }

  /**
   * 执行布局代码生成
   * @param {Object} params
   * @param {Object} params.layoutAnalysis - 布局分析结果（来自 FigmaLayoutAnalyzerAgent）
   * @param {Object} params.assetMapping - 资源映射 { nodeId: fileName }
   * @param {string} params.outputDir - 输出目录
   * @param {Function} params.progressCallback - 进度回调
   * @returns {Object} { files, summary }
   */
  async execute(params) {
    const { layoutAnalysis, assetMapping = {}, outputDir, progressCallback } = params

    logger.info('开始生成布局代码', { outputDir })

    const files = []
    const { page, layout, assets = [] } = layoutAnalysis
    const responsive = page.responsive

    // 1. 确保输出目录
    mkdirSync(outputDir, { recursive: true })

    // 2. 收集组件列表（遍历 layout zones）
    const components = this.collectComponents(layout)
    const totalFiles = 1 + components.length + 1 // index.vue + 组件 + index.js

    // 3. 生成子组件
    let fileIndex = 0
    progressCallback?.({ stage: 'generate-code', message: `[1/${totalFiles}] 生成子组件...` })

    const componentDir = join(outputDir, 'components')
    mkdirSync(componentDir, { recursive: true })

    for (const comp of components) {
      fileIndex++
      progressCallback?.({ stage: 'generate-code', message: `[${fileIndex}/${totalFiles}] 生成组件: ${comp.name}` })

      const code = this.generateComponentCode(comp, responsive, assetMapping, layoutAnalysis)
      const filePath = join(componentDir, `${comp.name}.vue`)
      writeFileSync(filePath, code, 'utf-8')
      files.push({ name: `${comp.name}.vue`, path: filePath, type: 'component' })
    }

    // 4. 生成主布局 index.vue
    fileIndex++
    progressCallback?.({ stage: 'generate-code', message: `[${fileIndex}/${totalFiles}] 生成主布局: index.vue` })

    const mainLayoutCode = this.generateMainLayoutCode(page, layout, components, responsive, assetMapping, layoutAnalysis)
    const mainLayoutPath = join(outputDir, 'index.vue')
    writeFileSync(mainLayoutPath, mainLayoutCode, 'utf-8')
    files.push({ name: 'index.vue', path: mainLayoutPath, type: 'layout' })

    // 5. 生成组件导出文件 components/index.js
    fileIndex++
    progressCallback?.({ stage: 'generate-code', message: `[${fileIndex}/${totalFiles}] 生成组件导出: index.js` })

    const exportCode = this.generateExportFile(components)
    const exportPath = join(componentDir, 'index.js')
    writeFileSync(exportPath, exportCode, 'utf-8')
    files.push({ name: 'index.js', path: exportPath, type: 'export' })

    logger.info('布局代码生成完成', { totalFiles, componentCount: components.length })

    return {
      files,
      summary: {
        totalFiles: files.length,
        componentCount: components.length,
        outputDir
      }
    }
  }

  /**
   * 从布局结构中收集所有组件节点
   */
  collectComponents(node, collected = []) {
    if (!node) return collected

    if (node.type === '组件' || node.type === '模块') {
      collected.push(node)
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectComponents(child, collected)
      }
    }

    return collected
  }

  /**
   * 生成组件代码（只包含容器结构，不含内部业务逻辑）
   */
  generateComponentCode(comp, responsive = false, assetMapping = {}) {
    const cssClass = comp.cssClass || this.toCssClass(comp.name)
    const rawName = comp.fullName || comp.name

    // 获取背景图（如果子节点中有背景元素）
    let backgroundImageStyle = ''
    if (comp.children) {
      const bgNode = comp.children.find(c =>
        c.type === '背景元素' || c.type === '背景样式'
      )
      if (bgNode && bgNode.id && assetMapping[bgNode.id]) {
        backgroundImageStyle = `  background-image: url('../assets/images/${assetMapping[bgNode.id]}');\n`
        backgroundImageStyle += '  background-size: cover;\n'
        backgroundImageStyle += '  background-repeat: no-repeat;\n'
        backgroundImageStyle += '  background-position: center;\n'
      }
    }

    // 尺寸
    let widthStyle = '  width: 100%;\n'
    let heightStyle = ''
    if (comp.responsiveSize) {
      heightStyle = `  height: ${comp.responsiveSize.height};\n`
    } else if (comp.size) {
      if (responsive) {
        const vh = ((comp.size.h / RESPONSIVE_RULES.designSize.height) * 100).toFixed(2)
        heightStyle = `  height: ${vh}vh;\n`
      } else {
        heightStyle = `  height: ${comp.size.h}px;\n`
      }
    }

    // 背景色
    let bgColorStyle = ''
    if (comp.bgColor) {
      bgColorStyle = `  background-color: ${comp.bgColor};\n`
    }

    return `<template>
  <!-- ${rawName} -->
  <div class="${cssClass}">
    <!-- 组件内容由业务代码实现 -->
    <slot />
  </div>
</template>

<style lang="less" scoped>
.${cssClass} {
${widthStyle}${heightStyle}${bgColorStyle}${backgroundImageStyle}}
</style>
`
  }

  /**
   * 生成主布局 index.vue
   */
  generateMainLayoutCode(page, layout, components, responsive, assetMapping, layoutAnalysis) {
    const pageCssClass = page.cssClass || this.toCssClass(page.name)
    const rawName = page.name

    // 收集所有组件导入
    const imports = components
      .map(c => `import ${c.name} from './components/${c.name}.vue'`)
      .join('\n')

    // 渲染布局 HTML
    const childrenHtml = this.renderZoneHtml(layout, responsive, assetMapping, layoutAnalysis, 1)

    // 页面样式
    let pageStyles = ''
    if (responsive) {
      pageStyles = `  width: 100vw;\n  height: 100vh;\n`
    } else {
      pageStyles = `  width: ${page.designWidth}px;\n  height: ${page.designHeight}px;\n`
    }
    if (page.backgroundColor) {
      pageStyles += `  background-color: ${page.backgroundColor};\n`
    }
    pageStyles += '  overflow: hidden;\n  position: relative;\n'

    // 容器样式（递归收集）
    const containerStyles = this.renderZoneStyles(layout, responsive, assetMapping, layoutAnalysis, '')

    return `<template>
  <!-- ${rawName} -->
  <div class="${pageCssClass}">
${childrenHtml}  </div>
</template>

<script setup>
${imports}
</script>

<style lang="less" scoped>
.${pageCssClass} {
${pageStyles}}

${containerStyles}</style>
`
  }

  /**
   * 递归渲染区域 HTML
   */
  renderZoneHtml(node, responsive, assetMapping, layoutAnalysis, indentLevel) {
    if (!node) return ''

    const indent = '  '.repeat(indentLevel)
    const cssClass = node.cssClass || this.toCssClass(node.name)
    const rawName = node.fullName || node.name

    if (node.type === '组件' || node.type === '模块') {
      return `${indent}<${node.name} />\n`
    }

    if (node.type === '容器') {
      // 检查是否有图标子节点
      let html = `${indent}<!-- ${rawName} -->\n`

      // 确定语义化标签
      let tag = 'div'
      const name = node.name?.toLowerCase() || ''
      if (name.includes('header') || name.includes('头部')) tag = 'header'
      else if (name.includes('sidebar') || name.includes('侧边栏') || name.includes('左边栏') || name.includes('右边栏')) tag = 'aside'
      else if (name.includes('main') || name.includes('主内容')) tag = 'main'
      else if (name.includes('section') || name.includes('中间')) tag = 'section'
      else if (name.includes('footer') || name.includes('底部')) tag = 'footer'

      html += `${indent}<${tag} class="${cssClass}">\n`

      // 渲染子节点
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          // 如果是图标/图片节点，生成 img 元素
          if ((child.type === '图片' || child.type === '元素') && child.id && assetMapping[child.id]) {
            html += `${indent}  <img src="./assets/icons/${assetMapping[child.id]}" alt="${child.name || 'icon'}" class="${child.cssClass || 'element-icon'}" />\n`
          } else if (child.type === '元素' && child.text) {
            const elClass = child.cssClass || this.toCssClass(child.name || 'text')
            html += `${indent}  <span class="${elClass}">${child.text}</span>\n`
          } else if (child.type === '交互控件' && child.text) {
            const ctrlClass = child.cssClass || this.toCssClass(child.name || 'control')
            html += `${indent}  <a href="#" class="${ctrlClass}">${child.text}</a>\n`
          } else if (child.type === '数据') {
            const dataClass = child.cssClass || this.toCssClass(child.name || 'data')
            html += `${indent}  <span class="${dataClass}">{{ data }}</span>\n`
          } else {
            html += this.renderZoneHtml(child, responsive, assetMapping, layoutAnalysis, indentLevel + 1)
          }
        }
      }

      html += `${indent}</${tag}>\n`
      return html
    }

    return ''
  }

  /**
   * 递归渲染区域样式
   */
  renderZoneStyles(node, responsive, assetMapping, layoutAnalysis, prefix) {
    if (!node || node.type === '组件' || node.type === '模块') return ''

    let styles = ''
    const cssClass = node.cssClass || this.toCssClass(node.name)

    if (node.type === '容器') {
      styles += `.${cssClass} {\n`

      // 宽度
      if (node.responsiveSize) {
        styles += `  width: ${node.responsiveSize.width};\n`
        styles += `  height: ${node.responsiveSize.height};\n`
      } else if (node.size) {
        if (responsive) {
          const vw = ((node.size.w / RESPONSIVE_RULES.designSize.width) * 100).toFixed(1)
          const vh = ((node.size.h / RESPONSIVE_RULES.designSize.height) * 100).toFixed(2)
          styles += `  width: ${vw}vw;\n`
          styles += `  height: ${vh}vh;\n`
        } else {
          styles += `  width: ${node.size.w}px;\n`
          styles += `  height: ${node.size.h}px;\n`
        }
      }

      // 定位（如果有 position）
      if (node.position && (node.position.x || node.position.y)) {
        styles += '  position: absolute;\n'
        if (node.position.x) styles += `  left: ${node.position.x}px;\n`
        if (node.position.y) styles += `  top: ${node.position.y}px;\n`
      }

      // 布局模式
      if (node.layoutMode) {
        styles += '  display: flex;\n'
        styles += `  flex-direction: ${node.layoutMode.toLowerCase() === 'horizontal' ? 'row' : 'column'};\n`
      }

      // 背景色
      if (node.bgColor) {
        styles += `  background-color: ${node.bgColor};\n`
      }

      // 背景图（合并节点）
      if (node.children) {
        const bgNodes = node.children.filter(c => c.type === '背景元素')
        for (const bg of bgNodes) {
          if (bg.id && assetMapping[bg.id]) {
            styles += `  background-image: url('../assets/images/${assetMapping[bg.id]}');\n`
            styles += '  background-size: cover;\n'
            styles += '  background-repeat: no-repeat;\n'
            styles += '  background-position: center;\n'
          }
        }
      }

      // 内边距
      if (node.padding) {
        const p = node.padding
        if (p.top || p.right || p.bottom || p.left) {
          const top = responsive ? `${((p.top || 0) / RESPONSIVE_RULES.designSize.height * 100).toFixed(2)}vh` : `${p.top || 0}px`
          const right = responsive ? `${((p.right || 0) / RESPONSIVE_RULES.designSize.width * 100).toFixed(2)}vw` : `${p.right || 0}px`
          const bottom = responsive ? `${((p.bottom || 0) / RESPONSIVE_RULES.designSize.height * 100).toFixed(2)}vh` : `${p.bottom || 0}px`
          const left = responsive ? `${((p.left || 0) / RESPONSIVE_RULES.designSize.width * 100).toFixed(2)}vw` : `${p.left || 0}px`
          styles += `  padding: ${top} ${right} ${bottom} ${left};\n`
        }
      }

      // 溢出
      if (node.overflow) {
        styles += `  overflow: ${node.overflow};\n`
      }

      styles += '}\n\n'
    }

    // 递归处理子节点
    if (node.children) {
      for (const child of node.children) {
        styles += this.renderZoneStyles(child, responsive, assetMapping, layoutAnalysis, prefix)
      }
    }

    return styles
  }

  /**
   * 生成组件导出文件
   */
  generateExportFile(components) {
    const exports = components
      .map(c => `export { default as ${c.name} } from './${c.name}.vue'`)
      .join('\n')

    return `/**
 * 子组件批量导出文件
 * 自动生成，请勿手动修改
 */

${exports}
`
  }

  /**
   * 转换为 kebab-case CSS 类名
   */
  toCssClass(name) {
    if (!name) return ''
    return name
      // PascalCase → kebab-case
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
  }
}

export default LayoutGenerator

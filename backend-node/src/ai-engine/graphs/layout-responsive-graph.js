/**
 * 大屏布局 → 响应式页面生成工作流
 *
 * 编排完整流程：
 * 1. spatialAnalyze      —— 规则引擎预处理（行/列/重叠/Zone树）
 * 2. generateResponsive  —— LLM 生成响应式 Vue 3 组件
 * 3. postProcess         —— 代码清洗（CSS sanitizer） + 质量校验
 * 4. buildPreviews       —— 生成多断点预览 HTML
 * 5. finalize            —— 组装最终结果
 */

import { Graph } from './graph.js'
import { createLogger } from '../logger/index.js'
import { LayoutSpatialAnalyzer } from '../utils/layout-spatial-analyzer.js'
import { LayoutResponsiveAgent } from '../agents/layout-responsive-agent.js'
import { sanitizeVueStyleBlock } from '../utils/css-sanitizer.js'

const logger = createLogger({ name: 'graph:layout-responsive' })

/**
 * 运行布局响应式生成工作流
 *
 * @param {Object} options
 * @param {Object} options.layoutData     - 原始 ScreenLayout
 * @param {Function} options.onProgress   - 进度回调 (stage, message, data?)
 * @param {Function} options.onTokenUsage - Token 用量回调（可选）
 * @returns {Promise<Object>} { vueCode, analysisResult, previews, summary }
 */
export async function runLayoutResponsiveGeneration(options = {}) {
  const {
    layoutData,
    onProgress = () => {},
    onTokenUsage = null,
  } = options

  if (!layoutData) {
    throw new Error('layoutData is required')
  }

  logger.info('启动布局响应式生成工作流', {
    name: layoutData.name,
    zones: layoutData.body?.zones?.length || 0,
  })

  const graph = new Graph({ name: 'layout-responsive-generation' })

  // ===== Node 1: 规则引擎空间分析 =====
  graph.addNode('spatialAnalyze', async (s) => {
    onProgress({ stage: 'spatial-analyze', message: '正在分析空间布局结构...' })

    const analyzer = new LayoutSpatialAnalyzer({
      rowTolerance: 30,
      colTolerance: 30,
    })
    const spatialReport = analyzer.analyze(s.layoutData)

    onProgress({
      stage: 'spatial-analyze',
      message: `空间分析完成：${spatialReport.summary.totalComponents} 个组件，` +
        `${spatialReport.summary.detectedRows} 行 × ${spatialReport.summary.detectedColumns} 列，` +
        `${spatialReport.summary.totalZones} 个 Zone`,
      data: {
        componentCount: spatialReport.summary.totalComponents,
        detectedRows: spatialReport.summary.detectedRows,
        detectedColumns: spatialReport.summary.detectedColumns,
        totalZones: spatialReport.summary.totalZones,
        complexityScore: spatialReport.responsiveHints?.complexityScore,
      },
    })

    return { spatialReport }
  })

  // ===== Node 2: LLM 生成响应式代码 =====
  graph.addNode('generateResponsive', async (s) => {
    onProgress({ stage: 'generate-responsive', message: '🤖 AI 正在分析布局并生成响应式代码...' })

    const agent = new LayoutResponsiveAgent({
      temperature: 0.15,
      maxTokens: 16384,
      onTokenUsage: onTokenUsage
        ? (usage) => {
            usage.sessionId = s.sessionId || null
            onTokenUsage(usage)
          }
        : null,
    })

    const layoutName = s.layoutData?.name || 'screen-layout'

    const result = await agent.invoke({
      spatialReport: s.spatialReport,
      layoutData: s.layoutData,
      context: {
        layoutName,
        componentPrefix: 'GenericPanel',
        targetFramework: 'Vue 3 + Vite + ant-design-vue',
      },
    })

    const vueCode = result?.vueCode || ''
    const analysisResult = result?.analysisResult || null

    if (!vueCode || vueCode.length < 100) {
      logger.warn('LLM 返回的 Vue 代码过短或为空', { length: vueCode?.length || 0 })
      onProgress({
        stage: 'generate-responsive',
        message: '⚠️ AI 生成的代码可能不完整',
      })
    } else {
      onProgress({
        stage: 'generate-responsive',
        message: `✅ AI 代码生成完成：${vueCode.length} 字符`,
        data: { codeLength: vueCode.length },
      })
    }

    return { vueCode, analysisResult }
  })

  // ===== Node 3: 代码后处理 =====
  graph.addNode('postProcess', async (s) => {
    onProgress({ stage: 'post-process', message: '正在清洗和校验代码...' })

    let cleanedCode = s.vueCode

    // 3a. CSS 清洗 — 复用现有 sanitizer
    try {
      const sanitized = sanitizeVueStyleBlock(cleanedCode, logger)
      if (sanitized && sanitized.length > cleanedCode.length * 0.3) {
        cleanedCode = sanitized
      } else {
        logger.warn('CSS 清洗后代码过短，保留原始输出', {
          before: cleanedCode.length,
          after: sanitized?.length || 0,
        })
      }
    } catch (e) {
      logger.warn('CSS 清洗异常，保留原始输出', { error: e.message })
    }

    // 3b. 基础质量校验
    const hasOverlaps = s.spatialReport?.summary?.totalOverlaps > 0
    const checks = {
      hasTemplate: /<template>/.test(cleanedCode),
      hasScript: /<script/.test(cleanedCode),
      hasStyle: /<style/.test(cleanedCode),
      hasMediaQuery: /@media/.test(cleanedCode),
      // 仅当空间分析显示无重叠时才检查 absolute 定位
      noAbsolute: hasOverlaps ? true : !/position:\s*absolute/.test(cleanedCode),
      noPixelCoord: !/(left|top):\s*\d+px/.test(cleanedCode), // 不应出现像素坐标
    }

    const passedChecks = Object.entries(checks).filter(([_, v]) => v).length
    const totalChecks = Object.keys(checks).length

    onProgress({
      stage: 'post-process',
      message: `代码校验：${passedChecks}/${totalChecks} 通过`,
      data: { checks, passedChecks, totalChecks },
    })

    return {
      cleanedCode,
      qualityChecks: checks,
    }
  })

  // ===== Node 4: 生成多断点预览 =====
  graph.addNode('buildPreviews', async (s) => {
    onProgress({ stage: 'build-previews', message: '正在生成多断点预览...' })

    const previews = buildPreviewDocuments(s.cleanedCode, s.layoutData)

    onProgress({
      stage: 'build-previews',
      message: `预览生成完成：${Object.keys(previews).length} 个断点`,
      data: { breakpoints: Object.keys(previews) },
    })

    return { previews }
  })

  // ===== Node 5: 最终结果 =====
  graph.addNode('finalize', async (s) => {
    const summary = {
      componentName: s.layoutData?.name || 'screen-layout',
      codeLength: s.cleanedCode?.length || 0,
      breakpoints: Object.keys(s.previews || {}),
      zoneCount: s.layoutData?.body?.zones?.length || 0,
      qualityScore: s.qualityChecks
        ? Object.values(s.qualityChecks).filter(Boolean).length / Object.keys(s.qualityChecks).length
        : 0,
      analysisSummary: s.analysisResult?.layoutStrategy
        ? {
            rootLayout: s.analysisResult.layoutStrategy.rootLayout,
            approach: s.analysisResult.responsiveStrategy?.approach,
          }
        : null,
    }

    onProgress({
      stage: 'complete',
      message: '✅ 响应式页面生成完成！',
      data: summary,
    })

    return {
      result: {
        vueCode: s.cleanedCode,
        analysisResult: s.analysisResult,
        previews: s.previews,
        qualityChecks: s.qualityChecks,
        spatialReport: s.spatialReport,
        summary,
      },
    }
  })

  // ===== 定义流程（线性） =====
  graph
    .addEdge('spatialAnalyze', 'generateResponsive')
    .addEdge('generateResponsive', 'postProcess')
    .addEdge('postProcess', 'buildPreviews')
    .addEdge('buildPreviews', 'finalize')
    .setEntry('spatialAnalyze')

  // 执行
  const initialState = { layoutData }
  try {
    const state = await graph.run(initialState)
    return state.result
  } catch (error) {
    logger.error('布局响应式生成工作流失败', { error: error.message, stack: error.stack })
    onProgress({ stage: 'error', message: `❌ 生成失败：${error.message}` })
    throw error
  }
}

// ============================================================
// 辅助：生成多断点预览 HTML
// ============================================================

function buildPreviewDocuments(vueCode, layoutData) {
  const breakpoints = [
    { width: 1920, height: 1080, label: '1920x1080' },
    { width: 1440, height: 900, label: '1440x900' },
    { width: 1024, height: 768, label: '1024x768' },
  ]

  const previews = {}

  for (const bp of breakpoints) {
    // 将 Vue SFC 包装为可独立预览的 HTML
    previews[bp.label] = wrapAsPreviewHtml(vueCode, layoutData, bp)
  }

  return previews
}

function wrapAsPreviewHtml(vueCode, layoutData, breakpoint) {
  // 提取 template / script / style
  const templateMatch = vueCode.match(/<template>([\s\S]*?)<\/template>/)
  const styleMatch = vueCode.match(/<style[^>]*>([\s\S]*?)<\/style>/)

  let template = templateMatch ? templateMatch[1] : ''
  const style = styleMatch ? styleMatch[1] : ''

  // 静态化模板：移除/替换 Vue 动态绑定，生成纯静态 HTML
  template = staticizeTemplate(template)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${layoutData?.name || '大屏布局'} - ${breakpoint.label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100vw; height: 100vh;
      overflow: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: #0a1628;
      color: #e0e6ed;
    }
    #app {
      width: ${breakpoint.width}px;
      height: ${breakpoint.height}px;
      transform-origin: top left;
      position: relative;
    }
    /* 缩放到视口 */
    @media (max-width: ${breakpoint.width}px) {
      #app { transform: scale(calc(100vw / ${breakpoint.width})); }
    }
    @media (max-height: ${breakpoint.height}px) {
      #app { transform: scale(min(calc(100vw / ${breakpoint.width}), calc(100vh / ${breakpoint.height}))); }
    }
    /* 组件占位卡片 */
    .preview-placeholder {
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.03);
      border: 1px dashed rgba(255,255,255,0.12);
      border-radius: 4px;
      overflow: hidden;
      min-height: 40px;
    }
    .preview-placeholder-label {
      font-size: 12px; color: rgba(255,255,255,0.25);
      text-align: center;
    }
    /* 用户自定义样式 */
    ${style || ''}
  </style>
</head>
<body>
  <div id="app">
${template.split('\\n').map(l => '    ' + l).join('\\n')}
  </div>
</body>
</html>`
}

/**
 * 将 Vue 模板静态化：移除动态绑定、替换组件标签为占位符
 */
function staticizeTemplate(template) {
  let result = template

  // 1. 移除 Vue 注释 <!-- ... -->
  result = result.replace(/<!--[\s\S]*?-->/g, '')

  // 2. 替换 <component :is="resolveComponent('Xxx')"> 为静态占位
  result = result.replace(
    /<component\s+:is="resolveComponent\('([^']+)'\)"[^>]*>/g,
    (_, name) =>
      `<div class="preview-placeholder" data-component="${name}">` +
      `<span class="preview-placeholder-label">${name}</span></div>`
  )
  // 对应的 </component>
  result = result.replace(/<\/component>/g, '')

  // 3. 移除 Vue 指令 (:style, :class, v-bind, v-if, v-for, v-show, @click 等)
  result = result.replace(/\s+(?::style|:class|v-bind:\w+|v-if|v-else-if|v-else|v-for|v-show|v-model|@\w+|v-on:\w+)\s*=\s*"[^"]*"/g, '')
  result = result.replace(/\s+(?::style|:class|v-bind:\w+|v-if|v-else-if|v-else|v-for|v-show|v-model|@\w+|v-on:\w+)\s*=\s*'[^']*'/g, '')

  // 4. 移除 `{{ expression }}` 插值（替换为占位文本）
  result = result.replace(/\{\{[^}]+\}\}/g, '—')

  // 5. 移除 v- 指令（无引号的布尔属性）
  result = result.replace(/\s+v-\w+/g, '')

  // 6. 清理多余空行和缩进
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n')

  return result
}

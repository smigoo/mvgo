/**
 * Prompt 文件加载工具
 * 负责从 prompts/ 目录加载 .md 文件并替换占位符
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { genClassKey } from './class-name-generator.js'
import { buildTextConstantsSection } from './text-constants-builder.js'
import { buildVisionFigmaCrossSection } from './vision-figma-cross-validator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// prompts 目录根路径
const PROMPTS_ROOT = join(__dirname, '../prompts')

/**
 * 加载 .md 文件并替换占位符
 * @param {string} relativePath - 相对于 prompts/ 的路径，如 'engineer/shared/role.md'
 * @param {Object} vars - 变量映射，如 { COMPONENT_NAME: 'my-component', COMPONENT_ID: 'my-component' }
 * @returns {string} 替换后的内容
 */
export function loadMd(relativePath, vars = {}) {
  const fullPath = join(PROMPTS_ROOT, relativePath)
  if (!existsSync(fullPath)) {
  console.warn(`[prompt-loader] 文件不存在: ${fullPath}`)
  return ''
  }
  let content = readFileSync(fullPath, 'utf-8')

  // 替换 {{VAR}} 占位符
  for (const [key, value] of Object.entries(vars)) {
  const placeholder = `{{${key}}}`
  content = content.replaceAll(placeholder, value ?? '')
  }

  return content
}

/**
 * 验证 prompts 目录是否存在必需文件
 * 用于启动时检查，防止部署遗漏 .md 文件
 * @param {string[]} requiredFiles - 必需的文件列表
 * @returns {Object} { ok: boolean, missing: string[] }
 */
export function validatePromptsDir(requiredFiles) {
  const missing = []
  for (const file of requiredFiles) {
  try {
    const fullPath = join(PROMPTS_ROOT, file)
    readFileSync(fullPath, 'utf-8')
  } catch (e) {
    missing.push(file)
  }
  }
  return { ok: missing.length === 0, missing }
}

/**
 * 构建 shared 段的所有 prompt 内容
 * 按顺序拼接 shared 段的所有静态部分
 * @param {Object} vars - 变量映射 { componentName, componentId, panelType, complexityHint, headerSlots }
 * @returns {string} 拼接后的 shared 段文本
 */
export function buildSharedSections(vars) {
  const {
  componentName = '',
  componentId = '',
  panelType = '',
  complexityHint = '',
  headerSlots = '[]',
  componentType = 'microcode',
  } = vars

  // 解析 headerSlots，判断是否需要加载插槽映射表
  let hasHeaderSlots = false
  let parsedSlots = []
  try {
    const parsed = typeof headerSlots === 'string' ? JSON.parse(headerSlots) : headerSlots
    if (Array.isArray(parsed)) {
      parsedSlots = parsed.filter(s => s && typeof s === 'object')
      hasHeaderSlots = parsedSlots.length > 0
    }
  } catch {
    // 解析失败按无插槽处理
  }

  // 🎯 填充 base-panel-slots.md 的三个细分变量（此前从未填充，表格渲染字面量占位符）：
  // 按 slotType（连字符/下划线归一）分组，列出每个插槽的实际内容清单。
  const fmtSlotGroup = (types) => {
    const items = parsedSlots.filter(s => types.includes(String(s.slotType || '').replace(/_/g, '-')))
    if (items.length === 0) return '(无明确分配——按设计稿节点树中 header 区内容自行判断)'
    return items.map(s => `[${s.elementType || 'item'}] ${String(s.content || '').slice(0, 60)}`).join('；')
  }
  const mdVars = {
    COMPONENT_NAME: componentName,
    COMPONENT_ID: componentId,
    PANEL_TYPE: panelType || 'default-panel',
    COMPLEXITY_HINT: complexityHint,
    HEADER_SLOTS: headerSlots,
    HEADER_SLOTS_TITLE_LEFT: fmtSlotGroup(['title-left']),
    HEADER_SLOTS_TITLE_RIGHT: fmtSlotGroup(['title-right']),
    HEADER_SLOTS_HEADER_RIGHT: fmtSlotGroup(['header-right']),
    }

  // 🛡️ 治本：vue3 任务换用 vue3-builder（defineProps 范式，禁 $mcComponentBuilder/componentProps 等
  // 微码运行时 API——vue3 预览环境未注入，引用即 "Cannot read properties of undefined"），
  // 且剔除 base-panel（vue3 真实还原面板外壳，不用宿主 base-panel）。
  const isVue3 = componentType === 'vue3'

  // 按 shared 段原始顺序加载
  // （style-files.md 已于 2026-08-24 删除：与 mc-builder.md 的 4️⃣ 样式文件结构节逐字重复，保留 mc-builder.md 一份）
  const sections = [
    'engineer/shared/role.md',
    'engineer/shared/layout-iron-rules.md',
    'engineer/shared/resource.md',
    'engineer/shared/root-container.md',
    'engineer/shared/layout-rules.md',
    'engineer/shared/text-fidelity.md',
    'engineer/shared/class-naming.md',
    isVue3 ? 'engineer/shared/vue3-builder.md' : 'engineer/shared/mc-builder.md',
    // 🎨 主题色变量铁律（2026-09-04）：双管线共用。样式颜色必须 var()/@mixin 变量引用，
    // 禁抄写槽位色值/局部预设重声明（theme-color-guard L0-B 兜底，mc-max-1788485095835 实锤）
    'engineer/shared/style-theme-rules.md',
    ...(isVue3 ? [] : ['engineer/shared/base-panel.md']),
    'engineer/shared/no-hallucination.md',
  ]

  // 仅在有 headerSlots 时追加插槽映射表（约 25 行，~800 tokens）；vue3 无 base-panel 宿主，跳过
  if (hasHeaderSlots && !isVue3) {
    sections.push('engineer/shared/base-panel-slots.md')
  }

  // 🆕 P1-4：每个文件加边界标记（<!-- shared-file: path -->），供调用方做文件级裁剪；
  // 末尾追加终止标记，保证裁剪边界查找不会越界吞掉 shared 之后拼接的动态内容。
  const marked = sections
    .map(path => `<!-- shared-file: ${path} -->\n${loadMd(path, mdVars)}`)
    .join('\n\n')
  return marked + '\n<!-- shared-files-end -->'
}

/**
 * 按需裁剪 ai-generation-constraints.md（36KB 大文件）：
 * 图表/交互专属章节只在对应能力存在时保留，其余场景跳过，减少固定 token 消耗。
 *
 * 章节归属规则（以 `## ` 一级标题切割）：
 * - CHART_ONLY：`## 4. 图例交互约束`、`## 7. 图表边界约束`、`## 1. 设计稿的"状态/瞬态"识别`（含图表 tooltip 子节）
 * - INTERACTION_ONLY：`## 2.5. Tab/Select 切换约束`、`## 6.5. Select/下拉框识别约束`
 * - 其余章节始终保留（核心规范/样式证据优先/base-panel/宽度/标题对齐等）
 *
 * @param {string} constraintsContent - 完整 constraints md 文本
 * @param {Object} [opts] - { hasCharts, hasInteractions }
 * @returns {string} 裁剪后的文本（无能力时移除对应章节）
 */
export function trimConstraintsForContext(constraintsContent = '', { hasCharts = false, hasInteractions = false } = {}) {
  if (!constraintsContent) return constraintsContent

  // 按 `## ` 一级章节头切块（保留章节头），最后一段兜底
  const parts = constraintsContent.split(/(?=^## )/m)
  const kept = []
  for (const part of parts) {
    const firstLine = part.split('\n')[0] || ''
    const isChartOnly = /^## 4\.|^## 7\.|^## 1\./.test(firstLine)
    const isInteractionOnly = /^## 2\.5\.|^## 6\.5\./.test(firstLine)
    if (isChartOnly && !hasCharts) continue
    if (isInteractionOnly && !hasInteractions) continue
    kept.push(part)
  }

  return kept.join('')
}

/**
 * 按需加载动态 concerns 段
 * 根据条件决定是否加载特定的 concern
 * @param {Object} options - 条件选项
 * @param {boolean} options.hasInteractions - 是否有交互信息
 * @param {boolean} options.hasCharts - 是否有图表信息
 * @returns {string} 拼接后的 concerns 文本
 */
export function buildConcerns(options = {}) {
  const {
  hasInteractions = false,
  hasCharts = false,
  } = options

  const concerns = []

  // 交互实现指南（仅在有交互信息时加载）
  if (hasInteractions) {
  concerns.push(loadMd('engineer/dynamic/interaction-guide.md'))
  }

  // 图表规范 + 图表边界 + 图例交互（仅在有图表时加载）
  if (hasCharts) {
  concerns.push(loadMd('engineer/dynamic/chart-standards.md'))
  concerns.push(loadMd('engineer/dynamic/legend-interaction.md'))
  }

  return concerns.join('\n\n')
}

/**
 * 格式化已下载资源清单（从 microcode-engineer.js 的 IIFE 提取）
 * @param {Object|Array} assets - 资源数据
 * @returns {string} 格式化后的资源清单文本
 */
export function formatAssetsList(assets) {
  if (!assets || (Array.isArray(assets) ? assets.length === 0 : Object.keys(assets).length === 0)) {
  return '(无已下载资源)'
  }
  const assetEntries = Object.values(assets).flat ? Object.values(assets) : [assets]
  const flatAssets = assetEntries.flat()
  const cssAssets = flatAssets.filter(a => a.cssInsteadOfImage)
  const imageAssets = flatAssets.filter(a => !a.cssInsteadOfImage)
  let out = ''
  if (cssAssets.length > 0) {
  out += '### ⚡ CSS 替代资源（纯色/渐变，已自动生成 CSS 值，**禁止引用图片文件**）\n\n'
  out += '```json\n' + JSON.stringify(cssAssets.map(a => ({
    name: a.name,
    nodeId: a.ref,
    cssValue: a.cssValue,
    cssUsage: 'background: ' + a.cssValue + ';'
  })), null, 1) + '\n```\n\n'
  out += '**规则**：\n1. 这些资源 **不要** 使用 `<img>` 标签，**不要** 通过 :style backgroundImage 引用图片\n'
  out += '2. 直接在 common.less 或 :style 中用 `background: <cssValue>;` 实现\n'
  out += '3. bg 类型应用到容器 `background` 属性；icon 类型用 CSS background + 尺寸定位\n\n'
  }
  if (imageAssets.length > 0) {
  out += '### 图片资源（引用系统注入的变量 bg1/icon1 等）\n\n'
  out += imageAssets.map(a => {
    const w = a.width || '?'
    const h = a.height || '?'
    const usage = a.recommendedUsage || (a.type === 'bg' ? 'backgroundStyle' : 'imgSrc')
    let hint = ''
    const nw = Number(a.width) || 0
    const nh = Number(a.height) || 0
    if (a.type === 'bg' && nw > 0 && nh > 0) {
    const ratio = nw / nh
    if (ratio > 2.5) hint = ' —— ⚠️ 横向装饰横幅，仅用于局部装饰位，禁止贴到根容器/整面板背景'
    else if (ratio < 0.4) hint = ' —— ⚠️ 竖向装饰条，仅用于局部装饰位，禁止贴到根容器/整面板背景'
    else if (usage === 'backgroundStyle') hint = ' —— 整体背景图（配合 layoutStructure.backgroundImage 使用）'
    else hint = ' —— 局部卡片背景（backgroundBlock）'
    }
    return `- ${a.name || a.path}: ${a.type || 'image'} (${w}x${h}) 用法: ${usage}${hint}`
  }).join('\n')
  }
  return out || '(无已下载资源)'
}

/**
 * 构建 Figma 阶段专属内容
 * 加载 stages/figma.md 模板并注入运行时动态数据
 * @param {Object} context - 运行时上下文
 * @param {string} context.figmaRulesContent - Figma 规则文本（来自 constraints）
 * @param {string|null} context.figmaStyleTree - Figma 样式树（已格式化）
 * @param {Object|null} context.figmaNodeData - Figma 节点原始数据
 * @param {Function|null} context.formatFigmaStyleData - 格式化 Figma 节点数据的函数
 * @param {Object|null} context.styleMappings - 样式映射
 * @param {Object|null} context.elementStyleMap - 逐元素样式映射
 * @param {Object|Array|null} context.assets - 已下载资源
 * @param {Object|null} context.resourceDomMapping - 资源 DOM 映射
 * @param {Function|null} context.formatResourceMapping - 格式化资源映射的函数
 * @returns {string} Figma 阶段专属内容
 */
/**
 * 📋 设计稿文字清单：从 Figma 节点树程序化提取全部 TEXT 内容（零臆造真值）。
 * 修复两类历史缺陷：vision 覆盖率不足导致文字遗漏、模型臆造分类名/数字。
 * vue3 与微码共用（buildFigmaStage 是双路径共享事实段）。
 */
export function buildTextInventorySection(figmaNodeData) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return ''
  const texts = []
  const seen = new Set()
  const walk = (node) => {
    if (node && node.type === 'TEXT' && typeof node.characters === 'string') {
      const t = node.characters.trim()
      if (t && !seen.has(t)) {
        seen.add(t)
        texts.push(t.length > 40 ? t.slice(0, 40) + '…' : t)
      }
    }
    if (Array.isArray(node?.children)) node.children.forEach(walk)
  }
  walk(figmaNodeData)
  if (texts.length === 0) return ''
  const MAX_ITEMS = 150
  const list = texts.slice(0, MAX_ITEMS).join(' ｜ ')
  const more = texts.length > MAX_ITEMS ? `\n（共 ${texts.length} 条，已截取前 ${MAX_ITEMS} 条；其余见下方节点树）` : ''
  return `## 📋 设计稿文字清单（业务文字唯一真值，程序化提取）

\`\`\`text
${list}${more}
\`\`\`

**🔴 文字铁律**：
1. 模板中的业务文字、分类名、标签名、数字必须**逐字**来自本清单——禁止改写、翻译、概括或新增同义文字
2. 视觉分析（layoutStructure）描述与本清单冲突时，**以本清单为准**
3. 本清单文字可按布局需要省略，但禁止替换成清单外的文字
4. 数字（统计值、百分比、计数）必须精确使用清单原值，禁止编造
`
}

/**
 * 🧩 设计稿结构标记：提取三类结构信号（全部程序化、通用、无组件特例）：
 *   1. \`@\` 前缀组件标记节点（如 @antd/tab）→ 组件结构语义
 *   2. header 容器（name 匹配 header 的 GROUP/FRAME）→ 内容属于面板标题栏
 *   3. 顶层 slot-* 节点 → 分区结构
 */
export function buildStructureMarkersSection(figmaNodeData, componentType = 'microcode') {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return ''
  const markerNodes = []
  const headerContainers = []
  const slotNodes = []

  const collectTexts = (node, acc, depth = 0) => {
    if (depth > 6 || acc.length >= 14) return
    if (node?.type === 'TEXT' && typeof node.characters === 'string') {
      const t = node.characters.trim()
      if (t) acc.push(t.length > 20 ? t.slice(0, 20) + '…' : t)
    }
    if (Array.isArray(node?.children)) node.children.forEach(c => collectTexts(c, acc, depth + 1))
  }

  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object') return
    const name = String(node.name || '')
    const nmLower = name.toLowerCase()
    if (name.startsWith('@') && !markerNodes.some(m => m.name === name)) {
      markerNodes.push({ name, type: node.type })
    }
    if (depth <= 2 && (node.type === 'GROUP' || node.type === 'FRAME') &&
        /^(header|panel-header|title-bar|slot-header)[- ]?/i.test(name) &&
        !headerContainers.some(h => h.name === name)) {
      const texts = []
      collectTexts(node, texts)
      // 🎯 实测尺寸：header 直接子节点的 Figma 真实宽高（模型写 CSS 的数值依据，
      // 防 tab 区/图标区宽度失真——文字换行与图标挤压的高频根因）
      const childDims = (Array.isArray(node.children) ? node.children : [])
        .map(c => {
          const bb = c.absoluteBoundingBox || {}
          return { name: String(c.name || c.type || '').slice(0, 20), w: Math.round(bb.width || 0), h: Math.round(bb.height || 0) }
        })
        .filter(d => d.w >= 6 && d.h >= 6)
        .slice(0, 8)
      headerContainers.push({ name, texts, childDims })
    }
    if (depth <= 1 && /^slot-/i.test(name)) slotNodes.push(name)
    if (Array.isArray(node.children)) node.children.forEach(c => walk(c, depth + 1))
  }
  walk(figmaNodeData)

  const lines = []
  const tabMarkers = markerNodes.filter(m => /tab/i.test(m.name))
  if (tabMarkers.length > 0) {
    lines.push(`- **标签页（Tabs）结构**：检测到组件标记 \`${tabMarkers[0].name}\` → 该区域是**标签页切换结构**：必须生成「tab 标签组 + 每个标签对应的内容区」，tab 标签文字逐字取自上方文字清单与下方节点树中该区域的实际文字，禁止臆造标签名`)
  }
  const otherMarkers = markerNodes.filter(m => !/tab/i.test(m.name) && !/^@echarts/i.test(m.name))
  if (otherMarkers.length > 0) {
    lines.push(`- **组件标记节点**：${otherMarkers.slice(0, 5).map(m => `\`${m.name}\``).join('、')} → 设计稿用这些名字标注组件类型，生成时按对应结构还原`)
  }
  if (headerContainers.length > 0) {
    const h = headerContainers[0]
    // 标题文字 = header 容器内 x 最左的文本（与 validator 推导器同判定）
    const titleText = h.texts[0] || ''
    const dimLine = (h.childDims && h.childDims.length > 0)
      ? `各子区域 Figma 实测尺寸：${h.childDims.map(d => `\`${d.name}\` ${d.w}×${d.h}px`).join('、')}（CSS 宽高必须按此数值还原，禁止自行估算）`
      : ''
    if (componentType === 'vue3') {
      lines.push(`- **Header 区（面板标题栏）**：节点 \`${h.name}\` 内的文字：${h.texts.join('、')} —— 面板标题「${titleText}」**由预览/宿主外壳渲染，组件内禁止生成标题文字元素**（生成即与外壳标题重复）；组件只渲染 header 右侧控件（统计指标/Tab/图标），置于组件顶部一行${dimLine ? `；${dimLine}` : ''}`)
    } else {
      lines.push(`- **Header 区（面板标题栏）**：节点 \`${h.name}\` 内的文字：${h.texts.join('、')} —— 这些内容属于**面板标题栏/头部**：微码组件应放入 base-panel 头部插槽（declare headerSlots），**禁止放入 body 内容区**${dimLine ? `；${dimLine}` : ''}`)
    }
  }
  if (slotNodes.length > 0) {
    lines.push(`- **分区结构**：顶层分区节点 ${slotNodes.slice(0, 8).map(s => `\`${s}\``).join('、')} → 组件按这些分区组织布局`)
  }
  if (lines.length === 0) return ''
  return `## 🧩 设计稿结构标记（程序化提取，结构真值）

${lines.join('\n')}
`
}

/**
 * 🛡️ L9 类名同源治理（2026-09-07）：构建类名清单段
 *
 * 从 Figma 节点树提取有意义的节点（FRAME/GROUP/带名称的容器），
 * 为每个节点生成确定性类名，注入 prompt 让 LLM 消费管线预分配的类名。
 *
 * @param {object|null} figmaNodeData - Figma 节点树
 * @param {string} componentPrefix - 组件前缀（如 `c-monitor`）
 * @returns {string} 类名清单段（无节点时返回空串）
 */
export function buildClassNameManifestSection(figmaNodeData, componentPrefix) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return ''
  if (!componentPrefix) return ''

  // 收集有意义的节点：FRAME/GROUP 或带名称的容器，排除纯装饰矢量
  const meaningfulNodes = []
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return
    const name = String(node.name || '')
    const type = node.type || ''

    // 跳过：纯装饰矢量、空名称、过深嵌套
    if (/^VECTOR$|^ELLIPSE$|^LINE$|^RECTANGLE$/i.test(type) && !name) return
    if (!name || name.length < 2) return

    // 收集：FRAME/GROUP/带名称的容器（有 children 或名称含语义关键词）
    const isContainer = type === 'FRAME' || type === 'GROUP' || type === 'COMPONENT'
    const hasSemanticName = /tab|header|content|icon|chart|stats|list|sidebar|footer|badge|card|panel|title|body|main|nav|menu|item|label|value|number|indicator|progress|legend|axis|series/i.test(name)

    if (isContainer || hasSemanticName) {
      meaningfulNodes.push({ name, type, id: node.id })
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(c => walk(c, depth + 1))
    }
  }
  walk(figmaNodeData)

  if (meaningfulNodes.length === 0) return ''

  // 去重（同名节点只保留一个映射）
  const seen = new Set()
  const uniqueNodes = meaningfulNodes.filter(n => {
    if (seen.has(n.name)) return false
    seen.add(n.name)
    return true
  })

  // 限制数量，避免 prompt 过长（最多 30 个）
  const limited = uniqueNodes.slice(0, 30)

  // 生成映射表（使用顶部 import 的 genClassKey — 单一事实源）
  const mappingLines = limited.map(n => {
    const className = genClassKey(n, componentPrefix)
    return `| \`${n.name}\` | \`${n.type}\` | \`.${className}\` |`
  })

  return `## 🏷️ 类名清单（L9 确定性类名，**强制使用，违反即 BLOCK**）

> 🔴 **最高优先级约束**：以下类名清单是**唯一合法事实源**，生成 \`<template>\` 和 \`common.less\` 时**必须逐字使用**，禁止任何形式的变体（BEM/驼峰/下划线/自创命名）。

| Figma 节点名 | 节点类型 | **必须使用的类名** |
|---|---|---|
${mappingLines.join('\n')}

**🚫 违规示例（会被门禁拦截）**：
- ❌ \`.c-env-monitor__tabs-section\`（BEM 双下划线）→ ✅ 应使用 \`${componentPrefix}-header\` 或表格第三列类名
- ❌ \`.c-env-monitor-tabs-section\`（自创后缀）→ ✅ 应使用表格第三列类名
- ❌ \`.item\` / \`.box\` / \`.wrapper\`（通用名）→ ✅ 应使用表格第三列类名

**✅ 正确做法**：
1. \`<template>\` 的 \`class="..."\` **只能**使用上表第三列的类名（如 \`${componentPrefix}-header\`）
2. \`common.less\` 选择器**必须**与上表类名一一对应
3. 如需额外类名，**必须**从表格中选择，禁止自创
4. ❌ 禁止对同一节点使用不同类名（如 \`.tabs-list\` 和 \`.tab-list-container\` 不能同时存在）
`
}

export function buildFigmaStage(context = {}) {
  const {
  figmaRulesContent = '',
  figmaStyleTree = null,
  figmaNodeData = null,
  formatFigmaStyleData = null,
  styleMappings = null,
  elementStyleMap = null,
  assets = null,
  resourceDomMapping = null,
  formatResourceMapping = null,
  componentPrefix = null,
  visualElements = null, // alias: visionElements (for L12 cross-validation)
  visionElements = null,
  } = context

  // L12 使用 visionElements 或 visualElements（两者是同一数据）
  const visionElementsForCross = visionElements || visualElements

  // FIGMA_STYLE_DATA：优先用 figmaStyleTree，否则格式化 figmaNodeData
  const styleDataContent = figmaStyleTree ?? (figmaNodeData && formatFigmaStyleData ? formatFigmaStyleData(figmaNodeData) : '(无Figma节点数据)')

  // STYLE_MAPPINGS：有数据则 JSON 代码块
  const styleMappingsContent = styleMappings ? '```json\n' + JSON.stringify(styleMappings, null, 2) + '\n```' : '(无样式映射)'

  // ELEMENT_STYLE_MAP_SECTION：条件块，有数据才显示完整规则+示例
  let elementStyleMapSection = ''
  if (elementStyleMap && Object.keys(elementStyleMap).length > 0) {
  elementStyleMapSection = `##Per-Element 样式映射（elementStyleMap — 必须遵守）

以下是从 Visual Parser 输出的 elements[] 程序化提取的每个元素的完整 CSS 属性。

\`\`\`json
${JSON.stringify(elementStyleMap, null, 2)}
\`\`\`

⚠️ **样式取值规则（CRITICAL，2026-09-04 修订）**：

1. **布局/尺寸/间距/圆角/字号**等无主题语义属性：elementStyleMap 的明确值 **必须直接写入 CSS**（\`font-size: 20px\`、\`width: 120px\` 等）
2. **颜色类属性**（color/background/background-color/border-*-color 等）**禁止抄写字面量**，必须改写为**主题变量引用**（见 style-theme-rules.md 语义槽对照）：
   - elementStyleMap 里的色值只作为**槽位默认值/fallback 依据**（如 \`color: "rgba(255,255,255,0.8)"\` → 白系文字 → \`color: var(--colorTextBase, #ffffff); opacity: 0.8\`）
   - 主色/强调色 → \`var(--colorPrimary, <设计真值>)\`；主色浅底/选中底 → \`var(--colorPrimaryBg, <设计真值>)\`；对应设计真值放入 theme-vars.less 主题槽位
3. 主题变量（themeVars/lessVariables）不只用于 JSON 无值属性——**颜色一律走变量**（microcode：var(--colorX, fallback)；vue3：@colorX mixin 变量）
4. **深色面板的文字颜色必须是白色系** — 如果 backgroundBrightness=dark，文字用 \`var(--colorTextBase)\`（深色槽=白色系），**禁止**用黑色系 rgba(0,0,0,...) 或抄写浅色稿黑字

**正确示例**：
\`\`\`less
.stat-label {
  font-size: 12px;                 // ← 尺寸直接值，来自 elementStyleMap
  color: var(--colorTextBase, #ffffff);  // ← 白系文字变量化（深色槽值=设计真值）
  opacity: 0.8;                    // ← 白字 0.8 透明度 = 设计稿 rgba(255,255,255,0.8)
}
\`\`\`

**错误示例** ❌：
\`\`\`less
.stat-label {
  font-size: 12px;
  color: rgba(255,255,255,0.8);   // ← 颜色字面量抄写：切主题/调色变量后该文字永不变化（L0-B BLOCK）
}
\`\`\``
  }

  // ASSETS_LIST：调用 formatAssetsList
  const assetsListContent = formatAssetsList(assets)

  // RESOURCE_DOM_MAPPING：条件格式化
  // 🆕 2026-08-27 #275-4：compactResourceMapping=true 时输出紧凑格式（保留全部还原关键字段，
  // 去掉 Import/使用示例等冗余文案，实测 -47%）。template 段启用（figma 树摘要 + compact 双降）。
  const resourceDomMappingContent = resourceDomMapping && formatResourceMapping
  ? formatResourceMapping(resourceDomMapping, {
      filterPanelResources: true,
      semanticLocation: true,
      importPrefix: './',
      ...(context.compactResourceMapping ? { compact: true } : {}),
    })
  : ''

  // 🛡️ L9 类名同源治理：生成确定性类名清单
  const classNameManifestContent = buildClassNameManifestSection(figmaNodeData, componentPrefix)

  // 🛡️ L11 文案白名单字面量注入：从 Figma TEXT 节点提取文案清单，LLM 必须逐字使用
  const textConstantsContent = buildTextConstantsSection(figmaNodeData)

  // 🛡️ L12 Vision-Figma 交叉验证：用 bbox IoU 匹配 vision 误读文字与 Figma 真值
  const visionFigmaCrossContent = buildVisionFigmaCrossSection(visionElementsForCross, figmaNodeData)

  return loadMd('engineer/stages/figma.md', {
    FIGMA_RULES_CONTENT: figmaRulesContent,
    TEXT_INVENTORY_SECTION: buildTextInventorySection(figmaNodeData),
    TEXT_CONSTANTS_SECTION: textConstantsContent,
    VISION_FIGMA_CROSS_SECTION: visionFigmaCrossContent,
    STRUCTURE_MARKERS_SECTION: buildStructureMarkersSection(figmaNodeData, context.componentType),
    FIGMA_STYLE_DATA: styleDataContent,
    STYLE_MAPPINGS: styleMappingsContent,
    ELEMENT_STYLE_MAP_SECTION: elementStyleMapSection,
    ASSETS_LIST: assetsListContent,
    RESOURCE_DOM_MAPPING: resourceDomMappingContent,
    CLASS_NAME_MANIFEST: classNameManifestContent,
  })
}

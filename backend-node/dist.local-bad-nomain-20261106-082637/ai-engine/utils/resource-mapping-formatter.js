/**
 * Resource Mapping Formatter - 资源映射格式化公共工具
 * 统一 data-agent / microcode-engineer / vue3-engineer 的资源格式化逻辑
 *
 * 单一事实源：所有 _formatResourceMapping / formatResourceMapping 调用都走这里。
 */

import { filterAvailableResources } from './resource-import-guard.js'

/**
 * 按角色分组资源映射
 * @param {Array} mappings - resourceDomMapping 数组
 * @returns {Object} { bg: [...], icon: [...], img: [...], image: [...] }
 */
export function groupByRole(mappings) {
  const groups = {}
  mappings.forEach(m => {
    const role = m.previewAnalysisRole || 'unknown'
    if (!groups[role]) groups[role] = []
    groups[role].push(m)
  })
  return groups
}

/**
 * 区分可用和不可用资源
 * @param {Array} mappings - resourceDomMapping 数组
 * @returns {Object} { available: [...], failed: [...] }
 */
export function partitionByStatus(mappings) {
  // R0-6（2026-09-01）：available 侧统一走 filterAvailableResources 单一过滤帮手
  const available = filterAvailableResources(mappings)
  const failed = mappings.filter(m => m.downloadStatus !== 'success')
  return { available, failed }
}

/**
 * 判断单条资源是否为「面板级资源」（bg/background/header/panel-header/title-bar）。
 *
 * 单一事实源：本函数是「面板级资源」判定的唯一权威实现。
 * - filterPanelResources（prompt 侧过滤）复用本函数
 * - figma-connector._buildResourceDomMapping（生成侧标记 isPanelResource）复用本函数
 * 保证「哪些资源会被过滤」在生成侧与 prompt 侧口径完全一致，编号永不漂移。
 *
 * @param {object} m 单条 mapping 记录
 * @returns {boolean}
 */
export function isPanelResource(m) {
  if (!m) return false
  const figmaPath = m.figmaPath || ''
  const name = m.name || ''
  if (/^[^/]+\/(bg|background|header|panel-header|title-bar)$/i.test(figmaPath)) return true
  if (/^(bg|background|header|panel-header|title-bar)$/i.test(name)) return true
  return false
}

/**
 * 微码模式下，过滤面板级资源（bg/header），避免 LLM 使用 base-panel 应提供的资源。
 * @param {Array} mappings
 * @returns {Array} 过滤后的映射
 */
export function filterPanelResources(mappings) {
  return mappings.filter(m => !isPanelResource(m))
}

/**
 * 从 figmaPath 推断语义位置（纯函数，原 microcode-engineer._extractSemanticLocation）
 * @param {string} figmaPath
 * @returns {string}
 */
export function extractSemanticLocation(figmaPath) {
  if (!figmaPath) return ''
  // 全透传（2026-08-25 用户明确要求：不要白名单和过滤）。
  // 背景：此前白名单只认 header/sub-header/bg/icon/title-left/数字，
  // 把 tabs-list / sub-t / slot-con 等业务语义段当噪声丢弃，
  // 导致 LLM 无法定位资源所属容器（bg2 位置="背景"废话、icon2 位置=""）。
  // 现在 Figma 路径所有段原样保留，仅去空段（字符串清理，非语义过滤）。
  return String(figmaPath).split('/').filter(Boolean).join(' - ')
}

/**
 * 格式化资源索引（供 data-agent 使用，简洁版）
 * @param {Array} mappings - resourceDomMapping 数组
 * @returns {string} Markdown 格式的资源索引
 */
export function formatResourceIndex(mappings) {
  if (!mappings || mappings.length === 0) return ''

  const { available, failed } = partitionByStatus(mappings)
  const { bg = [], icon = [], img = [], image = [] } = groupByRole(available)

  const lines = []

  if (icon.length > 0) {
    lines.push('**图标资源：**')
    icon.forEach((mapping, index) => {
      lines.push(`- 索引${index + 1}: ${mapping.hint}`)
    })
  }

  if (bg.length > 0) {
    lines.push('\n**背景图资源：**')
    bg.forEach((mapping, index) => {
      lines.push(`- 索引${index + 1}: ${mapping.hint}`)
    })
  }

  if (failed.length > 0) {
    lines.push('\n**⚠️ 不可用资源（不要在iconIndex中引用）：**')
    failed.forEach(m => {
      lines.push(`- ❌ ${m.hint} (下载失败，请忽略)`)
    })
  }

  return lines.join('\n')
}

/**
 * 格式化资源映射详情（统一详细版）。
 *
 * 合并了原 microcode-engineer._formatResourceMapping 的全部增强逻辑：
 * - 面板级资源过滤（filterPanelResources）
 * - 语义位置推断（extractSemanticLocation）
 * - AI 生成图识别（jimeng- 路径）
 * - 装饰性图标标注（isTinyDecoration）
 * - backgroundSize/Position/Repeat 样式提示
 *
 * @param {Array} mappings - resourceDomMapping 数组
 * @param {Object} options
 * @param {boolean} [options.includeVisualMeta=true] - 是否输出视觉元数据
 * @param {boolean} [options.filterPanelResources=false] - 微码模式：过滤面板级资源
 * @param {boolean} [options.semanticLocation=false] - 微码模式：从 figmaPath 推断语义位置
 * @param {string}  [options.importPrefix=''] - import 路径前缀（微码用 './'，vue3 用 ''）
 * @returns {string} Markdown 格式的资源映射
 */
export function formatResourceMapping(mappings, options = {}) {
  // 🆕 2026-08-27 #275-4：compact 模式转发紧凑实现（信息等价，体积 -47%）
  if (options.compact === true) {
    return formatResourceMappingCompact(mappings, options)
  }
  if (!mappings || mappings.length === 0) return ''

  const {
    includeVisualMeta = true,
    filterPanelResources: doPanelFilter = false,
    semanticLocation: useSemanticLocation = false,
    importPrefix = '',
  } = options

  // ── 面板级资源过滤 ──
  let filteredMappings = mappings
  if (doPanelFilter) {
    filteredMappings = filterPanelResources(mappings)
  }

  // 🛡️ 删减法批次 2 loop 2c（2026-09-14）：同图共享别名折叠。
  // visual-order-assign 已把同 resourceFile 条目共用 assignedVarName 并标记 isSharedAlias；
  // prompt 只呈现首个条目（单一事实），别名不再逐条列出诱导 LLM 多别名引用。
  filteredMappings = filteredMappings.filter((m) => !m?.isSharedAlias)

  if (filteredMappings.length === 0) return ''

  const { available, failed } = partitionByStatus(filteredMappings)
  const { bg = [], icon = [], img = [], image = [] } = groupByRole(available)
  const imgAll = [...img, ...image]

  const lines = ['## 🎨 资源使用映射（必须遵守）', '']

  // ── 辅助函数 ──
  const semLoc = (mapping) => useSemanticLocation ? extractSemanticLocation(mapping.figmaPath) : ''

  // === 背景图 ===
  if (bg.length > 0) {
    lines.push('### 背景图资源（必须使用）')
    lines.push('')
    // 🎯 挂载速查表（#3 资源挂载表确定性注入，2026-08-29）：模型在长篇逐条描述里容易漏看
    // 挂载归属，导致张冠李戴（mc-max-1787923972602 实锤：295×27 的 tabs 条图铺满图表区、
    // 78×21 激活图铺满整条 section）。一张结构化速查表让「变量 → 尺寸 → 挂载目标 → 角色」
    // 一目了然，配合下方总则形成「照表挂载」的确定性约束。
    lines.push('🎯 **背景挂载速查表**（照表挂载，禁止挪用）：')
    lines.push('')
    lines.push('| 变量 | 尺寸 | 挂载目标 | 角色 |')
    lines.push('|---|---|---|---|')
    bg.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `bg${index + 1}`
      const w = mapping.visualMeta?.width || mapping.figmaBox?.width || '?'
      const h = mapping.visualMeta?.height || mapping.figmaBox?.height || '?'
      const target = mapping.skipMount
        ? '⏭️ 面板外壳（不还原）'
        : mapping.bgRole === 'sub-state'
          ? `${mapping.mountTarget || '容器'} 内的激活/状态子项`
          : mapping.mountTarget || mapping.targetDomSelector || '组件根容器'
      const role = mapping.skipMount
        ? '面板背景'
        : mapping.bgRole === 'sub-state'
          ? '状态背景'
          : '区域背景'
      lines.push(`| \`${varName}\` | ${w}×${h} | ${target} | ${role} |`)
    })
    lines.push('')
    bg.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `bg${index + 1}`
      const loc = semLoc(mapping)
      const locationHint = loc ? `（位置：${loc}）` : ''
      const enhancedHint = loc ? `${loc}的背景图` : (mapping.hint || '')

      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**${locationHint}`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      lines.push(`- 使用：\`${mapping.usage.replace('bgX', varName)}\``)
      lines.push(`- 说明：${enhancedHint}`)
      // bg→父容器挂载目标（2026-08-25 用户规则：bg 是父元素的背景，面板直接子 bg 不还原）
      if (mapping.skipMount) {
        lines.push(`- ⏭️ 面板整体背景：无需组件内还原（由面板外壳/宿主处理），禁止贴到任何内部元素`)
      } else {
        if (mapping.bgRole === 'sub-state') {
          // 局部/状态背景（几何推导：面积远小于父容器），如激活 tab 的高亮背景
          lines.push(`- 🎯 定位：这是 \`${mapping.mountTarget}\` 容器内「某个子项的状态背景」（如激活态高亮），必须挂到该子项上（推荐 :style 条件绑定激活态），禁止挂到父容器整体、禁止拉伸铺满整个父容器`)
        } else if (mapping.mountTarget) {
          lines.push(`- 🎯 挂载目标：\`${mapping.mountTarget}\` 容器 —— 此图是该容器的整块背景，必须作为该容器的 backgroundImage，禁止用于其他区域`)
        }
        // 🛡️ 覆盖丢失类（2026-09-01 事故 mc-max-1788239096135-c19dfe56 实锤）：
        // 旧链路把这条铁律**只放在 sub-state 分支**，区域背景（bgRole='container'）拿不到 →
        // LLM 用 `linear-gradient(90deg,#b5deff,#d1ecff)` 替代 bg-7890.png（tabs-list 胶囊形
        // 背景），两端圆弧丢失，视觉与设计稿不符。
        // 铁律对所有「需要在组件内还原」的 bg 都成立，与 bgRole 无关 → 提升到分支外。
        lines.push(`- 🔴 图片铁律：禁止用 CSS linear-gradient 渐变「替代」此图——设计稿是图片就必须用图片（mc-max-1787923972602 / mc-max-1788239096135-c19dfe56 实锤：模型用渐变替代 bg 导致视觉不符）`)
      }
      if (includeVisualMeta && mapping.visualMeta) {
        // 🛡️ 2026-09-15（与 compact 版同口径）：**可用资源不输出 fillsSummary**。
        // 该值是节点自身的填充（其视觉已由 resourceFile 图片承载），吐出来等于给
        // 「禁止用 CSS gradient 替代 bg」递刀 —— 模型会把它抄成某元素的 CSS 背景
        // （实机：写到 .c-env-monitor-tab-item 上并盖住了本该显示的 bg-7890.png）。
        // 尺寸/效果不是「另一种视觉表达」，保留。
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px（按 Figma 实际 UI 尺寸/比例渲染，禁止拉伸压扁）`)
        if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
      }
      lines.push(`- ⚠️ CSS禁止：background/border/border-radius`)
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    bg.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `bg${index + 1}`
      lines.push(`import ${varName} from '${importPrefix}${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    // 使用示例（带 backgroundSizing 提示）
    lines.push('**⚠️ 强制要求：必须在template中使用这些变量**')
    lines.push('```vue')
    bg.slice(0, 2).forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `bg${index + 1}`
      const bgSizing = mapping.backgroundSize || mapping.backgroundPosition || mapping.backgroundRepeat
        ? `, backgroundSize: '${mapping.backgroundSize || 'cover'}', backgroundPosition: '${mapping.backgroundPosition || 'center'}', backgroundRepeat: '${mapping.backgroundRepeat || 'no-repeat'}'`
        : ''
      lines.push(`<div :style="{ backgroundImage: \`url(\${${varName}})\`${bgSizing} }">...</div>`)
    })
    lines.push('```')
    lines.push('❌ **禁止**：不使用bg变量，直接写CSS background')
    lines.push('')
    // 🔴 全局负向约束（mc-max-1787923972602 实锤，2026-08-28）：模型把 295×27 的 tabs 条背景
    // 挪用铺满图表区、给图标按钮区强加背景——「有资源就往容器塞」是系统性倾向，必须负向禁止。
    lines.push('🔴 **背景挂载总则（硬约束）**：')
    lines.push('1. 每张 bg 资源只允许挂载到上面对应的挂载目标容器，禁止挪用到其他区域（尤其禁止把小尺寸状态图/条形图拉伸铺满大容器）')
    lines.push('2. 设计稿中**没有背景资源的区域禁止添加任何 background-image / background**（图表容器、图标按钮区通常是纯透明区域，靠 echarts 内容/图标本身呈现）')
    lines.push('3. echarts 图表容器（ref 挂载的 div）不得挂任何背景图——图表自身按 Figma 配置渲染，容器只负责布局')
    lines.push('')
  }

  // === 图标 ===
  if (icon.length > 0) {
    lines.push('### 图标资源（必须使用）')
    lines.push('')
    icon.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `icon${index + 1}`
      const loc = semLoc(mapping)
      const locationHint = loc ? `（位置：${loc}）` : ''

      // AI 生成图识别
      const aiImageDesc = (mapping.figmaPath && mapping.figmaPath.match(/jimeng-[^/]+/))
        ? `[AI生成图: ${extractSemanticLocation(mapping.figmaPath)}]` : ''

      // 装饰性图标标注
      const decoTag = mapping.isTinyDecoration ? ' 🔸[装饰元素·非业务图标]' : ''

      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**${locationHint}${decoTag}`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      if (aiImageDesc) lines.push(`- 类型：${aiImageDesc}`)

      // 装饰性图标详细说明
      if (mapping.isTinyDecoration) {
        const _w = mapping.visualMeta?.width ?? mapping.figmaBox?.width ?? '?'
        const _h = mapping.visualMeta?.height ?? mapping.figmaBox?.height ?? '?'
        lines.push(`- ⚠️ **装饰性微元素（${_w}×${_h}px）**：这是圆点/短线/分隔符一类的纯装饰图形，**不是**标题图标或业务图标。`)
        lines.push(`  - ✅ 允许：作为标题前的小圆点、列表项前缀符、分隔装饰按原始尺寸渲染。`)
        lines.push(`  - ❌ 禁止：当作面板主图标 / 卡片业务图标使用；禁止放大到 20px 以上（会糊）。`)
        lines.push(`  - 💡 若该位置在设计稿中看起来需要一个"真正的图标"，请从下方尺寸正常的 icon 中选取，而不是用这个装饰点。`)
      }

      lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)

      // 增强说明
      const enhancedHint = loc
        ? `${loc}的${mapping.previewAnalysisRole === 'bg' ? '背景' : '图标'}${mapping.hint && mapping.hint !== `${mapping.previewAnalysisRole} → ${mapping.targetDomHint}` ? `（${mapping.hint}）` : ''}`
        : (mapping.hint || '')
      lines.push(`- 说明：${enhancedHint}`)

      if (includeVisualMeta && mapping.visualMeta) {
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px（按 Figma 实际 UI 尺寸/比例渲染，禁止拉伸压扁）`)
        if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
      }
      // 🛡️ 视觉臆造类（2026-09-01 事故 mc-max-1788239096135-c19dfe56 实锤）：
      // bg 分区（上方）早有「CSS禁止：background/border/border-radius」，icon 分区**没有** →
      // LLM 看到 icon-7941.png 自带浅蓝底色（视觉上像「带边框的按钮」），据此推断按钮也该有
      // 边框，给包 icon1/icon2 的容器臆造 `border: 1px solid #a1ceff` → 双重边框。
      // 图标 PNG 已自带边框与底色（都画在图里），外层容器再加描边必然重复。
      lines.push(`- ⚠️ CSS禁止：禁止给图标的容器/包裹元素加 border / border-radius / background —— 图标 PNG 已自带边框与底色（已画在图片内），额外描边会产生双重边框`)
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    icon.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `icon${index + 1}`
      lines.push(`import ${varName} from '${importPrefix}${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    lines.push('**⚠️ 强制要求：必须在data中使用这些变量**')
    lines.push('```javascript')
    lines.push('const data = ref([')
    icon.slice(0, Math.min(4, icon.length)).forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `icon${index + 1}`
      lines.push(`  { label: '项目${index + 1}', value: '...', icon: ${varName} }, // ✅ 使用${varName}变量`)
    })
    lines.push('])')
    lines.push('```')
    lines.push('❌ **禁止设置为null**：`icon: null` 是错误的！')
    lines.push('')
  }

  // === 图片 ===
  if (imgAll.length > 0) {
    lines.push('### 图片资源（必须使用）')
    lines.push('')
    imgAll.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `img${index + 1}`
      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)
      lines.push(`- 说明：${mapping.hint}`)
      if (includeVisualMeta && mapping.visualMeta) {
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px（按 Figma 实际 UI 尺寸/比例渲染，禁止拉伸压扁）`)
      }
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    imgAll.forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `img${index + 1}`
      lines.push(`import ${varName} from '${importPrefix}${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    lines.push('**⚠️ 强制要求：必须使用img变量**')
    lines.push('```vue')
    imgAll.slice(0, 2).forEach((mapping, index) => {
      const varName = mapping.assignedVarName || mapping.semanticVarName || `img${index + 1}`
      lines.push(`<img :src="${varName}" alt="图片${index + 1}" />`)
    })
    lines.push('```')
    lines.push('')
  }

  // === 不可用资源 ===
  const failedBg = failed.filter(m => m.previewAnalysisRole === 'bg')
  const failedIcon = failed.filter(m => m.previewAnalysisRole === 'icon')
  const failedImg = failed.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

  if (failed.length > 0) {
    lines.push('## ⚠️ 不可用资源（原图缺失，禁止使用变量引用）')
    lines.push('')
    lines.push('以下资源的**原图下载失败**（可能是 AI 生成图或 Figma 嵌入资源无法导出）：')
    lines.push('')
    lines.push('**关键规则：缺失的资源没有对应变量！不要猜测、不要用其他图片替代该位置！**')
    lines.push('- 缺失图标的位置：直接用 CSS/伪元素/Unicode 绘制简单装饰，或留空（不要从其他位置挪用图标）')
    lines.push('- 如果某个卡片的图标缺失，该卡片可以只显示文字+背景，不强制必须有图标')
    lines.push('')

    failedBg.forEach(m => {
      const loc = semLoc(m)
      const locTag = loc ? ` [${loc}]` : ''
      lines.push(`- **背景${locTag}**: ${m.fallbackHint}`)
      lines.push(`  CSS替代：background: ${m.cssValue || 'linear-gradient(180deg, #edf4fb, #d6e8f5)'};`)
      lines.push('')
    })

    failedIcon.forEach(m => {
      const loc = semLoc(m)
      const locTag = loc ? ` [${loc}]` : ''
      const isAiImage = (m.figmaPath || '').includes('jimeng-')
      const aiTag = isAiImage ? ' (AI生成原图未导出)' : ''
      lines.push(`- **图标${locTag}${aiTag}**: ${m.fallbackHint}`)
      if (m.visualMeta?.fillsSummary && m.visualMeta.fillsSummary !== '#00000000') {
        lines.push(`  颜色参考：${m.visualMeta.fillsSummary}（可用同色系 CSS 图形替代）`)
      }
      lines.push(`  替代方案：用 CSS 伪元素绘制简单形状 / 使用 Unicode 字符 / 直接省略该图标`)
      lines.push('')
    })

    failedImg.forEach(m => {
      const loc = semLoc(m)
      const locTag = loc ? ` [${loc}]` : ''
      lines.push(`- **图片${locTag}**: ${m.fallbackHint}`)
      lines.push(`  替代方案：用CSS绘制占位区域 + 装饰样式`)
      lines.push('')
    })

    lines.push('**绝对不要引用这些缺失资源的变量（它们不存在），也不要把其他位置的图标挪到缺失位置！**')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 🆕 紧凑版资源映射（2026-08-27 #275-4）：template/style 分块专用。
 *
 * 背景：template 段 prompt 202KB 中，buildFigmaStage 的资源映射段（formatResourceMapping 全量）
 * 实测 74k chars / 31k tokens，是最大单一变量。全量格式包含大量冗余文案：
 *   - Import 示例段（模型不写 import，系统自动生成）
 *   - 使用示例代码块（usage 字段已含挂载方式）
 *   - 每条重复的「⚠️ CSS禁止」「禁止设置为null」等固定行
 *   - 装饰性图标的超长说明
 *
 * 信息等价性（对照全量逐字段保留）：
 *   - 变量名（assignedVarName/semanticVarName/序号兜底）
 *   - targetDomSelector（目标 DOM）
 *   - resourceFile（资源路径）
 *   - usage（挂载方式，bgX/iconX 替换为真实变量名）
 *   - semanticLocation（figmaPath 语义位置）
 *   - skipMount（面板整体背景不还原）/ bgRole=sub-state + mountTarget（状态背景挂载）/ mountTarget（容器挂载）
 *   - visualMeta（fillsSummary 样式 / width×height 尺寸防拉伸 / effectsSummary 效果）
 *   - backgroundSize/Position/Repeat（背景尺寸提示）
 *   - isTinyDecoration（装饰性微元素 + 尺寸）/ jimeng-（AI 生成图标记）
 *   - failed 段（fallbackHint / cssValue / fillsSummary 颜色参考）
 *
 * @param {Array} mappings - resourceDomMapping 数组
 * @param {Object} options - 同 formatResourceMapping（filterPanelResources / semanticLocation）
 * @returns {string} 紧凑 Markdown（关键字段等价，体积 -47%）
 */
export function formatResourceMappingCompact(mappings, options = {}) {
  if (!mappings || mappings.length === 0) return ''
  const {
    filterPanelResources: doPanelFilter = false,
    semanticLocation: useSemanticLocation = false,
  } = options

  let filteredMappings = mappings
  if (doPanelFilter) {
    filteredMappings = filterPanelResources(mappings)
  }
  // 🛡️ 2c：同图共享别名折叠（同 formatResourceMapping 主实现口径）
  filteredMappings = filteredMappings.filter((m) => !m?.isSharedAlias)
  if (filteredMappings.length === 0) return ''

  const { available, failed } = partitionByStatus(filteredMappings)
  const { bg = [], icon = [], img = [], image = [] } = groupByRole(available)
  const imgAll = [...img, ...image]

  const lines = [
    '## 🔴 资源使用铁律（命名语义强制约束）',
    '',
    '**bg / icon / img 是用户自定义命名，代表设计意图，必须使用：**',
    '- 命名为 `bg` 的节点：必须作为 `backgroundImage` 使用，禁止用 CSS gradient/color 替代',
    '- 命名为 `icon` 的节点：必须作为 `<img :src>` 使用，禁止用 CSS 图形/字体图标替代',
    '- 命名为 `img` 的节点：必须作为 `<img :src>` 使用',
    '- 资源映射表中的每个资源都必须使用，未使用 = 生成失败',
    '',
    '---',
    '',
    '## 🎨 资源使用映射（紧凑版·关键字段与全量等价）',
    '',
  ]
  const varName = (m, i, prefix) => m.assignedVarName || m.semanticVarName || `${prefix}${i + 1}`

  const pushRes = (m, i, prefix) => {
    const vn = varName(m, i, prefix)
    const loc = useSemanticLocation ? extractSemanticLocation(m.figmaPath) : ''
    const vm = m.visualMeta || {}
    const tags = []
    if (loc) tags.push(`位置:${loc}`)
    if (m.isTinyDecoration) tags.push('🔸装饰微元素')
    if ((m.figmaPath || '').includes('jimeng-')) tags.push('AI生成图')
    if (m.skipMount) tags.push('⏭️面板整体背景不还原')
    else if (m.bgRole === 'sub-state') tags.push(`🎯挂到子项${m.mountTarget || '?'}(状态背景)`)
    else if (m.mountTarget) tags.push(`🎯挂载:${m.mountTarget}`)
    if (vm.width && vm.height) tags.push(`${vm.width}×${vm.height}px`)
    const tagStr = tags.length ? ` | ${tags.join(' | ')}` : ''
    lines.push(`**${vn}** → \`${m.targetDomSelector || m.targetDomHint || '?'}\`${tagStr}`)
    const usageStr = m.usage ? `使用:\`${m.usage.replace(/bgX/g, vn).replace(/iconX/g, vn)}\`` : ''
    lines.push(`   资源:\`${m.resourceFile}\`${usageStr ? ' ' + usageStr : ''}`)
    // 🛡️ 2026-09-15（mc-max-1789452271404-7e0e19d2 实锤）：**可用（已下载）资源不再输出「样式:fillsSummary」**。
    //
    // 背景：原实现只按 available/failed 分流，对 downloadStatus=success 的资源也把节点填充值当「样式」
    // 吐出来（如 `样式:linear-gradient(#b5deff 0%, #d1ecff 100%)`）。这与本段开头的铁律
    // 「命名为 bg 的节点必须作为 backgroundImage 使用，**禁止用 CSS gradient/color 替代**」
    // **自相矛盾**，模型会照抄该值：实机产物把它写到 `.c-env-monitor-tab-item`（**错误元素**，应为
    // tabs-list 容器）上，且因 CSS 版不透明而**盖住**本该显示的 bg-7890.png。
    // 同一视觉只允许一条落地路径（单一事实源）= 图片本身；填充摘要对可用资源是纯噪声 + 误导。
    // 该值只在「资源缺失」时才有兜底意义 —— 见下方 failed 分支（那里会显式标注）。
    if (vm.effectsSummary) lines.push(`   效果:${vm.effectsSummary}`)
    if (m.backgroundSize || m.backgroundPosition || m.backgroundRepeat) {
      lines.push(`   bgSizing: ${m.backgroundSize || 'cover'}/${m.backgroundPosition || 'center'}/${m.backgroundRepeat || 'no-repeat'}`)
    }
    if (m.hint && !loc) lines.push(`   说明:${m.hint}`)
    lines.push('')
  }

  if (bg.length > 0) { lines.push('### 背景图资源（必须使用）', ''); bg.forEach((m, i) => pushRes(m, i, 'bg')) }
  if (icon.length > 0) { lines.push('### 图标资源（必须使用）', ''); icon.forEach((m, i) => pushRes(m, i, 'icon')) }
  if (imgAll.length > 0) { lines.push('### 图片资源（必须使用）', ''); imgAll.forEach((m, i) => pushRes(m, i, 'img')) }

  if (failed.length > 0) {
    lines.push('## ⚠️ 不可用资源（原图缺失，禁止引用变量）', '')
    failed.forEach((m) => {
      const loc = useSemanticLocation ? extractSemanticLocation(m.figmaPath) : ''
      lines.push(`- ${m.previewAnalysisRole || '?'}${loc ? ` [${loc}]` : ''} ${m.targetDomHint || m.name || ''}: ${m.fallbackHint || '原图缺失'}`)
      if (m.cssValue) lines.push(`  CSS替代: ${m.cssValue}`)
      if (m.visualMeta?.fillsSummary && m.visualMeta.fillsSummary !== '#00000000') {
        // 🛡️ 2026-09-15：仅当资源**确实缺失**时才给填充参考，且显式标注「兜底专用」——
        // 避免被当成通用样式规范抄到别处（可用资源已在上面分支刻意不输出该值）。
        lines.push(`  兜底填充参考（仅本资源缺失时使用，禁止用于其他元素）: ${m.visualMeta.fillsSummary}`)
      }
    })
    lines.push('', '**缺失资源没有变量，用 CSS/伪元素替代或留空，禁止挪用其他图标！**', '')
  }

  return lines.join('\n')
}

/**
 * 结构树节点 → resourceDomMapping 条目的精确匹配（2026-09-01 事故 5 衍生 · mc-max-1788239096135-c19dfe56）
 *
 * 背景（原实现在 visual-parser.extractFigmaHints 内联）：
 *   `m.figmaNodeId === nodeId || (name && (m.hint?.includes(name) || m.targetDomSelector?.includes(name)))`
 * 两个致命缺陷：
 *   ① 兜底用 **子串 includes**：`"tabs-icon → tabs-icon区域".includes("icon")` 为真；
 *   ② `find()` 按数组顺序取首个命中：事故 mapping 里容器 tabs-icon（idx 4，missing）排在
 *      它的两个 icon 子节点（idx 5/6，success → icon1/icon2）**之前**。
 *   ⇒ 下载成功的子图标被标成「⛔ 下载失败｜该位置无对应变量，禁止引用任何变量名」
 *   ⇒ LLM 不敢用 icon1/icon2 ⇒ 资源漏用（RESOURCE-001）。
 *   更糟的是 W4 新增的「禁止引用变量名」文案会被错误盖到真正有变量的节点上，放大危害。
 *
 * 修正策略（只保留确定性匹配，不做子串猜测）：
 *   1. figmaNodeId 精确相等 —— 唯一事实源，最高优先级；
 *   2. 节点名 **完全相等** 兜底（结构树节点 id 可能被裁剪/归一化而丢失）；
 *      同名多条目时**优先取 success/css**（兜底路径下尽量命中真正可用的资源）；
 *   3. 都不中 → null（调用方据此不加任何资源标注，避免误标）。
 *
 * @param {Object|null} node - 结构树节点，形如 { id, name }
 * @param {Array} resourceDomMapping - resourceDomMapping 数组
 * @returns {Object|null} 命中的 mapping 条目，未命中返回 null
 */
export function matchResourceMapping(node, resourceDomMapping) {
  const list = Array.isArray(resourceDomMapping) ? resourceDomMapping : []
  if (!node || typeof node !== 'object' || list.length === 0) return null

  const nodeId = node.id != null ? String(node.id) : ''
  const name = node.name != null ? String(node.name) : ''

  // 1. figmaNodeId 精确匹配（唯一事实源）
  if (nodeId) {
    const byId = list.find(m => m && m.figmaNodeId != null && String(m.figmaNodeId) === nodeId)
    if (byId) return byId
  }

  // 2. 节点名完全相等兜底（子串 includes 已废弃）
  if (name) {
    const sameName = list.filter(m => m && m.name != null && String(m.name) === name)
    if (sameName.length > 0) {
      // 同名多条目时优先取「有变量可用」的，避免把成功资源标成失败
      const usable = sameName.find(m => m.downloadStatus === 'success' || m.downloadStatus === 'css')
      return usable || sameName[0]
    }
  }

  // 3. 信息不足 → 不猜，返回 null（宁可不标注，也不误标）
  return null
}

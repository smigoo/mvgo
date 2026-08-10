/**
 * Resource Mapping Formatter - 资源映射格式化公共工具
 * 统一 data-agent / microcode-engineer / component-assembler 的资源格式化逻辑
 */

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
  const available = mappings.filter(m => m.downloadStatus === 'success')
  const failed = mappings.filter(m => m.downloadStatus !== 'success')
  return { available, failed }
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
 * 格式化资源映射详情（供 microcode-engineer 使用，详细版）
 * @param {Array} mappings - resourceDomMapping 数组
 * @param {Object} options - { includeVisualMeta: boolean }
 * @returns {string} Markdown 格式的资源映射
 */
export function formatResourceMapping(mappings, options = {}) {
  if (!mappings || mappings.length === 0) return ''

  const { includeVisualMeta = true } = options
  const { available, failed } = partitionByStatus(mappings)
  const { bg = [], icon = [], img = [], image = [] } = groupByRole(available)
  const imgAll = [...img, ...image]  // 合并 img 和 image

  const lines = ['## 🎨 资源使用映射（必须遵守）', '']

  // === 背景图 ===
  if (bg.length > 0) {
    lines.push('### 背景图资源（必须使用）')
    lines.push('')
    bg.forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `bg${index + 1}`
      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      lines.push(`- 使用：\`${mapping.usage.replace('bgX', varName)}\``)
      lines.push(`- 说明：${mapping.hint}`)
      if (includeVisualMeta && mapping.visualMeta) {
        if (mapping.visualMeta.fillsSummary) lines.push(`- 样式：${mapping.visualMeta.fillsSummary}`)
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
        if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
      }
      lines.push(`- ⚠️ CSS禁止：background/border/border-radius`)
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    bg.forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `bg${index + 1}`
      lines.push(`import ${varName} from '${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    lines.push('**⚠️ 强制要求：必须使用bg变量作为背景图**')
    lines.push('```vue')
    bg.slice(0, 2).forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `bg${index + 1}`
      lines.push(`<div :style="{ backgroundImage: 'url(' + ${varName} + ')' }">...</div>`)
    })
    lines.push('```')
    lines.push('❌ **禁止**：不使用bg变量，直接写CSS background')
    lines.push('')
  }

  // === 图标 ===
  if (icon.length > 0) {
    lines.push('### 图标资源（必须使用）')
    lines.push('')
    icon.forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `icon${index + 1}`
      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)
      lines.push(`- 说明：${mapping.hint}`)
      if (includeVisualMeta && mapping.visualMeta) {
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
        if (mapping.visualMeta.effectsSummary) lines.push(`- 效果：${mapping.visualMeta.effectsSummary}`)
      }
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    icon.forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `icon${index + 1}`
      lines.push(`import ${varName} from '${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    lines.push('**⚠️ 强制要求：必须在data中使用这些变量**')
    lines.push('```javascript')
    lines.push('const data = ref([')
    icon.slice(0, Math.min(4, icon.length)).forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `icon${index + 1}`
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
      const varName = mapping.semanticVarName || `img${index + 1}`
      lines.push(`**${index + 1}. ${mapping.targetDomSelector}**`)
      lines.push(`- 资源：\`${mapping.resourceFile}\``)
      lines.push(`- 使用：\`${mapping.usage.replace('iconX', varName)}\``)
      lines.push(`- 说明：${mapping.hint}`)
      if (includeVisualMeta && mapping.visualMeta) {
        if (mapping.visualMeta.width && mapping.visualMeta.height) lines.push(`- 尺寸：${mapping.visualMeta.width}×${mapping.visualMeta.height}px`)
      }
      lines.push('')
    })

    lines.push('**Import示例（系统会自动生成，你不要写）：**')
    lines.push('```javascript')
    imgAll.forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `img${index + 1}`
      lines.push(`import ${varName} from '${mapping.resourceFile}'`)
    })
    lines.push('```')
    lines.push('')

    lines.push('**⚠️ 强制要求：必须使用img变量**')
    lines.push('```vue')
    imgAll.slice(0, 2).forEach((mapping, index) => {
      const varName = mapping.semanticVarName || `img${index + 1}`
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
    lines.push('## ⚠️ 不可用资源（禁止使用变量引用，必须用CSS替代）')
    lines.push('')
    lines.push('以下资源下载失败，**不要使用bg/icon/img变量引用**，必须用CSS替代方案：')
    lines.push('')

    failedBg.forEach(m => {
      lines.push(`- **${m.hint}**: ${m.fallbackHint}`)
      // 🆕 如果有 visualMeta.fillsSummary，提供 CSS 渐变替代建议
      if (m.visualMeta?.fillsSummary) {
        lines.push(`  CSS替代示例：background: ${m.visualMeta.fillsSummary};`)
      } else {
        lines.push(`  CSS替代示例：background: linear-gradient(180deg, #051a1f, #0a2730); 或 background: #1a2a3a;`)
      }
      lines.push('')
    })

    failedIcon.forEach(m => {
      lines.push(`- **${m.hint}**: ${m.fallbackHint}`)
      lines.push(`  CSS替代示例：用伪元素+CSS绘制简单图标形状，或使用Unicode字符`)
      lines.push('')
    })

    failedImg.forEach(m => {
      lines.push(`- **${m.hint}**: ${m.fallbackHint}`)
      lines.push(`  CSS替代示例：用CSS绘制占位区域 + 装饰样式`)
      lines.push('')
    })

    lines.push('**绝对不要引用这些资源变量，否则代码会报错！**')
    lines.push('')
  }

  return lines.join('\n')
}

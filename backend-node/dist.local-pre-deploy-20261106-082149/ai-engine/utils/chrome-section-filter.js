/**
 * chrome-section-filter.js — preview-analysis chrome/content 分流单一事实源
 *
 * 微码组件由 base-panel 提供外壳标题栏，视觉分析中的 panel-title/title-itself/sub-header
 * 只应进入 headerSlots 或被剥离，不应作为业务 section 进入 SubcomponentPlanner。
 *
 * 🛡️ P1-1 (2026-09-08)：header 区含业务 controls（tab-switch / stat-item / icon-group）
 * 的 section 保留为业务 section 而非 chrome，确保 _inferHeaderSlots 能从 controls 提取 slots。
 */

// 🛡️ P1-1：header controls 中属于业务内容的类型（_inferHeaderSlots 可消费的）
const HEADER_BUSINESS_CONTROL_TYPES = /^(?:tab-switch|stat-item|statistic|text-group|icon-group|icon-button)$/

const CHROME_HEADER_RELATIONS = new Set([
  'title-itself',
  'panel-title',
  'title-note',
  'sub-header',
  'header-only',
])

const CHROME_ROLES = /^(?:header|panel-header|panel-title|title|title-bar|sub-header|chrome)$/i
const CHROME_NAME_RE = /(?:^|[-_\s/])(?:panel-title|title-note|sub-header|title-bar)(?:$|[-_\s/])/i

function textOf(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function normalizedRelation(section) {
  return textOf(section?.headerRelation || section?.header?.relation || section?.relation)
    .trim()
    .toLowerCase()
}

function sectionText(section) {
  const parts = [
    section?.id,
    section?.name,
    section?.title,
    section?.type,
    section?.role,
    section?.className,
    section?.header?.id,
    section?.header?.name,
    section?.header?.title,
    section?.header?.type,
    section?.header?.role,
  ]
  return parts.map(textOf).filter(Boolean).join(' ')
}

function childrenOf(section) {
  const out = []
  const push = (v) => {
    if (Array.isArray(v)) out.push(...v)
  }
  push(section?.children)
  push(section?.items)
  push(section?.elements)
  push(section?.body?.children)
  push(section?.body?.items)
  push(section?.body?.elements)
  push(section?.header?.controls)
  return out
}

function hasBusinessBody(section) {
  const children = childrenOf(section)
  if (children.length === 0) return false
  return children.some((child) => {
    const role = textOf(child?.role || child?.type).toLowerCase()
    const txt = sectionText(child).toLowerCase()
    if (/chart|list|grid|card|stat|metric|table|item|button|select|input|nav|tab|content|body|设备|流量|监测|预测|车型|告警|列表|卡片/.test(role)) return true
    if (/chart|list|grid|card|stat|metric|table|item|button|select|input|nav|tab|content|body|设备|流量|监测|预测|车型|告警|列表|卡片/.test(txt)) return true
    return false
  })
}

/**
 * 🛡️ P1-1（2026-09-08）：header 区含业务 controls 的 section 判定。
 * 仅当 header 存在、且 controls 中存在 tab-switch / stat-item / statistic / text-group /
 * icon-group / icon-button 之一时返回 true——这些 controls 是 _inferHeaderSlots 的消费源，
 * 若整节被 chrome 剔除，headerSlots 将为空，标题栏的 tab/统计/图标全部视觉丢失。
 */
function hasBusinessHeaderControls(section) {
  const header = section?.header || section?.titleBar || {}
  const controls = Array.isArray(header.controls) ? header.controls : []
  if (controls.length === 0) return false
  return controls.some((c) => {
    const cType = textOf(c?.type || c?.role).trim().toLowerCase()
    return HEADER_BUSINESS_CONTROL_TYPES.test(cType)
  })
}

/**
 * 判断一个 preview-analysis section 是否为 base-panel chrome，而不是业务内容。
 * 保守原则：只剔除明确 title-itself/panel-title/title-note/sub-header/header-only，
 * 或 role/name 均显示为 header 且没有业务 body 的 section。
 *
 * 🛡️ P1-1（2026-09-08）：header 区含业务 controls（tab-switch/stat-item/icon-group/icon-button/text-group）
 * 或 body 含业务子节点的 section 不判定为 chrome-only，确保 _inferHeaderSlots 能正常消费。
 */
export function isChromeOnlySection(section) {
  if (!section || typeof section !== 'object') return false

  const rel = normalizedRelation(section)
  const role = textOf(section.role || section.type || section.header?.role || section.header?.type).trim()
  const txt = sectionText(section)

  // Loop 2.0.C：chrome 关系/名称早退前先看业务 controls/body，否则 P1-1 是死代码。
  const looksChrome = CHROME_HEADER_RELATIONS.has(rel) || CHROME_NAME_RE.test(txt)
  if (looksChrome) {
    if (hasBusinessHeaderControls(section)) return false
    if (hasBusinessBody(section)) return false
    return true
  }

  // 🛡️ P1-1：header 区有业务 controls（tab/stat/icon）→ 不是纯 chrome，保留 headerSlots 消费源
  if (CHROME_ROLES.test(role)) {
    if (hasBusinessHeaderControls(section)) return false
    if (hasBusinessBody(section)) return false
    return true
  }

  return false
}

function filterSectionArray(sections, removed, path) {
  if (!Array.isArray(sections)) return sections
  const kept = []
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    if (isChromeOnlySection(section)) {
      removed.push({
        path: `${path}[${i}]`,
        id: section?.id,
        name: section?.name || section?.title,
        title: section?.title || section?.name,
        headerRelation: normalizedRelation(section) || undefined,
      })
      continue
    }
    kept.push(section)
  }
  return kept
}

/**
 * 原地清理 parsed 中所有可能的 section 入口，返回被剔除的 chrome section 清单。
 */
export function stripChromeSectionsInPlace(parsed) {
  const removed = []
  if (!parsed || typeof parsed !== 'object') return removed

  if (parsed.layout && Array.isArray(parsed.layout.sections)) {
    parsed.layout.sections = filterSectionArray(parsed.layout.sections, removed, 'layout.sections')
  }

  if (Array.isArray(parsed.sections)) {
    parsed.sections = filterSectionArray(parsed.sections, removed, 'sections')
  }

  if (parsed.layoutStructure && typeof parsed.layoutStructure === 'object') {
    if (Array.isArray(parsed.layoutStructure.sections)) {
      parsed.layoutStructure.sections = filterSectionArray(parsed.layoutStructure.sections, removed, 'layoutStructure.sections')
    }
    if (parsed.layoutStructure.layout && Array.isArray(parsed.layoutStructure.layout.sections)) {
      parsed.layoutStructure.layout.sections = filterSectionArray(parsed.layoutStructure.layout.sections, removed, 'layoutStructure.layout.sections')
    }
  }

  return removed
}

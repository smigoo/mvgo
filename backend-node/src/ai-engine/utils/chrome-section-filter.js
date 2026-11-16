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

/**
 * 🛡️ P2（2026-11-16 · c-monitor 73:3 实锤）：收集 section 上所有 Figma 节点标识。
 * vision 段的 id 形态不统一（多数 sections.id 即 Figma 节点 id，另有 figmaNode/
 * figmaNodeId 注入形态），全部收集并去重，供 chromeStrippedNodeIds 契约字段使用。
 */
function sectionNodeIds(section) {
  const out = []
  for (const key of ['id', 'figmaNode', 'figmaNodeId']) {
    const v = section?.[key]
    if (typeof v === 'string' && v) out.push(v)
    else if (typeof v === 'number') out.push(String(v))
  }
  return [...new Set(out)]
}

function filterSectionArray(sections, removed, path, headerOwnerId) {
  if (!Array.isArray(sections)) return sections
  const kept = []
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    // 🛡️ 2026-11-15（mc-max-1794749284344-c5e0aadc 实锤）：header 归属单一事实源优先。
    //   ownerId 来自 header-owner-truth#resolveHeaderOwner（结构锚 + 无量纲几何），
    //   此处不再按 headerRelation 字面二次判定——vision 把 header 组标成
    //   `content-below-title` 时旧判据会把它当业务段留在内容流（真插槽留内容区）。
    if (headerOwnerId && String(section?.id ?? '') === String(headerOwnerId)) {
      removed.push({
        path: `${path}[${i}]`,
        id: section?.id,
        name: section?.name || section?.title,
        title: section?.title || section?.name,
        headerRelation: normalizedRelation(section) || undefined,
        nodeIds: sectionNodeIds(section),
        reason: 'header-owner',
      })
      continue
    }
    if (isChromeOnlySection(section)) {
      removed.push({
        path: `${path}[${i}]`,
        id: section?.id,
        name: section?.name || section?.title,
        title: section?.title || section?.name,
        headerRelation: normalizedRelation(section) || undefined,
        nodeIds: sectionNodeIds(section),
        reason: 'chrome-relation',
      })
      continue
    }
    kept.push(section)
  }
  return kept
}

/**
 * 原地清理 parsed 中所有可能的 section 入口，返回被剔除的 chrome section 清单。
 * @param {object} parsed
 * @param {{ headerOwnerId?: string }} [opts] header 归属单一事实源给出的 owner id
 */
export function stripChromeSectionsInPlace(parsed, opts = {}) {
  const removed = []
  if (!parsed || typeof parsed !== 'object') return removed
  const headerOwnerId = typeof opts?.headerOwnerId === 'string' && opts.headerOwnerId ? opts.headerOwnerId : ''

  if (parsed.layout && Array.isArray(parsed.layout.sections)) {
    parsed.layout.sections = filterSectionArray(parsed.layout.sections, removed, 'layout.sections', headerOwnerId)
  }

  if (Array.isArray(parsed.sections)) {
    parsed.sections = filterSectionArray(parsed.sections, removed, 'sections', headerOwnerId)
  }

  if (parsed.layoutStructure && typeof parsed.layoutStructure === 'object') {
    if (Array.isArray(parsed.layoutStructure.sections)) {
      parsed.layoutStructure.sections = filterSectionArray(parsed.layoutStructure.sections, removed, 'layoutStructure.sections', headerOwnerId)
    }
    if (parsed.layoutStructure.layout && Array.isArray(parsed.layoutStructure.layout.sections)) {
      parsed.layoutStructure.layout.sections = filterSectionArray(parsed.layoutStructure.layout.sections, removed, 'layoutStructure.layout.sections', headerOwnerId)
    }
  }

  // 🛡️ P2（2026-11-16 · c-monitor 73:3 实锤）：契约字段 —— 把被剥离 chrome/header-owner 段的
  //   Figma 节点 id 记到 parsed 上，供 A4 几何并集（figma-height-ratio#geometricUnionHeightFor）
  //   作「已被 chrome 剥离的节点不得再被段高吸收」判据（病灶：剥离后的 header 1:449 薄条
  //   既不在 claimedIds、又无人认领，被 tab 段向上吸收，段高 27 → 256）。
  //   经 parsed 对象自动贯通双消费方（visual-parser 主链 / phase2 缓存补跑），零接线；
  //   旧缓存无此字段 ⇒ A4 侧 null ⇒ 旧行为（fail-open）。
  if (removed.length > 0) {
    const prev = Array.isArray(parsed.chromeStrippedNodeIds) ? parsed.chromeStrippedNodeIds : []
    parsed.chromeStrippedNodeIds = [...new Set([...prev, ...removed.flatMap((r) => r.nodeIds || [])])]
  }

  return removed
}

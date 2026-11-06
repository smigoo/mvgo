/**
 * 🛡️ Loop 2.1.B（2026-09-10）：@antd/tab / tabs / 竖 nav 强制 {nav, panels} 二元结构。
 *
 * 旧行为：planner 只把 tab/nav 当普通 section 产出拆分清单，不约束内部二元结构，
 * 导致竖 tab 的 nav 头在生成产物中丢失（device 左侧竖 tab 头整段消失）。
 *
 * 新行为：对 role∈{tabs,nav} 或 name 命中 @antd/tab / tab / 导航 的 section，
 * 确定性校验/补全省 {nav, panels} 结构：
 *   - nav：若 body.children 中存在 role/name 含 nav/tab 的子节点 → present=true；
 *          否则 present=false 且 placeholder=true（下游必须渲染 nav 占位，不得丢）。
 *   - panels：收集 body 内非 nav 的主内容子节点 id（figmaNode）。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；不修改入参。
 *
 * @param {object} section - visual-parser 产物（含 role / name / body.children）
 * @returns {object} 原 section 增加 `tabStructure` 字段（非 tab/nav 类型原样返回、无该字段）
 */
const TAB_ROLES = new Set(['tabs', 'nav'])
const NAV_HINT = /(^|[\/_-])(nav|tab)([\/_-]|$)|导航|标签页|标签/

function isTabLike(section) {
  if (!section || typeof section !== 'object') return false
  const role = String(section.role || '').toLowerCase()
  if (TAB_ROLES.has(role)) return true
  const name = String(section.name || '').toLowerCase()
  return NAV_HINT.test(name)
}

function isNavNode(node) {
  const role = String(node?.role || '').toLowerCase()
  const name = String(node?.name || '').toLowerCase()
  return /nav|tab|导航|标签页|标签/.test(`${role} ${name}`)
}

/**
 * 🎯 治本 A（2026-09-10）：判定 tab/nav 的方向（横向顶部 tab vs 竖向侧栏 nav）。
 *
 * 旧行为（a78a980）：所有 @antd/tab / nav 一律按"竖向 nav"处理 → device 的
 * 横向顶部 tab 条（监控/照明/通风…）被误判成左侧竖栏。
 *
 * 新行为：依据 nav 子节点（或 section 自身）的 absoluteBoundingBox 几何特征判定：
 *   - nav 节点宽度 > 高度 * 1.5（或 layoutMode 为 'HORIZONTAL' 且自身宽>高）→ 'horizontal'
 *   - 否则 → 'vertical'
 * fail-closed：无 bbox / 无几何信息时回退 'vertical'（保持旧行为，不破既有竖向 nav 样本）。
 *
 * @param {object} section
 * @returns {'horizontal'|'vertical'}
 */
function inferTabOrientation(section) {
  const children = Array.isArray(section?.body?.children) ? section.body.children : []
  const navNode = children.find(isNavNode) || section
  const bbox =
    navNode?.absoluteBoundingBox ||
    navNode?.size ||
    section?.absoluteBoundingBox ||
    section?.size
  if (bbox && Number(bbox.width) > 0 && Number(bbox.height) > 0) {
    if (Number(bbox.width) > Number(bbox.height) * 1.5) return 'horizontal'
    const layoutMode = String(section?.layoutMode || navNode?.layoutMode || '').toUpperCase()
    if (layoutMode === 'HORIZONTAL' && Number(bbox.width) >= Number(bbox.height)) {
      return 'horizontal'
    }
    return 'vertical'
  }
  // 无几何信息：保持旧默认（竖向），fail-closed
  return 'vertical'
}

export function enforceTabStructure(section) {
  if (!isTabLike(section)) return section

  const children = Array.isArray(section?.body?.children) ? section.body.children : []
  const navNode = children.find(isNavNode)
  const panelNodes = children.filter((c) => !isNavNode(c))

  const orientation = inferTabOrientation(section)
  const tabStructure = {
    nav: navNode
      ? { present: true, figmaNode: navNode.figmaNode || navNode.id }
      : { present: false, placeholder: true },
    panels: panelNodes.map((c) => c.figmaNode || c.id).filter(Boolean),
    // 🎯 治本 A：方向标注。横向顶部 tab 不套竖向 nav 语义（planner/engineer 据此区分）。
    orientation,
  }

  return { ...section, tabStructure }
}

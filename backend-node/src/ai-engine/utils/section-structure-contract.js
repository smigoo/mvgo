/**
 * section 装配结构契约：最终生效树 → contentType/placement/parent/children。
 *
 * 只在 resolvePlanSections() 之后派生，不写回 planner；placement 是空间归属，
 * 与 type=header 的内容语义分离。index 的插槽、bodyRoots、递归渲染共用本契约。
 */
import { isLayoutContainerSection } from './section-tree.js'

function hasBusinessBody(section) {
  return ['body', 'declaredContent'].some((root) => {
    const value = section?.[root]
    return ['items', 'children', 'elements'].some(
      (key) => Array.isArray(value?.[key]) && value[key].length > 0,
    )
  })
}

/**
 * header chrome 叶判据（2026-11-15 · 3e2bc817 实锤）。
 *
 * 面板头部（标题 / Tab / 切换器 / 小图标）由微码 base-panel 头部面板 + `#header-right`
 * 插槽承担，**不得**作为 body 段参与内容区高度分配。判据刻意保守：
 *   ① type 命中 chrome 白名单；② 无业务正文（items/children/elements）；③ 无图表信号。
 * 任一不满足 ⇒ 不算 chrome（宁可回落 body，也不误删正文）。
 */
const HEADER_CHROME_TYPES = new Set(['header', 'tabs', 'tab', 'title', 'segmented', 'switch'])

/** 元素级 chrome 白名单：头部行里允许出现的「非业务」元素类型。 */
const CHROME_ELEMENT_TYPES = new Set([
  'text',
  'tab',
  'icon',
  'label',
  'title',
  'subtitle',
  'divider',
  'switch',
  'segmented',
  'badge',
  'dot',
  'tag',
])

/** 明确的业务元素类型（出现即判「这段是正文」，绝不收口）。 */
const BUSINESS_ELEMENT_TYPES = new Set([
  'chart',
  'echarts',
  'table',
  'list',
  'grid',
  'form',
  'map',
  'video',
  'image',
  'img',
  'progress',
  'gauge',
])

function isChromeElement(el) {
  if (!el || typeof el !== 'object') return true
  const type = String(el.type || el.role || '').toLowerCase()
  const kids = Array.isArray(el.children) ? el.children : []
  if (BUSINESS_ELEMENT_TYPES.has(type)) return false
  if (Array.isArray(el.items) && el.items.length > 0) return false
  // 未知类型：只有「本身无子元素」时不认（保守，宁可回落 body）
  if (!CHROME_ELEMENT_TYPES.has(type) && kids.length === 0) return false
  return kids.every(isChromeElement)
}

/**
 * body 是否「纯 chrome」：body.children 递归全是文本/Tab/图标类元素。
 *
 * 不能用 `hasBusinessBody`（它只判「有没有 children」）——头部段的 body.children
 * 恰恰就是「标题文字 + 图标 + Tab」，会被误判成业务正文，导致收口失效。
 */
function isChromeOnlyBody(section) {
  const body = section?.body
  const kids = Array.isArray(body?.children) ? body.children : []
  if (kids.length === 0) return true
  return kids.every(isChromeElement)
}

/** 段自身带数据项（items）⇒ 有业务正文，绝不收口。 */
function hasOwnItems(section) {
  for (const src of [section?.items, section?.body?.items, section?.declaredContent?.items]) {
    if (Array.isArray(src) && src.length > 0) return true
  }
  return false
}

function isHeaderChromeLeaf(section) {
  if (!section || typeof section !== 'object') return false
  const type = String(section?.type || '').toLowerCase()
  if (!HEADER_CHROME_TYPES.has(type)) return false
  if (hasOwnItems(section)) return false
  if (!isChromeOnlyBody(section)) return false
  const styles = section?.styles
  if (styles && typeof styles === 'object' && (styles.chartType || styles.echarts)) return false
  return true
}

/* ─────────────────── header 行 · 几何通道（2026-11-15 根治） ───────────────────
 * 目标：把「哪一行是面板头部」从 **type 枚举** 升级为 **几何 + 语义双通道**，
 * 从而覆盖 vision 不给 type 标签、以及头部行未包容器（根级平铺）两种形态。
 * 证据来源全部是 planner 已有事实，不新增上游调用：
 *   · 段自身 `absoluteBoundingBox` / `figmaBox`（容器有）
 *   · 叶的 `internalGeometry[]`（子元素逐项 bbox，含 x/y/w/h）⇒ 并集即叶的视觉盒
 */

/** 叶/容器的视觉盒：优先自身 bbox，退化到 internalGeometry 并集。 */
export function resolveSectionVisualBox(section) {
  const own = section?.absoluteBoundingBox || section?.figmaBox
  if (own && Number.isFinite(Number(own.height)) && Number(own.height) > 0) {
    return { y: Number(own.y) || 0, h: Number(own.height) }
  }
  const geo = Array.isArray(section?.internalGeometry) ? section.internalGeometry : []
  const boxes = geo.filter(
    (g) => g && Number.isFinite(Number(g.h)) && Number(g.h) > 0 && Number.isFinite(Number(g.y)),
  )
  if (boxes.length === 0) return null
  const top = Math.min(...boxes.map((g) => Number(g.y)))
  const bottom = Math.max(...boxes.map((g) => Number(g.y) + Number(g.h)))
  return { y: top, h: bottom - top }
}

/** 递归收集 body 元素类型（几何之外的第二条证据：这段里到底画了什么）。 */
function collectElementTypes(section, out = []) {
  const kids = Array.isArray(section?.body?.children) ? section.body.children : []
  const walkEl = (el) => {
    if (!el || typeof el !== 'object') return
    const t = String(el.type || el.role || '').toLowerCase()
    if (t) out.push(t)
    for (const c of Array.isArray(el.children) ? el.children : []) walkEl(c)
  }
  for (const k of kids) walkEl(k)
  return out
}

/**
 * 宽松 chrome 叶判据：type 白名单 **或**（无 type 标签但有 text/tab/icon 等 chrome 元素）。
 * 后者专治 vision 不给 type 的头部段；业务元素（chart/table/image/list…）仍一律否决。
 */
function isHeaderChromeLeafLoose(section) {
  if (!section || typeof section !== 'object') return false
  if (hasOwnItems(section)) return false
  if (!isChromeOnlyBody(section)) return false
  const styles = section?.styles
  if (styles && typeof styles === 'object' && (styles.chartType || styles.echarts)) return false
  const type = String(section?.type || '').toLowerCase()
  if (HEADER_CHROME_TYPES.has(type)) return true
  if (type && type !== 'content') return false
  // 无 type / 泛 content：必须自带 chrome 元素（纯空壳不认，避免吞掉空白段）
  const types = collectElementTypes(section)
  return types.some((t) => CHROME_ELEMENT_TYPES.has(t))
}

/** 被动 chrome：只含文字/图标/分隔等「无交互」元素 ⇒ 与面板头部重复，可安全 drop。 */
const PASSIVE_CHROME_TYPES = new Set([
  'text',
  'icon',
  'label',
  'divider',
  'title',
  'subtitle',
  'badge',
  'dot',
  'tag',
])

function isPassiveChromeLeaf(section) {
  const types = collectElementTypes(section)
  if (types.length === 0) {
    // 空壳：交互类容器（tabs/switch/segmented）即便暂无元素也保留（可能是数据驱动的空态），
    // 其余（header/title 等纯装饰壳）可安全 drop。
    return !['tabs', 'tab', 'switch', 'segmented'].includes(typeOf(section))
  }
  return types.every((t) => PASSIVE_CHROME_TYPES.has(t))
}

/** 与 header 行锚「同一视觉行」：纵向对齐 + 高度不显著超出 + 是 chrome。 */
export function isSameHeaderRow(section, anchorBox) {
  if (!isHeaderChromeLeafLoose(section)) return false
  if (!anchorBox) return isHeaderChromeLeaf(section)
  const box = resolveSectionVisualBox(section)
  if (!box) return isHeaderChromeLeaf(section) // 叶无几何 ⇒ 退化到 type 判据
  const tolY = Math.max(4, anchorBox.h * 0.2)
  if (Math.abs(box.y - anchorBox.y) > tolY) return false
  // 高度上限：锚行高 ×1.8（比 1.6 略宽，兼容「小标题行含图标/角标略高于 Tab」的真实形态），
  // 下限 24px 兜住锚行只有 18~19px 的场景。超限即视为独立内容块，绝不收口。
  return box.h <= Math.max(anchorBox.h * 1.8, 24)
}

function typeOf(section) {
  return String(section?.type || '').toLowerCase()
}

function sourceIds(section) {
  const ids = Array.isArray(section?.sourceNodeIds)
    ? section.sourceNodeIds.map(String).filter(Boolean)
    : []
  // 🛡️ 2026-11-15（693c8d17 实锤）：headerSlots 契约的 figmaNodeId/sectionId 常指向
  //   **段自身或其宿主段**（如 2:7954 tabs / 136:120 header），而 planner 段的
  //   sourceNodeIds 只装「内容子节点」⇒ 旧判据 matched 恒空 ⇒ headerSlotsEmitted=0
  //   ⇒ 整条 header 行落进 body。补三个自身锚（不新增守卫、不改判定方向）：
  //   有契约命中才可能成为 header 叶，无契约时行为逐字不变。
  for (const key of ['id', 'figmaNodeId', 'figmaAnchorId']) {
    const v = section?.[key]
    if (v != null && String(v).trim()) ids.push(String(v).trim())
  }
  return ids
}

/**
 * @param {Array} sections resolvePlanSections() 的最终生效树
 * @param {{headerSlots?:Array}} opts
 */
export function buildSectionStructureContract(sections, opts = {}) {
  const roots = Array.isArray(sections) ? sections : []
  const byId = new Map()
  const leaves = []

  const walk = (list, parent = null) => {
    for (const section of Array.isArray(list) ? list : []) {
      if (!section || typeof section !== 'object') continue
      const container = isLayoutContainerSection(section)
      const childSections = container && Array.isArray(section.children) ? section.children : []
      const id = String(section.id ?? '')
      const node = {
        id,
        contentType: container ? 'container' : String(section.type || 'content'),
        placement: 'body',
        parent,
        children: childSections.map((child) => String(child?.id ?? '')).filter(Boolean),
        section,
      }
      byId.set(id, node)
      if (container) walk(childSections, id)
      else leaves.push(section)
    }
  }
  walk(roots)

  let slotRevokedRespected = 0
  const headerSlotNodeIds = new Set()
  for (const slot of Array.isArray(opts.headerSlots) ? opts.headerSlots : []) {
    const slotType = String(slot?.slotType || '').toLowerCase()
    if (slotType !== 'header-right' && slotType !== 'title-right') continue
    // 子节点 figmaNodeId 与宿主 sectionId 是互补证据，不能用 || 只留前者。
    // 例如 Tab 容器 2:7954 属于 header section 2:7959；最终入槽的是宿主段。
    for (const id of [slot?.figmaNodeId, slot?.sectionId, slot?.id]) {
      if (id) headerSlotNodeIds.add(String(id))
    }
  }

  const typedHeaders = leaves.filter((section) => section.type === 'header')
  const safeHeaders = typedHeaders.filter((section) => !hasBusinessBody(section))
  let candidates = safeHeaders
  if (headerSlotNodeIds.size > 0) {
    const matched = leaves.filter((section) =>
      sourceIds(section).some((id) => headerSlotNodeIds.has(id)),
    )
    // 🛡️ 2026-11-07（mc-max-1794041862682-9f43a112 实锤）：**尊重插槽资格复核的撤单**。
    //   病灶：derived 插槽不带 sectionId ⇒ 复核按 sectionId 过滤拦不住它；结构契约又按
    //   sourceNodeIds（含子节点 id）匹配 ⇒ 整个父段（146 行 StatsMonitor）被拉进 38px 定高
    //   #header-right ⇒ 溢出压住 body。复核撤单是资格判据的权威结论（`_slotRevoked` 已由
    //   visual-parser 挂到段对象上），契约必须照办：撤单段一律回落 body。
    const revokedMatched = matched.filter((section) => section && section._slotRevoked)
    if (revokedMatched.length > 0) {
      slotRevokedRespected = revokedMatched.length
      const keep = matched.filter((section) => !section._slotRevoked)
      if (keep.length > 0) candidates = keep
      else candidates = [] // 全被撤 ⇒ 不产 header 叶，全部回落 body
    } else if (matched.length > 0) {
      candidates = matched
    }
  }
  // 🛡️ 2026-11-06（f91aa545 实锤）：**planner 显式声明的插槽宿主段**优先兜底。
  //   真机 vision 从没产出 `type==='header'` 的段（标题栏被当 chrome），插槽 id 又是文本/
  //   统计节点、不在任何段的 `sourceNodeIds` 里 ⇒ 上面两条全空 ⇒ `headerSlotsEmitted=0`
  //   ⇒ index 无 `#header-right` ⇒ 插槽内容退回 body 再渲一遍。
  //   planner 已按「isPanelHeader ∧ 有插槽业务内容」保住宿主并打 `_headerSlotHost`，
  //   本契约认这个显式事实（不靠 type 猜、不做几何推断）。
  if (candidates.length === 0) {
    const hosts = leaves.filter(
      (section) => section && section._headerSlotHost === true && !section._slotRevoked,
    )
    if (hosts.length > 0) candidates = [hosts[0]]
  }

  // 🛡️ 2026-11-15（mc-max-1794714133703-3e2bc817 实锤）：**header 行整体收口（几何+语义双通道）**。
  //   病灶：planner 把面板头部拆成「容器(136:120) + 叶(tabs 2:7954 / 小标题 2:7959)」，
  //   契约只把 tabs 一个叶提升进 `#header-right`；兄弟叶 `type:'header'` 回落 body ⇒
  //   容器因「还有 body 后代」被 `hasBodyLeaf` 保留 ⇒ 整条 header 行作为 bodyRoot 参与
  //   顶层 flex，按 Figma 高 28.1 吃掉 17.5% 内容区高度，而壳里标题已被 chrome 接管、
  //   只剩 8×8 图标 ⇒ 纯空白占位（用户口径：头部应由微码头部面板 + 插槽实现，不占内容区）。
  //
  //   根治口径（相对首版的 type 白名单补丁）：先按 **作用域**（同父兄弟 + 根级兄弟）找 header 行锚，
  //   再用 **几何**（纵向对齐 ∧ 高度不超锚行 ×1.6）扩展行成员，type 只作为「无几何时」的退化判据。
  //   这样 vision 不给 type、或头部行没包容器（根级平铺）也能判出来。
  const leavesByScope = new Map()
  for (const section of leaves) {
    const parentId = byId.get(String(section?.id ?? ''))?.parent ?? '__root__'
    if (!leavesByScope.has(parentId)) leavesByScope.set(parentId, [])
    leavesByScope.get(parentId).push(section)
  }
  const scopeBox = (parentId) => {
    if (parentId === '__root__') return null
    const parentSection = byId.get(parentId)?.section
    return parentSection ? resolveSectionVisualBox(parentSection) : null
  }

  const headerRowLeaves = []
  for (const [parentId, kids] of leavesByScope) {
    if (kids.length === 0) continue
    // 行锚：已有插槽候选 > 显式 type=header > planner 声明的插槽宿主
    const anchor =
      kids.find((s) => candidates.includes(s)) ||
      kids.find((s) => typeOf(s) === 'header' && !s?._slotRevoked) ||
      kids.find((s) => s?._headerSlotHost === true && !s?._slotRevoked)
    if (!anchor) continue
    const anchorBox = scopeBox(parentId) || resolveSectionVisualBox(anchor)
    // 成员判定分两条通道（几何优先，几何缺失时只认「整作用域全 chrome」的原语义）：
    //   · 有几何：按「同一视觉行」选成员 —— 覆盖 vision 不给 type / 头部行不包容器两形态
    //   · 无几何：必须**整个作用域**都是 chrome 才收口，绝不因「有个 chrome 兄弟」就动刀
    //     （否则 switch/chart 之类的业务兄弟会被误吞）
    const geomAvailable = !!anchorBox && kids.some((s) => resolveSectionVisualBox(s))
    let rowMembers = []
    if (geomAvailable) {
      rowMembers = kids.filter((s) => isSameHeaderRow(s, anchorBox))
    } else if (kids.every(isHeaderChromeLeaf)) {
      rowMembers = kids.slice()
    }
    if (rowMembers.length === 0) continue
    if (!rowMembers.some((s) => candidates.includes(s))) {
      const tabsLeaf = rowMembers.find((s) => typeOf(s) === 'tabs' || typeOf(s) === 'tab')
      if (tabsLeaf) candidates.push(tabsLeaf)
    }
    headerRowLeaves.push(...rowMembers)
  }

  // 唯一化之前先留一份「曾经入选」的池：淘汰者仍需回落 body（不消失），
  // 故后面的 drop 判据要排除这些叶，只 drop 从未成为候选的纯 chrome 兄弟。
  const candidatePool = new Set(candidates)
  if (candidates.length > 1) {
    const topLevelHeaderIds = new Set(
      roots.filter((section) => section?.type === 'header').map((section) => String(section?.id)),
    )
    const topOnly = candidates.filter((section) => topLevelHeaderIds.has(String(section?.id)))
    candidates = [(topOnly.length > 0 ? topOnly : candidates)[0]]
  }

  const headerSet = new Set(candidates)
  // header 行里没入槽的兄弟叶（如已被 base-panel 标题栏接管的「小标题」段）一律 drop：
  // 既不进 header-right（避免重复渲染），也不进 body（避免占内容区高度）。
  // ⚠️ 只 drop「从未成为候选」的 chrome 叶。曾入选但被唯一化/撤单淘汰的候选**不得** drop ——
  //   其语义是「另找位置渲染」，必须回落 body（沿用「落选者不消失」的既有约定）。
  const droppedHeaderChrome = headerRowLeaves.filter(
    (section) =>
      !headerSet.has(section) &&
      !candidatePool.has(section) &&
      // 只 drop「被动 chrome」（纯文字/图标）—— Tab/switch/segmented 这类交互控件即便同处
      // header 行也不 drop：宁可让它回落 body 保住功能，绝不因「同 y 行」把控件抹掉。
      isPassiveChromeLeaf(section),
  )
  const droppedSet = new Set(droppedHeaderChrome)
  for (const section of leaves) {
    byId.get(String(section.id ?? '')).placement = headerSet.has(section) ? 'header-right' : 'body'
  }
  for (const section of droppedHeaderChrome) {
    byId.get(String(section?.id ?? '')).placement = 'header-chrome'
  }
  const bodyLeaves = leaves.filter(
    (section) => !headerSet.has(section) && !droppedSet.has(section),
  )
  const bodyLeafSet = new Set(bodyLeaves)
  const hasBodyLeaf = (section) => {
    if (!section || typeof section !== 'object') return false
    if (!isLayoutContainerSection(section)) return bodyLeafSet.has(section)
    return (Array.isArray(section.children) ? section.children : []).some(hasBodyLeaf)
  }
  // 容器级归属：子树内已无任何 body 叶（全被头部面板/插槽接管）⇒ 整段不参与内容区布局。
  // 这是「行级 placement」的落地——不再靠 bodyRoots 的递归推断去猜。
  let headerRowContainers = 0
  const hasLeafInside = (section) =>
    (Array.isArray(section?.children) ? section.children : []).some(
      (c) => !isLayoutContainerSection(c) || hasLeafInside(c),
    )
  for (const node of byId.values()) {
    if (node.contentType !== 'container') continue
    if (!node.section || !hasLeafInside(node.section)) continue
    if (hasBodyLeaf(node.section)) continue
    node.placement = 'header-row'
    headerRowContainers += 1
  }

  return {
    byId,
    leaves,
    headerLeaves: candidates,
    bodyLeaves,
    bodyRoots: roots.filter(hasBodyLeaf),
    droppedHeaderLeaves: typedHeaders.filter((section) => !headerSet.has(section)),
    droppedHeaderChrome,
    stats: {
      nodes: byId.size,
      leaves: leaves.length,
      headerLeavesBefore: typedHeaders.length,
      headerSlotsEmitted: candidates.length,
      slotRevokedRespected,
      contracted: typedHeaders.length > 1 ? 1 : 0,
      bodyRoots: roots.filter(hasBodyLeaf).length,
      // header 行收口：行成员数 / 被 drop 的 chrome 叶数 / 归入 header-row 的容器数
      // （0 命中时行为逐字不变）。headerRowCollapsed 只表示「容器级整行收口」发生。
      headerRowCollapsed: headerRowContainers > 0 ? 1 : 0,
      headerRowLeaves: headerRowLeaves.length,
      droppedHeaderChrome: droppedHeaderChrome.length,
      headerRowContainers,
    },
  }
}

export default buildSectionStructureContract

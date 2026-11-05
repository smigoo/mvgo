/**
 * Figma 尺寸真值工具（2026-09-03，A4 元素级高度比例覆盖的纯函数层）
 *
 * 抽为独立模块的原因：
 *  ① `visual-parser.js` 依赖链过重（加载即拉起 puppeteer 等），无法在单测中直接 import；
 *  ② 纯函数零依赖 → 可独立单测、可复用（visual-parser / 其他后处理共用），
 *     符合「确定性后处理不依赖 LLM、可测试」的管线约定。
 *
 * ⚠️ 核心约束（用户指正 2026-09-03 + 既有规范）：
 *   - **高度必须是比例，不是固定 px**：组件需在不同宿主高度下自适应，写死
 *     `height: 64.8px` 会破坏自适应（高容器留白、矮容器挤压）。
 *   - **不得 flex-grow 量纲混用**（FLEX-004，`code-structure-validator.js:2381`）：
 *     同组统一用「相对组均值」的比例量级（~1），比例与设计视觉比例一致。
 *   - **放主生成链**：generate 模式跳过 layout-refiner（原比例修正环节不执行，
 *     日志实证全程无 refiner 节点），故必须在主生成后处理链补全。
 */

/** 递归深度上限（与 visual-parser 原有实现保持一致） */
const MAX_DEPTH = 5

/**
 * 收集 Figma 节点树中所有有意义节点（带名称 + bbox）。
 * @技术栈节点（如 @antd/tab）取子节点最大宽高作为有效尺寸。
 * @param {object} figmaData Figma 节点树
 * @returns {Array<{name:string, type:string, bbox:object, effectiveW:number, effectiveH:number, isTechComponent:boolean}>}
 */
import { getFigmaBox } from './section-tree.js'
import { unionBoxes } from './section-intrinsic-layout.js'

/**
 * 🛡️ 2026-11-03 治本（mc-max-1793682828131-09063447 实锤）：collapsed list section 的
 *   高度真值必须取「逐项并集」，不得只取配对节点的单盒。
 *
 * 病灶：①-β id 直配命中 `48:5798`——它在 Figma 里只是**首卡 GROUP（72px）**，不是
 *   6 卡列表容器（6×72+5×20=532px）。id 直配拿 72 ⇒ flexGrow 1.636/0.364 与刀16
 *   gap 483px 全错 ⇒ 产物列表被压成一条缝、margin-top 撑爆。
 *   （250f1b53 三卡同理：配对 region=单卡 74px。）
 *   与 subcomponent-planner#resolveVisionSectionBox（:221「逐项并集」注释同源同判据：
 *   `48:5798 type=list items=6 但 figmaHeightPx=72` 正是 planner 已踩过的坑）。
 *
 * 判据（极保守）：section.body.items ≥2 且 ≥2 个 item.id 能在 figmaNodes 命中
 *   ⇒ effectiveH = 并集(配对节点盒, 逐项盒)；并集高度 ≤ 配对高度时不覆盖
 *   （配对节点已是整段容器，如表格容器，别拿子集缩小它）。纯几何，不由 vision 臆造。
 *
 * @param {object} section vision section
 * @param {object} node 配对到的 figma 节点（collectFigmaNodes 产物，含 bbox/effectiveH）
 * @returns {number} 修正后的 effectiveH（无修正时原样返回）
 */
function effectiveHeightForSection(section, node, figmaNodes) {
  const items = section?.body?.items
  if (!Array.isArray(items) || items.length < 2 || !node) return node?.effectiveH || 0
  const boxes = []
  for (const it of items) {
    const iid = String(it?.id || '')
    if (!iid) continue
    const found = figmaNodes.find((n) => n._id === iid)
    if (found?.bbox) boxes.push(found.bbox)
  }
  if (boxes.length < 2) return node.effectiveH
  const itemBoxes = boxes.map((b) => ({ x: b.x, y: b.y, w: b.width ?? b.w, h: b.height ?? b.h }))
  const paired = { x: node.bbox.x, y: node.bbox.y, w: node.bbox.width ?? node.bbox.w, h: node.bbox.height ?? node.bbox.h }
  const union = unionBoxes([paired, ...itemBoxes])
  const h = union?.h || 0
  // 并集必须严格大于配对高度才覆盖（子集/等高 = 配对节点已是整段，不动）
  return h > node.effectiveH + 1 ? h : node.effectiveH
}

/**
 * 🛡️ 2026-11-03 治本（mc-max-1793683866145-ec1db095 实锤）：段标题节点上溯 `slot-{段名}` 同名容器。
 *
 * 病灶：vision 的 section.id 在 Figma 里**锚到的是段标题 GROUP**（2:3559「标题」h=24 /
 *   2:3439「sub-header」h=24 / 2:3571「tit」h=24），而不是整段容器。①-β id 直配「全命中即采纳」
 *   ⇒ A4 比例拿到 24:21:24:24（近均分），刀16 兄弟间距又用「标题 y 差」算出 242/124/133px
 *   margin-top ⇒ 产物大面积空白 + 文字互叠。
 *   而真值容器是**祖先**：`slot-当日总流量`(h=556) / `slot-车型分布`(142) / `slot-流量预测`(174)
 *   ——Figma 命名约定 `slot-{业务名}`，业务名与 vision section.name **精确同名**。
 *
 * 判据（纯结构、极保守、fail-open）：
 *   ① 从配对节点沿 parentId 链上溯（≤4 跳）；
 *   ② 祖先名 trim 后**严格全等** `slot-${section.name}` 才采纳（不做前缀/包含/模糊匹配）；
 *   ③ 找不到 / 链断 / 名字不精确 ⇒ 返回 0（调用方保留原配对值，绝不猜）；
 *   ④ 只升级不降级：调用方取 max(原值, 祖先值)，祖先反而更小说明配对已合理。
 *
 * 单一来源：上溯判据只在本函数实现（id 直配 / figmaNodeId 直命中 / 根下直配三条路径共用
 *   writeSectionRatios 这一个替换点）。
 *
 * @param {object} node 配对到的 figma 节点（collectFigmaNodes 产物，含 parentId/effectiveH）
 * @param {string} sectionName vision section.name
 * @param {Map<string, object>} byId collectFigmaNodes 产出的 _id → 节点 索引
 * @returns {number} 命中祖先容器的 effectiveH（未命中/不精确/链断 → 0）
 */
const SLOT_ANCESTOR_MAX_HOPS = 4
function slotAncestorHeightFor(node, sectionName, byId) {
  const nm = String(sectionName || '').trim()
  if (!node || !nm || !byId || !byId.size) return 0
  const target = `slot-${nm}`
  let cur = node
  for (let hop = 0; hop < SLOT_ANCESTOR_MAX_HOPS; hop++) {
    const pid = cur?.parentId
    if (pid == null || pid === '') return 0
    const parent = byId.get(String(pid))
    if (!parent) return 0
    if (String(parent.name || '').trim() === target) {
      return parent.effectiveH > 0 ? parent.effectiveH : 0
    }
    cur = parent
  }
  return 0
}


export function collectFigmaNodes(figmaData) {
  const nodes = []
  // 🛡️ 2026-11-03 治本（ec1db095 实锤）：记录 parentId 以支持「段标题节点 → slot 同名容器」上溯。
  //   父链是纯结构事实（Figma 树的父子关系），不引入任何业务猜测；
  //   既有消费者只读 _id/name/type/bbox/effectiveW/effectiveH/isTechComponent，新增字段零影响。
  const walk = (node, depth = 0, parentId = null) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    const name = String(node.name || '').trim()
    const box = getFigmaBox(node)
    const bb = node.absoluteBoundingBox
    if (name && bb && box && box.w > 0 && box.h > 0) {
      let effectiveW = bb.width
      let effectiveH = bb.height
      if (name.startsWith('@') && Array.isArray(node.children) && node.children.length) {
        for (const child of node.children) {
          const cbb = child?.absoluteBoundingBox
          if (cbb) {
            if (cbb.width > effectiveW) effectiveW = cbb.width
            if (cbb.height > effectiveH) effectiveH = cbb.height
          }
        }
      }
      nodes.push({
        _id: node.id,
        name,
        type: node.type,
        bbox: bb,
        effectiveW,
        effectiveH,
        isTechComponent: name.startsWith('@'),
        parentId,
      })
    }
    if (Array.isArray(node.children)) {
      const selfId = node.id != null ? String(node.id) : null
      for (const child of node.children) walk(child, depth + 1, selfId)
    }
  }
  // ⚠️ document 包装兼容（2026-11-03 · mc-max-1793669737047-17691193 实锤）：
  // 生产 figmaData 常为 Figma API 响应 `{ document: {...} }`，若不拆包则 walk 只看到
  // `document` 键（无 name/children）→ collectFigmaNodes 静默空转。与 collectSectionRegions/
  // collectRootRegions 的 rootDimensions 同口径统一拆包。
  walk(figmaData?.document || figmaData)
  return nodes
}

/**
 * 收集 section 内所有「兄弟组」（含嵌套层级）。
 * 兼容 flat 格式（body.children）与 schema 格式（body.items，vision 缓存实测用 items）。
 * @param {object} node section.body 或 section
 * @returns {Array<Array<object>>}
 */
export function collectSiblingGroups(node) {
  const groups = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    const kids = n.children || n.items
    if (Array.isArray(kids) && kids.length) {
      const group = kids.filter((c) => c && typeof c === 'object')
      if (group.length) groups.push(group)
      for (const c of group) walk(c)
    }
  }
  walk(node)
  return groups
}

/**
 * 把 vision 元素的匹配模式提取为 Figma 节点名「包含」关键字（不区分大小写）。
 * 链接键优先级（与 visual-parser._findFigmaNodeForElement 一致）：
 *   ① figmaNodeId 直接命中 → ② type/role/name 关键词包含匹配。
 *
 * 实测：vision 元素 name/role 多为中文（设备类型切换/常驻），figma 节点为英文
 * （tab/switch），故**不能用 name 精确匹配**（会全 miss → no-op）。应以英文 type
 * （tab/switch-card）作关键词，figma 节点名包含该词即视为同源。
 *
 * @param {object} el vision 元素（含 type/role/name/figmaNodeId）
 * @returns {Array<{id?:string, tokens:string[]}>} id 命中优先；否则返回关键词 token 列表
 */
export function elementMatchPatterns(el) {
  const directId = el?.figmaNode || el?.figmaNodeId
  if (directId) return [{ id: String(directId) }]

  const toTokens = (v) => {
    if (!v) return []
    return String(v)
      .toLowerCase()
      .split(/[-_/\s]+/)
      .filter((t) => t.length >= 2)
  }
  // 过滤 token：type/id/name/role 全部参与（精度匹配，含中文 name 的同名命中）
  // 顺序：type（英文，最可靠）> id（section 级如 device-switch）> name（可能中文）> role
  const tokens = [
    ...toTokens(el?.type),
    ...toTokens(el?.id),
    ...toTokens(el?.name),
    ...toTokens(el?.role),
  ]

  // ⚠️ 稳定配对键（A4 关键修复 2026-09-03 · 实测 tab 全塌成 tab-active/54）：
  // 同名多实例需按「文档顺序」配对（禁止最近邻），故同一「元素类」的所有实例必须
  // 共享同一 key，否则每个实例 key 唯一 → 游标恒为 0 → 全部命中 candidates[0]。
  // 实测：vision tab-item 只有 role=tab-item、无 type，且其 id（tab-monitor/…）
  // 唯一 → 原实现把唯一 id 折进 key → 6 个 tab 全命中 tab-active(54)。
  // 故配对键只取「稳定语义类」（type > role），排除唯一性 id 与中文 name。
  const keyTokens = [...toTokens(el?.type), ...toTokens(el?.role)]
  const stableKey = keyTokens.length
    ? Array.from(new Set(keyTokens)).join('|')
    : Array.from(new Set(toTokens(el?.id))).join('|') // 兜底：无 type/role 时按 id 去尾序号

  const dedupTokens = Array.from(new Set(tokens))
  return dedupTokens.length ? [{ tokens: dedupTokens, key: stableKey }] : []
}

/**
 * 固定尺寸元素类型（图标/徽标/标签/角标等）——这些元素有固有尺寸，
 * 绝不能按比例 flex-grow（否则会被撑大/压缩）。A4 只处理布局块。
 */
const FIXED_SIZE_TYPES = [
  'icon', 'img', 'image', 'badge', 'label', 'text', 'avatar', 'tag',
  'counter', 'dot', 'indicator', 'divider', 'spinner', 'group', 'chip', 'bullet',
]
export function isFixedSizeElement(el) {
  // 同时看 type 与 role：实测 vision 固定尺寸元素常只有 role（tab-counter / tab-item 无 type）
  const ts = [el?.type, el?.role].filter(Boolean).map((v) => String(v).toLowerCase())
  if (!ts.length) return false
  return ts.some((t) =>
    FIXED_SIZE_TYPES.some(
      (k) => t === k || t.endsWith('-' + k) || t.startsWith(k + '-') || t.includes(k)
    )
  )
}

/** 容器/槽位/技术组件节点：元素级匹配应排除（它们是「区域」不是「元素」） */
const CONTAINER_NAME_RE =
  /^(tabs|tab-bar|tab-list|tab-pane|tab-content|slot|slot-con|container|group|frame|wrapper|panel|section|body|root|layer|header|footer)$/i
export function isContainerNode(n, allowTech = false) {
  if (n.isTechComponent && !allowTech) return true
  if (CONTAINER_NAME_RE.test(n.name)) return true
  const kids = Array.isArray(n.children) ? n.children.length : 0
  return kids > 6
}

/** 给候选节点按「与 token 的吻合度」打分（越高越精确） */
function rankCandidate(name, tokens) {
  const nm = String(name || '').toLowerCase()
  let best = 0
  for (const t of tokens) {
    if (nm === t) {
      best = Math.max(best, 3)
      continue
    }
    // ⚠️ 非 ASCII token（中文名等）只允许全等命中：杜绝 d-消防↔消防、t-隧道设备↔隧道设备
    // 这类「前缀/子串」误配（实测 2026-09-03：tab 项把 d-消防(32)/d-交通诱导(64) 当兄弟消费）。
    // ASCII token（英文 type/id）允许前缀/包含匹配（tab-active ↔ tab、@antd/tab ↔ tab）。
    if (!/^[\x00-\x7F]+$/.test(t)) continue
    if (nm.startsWith(t + '-') || nm.startsWith(t + ' ')) best = Math.max(best, 2)
    else if (nm.includes(t)) best = Math.max(best, 1)
  }
  return best
}

/**
 * 在 Figma 节点列表中为某元素定位匹配节点（支持同名多实例按文档顺序配对）。
 * 链接优先级：figmaNodeId 直命中 > type/id/role 关键词（排除容器/技术组件/槽位）。
 *
 * 精度约束（实测 2026-09-03，真实数据验证）：
 *  - 排除 @ 技术组件（@antd/tab）、容器名（tabs/slot-con/group…）、子节点 >6 的大容器
 *    → 否则会命中包装层/槽位，把整块或图标比例化（劣化）。
 *  - 用吻合度打分（name===token 最高），同名多实例按**文档顺序**配对（禁止最近邻）。
 *
 * @param {object} el vision 元素
 * @param {Array} figmaNodes collectFigmaNodes 产出
 * @param {Map} cursorByKey 同名多实例游标（key = 元素的匹配签名）
 * @param {object} [opts] { allowTech?:boolean } 顶层 section 组允许命中技术组件容器
 * @returns {object|null}
 */
export function findFigmaNodeForElement(el, figmaNodes, cursorByKey, opts = {}) {
  const patterns = elementMatchPatterns(el)
  if (!patterns.length) return null

  // ① figmaNodeId 直接命中
  if (patterns[0].id) {
    return figmaNodes.find((n) => n._id === patterns[0].id) || null
  }

  const tokens = patterns[0].tokens
  // 候选：排除容器/槽位/技术组件（除非 allowTech），且名称与 token 有吻合
  const candidates = figmaNodes.filter(
    (n) => !isContainerNode(n, opts.allowTech) && rankCandidate(n.name, tokens) > 0
  )
  if (!candidates.length) return null

  // 同名多实例：按文档顺序取第 N 个（figma children 顺序 = 视觉顺序）。
  // 配对键用「稳定语义类」（patterns[0].key），保证同一元素类的实例共享游标、
  // 依次消费 candidates[0..n]，而非各自 idx=0 全命中 candidates[0]。
  const key = patterns[0].key || tokens.join('|')
  const idx = cursorByKey.get(key) || 0
  cursorByKey.set(key, idx + 1)
  return candidates[idx] || null
}

// ── 根区域收集共用判据（单一来源：collectRootRegions / collectSectionRegions 共用）──
// 🛠️ BG 剔除增强（2026-09-04 · mc-max-1788485095835-e1432017 实锤）：BG_RE 只认前缀匹配
//   `bg[-_\[(_/].*` / `background…` / `背景…`（含带后缀 bg-[m] / bg-_m-35），且必须 bbox
//   铺满根（宽高均 ≥95%）才视为背景——避免误删 `bg-card` 类业务小模块；装饰图（decoration/
//   glow/line）不含 bg 前缀、bbox 远小于根，不会误入剔除。
// 内容包装容器名（展开为子级）
const WRAPPER_RE = /^(slot-con|slot|frame|container|group|wrapper|panel)$/i
// 🛠️ BG 前缀 + 后缀分隔符（破折号/下划线/中括号/圆括号/斜杠/点）→ 匹配 bg-[m] / bg-_m-35 / bg-card / background-x 等
//   也允许恰好名为 bg/background/背景（无后缀）
const BG_RE = /^(bg|background|背景)(?:[-_\[(_/].*)?$/i
// 铺满阈值：宽高均 ≥95% → 视为整图背景（避免误删占根 70%+ 的"卡片主区"等业务模块）
const FILL_RATIO = 0.95

/** 根节点与尺寸（document 包装与裸根两种形态兼容） */
function rootDimensions(figmaData) {
  const root = figmaData?.document || figmaData
  const rootBB = root?.absoluteBoundingBox
  return {
    root,
    rootW: Number(rootBB?.width) || 0,
    rootH: Number(rootBB?.height) || 0,
  }
}

/** 纯背景层判定：命名命中 BG_RE 且 bbox 铺满根（二者都满足才视为背景） */
function isFullBleedBG(n, rootW, rootH) {
  const bb = n?.absoluteBoundingBox
  if (!bb || !(bb.width > 0) || !(bb.height > 0) || !(rootW > 0) || !(rootH > 0)) return false
  return bb.width / rootW >= FILL_RATIO && bb.height / rootH >= FILL_RATIO
}

/**
 * 收集 Figma 顶层「区域」节点（用于 section 级 1:1 顺序配对）。
 * 根节点直接子节点中：纯背景剔除；内容包装容器（slot-con/frame/container/group/wrapper/panel）
 * 展开为其直接子节点（这些子节点才是真正的 section 区域，包装层无视觉身份）。
 */
export function collectSectionRegions(figmaData) {
  const { root, rootW, rootH } = rootDimensions(figmaData)
  const children = (root && root.children) || []
  const regions = []
  for (const c of children) {
    const nm = String(c?.name || '')
    // ① 纯背景层不参与布局比例（命名命中 BG_RE 且 bbox 铺满根，二者都满足才视为背景）
    if (BG_RE.test(nm.trim()) && isFullBleedBG(c, rootW, rootH)) continue
    // ② 内容包装容器展平为子级
    if (WRAPPER_RE.test(nm) && Array.isArray(c.children) && c.children.length) {
      for (const cc of c.children) regions.push(cc)
    } else {
      regions.push(c)
    }
  }
  return regions
}

/**
 * 根下非 bg 节点（**不展开 wrapper**）。
 *
 * 🛡️ 治本（2026-11-03 · mc-max-1793669737047-17691193 实锤）：collectSectionRegions 会把内容区
 *   `slot` 无脑展开成子区域（WRAPPER_RE 命中），导致「根下 header+slot 两区域 vs vision 两 section」
 *   的简单布局被展开成 3 region，随后 header 容错剥 header 后顺序错位（头部标题栏↔三卡 74、
 *   今日累计↔sub-header 24），flex 比例与真值（28/86）**正好反了** → 标题栏占 75% 高、三卡压进 25%。
 *   本函数保留根下非 bg 节点原貌，供 applyFigmaSectionRatios 做「根下直配」——根下非 bg 节点数
 *   == sections 数时直接 1:1，不展开、不剥 header。
 *
 * @param {object} figmaData Figma 节点树（document 根）
 * @returns {Array<object>} 根下非 bg 节点（含 absoluteBoundingBox）
 */
export function collectRootRegions(figmaData) {
  const { root, rootW, rootH } = rootDimensions(figmaData)
  const children = (root && root.children) || []
  return children.filter((c) => {
    const nm = String(c?.name || '')
    return !(BG_RE.test(nm.trim()) && isFullBleedBG(c, rootW, rootH))
  })
}

/**
 * 🛡️ header 类区域判据（单一来源 · 2026-11-04 收敛）：② 路径 header 容错、复合展开内层剥离、
 *   ①-γ 剩余区域兜底三处共用。仅认「头部条」这种短命名，不做包含匹配（避免 `header-info` 被误剥）。
 */
const HEADER_RE = /^(header|头部|title|标题|top|top-bar|title-bar)[-_]?$/i
/** header 类区域的高度上界：超过 80px 说明它是内容块而非头部条（与 ② 容错同口径）。 */
const HEADER_MAX_HEIGHT_PX = 80

/**
 * ①-γ 剩余区域（2026-11-04 治本 · mc-max-1793765119169-4cbe82a2 实锤）：
 *   从 `collectSectionRegions` 的结果里剔除「已被 id 命中 section 消费」的区域。
 *
 * 判据（纯结构，无业务猜测）：
 *   - 区域自身就是命中节点 → 已消费；
 *   - 区域是命中节点的**祖先**（容器已被某段整体认领，其高度已计入该段）→ 已消费；
 *   - 区域是命中节点的**后代**（已含在某段内部）→ 已消费；
 *   - 其余才是「无归属的独立区域」，供未命中段兜底配对。
 *
 * 实测（cp-环境监测 2:7879）：命中 `2:7889/89:43/2:7949` 三者都在 `sub-t(89:42)` 内 ⇒
 *   regions `[header(2:7881), @echarts/line(2:7898), sub-t(89:42)]` 里 `sub-t` 因「是命中项
 *   祖先」被剔除，`@echarts/line` 留作图表段的真实区域（113px）。
 *
 * @param {Array<object>} regions collectSectionRegions 输出（原始 Figma 节点）
 * @param {Array<object>} matchedNodes 已 id 命中的 figmaNodes 条目（含 parentId）
 * @param {Map<string, object>} byId collectFigmaNodes 产出的 _id → 节点 索引
 * @returns {Array<object>} 未被消费的独立区域（保持 Figma 文档序）
 */
function collectLeftoverRegions(regions, matchedNodes, byId) {
  if (!Array.isArray(regions) || !regions.length) return []
  if (!Array.isArray(matchedNodes) || !matchedNodes.length) return []
  const ancestorsOf = (id) => {
    const set = new Set()
    let cur = byId.get(String(id))
    for (let hop = 0; cur && hop < 16; hop++) {
      const pid = cur.parentId
      if (pid == null || pid === '') break
      set.add(String(pid))
      cur = byId.get(String(pid))
    }
    return set
  }
  const matchedIds = matchedNodes.map((n) => String(n._id))
  const matchedAncestors = matchedIds.map(ancestorsOf)
  const regionAncestors = new Map()
  return regions.filter((r) => {
    const rid = String(r?.id ?? '')
    if (!rid) return false
    if (matchedIds.includes(rid)) return false
    if (matchedAncestors.some((set) => set.has(rid))) return false
    if (!regionAncestors.has(rid)) regionAncestors.set(rid, ancestorsOf(rid))
    const rAnc = regionAncestors.get(rid)
    return !matchedIds.some((mid) => rAnc.has(mid))
  })
}

/**
 * 🛠️ 2026-10-30 视觉行归并（mc-max-1793349441153-c3b958e0 实锤）。
 *
 * 病灶：`collectSectionRegions` 返回的是**图元级**节点，而 vision 的 sections 是**视觉语义级**。
 * 一个视觉区块在 Figma 里常被拆成多个平级图元（例：底部「图例 + 详情链接」= Group 图例1 +
 * Group 图例2 + TEXT 点击查看详情 + icon 箭头，四者 y 全为 52138），一旦数量错位就对不上。
 *
 * 实锤数据（slot-con 807:2，483×515，根 7 个直接子节点）：
 *   [0] Frame 2136639921  y=51728 h=388   ← 设备列表（第 2 行）
 *   [1] Group 2136638436  y=52138 h=14
 *   [2] Group 2136638438  y=52138 h=14
 *   [3] TEXT 点击查看详情 y=52138 h=14
 *   [4] Frame 2136639911  y=51637 h=66    ← 统计卡片组（第 1 行）
 *   [5] icon              y=52141 h=8     ← 装饰
 *   [6] Rectangle 3462423 y=51815 h=218 w=6 ← 滚动条装饰
 *   → regions=7 vs sections=3 → 数量不等 → A4 整体 return 0（写入数量实测 = 0）
 *   → 全链路无系数 → mounter 退等分 → 产物 `flex:1.000 / flex:1 / flex:1`
 *   → 渲染 171 / 171 / 171，与设计稿 66 / 388 / 14 完全不符。
 *
 * 修法（两步，均只在「数量不等」时作为兜底启用）：
 *  ① 剔除装饰图元：细长（max/min ≥ 8 且短边 ≤ 10px）或极小（≤10×10）→ 滚动条 / 小图标；
 *  ② 纵向行归并：按 y 排序后，与当前行 bottom+gap 相交的并入同一行，行高 = 行内 bbox 并集高度。
 * 归并后恰好等于 sections 数才采纳，否则原样退回（保留原 header 容错 / 复合展开链）。
 *
 * @param {Array<object>} regions collectSectionRegions 的输出
 * @returns {Array<object>} 归并后的「视觉行」节点（按 y 升序，附 absoluteBoundingBox）
 */
export function mergeVisualRows(regions) {
  if (!Array.isArray(regions) || regions.length === 0) return []
  /** 同一视觉行的最大纵向间隙（px）。实测 66 与 388 两行间距 25px、388 与图例间距 22px，取 8 不误合。 */
  const ROW_GAP_PX = 8
  /** 装饰图元短边上限：滚动条 w=6、图标 8×8 */
  const DECOR_MAX_SIDE_PX = 10
  /** 细长比：h/w ≥ 8（或 w/h ≥ 8）才算细长，避免把 14px 高的图例条误剔 */
  const DECOR_ASPECT = 8

  const boxed = []
  for (const node of regions) {
    const bb = node?.absoluteBoundingBox
    if (!bb) continue
    const w = Number(bb.width)
    const h = Number(bb.height)
    if (!(w > 0) || !(h > 0)) continue
    const x = Number(bb.x) || 0
    const y = Number(bb.y) || 0
    // ① 装饰图元剔除（滚动条 / 小图标）：细长或极小
    const short = Math.min(w, h)
    const long = Math.max(w, h)
    const isSliver = short <= DECOR_MAX_SIDE_PX && long / short >= DECOR_ASPECT
    const isTiny = w <= DECOR_MAX_SIDE_PX && h <= DECOR_MAX_SIDE_PX
    if (isSliver || isTiny) continue
    boxed.push({ node, x, y, w, h, top: y, bottom: y + h, left: x, right: x + w })
  }
  if (boxed.length === 0) return []

  // ② 按 y（同 y 再按 x）排序 —— 🔴 Figma children 文档顺序 ≠ 视觉顺序，
  //    不排序会把第 2 行的 388 配给第 1 个 section（本案 regions[0] 才是第 2 行）
  boxed.sort((a, b) => a.top - b.top || a.left - b.left)

  const rows = []
  for (const it of boxed) {
    const last = rows[rows.length - 1]
    if (last && it.top <= last.bottom + ROW_GAP_PX) {
      last.bottom = Math.max(last.bottom, it.bottom)
      last.left = Math.min(last.left, it.left)
      last.right = Math.max(last.right, it.right)
      last.nodes.push(it.node)
    } else {
      rows.push({ top: it.top, bottom: it.bottom, left: it.left, right: it.right, nodes: [it.node] })
    }
  }

  return rows.map((row) => {
    const host = row.nodes[0]
    const merged = row.nodes.length > 1
    const name = row.nodes
      .map((n) => String(n?.name || '').trim())
      .filter(Boolean)
      .join(' + ')
    return {
      ...host,
      name: name || host?.name,
      absoluteBoundingBox: {
        x: row.left,
        y: row.top,
        width: row.right - row.left,
        height: row.bottom - row.top,
      },
      // 🔴 合成行不能带 children：否则后段「复合 region 展开」会把它再拆开，抵消归并效果
      children: merged ? undefined : host?.children,
      _mergedCount: merged ? row.nodes.length : undefined,
    }
  })
}

/**
 * 🛠️ header 类 section 判据（2026-11-03 · mc-max-1793669737047-17691193 实锤）。
 *
 * vision 的 sections 中「头部标题栏」这类 section 表示 header 是 **body 成员**（非 base-panel
 * 的 header slot），此时根下直配成立（header 对应 sections[0]）。反之「header 走 panel slot」
 * 场景（既有 header 容错用例：sections=[概览,列表]，header 不在 sections）须走剥 header 链。
 *
 * 与 header-relation-validator.findHeaderRegion 同口径（name 含 header/顶部/标题），
 * 另补「头部/title」以覆盖「头部标题栏」「title-bar」等命名。
 */
const HEADER_SECTION_RE = /(header|顶部|标题|头部|title)/i
function isHeaderLikeSection(section) {
  const name = String(section?.name || '').toLowerCase()
  const type = String(section?.type || '').toLowerCase()
  return HEADER_SECTION_RE.test(name) || HEADER_SECTION_RE.test(type)
}

/**
 * A4（section 级）：让 device-switch 这类**单容器 section** 按父列比例被约束。
 *
 * 链接策略（实测 2026-09-03，c-monitor-3）：
 *  - 优先 figmaNodeId 直命中（live 生成若注入则用它，最准）；
 *  - 否则按「文档顺序」1:1 配对 sections ↔ figma 区域（header/switch/@antd/tab）。
 *    仅当两侧数量相等（无歧义）才应用，数量不等则**跳过不猜**（避免串列误配）。
 * 要求 ≥2 命中，孤例不猜。写比例量纲 flexGrow（~1）到 section.styles。
 *
 * @param {Array} sections vision 顶层 sections
 * @param {object} figmaData Figma 节点树
 * @param {object} [stats] 可选 out param：回填各分支命中数，供调用方打真机日志计数行
 *   （判据必须挂日志计数，只靠入参塞值验证 = 假绿）
 * @returns {number} 写入比例的元素数
 */
export function applyFigmaSectionRatios(sections, figmaData, stats = null) {
  if (!Array.isArray(sections) || !figmaData) return 0
  const figmaNodes = collectFigmaNodes(figmaData)
  const regions = collectSectionRegions(figmaData)
  const bump = (k, n = 1) => {
    if (stats && typeof stats === 'object') stats[k] = (Number(stats[k]) || 0) + n
  }
  // 🛡️ 计数行「0 也打」：slotAncestor / idDirectSkipHallucinated / idDirectLeftover 恒 0 时
  //   同样出现在日志里，便于区分「未生效」与「判据失效」。
  bump('slotAncestor', 0)
  bump('idDirectSkipHallucinated', 0)
  bump('idDirectLeftover', 0)

  // ① figmaNodeId 直命中
  const idMatched = []
  const restSections = []
  for (const section of sections) {
    const fid = section?.figmaNode || section?.figmaNodeId
    if (fid) {
      const node = figmaNodes.find((n) => n._id === String(fid))
      if (node && node.effectiveH > 0) idMatched.push({ section, node })
      else restSections.push(section)
    } else {
      restSections.push(section)
    }
  }

  // ②-α 根下直配（2026-11-03 治本 · mc-max-1793669737047-17691193）：当 sections 全无
  //   figmaNodeId、且 sections 中存在 header 类 section、且根下非 bg 节点数 == sections 数时，
  //   直接顺序 1:1 直配（不展开 slot、不剥 header）。病灶：collectSectionRegions 把内容区
  //   slot 展开成 [三卡, sub-header]，header 容错再剥 header，剩 [三卡(74), sub-header(24)]
  //   与 [头部标题栏, 今日累计] 错位 → flex 比例与真值（28/86）正好反了（标题栏占 75% 高、
  //   三卡压进 25%）。根下非 bg 节点 [header(28), slot(86)] 与两 section 天然 1:1，直配即真值。
  //   🔴 必须 sections 含 header 类 section 才直配：否则「header 走 panel slot」场景（既有
  //   header 容错用例 sections=[概览,列表]，根下 [header,slot-con] 数也恰为 2）会被误接管，
  //   把 header(30) 错配给概览、slot-con(380) 错配给列表（真值应为 switch(65)/@antd/tab(317)）。
  if (idMatched.length === 0 && restSections.length >= 2 && restSections.some(isHeaderLikeSection)) {
    const rootNodes = collectRootRegions(figmaData)
      .map((c) => figmaNodes.find((n) => n._id === c.id))
      .filter((n) => n && n.effectiveH > 0)
    if (rootNodes.length === restSections.length) {
      const directMatched = restSections.map((sec, i) => ({
        section: sec,
        node: rootNodes[i],
      }))
      bump('rootDirect', directMatched.length)
      return writeSectionRatios(directMatched, figmaNodes, stats)
    }
  }

  // ①-β section.id 直配（2026-11-03 治本 · mc-max-1793675066942-7396124c 实锤）：当 sections 全无
  //   figmaNode/figmaNodeId、且根下直配未触发时，用 section.id 在 figmaNodes 里直配。合作厂商的
  //   4 个 sections.id 恰好就是 figma 节点 id（38:3260/3137/3162/3206），但根下 slot-icon 不匹配
  //   WRAPPER_RE → collectSectionRegions 只得 2 region → 复合展开成 9 图元 → 10≠4 → 写入 0。
  //   🔴 必须排在根下直配**之后**：重点车辆监测的 sections.id 指向**内部子节点**（2:7959 小标题
  //   28px、136:122 sub-header 24px），id 直配会得 28/24（错），而根下直配得 28/86（对）。
  //   安全性：语义 id（如 attributes-section）在 figmaNodes 中天然不命中 → 未命中项进 rest →
  //   「全部命中才用」否则 fail-open 走顺序配对（不猜、不混配）。
  //   🔧 2026-11-03 追认（ec1db095）：未命中项**全部**是已判幻觉锚点（anchorValid===false）时，
  //   仍采纳命中项（幻觉项不写比例）；幻觉缺项数须 ≤ 命中数（上界，多数为真）。
  if (idMatched.length === 0 && restSections.length >= 2) {
    const idDirectMatched = []
    const idDirectMissSections = []
    for (const section of restSections) {
      const sid = section?.id
      const node = sid ? figmaNodes.find((n) => n._id === String(sid)) : null
      if (node && node.effectiveH > 0) idDirectMatched.push({ section, node })
      else idDirectMissSections.push(section)
    }
    const idDirectMiss = idDirectMissSections.length
    // 🛡️ 2026-11-03 治本（mc-max-1793683866145-ec1db095 实锤）：追认幻觉缺项。
    //   病灶：vision 把 `@antd/tab` 的第二个选项文字（「江阴大桥」tab 标题）**误升格为独立
    //   section**（id=2:3580，Figma 真值树中不存在 ⇒ validateVisionAnchors 已原地标
    //   `anchorValid:false`，其 children 2:3582 亦 MISS）⇒ ①-β「全命中才采纳」被这一项打破
    //   ⇒ idDirect 整体放弃 ⇒ 顺序配对 6≠regions 也 miss ⇒ **A4 全灭**（slotAncestor 恒 0）。
    //   判据（极保守、fail-open）：未命中项**全部**是已判幻觉的锚点（`anchorValid === false`）时，
    //   仍采纳命中项；被追认的幻觉项本身**完全不写比例**（交给宿主默认 flex，不猜也不混配）。
    //   任一未命中项**没有**幻觉标记（=可能是真·错配风险）⇒ 维持旧行为整体放弃（不放松）。
    //   上界：幻觉缺项数 ≤ 命中数（多数为真才采纳）——防止「大半段都是臆造」时静默劣化。
    const hallucinatedMiss = idDirectMissSections.filter((s) => s?.anchorValid === false).length
    const adoptsHallucinated = idDirectMiss > 0 && hallucinatedMiss === idDirectMiss
    const withinBound = !adoptsHallucinated || hallucinatedMiss <= idDirectMatched.length
    if (idDirectMatched.length >= 2 && (idDirectMiss === 0 || (adoptsHallucinated && withinBound))) {
      if (adoptsHallucinated) bump('idDirectSkipHallucinated', hallucinatedMiss)
      bump('idDirect', idDirectMatched.length)
      return writeSectionRatios(idDirectMatched, figmaNodes, stats)
    }
    // ①-γ section.id 部分命中 + 剩余区域兜底（2026-11-04 治本 · mc-max-1793765119169-4cbe82a2 实锤）
    //   病灶：cp-环境监测(2:7879) 的 vision 4 段里 3 段 id 精确命中 Figma 图元
    //   （2:7889 tabs-list / 89:43 tabs-icon / 2:7949 num），第 4 段 `chart-section` 是 vision
    //   **自造壳**（Figma 树无此 id，且未标 anchorValid:false）⇒「全命中才采纳」与「幻觉追认」
    //   两条判据都够不到 ⇒ ①-β 整体放弃 ⇒ ② 顺序配对按图元文档序 1:1：展开 sub-t(89:42) 后得
    //   [@echarts/line(113), num(14), tabs-list(27), tabs-icon(24)] 直接对位 ⇒ 113px 的图表被
    //   配给「标签切换栏」（flexGrow 2.539），图表反而只有 0.539 ⇒ 产物标签栏撑到 63.5%、
    //   图表压成 13.5%（用户报「样式很差」）。消费端 subcomponent-planner:2378 又以
    //   styles.figmaHeightPx 为事实源二次归一，把错值固化。
    //   判据（纯结构、fail-open，不猜）：
    //     ① 精确 id 命中 ≥2 段 —— 强身份证据，不是位置猜测；
    //     ② 剩余区域 = collectSectionRegions 里剔除「被命中项消费」的区域（自身/祖先/后代）；
    //     ③ 剩余区域**首项**若是 header 类（名匹配 + ≤80px）先按既有 header 容错剥掉
    //        （header 走 base-panel header slot、不进 body sections，本模块既有约定）；
    //     ④ 剥后 未命中段数 与 剩余区域数 **严格相等** 才采纳（多一少一率放弃）；
    //     ⑤ 剩余区域按 Figma y 视觉序（同 y 按 x）升序后再与未命中段（vision 顺序=视觉序）
    //        逐位配对——文档序 ≠ 视觉序时不得串列（cp-环境监测 的 slot-con 文档序即与视觉
    //        上下相反：@echarts/line 在下却排在前）；
    //     ⑥ 写比例仍走 writeSectionRatios 单一入口（同一份 collapsed list 并集 / slot 上溯修正）；
    //     ⑦ 缺项**全部无幻觉标记**才接管——带 anchorValid===false 的缺项归 ①-β 追认判据
    //        管辖（ec1db095 契约），①-γ 不得二次裁决（见下）。
    //   🔴 刻意不放松 ①-β「全命中才采纳」：spec「未命中项无 anchorValid===false ⇒ 整体放弃」
    //      阴性用例守着该判据，且该判据在设备详情场景（语义 id）正确。
    //   🔴 header 剥离**不设数量前提**（区别于 ② 路径的「恰多 1 才剥」）：本分支的前提已是
    //      「id 强命中 ≥2 段」，header 无 id 身份必落在剩余区域里；若剥后仍等量（如 5 段样本
    //      剩余 [header, chart] vs 缺项 2）⇒ 说明剩余区域含无法归属的头部 ⇒ 数量不等 ⇒ 放弃，
    //      否则会把 28px 的 header 认成 `chart-section`（spec 阴性等量纪律用例守着这条）。
    //   🔴 2026-11-04 评审补刀（判据裁决冲突）：①-β 上界裁决「幻觉缺项数 > 命中数 ⇒ 样本已
    //      不可信 ⇒ 放弃」后代码会落入本分支；若剩余区域数恰等，①-γ 会把**已判臆造的段**
    //      又配回真实区域——等于用位置兜底推翻了 id 层面的可信度裁决。修法：缺项里混入**任一**
    //      幻觉标记即不接管（含混合场景，保守 fail-open），该域完全交给 ①-β/② 既有口径。
    const unmarkedMissCount = idDirectMissSections.filter((s) => s?.anchorValid !== false).length
    if (
      idDirectMatched.length >= 2 &&
      idDirectMiss >= 1 &&
      unmarkedMissCount === idDirectMiss
    ) {
      const byId = new Map()
      for (const n of figmaNodes) if (n && n._id != null) byId.set(String(n._id), n)
      let leftover = collectLeftoverRegions(
        regions,
        idDirectMatched.map((m) => m.node),
        byId,
      )
      if (leftover.length) {
        const first = leftover[0]
        const h = Number(first?.absoluteBoundingBox?.height) || 0
        if (HEADER_RE.test(String(first?.name || '').trim()) && h > 0 && h <= HEADER_MAX_HEIGHT_PX) {
          leftover = leftover.slice(1)
        }
      }
      if (leftover.length === idDirectMiss) {
        // 🛡️ 2026-11-05：排序口径收敛到单一来源 sortByVisualOrder（② 顺序配对共用同一函数，
        //    此前 ①-γ 内联一份、② 完全不排 ⇒ 同一图结构两条路径结论相反）。
        const ordered = sortByVisualOrder(leftover)
        const leftoverMatched = ordered
          .map((r, i) => ({ section: idDirectMissSections[i], node: byId.get(String(r?.id)) }))
          .filter((m) => m.node && m.node.effectiveH > 0)
        if (leftoverMatched.length === idDirectMiss) {
          bump('idDirectLeftover', leftoverMatched.length)
          // 🛡️ 计数行取证：①-γ 接管时同样登记缺项数（否则日志只有 leftover、看不出兜底了几段）。
          bump('idDirectMiss', idDirectMiss)
          return writeSectionRatios([...idDirectMatched, ...leftoverMatched], figmaNodes, stats)
        }
      }
      bump('idDirectLeftoverMiss', 1)
    }
    bump('idDirectMiss', idDirectMiss)
  }

  // ② 顺序 1:1 兜底（仅当未直命中的 section 数与区域数相等，无歧义）
  // 🔧 2026-09-04 header 容错：微码产物的头部走 base-panel header slot（headerSlots），
  // 不在 body sections 里；而 figma 侧 header 仍是根的直接子节点 → regions 比 sections 多 1。
  // 实锤 mc-max-1788454423557-25e40782：regions=[header(30),switch(65),@antd/tab(317)]
  // vs sections=[概览,列表] → 2!==3 整体跳过 → 两区块被 mounter 盲注 flex:1 1 0 均分。
  // 处理（保守）：仅当 regions 恰好多 1 且首个是 header 类（名匹配 + 高度 ≤80px，
  // 文档顺序首项即视觉顶部）时，剥掉首个再 1:1；其余数量不等场景维持跳过不猜。
  // 🛡️ 2026-11-04：HEADER_RE / HEADER_MAX_HEIGHT_PX 已提升到模块作用域（①-γ 共用），
  //   此处不得再声明同名局部常量——同一函数内的局部 `const` 会让上方 ①-γ 分支落入 TDZ。
  let pairRegions = regions
  // 🛠️ 2026-10-30 视觉行归并兜底（mc-max-1793349441153-c3b958e0 实锤，见 mergeVisualRows）。
  // 仅在「regions 比 sections 多」时启用；归并后恰好对齐才采纳，否则原样退回走下面的旧容错链。
  // 🔴 归并结果按 y 升序，顺带修掉「文档顺序 ≠ 视觉顺序」的串列风险；数量本就相等时不动，
  //    以保证既有已验证行为（132 个 region/section 直配用例）零回归。
  if (restSections.length >= 2 && pairRegions.length > restSections.length) {
    const mergedRows = mergeVisualRows(pairRegions)
    if (mergedRows.length === restSections.length) {
      pairRegions = mergedRows
    }
  }
  if (restSections.length >= 2 && pairRegions.length === restSections.length + 1) {
    const first = pairRegions[0]
    const bb = first?.absoluteBoundingBox
    if (HEADER_RE.test(String(first?.name || '').trim()) && bb && bb.height > 0 && bb.height <= HEADER_MAX_HEIGHT_PX) {
      pairRegions = pairRegions.slice(1)
    }
  }
  // 🛠️ 2026-09-04 复合 region 展开（mc-max-1788485095835-e1432017 实锤）：
  // 不同构场景：vision 把一个「复合卡」slot 的视觉子块拆成多个平级 sections
  // （如 88:33 slot-当日总流量 含 sub-header/Group stat/bar1/bar2，被 vision 拆为
  // 当日总流量+隧道图+大桥图 三个 section）→ regions 数 < sections 数 →
  // 顺序配对跳过 → 全失比例（盲注 flex:1 1 0 均分，丢失设计稿高度比例）。
  // 修法：regions 不足 → 找 bbox.h 最大且有 children 的 region 当作「复合候选」，
  // 展开其直接子级（剥 header 类小子项，按 y 排序插入原位）。限 2 轮防过深。
  const MAX_EXPANSION_PASS = 2
  for (let pass = 0; pass < MAX_EXPANSION_PASS; pass++) {
    if (pairRegions.length >= restSections.length) break
    if (pairRegions.length < 2) break
    // 选最大（按 bbox.h），且：有 children & 非技术组件 & 非 header 类小子项
    let bestIdx = -1
    let bestH = -1
    for (let i = 0; i < pairRegions.length; i++) {
      const r = pairRegions[i]
      if (!r || String(r.name || '').startsWith('@')) continue
      if (!Array.isArray(r.children) || r.children.length < 2) continue
      const h = r.absoluteBoundingBox?.height || 0
      if (h > bestH) { bestH = h; bestIdx = i }
    }
    if (bestIdx < 0) break
    const target = pairRegions[bestIdx]
    const expandedKids = (target.children || [])
      .filter((c) => c && c.absoluteBoundingBox?.height > 0)
      // 剥内层 header 类小子项（与外层 header 容错同约定：名匹配 + 高度 ≤80）
      .filter((c) => {
        const nm = String(c.name || '').trim()
        const h = c.absoluteBoundingBox?.height || 0
        return !(HEADER_RE.test(nm) && h > 0 && h <= HEADER_MAX_HEIGHT_PX)
      })
      .sort((a, b) => (a.absoluteBoundingBox.y || 0) - (b.absoluteBoundingBox.y || 0))
    if (expandedKids.length < 2) break // 展开不充分说明这不是真复合 region，停
    pairRegions = [
      ...pairRegions.slice(0, bestIdx),
      ...expandedKids,
      ...pairRegions.slice(bestIdx + 1),
    ]
  }
  // 复合展开后清理：迭代剥「多余 1 项」（sub-header / outer header）直到对齐 sections，
  // 上限 5 轮防死循环。覆盖三种场景：① 外 header 留到展开后（剥首项）；② 内部 sub-header
  // 留到展开后（剥 sub-header）；③ 复合展开深度不到位仍多 N（放弃 fail-open，由后段 1:1 跳过）。
  const SUB_HEADER_RE = /^sub-?header$/i
  const stripLeadingHeaderIfExcess = () => {
    if (pairRegions.length !== restSections.length + 1) return false
    if (pairRegions.length < 3) return false
    const first = pairRegions[0]
    const bb = first?.absoluteBoundingBox
    if (HEADER_RE.test(String(first?.name || '').trim()) && bb && bb.height > 0 && bb.height <= HEADER_MAX_HEIGHT_PX) {
      pairRegions = pairRegions.slice(1)
      return true
    }
    return false
  }
  const stripSubHeader = () => {
    if (pairRegions.length <= restSections.length) return false
    const before = pairRegions.length
    pairRegions = pairRegions.filter(
      (r) => !(SUB_HEADER_RE.test(String(r?.name || '').trim()) && (r?.absoluteBoundingBox?.height || 0) <= HEADER_MAX_HEIGHT_PX),
    )
    return pairRegions.length < before
  }
  for (let t = 0; t < 5 && pairRegions.length > restSections.length; t++) {
    if (stripSubHeader()) continue
    if (stripLeadingHeaderIfExcess()) continue
    break
  }
  // 🛠️ 2026-11-03 Loop 3 治本（mc-max-1793675061130-eefcd3df 实锤）：复合展开后再归并一次。
  //   病灶：根下 slot-icon(547×493, 9 kids) 不匹配 WRAPPER_RE → collectSectionRegions 只得
  //   [header(10×10), slot-icon] 2 region；② 路径的复合展开把 slot-icon 展开成 9 图元 → 10≠3
  //   → fail-open 写入 0（A4 全链路无系数 → mounter 退等分 flex:1）。而 mergeVisualRows 只在
  //   展开**前**跑过（:512，那时 2 < 3 条件不成立）→ 展开后 regions 已是图元级，却永远失去
  //   归并机会——这是「顺序问题」而非「WRAPPER_RE 匹配问题」。
  //   修法：展开 + 剥离循环结束后若仍多于 sections，按同一判据（恰好相等才采纳，:513 同口径）
  //   再归并一次；不采纳则原样退回 1:1 跳过（不猜）。
  //   实测两真实样本：设备详情 10 图元 → 3 视觉行 [76,135,193]（头部信息/设备属性/产品描述）；
  //   合作厂商 10 图元 → 4 视觉行 [76,161,212,265]（与 ①-β id 直配结果逐项一致，互为交叉验证）。
  //   🔴 刻意不放松 WRAPPER_RE 匹配 `slot-*`：`slot-当日总流量` 等业务名 slot 自身就是 section
  //   （e1432017 复合展开契约，spec「复合 region 展开」用例），blanket 前缀会把它整体打挂。
  if (pairRegions.length > restSections.length) {
    const mergedAfterExpansion = mergeVisualRows(pairRegions)
    if (mergedAfterExpansion.length === restSections.length) {
      pairRegions = mergedAfterExpansion
    }
  }
  const orderMatched = []
  if (restSections.length === pairRegions.length && restSections.length >= 2) {
    // 🛡️ 2026-11-05 治本：区域侧先归一到视觉序，再与 vision 段序（视觉上下序）逐位配对。
    //   与 ①-γ 剩余区域映射共用 sortByVisualOrder（单一口径，杜绝两处排序语义分叉）。
    //   文档序与视觉序一致的样本（既有已验收的直配场景）排序后不变 ⇒ 零位移。
    pairRegions = sortByVisualOrder(pairRegions)
    for (let i = 0; i < restSections.length; i++) {
      const node = pairRegions[i]
      const bb = node?.absoluteBoundingBox
      if (bb && bb.height > 0) {
        let effectiveH = bb.height
        // 技术组件（@antd/tab）取子节点最大高
        if (String(node.name || '').startsWith('@') && Array.isArray(node.children)) {
          for (const child of node.children) {
            const cbb = child?.absoluteBoundingBox
            if (cbb && cbb.height > effectiveH) effectiveH = cbb.height
          }
        }
        orderMatched.push({ section: restSections[i], node: { name: node.name, effectiveH, _id: node.id } })
      }
    }
  }

  const matched = [...idMatched, ...orderMatched].filter((m) => m.node && m.node.effectiveH > 0)
  if (idMatched.length) bump('figmaNodeId', idMatched.length)
  if (orderMatched.length) bump('order', orderMatched.length)
  if (!matched.length) bump('miss', 1)
  return writeSectionRatios(matched, figmaNodes, stats)
}

/**
 * 视觉序：Figma y 升序，同 y 按 x 升序（稳定排序，全等时保留文档序）。
 *
 * 🛡️ 2026-11-05 治本（mc-max-1793840255758-76bb6b43 实锤 · cp-环境监测 2:7879）：
 *   本文件里「按视觉序配对」的口径此前只落在 ①-γ 剩余区域映射一处（内联 sort），
 *   ② 顺序配对仍用 `collectSectionRegions` 的**文档序** ⇒ 同一份图结构在两条路径上得到相反结果。
 *   实测病灶：vision 2 段（`89:42 Tab切换栏` 真 id + `chart-section` 自造壳），①-γ 因
 *   「id 精确命中需 ≥2 段」不接管（只 1 段命中）⇒ 落 ②，文档序 `[@echarts/line(113),
 *   sub-t(32)]` 对位视觉序 `[Tab, chart]` ⇒ 113px 的图表区被配给 Tab 栏（flexGrow 1.559，
 *   产物 Tab 栏撑到 78%、图表压成 22%），与设计稿完全相反。
 *   A4 方案 §9.3.2 已登记此残留并指明「彻底治本应抽公共 sortByVisualOrder 供 ②/①-γ 共用」。
 *
 *   🔴 为何可以按 y 排序：vision 的 sections 顺序即视觉上下序（分析模型自上而下描述），
 *      而 Figma 文档子节点序 ≠ 视觉序（本例 `@echarts/line` y930 排在 `sub-t` y898 之前）。
 *      「分段序 vs 区域序」按 index 1:1 配对的前提就是两侧同序 —— 不同序时必须显式归一。
 *
 * @param {Array<object>} regions Figma 图元/区域（含 absoluteBoundingBox）
 * @returns {Array<object>} 新数组（不原地修改）
 */
function sortByVisualOrder(regions) {
  return [...(regions || [])].sort((a, b) => {
    const ya = Number(a?.absoluteBoundingBox?.y) || 0
    const yb = Number(b?.absoluteBoundingBox?.y) || 0
    if (ya !== yb) return ya - yb
    return (Number(a?.absoluteBoundingBox?.x) || 0) - (Number(b?.absoluteBoundingBox?.x) || 0)
  })
}

/**
 * 把「section ↔ Figma 节点」配对写入 flex 比例（比例量纲，avg=1）。
 * 🛡️ 单一来源：根下直配（②-α）、section.id 直配（①-β）、顺序配对（②）三条路径共用同一写比例逻辑。
 * 🛡️ 2026-11-03 治本（09063447 实锤）：collapsed list section 的 effectiveH 先过
 *   effectiveHeightForSection 逐项并集修正（首卡 72 → 整列 532），配对节点只是
 *   首行/首卡时不再污染整段比例（含刀16 gap 与 A4 两个消费者同源受益）。
 * 🛡️ 2026-11-03 治本（ec1db095 实锤）：再叠加 slot 同名容器上溯（段标题 24 → 整段 556）。
 *   两者互补（列表并集看 body.items 几何；slot 上溯看 Figma 命名约定父链），取最大值，
 *   只升级不降级 ⇒ 任一判据命中都生效，都未命中则保持原配对值（fail-open 不猜）。
 */
function writeSectionRatios(matched, figmaNodes, stats = null) {
  if (!Array.isArray(matched) || matched.length < 2) return 0
  const byId = new Map()
  for (const n of figmaNodes || []) {
    if (n && n._id != null) byId.set(String(n._id), n)
  }
  let slotAncestorHits = 0
  const resolved = matched.map(({ section, node }) => {
    let effH = effectiveHeightForSection(section, node, figmaNodes)
    const ancestorH = slotAncestorHeightFor(node, section?.name, byId)
    if (ancestorH > effH) {
      effH = ancestorH
      slotAncestorHits += 1
    }
    return { section, node: { ...node, effectiveH: effH } }
  })
  // 计数语义：**实际生效**（祖先值严格大于配对值才计）——找到但更小说明配对已合理，不算命中。
  if (slotAncestorHits && stats && typeof stats === 'object') {
    stats.slotAncestor = (Number(stats.slotAncestor) || 0) + slotAncestorHits
  }
  const total = resolved.reduce((a, m) => a + m.node.effectiveH, 0)
  if (!(total > 0)) return 0
  const avg = total / resolved.length
  let count = 0
  for (const { section, node } of resolved) {
    if (!section.styles) section.styles = {}
    section.styles.flexGrow = Number((node.effectiveH / avg).toFixed(3))
    section.styles.flexShrink = 1
    section.styles.flexBasis = 0
    section.styles.figmaHeightPx = Math.round(node.effectiveH) // 仅审计
    // 🛡️ P-2（2026-11-04）：几何契约双写。flexGrow 是「换算后的比例」，换算即失真
    //   （画布不定则比例展开走样）；geometryPx 保留 Figma 绝对像素真值（顶层契约字段，
    //   非 styles 消费面），G1 尺寸同源直接消费它，不再反推。
    section.geometryPx = { h: Math.round(node.effectiveH) }
    count += 1
  }
  return count
}

/**
 * A4：把 vision 兄弟元素的高度按 **Figma 真值比例** 写入 styles（比例量纲，非 px）。
 *
 * 链接键（实测修正 2026-09-03）：vision 元素 name/role 多为中文、figma 节点为英文，
 * 故**不能用 name 精确匹配**（会全 miss → no-op）。改为：
 *   ① 元素带 figmaNodeId → 直接命中；
 *   ② 否则用元素 `type`/`id`（英文，如 tab/switch-card/device-switch）作关键词，
 *      在 Figma 中按「吻合度打分 + 排除容器/技术组件/槽位 + 文档顺序配对」定位。
 *
 * 两层处理（均要求组内 ≥2 命中，孤例/固定尺寸元素不猜）：
 *   - 顶层 `layout.sections` 组（allowTech）：让 device-switch 这类**单容器**靠父列
 *     比例被约束（其兄弟 section 命中 Figma 区域高度）；
 *   - 各 section.body 内的兄弟组：叶子元素逐项比例（tab 54/44/40/72/56 等）。
 * 固定尺寸元素（icon/badge/group/counter…）跳过，避免被比例化（实测会撑爆/压缩）。
 *
 * @param {object} parsed vision 分析结果（layoutStructure.layout.sections）
 * @param {object} figmaData Figma 节点树（document 根）
 * @param {object} [options]
 * @param {boolean} [options.disabled=false] 关闭开关（MC_DISABLE_FIGMA_ELEM_RATIO）
 * @returns {number} 被覆盖的元素数
 */
export function applyFigmaElementHeightRatios(parsed, figmaData, options = {}) {
  if (options.disabled) return 0
  // ⚠️ sections 双形态兜底（2026-09-04 实锤）：analyze() 内 post-process 阶段 parsed 是
  // 扁平 layout（parseAnalysisResult 返回 { layout:{sections} }，visual-parser.js:1663 注释），
  // layoutStructure 壳要等落盘/engineer 输入时才套上。若只认 layoutStructure 形态 → 恒 0
  // 静默空转（v3 管线实测 figmaElemRatioApplied 恒 0、figmaDimOverridden 恒 0）。
  // 与 visual-parser 其他后处理助手（1666/2224/2575 行的兜底链）保持一致。
  const layout = parsed?.layoutStructure?.layout || parsed?.layout
  const sections = layout?.sections || parsed?.layoutStructure?.sections || parsed?.sections
  if (!Array.isArray(sections) || !figmaData) return 0

  const figmaNodes = collectFigmaNodes(figmaData)
  let count = 0

  const processGroup = (group, allowTech) => {
    const cursorByKey = new Map()
    const matched = group
      .filter((el) => !isFixedSizeElement(el)) // 固定尺寸元素不参与比例
      .map((el) => {
        const node = findFigmaNodeForElement(el, figmaNodes, cursorByKey, { allowTech })
        return node ? { el, node } : null
      })
      .filter(Boolean)

    if (matched.length < 2) return
    const heights = matched.map((m) => m.node.effectiveH)
    const total = heights.reduce((a, b) => a + b, 0)
    if (!(total > 0)) return

    const avg = total / matched.length
    for (const { el, node } of matched) {
      if (!el.styles) el.styles = {}
      // 比例量级（~1），不触犯 FLEX-004 的 flex-grow 量纲混用
      el.styles.flexGrow = Number((node.effectiveH / avg).toFixed(3))
      el.styles.flexShrink = 1
      el.styles.flexBasis = 0
      el.styles.figmaHeightPx = Math.round(node.effectiveH) // 仅审计，产物不得写区块固定高度
      count += 1
    }
  }

  // 顶层：section 级 1:1 顺序配对（device-switch 靠它按比例约束父列高度）
  count += applyFigmaSectionRatios(sections, figmaData, options.stats || null)

  for (const section of sections) {
    for (const group of collectSiblingGroups(section?.body || section)) {
      processGroup(group, false)
    }
  }

  return count
}

export default applyFigmaElementHeightRatios

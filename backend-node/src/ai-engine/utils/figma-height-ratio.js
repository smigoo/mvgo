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

export function collectFigmaNodes(figmaData) {
  const nodes = []
  const walk = (node, depth = 0) => {
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
      })
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child, depth + 1)
    }
  }
  walk(figmaData)
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

/**
 * 收集 Figma 顶层「区域」节点（用于 section 级 1:1 顺序配对）。
 * 根节点直接子节点中：
 *  - 纯背景（bg/background/底图/背景）剔除；
 *  - 内容包装容器（slot-con/frame/container/group/wrapper/panel）展开为它的
 *  直接子节点（这些子节点才是真正的 section 区域，包装层无视觉身份）。
 *
 * 🛠️ 2026-09-04 BG 剔除增强（mc-max-1788485095835-e1432017 实锤）：
 *  - 原 BG_RE=/^(bg|background|背景)$/i 只匹配**恰好**名为 bg 的节点。
 *  - 实际 Figma 设计稿常用 `bg-[m]`（隐藏层标记）/ `bg-_m-35`（资源层）/ `背景-x`
 *    等带后缀命名，原正则全部漏剔 → 该背景节点作为 region 参与 sections 1:1 配对，
 *    使所有 section 高度**整体偏移一位**（当日总流量误用整图高 807 / 隧道图误取 header 32 / 大桥图误取 slot-当日总流量 556）。
 *  - 修法：命名前缀匹配 `bg[-_\[(_/].*` / `background[-_\[(_/].*` / `背景[-_\[(_/].*`
 *    或纯 bg/background/背景（无后缀）；
 *    + **bbox 铺满根**强约束（width/height 均 ≥ 根 95%）→ 避免误删业务性
 *    `bg-card` 类小尺寸模块（卡片本身不是铺满整图的）。
 *  - ⚠️ 设计原则：背景层 ≠ 装饰图。装饰图（圆角/渐变/光效）通常名字不含 bg 前缀
 *    （名为 decoration/glow/line 等）且 bbox 远小于根 → 不会进入本剔除分支。
 *
 * 例：root[bg-[m](铺满), header-(32.5), slot-当日总流量(556), 车型(142), 流量(174)]
 *   → regions=[header-, slot-当日总流量, 车型, 流量预测]（bg-[m] 命中铺满+前缀被剔除）
 *   → 4 regions ≠ 5 sections → 进入复合 region 展开（见 applyFigmaSectionRatios）。
 *
 * @param {object} figmaData Figma 节点树（document 根）
 * @returns {Array<object>} figma 节点（含 absoluteBoundingBox）
 */
export function collectSectionRegions(figmaData) {
  const root = figmaData?.document || figmaData
  const children = (root && root.children) || []
  const WRAPPER_RE = /^(slot-con|slot|frame|container|group|wrapper|panel)$/i
  // 🛠️ BG 前缀 + 后缀分隔符（破折号/下划线/中括号/圆括号/斜杠/点）→ 匹配 bg-[m] / bg-_m-35 / bg-card / background-x 等
  //   也允许恰好名为 bg/background/背景（无后缀）
  const BG_RE = /^(bg|background|背景)(?:[-_\[(_/].*)?$/i
  const rootBB = root?.absoluteBoundingBox
  const rootW = Number(rootBB?.width) || 0
  const rootH = Number(rootBB?.height) || 0
  // 铺满阈值：宽高均 ≥95% → 视为整图背景（避免误删占根 70%+ 的"卡片主区"等业务模块）
  const FILL_RATIO = 0.95
  const isFullBleedBG = (n) => {
    const bb = n?.absoluteBoundingBox
    if (!bb || !(bb.width > 0) || !(bb.height > 0) || !(rootW > 0) || !(rootH > 0)) return false
    return bb.width / rootW >= FILL_RATIO && bb.height / rootH >= FILL_RATIO
  }
  const regions = []
  for (const c of children) {
    const nm = String(c?.name || '')
    // ① 纯背景层不参与布局比例（命名命中 BG_RE 且 bbox 铺满根，二者都满足才视为背景）
    if (BG_RE.test(nm.trim()) && isFullBleedBG(c)) continue
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
 * @returns {number} 写入比例的元素数
 */
export function applyFigmaSectionRatios(sections, figmaData) {
  if (!Array.isArray(sections) || !figmaData) return 0
  const figmaNodes = collectFigmaNodes(figmaData)
  const regions = collectSectionRegions(figmaData)

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

  // ② 顺序 1:1 兜底（仅当未直命中的 section 数与区域数相等，无歧义）
  // 🔧 2026-09-04 header 容错：微码产物的头部走 base-panel header slot（headerSlots），
  // 不在 body sections 里；而 figma 侧 header 仍是根的直接子节点 → regions 比 sections 多 1。
  // 实锤 mc-max-1788454423557-25e40782：regions=[header(30),switch(65),@antd/tab(317)]
  // vs sections=[概览,列表] → 2!==3 整体跳过 → 两区块被 mounter 盲注 flex:1 1 0 均分。
  // 处理（保守）：仅当 regions 恰好多 1 且首个是 header 类（名匹配 + 高度 ≤80px，
  // 文档顺序首项即视觉顶部）时，剥掉首个再 1:1；其余数量不等场景维持跳过不猜。
  const HEADER_RE = /^(header|头部|title|标题|top|top-bar|title-bar)[-_]?$/i
  let pairRegions = regions
  if (restSections.length >= 2 && regions.length === restSections.length + 1) {
    const first = regions[0]
    const bb = first?.absoluteBoundingBox
    if (HEADER_RE.test(String(first?.name || '').trim()) && bb && bb.height > 0 && bb.height <= 80) {
      pairRegions = regions.slice(1)
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
        return !(HEADER_RE.test(nm) && h > 0 && h <= 80)
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
    if (HEADER_RE.test(String(first?.name || '').trim()) && bb && bb.height > 0 && bb.height <= 80) {
      pairRegions = pairRegions.slice(1)
      return true
    }
    return false
  }
  const stripSubHeader = () => {
    if (pairRegions.length <= restSections.length) return false
    const before = pairRegions.length
    pairRegions = pairRegions.filter(
      (r) => !(SUB_HEADER_RE.test(String(r?.name || '').trim()) && (r?.absoluteBoundingBox?.height || 0) <= 80),
    )
    return pairRegions.length < before
  }
  for (let t = 0; t < 5 && pairRegions.length > restSections.length; t++) {
    if (stripSubHeader()) continue
    if (stripLeadingHeaderIfExcess()) continue
    break
  }
  const orderMatched = []
  if (restSections.length === pairRegions.length && restSections.length >= 2) {
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
  if (matched.length < 2) return 0

  const total = matched.reduce((a, m) => a + m.node.effectiveH, 0)
  if (!(total > 0)) return 0
  const avg = total / matched.length

  let count = 0
  for (const { section, node } of matched) {
    if (!section.styles) section.styles = {}
    section.styles.flexGrow = Number((node.effectiveH / avg).toFixed(3))
    section.styles.flexShrink = 1
    section.styles.flexBasis = 0
    section.styles.figmaHeightPx = Math.round(node.effectiveH) // 仅审计
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
  count += applyFigmaSectionRatios(sections, figmaData)

  for (const section of sections) {
    for (const group of collectSiblingGroups(section?.body || section)) {
      processGroup(group, false)
    }
  }

  return count
}

export default applyFigmaElementHeightRatios

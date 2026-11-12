/**
 * 🛡️ V-4（2026-11-08 · mc-1794122457556-be2af6c7「设备监测」实锤）：顶层段锚点范围几何审计。
 *
 * ── 病灶（真机证据） ────────────────────────────────────────────────────────
 * vision 把**一张卡**及其**该卡的背景**报成两个顶层业务段：
 *   `2:8438 Group 2136637321` 117×64（单卡）        → title「左侧功能标签栏」
 *   `2:8439 bg`               117×64（单卡底图, 0 文字）→ title「设备状态卡片网格」
 * 真实网格容器是它们的祖先 `2:8437 cons` 367×295（12 张 117×64 卡，3×4）。
 *
 * 忠实执行错段的连锁后果（全部实测）：
 *   ① `applyFigmaHeightGrow` 拿 64 当段高 ⇒ flexGrow 0.539/1.163/1.149/1.149；
 *   ② 确定性模板装配按 4 段出骨架 ⇒ `CardGrid` 段 flex 1.149（真值应 ≈295/425）；
 *   ③ 刀53 `detectIconLeaf` 对 `2:8439`（子树 3 节点、0 TEXT）判 `kind:'icon'` ⇒
 *      **整文件重写 `CardGrid.vue` 为单图容器**（12 张卡全丢，产物退化为一张背景图）。
 *
 * ── 为什么不在下游补 ────────────────────────────────────────────────────────
 * 刀53 判 icon 没有错（`2:8439` 确实是纯图叶）；错的是「它被当成一个段」。
 * 同理 flex 量纲、装配比例、覆盖度判据都只是忠实放大这个上游错误。
 * 故落点唯一：**段划分本身**（planner 锚点归属，总纲 §6 G14a / R3 同域）。
 *
 * ── 判据（几何事实，零命名/零业务值） ───────────────────────────────────────
 * 「一个**重复集合**中的某个成员，不可能是整个业务段」——成员的上提目标必然是集合容器。
 * 从锚点 N 逐级向上，找第一个满足以下全部条件的祖先 C：
 *   1. C 的直接子节点中，与 N **几何同构**（宽高差 ≤ max(1px, 1%)）的兄弟 ≥ `MIN_SET_SIZE`；
 *   2. 这些同构成员构成**双轴网格**（distinct x ≥ 2 且 distinct y ≥ 2），
 *      或**纯垂直列表**（distinct x === 1 且 distinct y ≥ `MIN_SET_SIZE` 且 C 宽 ≈ 成员宽）；
 *   3. C 不是根节点（根代表整个组件，不是段）。
 *
 * ▸ 为什么排除「单轴水平列表」：同一行并排的 3~4 块在大屏里多为**并列语义区块**
 *   （今日/本周/本月、左中右三栏），合并会真丢内容；垂直方向的多行才是「某一行被当成整段」
 *   的典型误判。保守取垂直，宁漏不误伤。
 *
 * ── 上提后去重 ──────────────────────────────────────────────────────────────
 * 多个段上提到同一集合容器 ⇒ 合并为一段（保留首个的 type/title，并集 refs/children/
 * internalSubcomponents，几何高度改用 C 的真实盒）。段数因此下降，下游
 * （flexGrow / 装配 / minFiles / 覆盖度）全部按修正后的段树计算，无第二套口径。
 *
 * ── R3 加固（2026-11-11 · mc-max-1794359124563-05945a47「合作厂商弹窗」实锤）────────
 * 🔴 病灶：**本模块把 R2 已明文拒绝的事又做了一遍**。
 *   真值 `38:3134` 660×868，4 个业务段：
 *     段0 统计卡片区  `38:3260`（首卡 265×76）真实高 **76px（8.8%）**；
 *     段1/2/3 三个分组 604×161 / 212 / 265。
 *   `entrance` 时 vision 段高本来是对的（`figmaHeightPx:76 flexGrow:0.426`），
 *   本模块把它上提成 `796:3`（`slot-icon` 604×787 整内容槽）⇒ 段高 76 → **787（+935%）**，
 *   `flexGrow` 0.426 → 2.209；下游 `applyFigmaHeightGrow` 忠实执行 ⇒
 *   产物 `<StatsSection style="flex:0.552">` 独占 55.2% 高度，三个列表被压到 11.3/14.9/18.6%。
 *
 * 🔴 同一次运行里 **R2（`section-anchor-truth#auditSectionAnchors`）对同一候选
 *   `candidateLca=796:3` 已经以 `lca-covers-sibling-sections` 正确拒修**：
 *     `unrepairedDetail:[{sectionId:'38:3260',candidateLca:'796:3',reason:'lca-covers-sibling-sections',
 *                         coveredAnchors:['38:3137','38:3162','38:3206']}]`
 *   —— 判据不对称才是真因（不是「判据不够多」，是「同一条判据只有 R2 有」）。
 *
 * 根因①（漏认「段已声明的内容」为已覆盖）：
 *   段0 的 `body.children` **已声明两张卡** `[38:3260, 38:3282]`（各 `role:'stat-card'`）——
 *   vision 用「首卡 id」当整段锚点（与 `declaresCollection` 注释里「首行 id 表示整张表」同族）。
 *   旧实现只把「锚点**子树**」算作已覆盖 ⇒ 兄弟卡 `38:3282`（同尺寸、非锚点子树内）
 *   被误判为「未被任何段覆盖的成员」⇒ 判定 `horizontal-row` 上提。
 *   ⇒ 修复：`coveredIds` 增认**段声明的内容节点 id**（`body.children` / `body.items` /
 *   `headers` / `internalSubcomponents` / `declaredContent` / `refs` / `sourceNodeIds`）及其子树。
 *     语义：「段声明了内容」= 该节点**已有归属**，不可能是「被漏掉的兄弟」。
 *     ⇒ 本例 `uncovered` 由 1 → 0 ⇒ `all-peers-covered` ⇒ 不上提（锚点与几何保持 76）。
 *
 * 根因②（缺 R2 同款对称守卫）：
 *   即使根因①单独漏网，也应有第二道闸：**上提目标不得吞并其他业务段**。
 *   补 `covers-sibling-sections`：候选容器子树若包含**其他段**的锚点，且该段**不**并入同一
 *   目标（即不是合法合并），则撤销本次上提（reason 同名对齐 R2，便于两条轨道对账）。
 *   例外：其他段也上提到**同一目标** ⇒ 正当合并（V-4 设计意图：两个成员并进同一集合容器），不撤。
 *   ⇒ 本例 `796:3` 子树含 `38:3137/3162/3206`（段1/2/3），三者目标都是自身 ⇒ 撤销。
 *
 * 两道判据互补：① 让「本段自己声明的成员」不再被当漏网兄弟；② 挡住「目标容器吞并别的段」。
 * 均只读 Figma 结构化字段（id 对位 / 几何盒 / 段声明），**零命名、零尺寸枚举**。
 * 与 V-4 原始收益不冲突：`2:8438`/`2:8439`（单卡 + 其 bg，未声明任何兄弟）仍照常上提
 * —— 见 spec「阳性①②」「边界」用例原样通过。
 *
 * ── 边界（fail-open，不猜） ─────────────────────────────────────────────────
 * 无 Figma 真值 / 段数 < 2 / 锚点无法解析 / 无几何盒 / 未命中判据 ⇒ 原样返回 + `skippedReason`。
 * 纯函数：不 import logger，日志由调用方按返回值打（计数行铁律：0 也打）。
 *
 * 锚点候选单一来源：`section-anchor-truth#sectionAnchorKey`（figmaAnchorId → figmaNodeId →
 * nodeId → figmaNode → id），不另写候选序；几何工具复用 `section-tree#indexFigmaNodes/getFigmaBox`。
 */
import { FIGMA_ID_RE, sectionAnchorKey } from './section-anchor-truth.js'
import { getFigmaBox, indexFigmaNodes } from './section-tree.js'

/** 同构集合的最小成员数：2 个即成立（是否为「集合」由「有兄弟未被任何段覆盖」判定，不靠数量） */
const MIN_SET_SIZE = 2

/** 单轴列表上提要求：成员沿该轴铺满父容器的比例（防止「图标容器」被误当整段） */
const AXIS_FILL_RATIO = 0.9

/** 几何同构容差：宽高差 ≤ max(1px, 尺寸 × 该比例) —— 覆盖 Figma 小数四舍五入 */
const SAME_SIZE_TOL_RATIO = 0.01

/** 单轴列表判定「C 在另一轴与成员同宽同高」的容差 */
const AXIS_ALIGN_TOL_RATIO = 0.02

function sameSize(a, b) {
  if (!a || !b) return false
  const tolW = Math.max(1, Math.max(a.w, b.w) * SAME_SIZE_TOL_RATIO)
  const tolH = Math.max(1, Math.max(a.h, b.h) * SAME_SIZE_TOL_RATIO)
  return Math.abs(a.w - b.w) <= tolW && Math.abs(a.h - b.h) <= tolH
}

/**
 * 段是否**自带结构化集合清单**（`items` / `headers`，顶层或 `body` 内）。
 *
 * 🔴 事实否决（2026-11-08 · `dfe50968` 既有 spec 实锤）：
 *   vision 惯用「首行 id」表示整张表 —— `43:4788` 是表格首行（179×44），
 *   整表 388 高；其父 `43:4785` 下确有 3 个 179×44 同构行 ⇒ 纯几何看它就是「集合成员」，
 *   上提会把表格段变成「左半列容器」，table 语义与 388 整表高度一起丢。
 *   但该段**已声明 headers/items**（自己就是完整集合）⇒ 它不是「某个成员」，不得上提。
 *
 * 判据只看「有没有声明成员清单」，不看 role/type 名称（`2:8439` 声明为 grid、无 items，
 * 属真正的误判段，仍需上提）。零命名依赖。
 */
function declaresCollection(sec) {
  const sources = [sec, sec?.body].filter((x) => x && typeof x === 'object')
  return sources.some(
    (s) =>
      (Array.isArray(s.items) && s.items.length > 0) ||
      (Array.isArray(s.headers) && s.headers.length > 0),
  )
}

function sameAxis(a, b, ratio = AXIS_ALIGN_TOL_RATIO) {
  return Math.abs(a - b) <= Math.max(1, Math.max(a, b) * ratio)
}

/** 值去重（按坐标取整分组，容忍小数抖动） */
function distinctCount(values) {
  const set = new Set(values.map((v) => Math.round(Number(v) || 0)))
  return set.size
}

/**
 * 判断祖先 C 是否为锚点 N 所属的「重复集合容器」。
 *
 * 🔑 主判据不是「成员数量」，而是**「有没有同构兄弟未被任何段覆盖」**：
 *   - `mc-1794126061219-cbcac19a` 实锤：`89:38 switch` 下有 `2:8787 active` + `2:8806 default`
 *     两张 193.4×64.8 同构卡，vision 只报了 `2:8787` ⇒ 单卡被拉成整条统计栏、
 *     底图箭头变形、卡内文字溢出。兄弟只有 2 个，旧「≥3」判据漏掉。
 *   - 反过来，若两个并排块**各自都是独立段**（都被覆盖），说明 vision 已按语义分区，
 *     此时上提才会误伤 ⇒ 必须不上提。
 *
 * 单轴列表额外要求成员沿该轴**铺满**父容器（≥90%），用来排除
 * 「一个图标 + 周围一堆同构装饰图标」这类非整段形态。
 *
 * @param {object} containerNode 候选祖先
 * @param {{x:number,y:number,w:number,h:number}} anchorBox 锚点几何盒
 * @param {Set<string>} coveredIds 已被任一段锚点（含其子树）覆盖的节点 id
 * @returns {{ isSet: true, reason: string, members: number } | { isSet: false, reason: string }}
 */
function detectSetContainer(containerNode, anchorBox, coveredIds) {
  const children = Array.isArray(containerNode?.children) ? containerNode.children : []
  if (children.length < MIN_SET_SIZE) return { isSet: false, reason: 'too-few-children' }
  const peers = []
  for (const c of children) {
    const b = getFigmaBox(c)
    if (b && sameSize(b, anchorBox)) peers.push({ id: String(c.id ?? ''), box: b })
  }
  if (peers.length < MIN_SET_SIZE) return { isSet: false, reason: `peers=${peers.length}` }
  const uncovered = peers.filter((p) => !coveredIds.has(p.id))
  if (uncovered.length === 0) return { isSet: false, reason: 'all-peers-covered' }

  const boxes = peers.map((p) => p.box)
  const xs = distinctCount(boxes.map((b) => b.x))
  const ys = distinctCount(boxes.map((b) => b.y))
  const cb = getFigmaBox(containerNode)

  // 双轴网格（如 12 卡 3×4）：本身就是集合，不受铺满约束
  if (xs >= 2 && ys >= 2) {
    return { isSet: true, reason: 'grid', members: peers.length, uncovered: uncovered.length }
  }
  // 水平单行：成员总跨宽须铺满父宽
  if (ys === 1 && xs >= 2) {
    const span = Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x))
    if (cb && span / cb.w >= AXIS_FILL_RATIO) {
      return { isSet: true, reason: 'horizontal-row', members: peers.length, uncovered: uncovered.length }
    }
    return { isSet: false, reason: 'horizontal-not-full' }
  }
  // 纯垂直列表：成员总跨高须铺满父高，且父宽≈成员宽（不是多列）
  if (xs === 1 && ys >= 2) {
    const span = Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y))
    if (cb && span / cb.h >= AXIS_FILL_RATIO && sameAxis(cb.w, boxes[0].w)) {
      return { isSet: true, reason: 'vertical-list', members: peers.length, uncovered: uncovered.length }
    }
    return { isSet: false, reason: 'vertical-not-full' }
  }
  return { isSet: false, reason: 'ambiguous-layout' }
}

/**
 * 段**声明的内容**节点 id 集合（结构化字段，不含 `section.id` 自身 —— 它由锚点先行覆盖）。
 *
 * 「段声明了内容」= 该节点已有归属 ⇒ 不可能是「未被任何段覆盖的漏网兄弟」。
 * 只认 Figma 形态 id（过 `FIGMA_ID_RE`），语义 id（`section-cards`）自然不入选。
 *
 * 采集面（与 `section-anchor-truth#collectSectionFigmaRefs` 同族，但**只增**两个来源）：
 *   · 成员清单：`children` / `items` / `elements` / `internalSubcomponents` / `headers`
 *     （顶层 或 `body` 内 或 `declaredContent` 内）的 `figmaNode` / `figmaNodeId` / `id`；
 *   · 显式引用数组：`refs` / `sourceNodeIds` / `nodeIds`。
 * 🔴 覆盖 `body.children` 是本次实锤的关键：段0 用它声明了两张统计卡（`38:3260`/`38:3282`）。
 */
function collectDeclaredRefIds(section) {
  const out = new Set()
  if (!section || typeof section !== 'object') return out
  const pushId = (v) => {
    if (typeof v !== 'string') return
    const s = v.trim()
    if (s && FIGMA_ID_RE.test(s)) out.add(s)
  }
  for (const key of ['refs', 'sourceNodeIds', 'nodeIds']) {
    const arr = section[key]
    if (Array.isArray(arr)) arr.forEach(pushId)
  }
  const shells = [section, section.body, section.declaredContent].filter(
    (x) => x && typeof x === 'object',
  )
  for (const shell of shells) {
    for (const key of ['children', 'items', 'elements', 'internalSubcomponents', 'headers']) {
      const arr = shell[key]
      if (!Array.isArray(arr)) continue
      for (const it of arr) {
        if (typeof it === 'string') {
          pushId(it)
          continue
        }
        if (!it || typeof it !== 'object') continue
        for (const k of ['figmaNode', 'figmaNodeId', 'id']) pushId(it[k])
      }
    }
  }
  return out
}

/**
 * `ancestorId` 是否为 `id` 的祖先（含自身）。与 `section-anchor-truth#isAncestorOrSelf` 同口径，
 * 但只吃 `indexFigmaNodes` 的 `parentId` 链（本模块不 import 那份未导出的内部函数）。
 */
function isAncestorId(index, ancestorId, id) {
  let cur = index.get(String(id)) || null
  let guard = 0
  while (cur && guard++ < 128) {
    if (String(cur.id) === String(ancestorId)) return true
    cur = cur.parentId != null ? index.get(String(cur.parentId)) || null : null
  }
  return false
}

/**
 * 审计并（在满足窄判据时）把过窄的顶层段锚点上提到其集合容器。
 *
 * @param {Array<object>} sections 顶层 sections（planner effectiveSections）
 * @param {object} figmaRoot Figma 真值树（或 { document } 包裹）
 * @returns {{ sections: Array<object>, stats: {
 *   evaluated: number, sections: number, anchoredSections: number,
 *   promoted: number, merged: number, vetoed: number, skippedReason: string,
 *   promotions: Array<{sectionId:string, from:string, to:string, reason:string, members:number}>,
 *   vetoes: Array<{sectionId:string, from:string, to:string, reason:string, coveredAnchors:string[]}>
 * }}}
 *   `sections` 为原数组（未动）或**新数组**（绝不原地改）。
 *   `vetoes` 为「因目标容器吞并其他段而被撤销的上提」（R3，对齐 R2 `lca-covers-sibling-sections`）。
 */
export function auditSectionAnchorScope(sections, figmaRoot) {
  const stats = {
    evaluated: 0,
    sections: Array.isArray(sections) ? sections.length : 0,
    anchoredSections: 0,
    promoted: 0,
    merged: 0,
    vetoed: 0,
    skippedReason: '',
    promotions: [],
    vetoes: [],
  }
  if (!Array.isArray(sections) || sections.length < 2) {
    stats.skippedReason = 'insufficient-sections'
    return { sections, stats }
  }
  const root = figmaRoot?.document || figmaRoot
  if (!root || typeof root !== 'object') {
    stats.skippedReason = 'no-figma-data'
    return { sections, stats }
  }

  const index = indexFigmaNodes(root)
  if (index.size === 0) {
    stats.skippedReason = 'empty-figma-index'
    return { sections, stats }
  }
  const rootId = root.id != null ? String(root.id) : null

  // ① 解析每个段的锚点几何盒（全部可解析才继续，与 vision-order-auditor 同纪律）
  const anchors = sections.map((s) => {
    const key = sectionAnchorKey(s)
    if (!key || !FIGMA_ID_RE.test(key)) return null
    const rec = index.get(String(key))
    if (!rec) return null
    const box = getFigmaBox(rec.rawNode)
    if (!box) return null
    return { key: String(key), box }
  })
  stats.anchoredSections = anchors.filter(Boolean).length
  if (stats.anchoredSections < sections.length) {
    stats.skippedReason = 'unanchored-sections'
    return { sections, stats }
  }

  // ①-b 「已被覆盖」集合：任一段锚点**及其整棵子树**（段声明了子树 = 该子树内元素有归属）
  //   ＋ **段声明的内容节点**及其子树（R3，见头部「根因①」）。
  //   语义：「段声明了内容」⇒ 该节点已有归属 ⇒ 不可能是「被漏掉的同构兄弟」。
  const coveredIds = new Set()
  const markCovered = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.id != null) coveredIds.add(String(node.id))
    for (const c of Array.isArray(node.children) ? node.children : []) markCovered(c)
  }
  for (const a of anchors) markCovered(index.get(a.key)?.rawNode)
  for (const s of sections) {
    for (const id of collectDeclaredRefIds(s)) markCovered(index.get(id)?.rawNode)
  }

  // ② 逐段向上找集合容器（**只取暂定目标**；「吞并其他段」的对称守卫在 ②-b 统一裁决，
  //   避免 `stats.promoted` 先加后减、或合并已发生后无法回退）
  const targets = anchors.map((a, i) => {
    // 已声明成员清单（表格首行 id / 列表首项 id 作锚点）⇒ 它自己就是集合段，不得上提
    if (declaresCollection(sections[i])) {
      return { ...a, target: a.key, targetBox: a.box, vetoed: 'declares-collection' }
    }
    stats.evaluated += 1
    const rec = index.get(a.key)
    let cursorId = rec?.parentId || null
    let hops = 0
    while (cursorId && cursorId !== rootId && hops < 32) {
      const parentRec = index.get(cursorId)
      if (!parentRec) break
      const verdict = detectSetContainer(parentRec.rawNode, a.box, coveredIds)
      if (verdict.isSet) {
        return {
          ...a,
          target: String(cursorId),
          targetBox: getFigmaBox(parentRec.rawNode),
          setReason: verdict.reason,
          members: verdict.members,
          uncovered: verdict.uncovered,
        }
      }
      cursorId = parentRec.parentId || null
      hops += 1
    }
    return { ...a, target: a.key, targetBox: a.box }
  })

  // ②-b 对称守卫（R3 · 对齐 R2 `lca-covers-sibling-sections`）：
  //   目标容器子树若覆盖**其他段**的声明锚点 ⇒ 该上提把别段地盘划归本段 ⇒ 撤销。
  //   例外：其他段也上提到**同一目标** ⇒ 正当合并（V-4 设计意图），不撤。
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]
    if (t.target === t.key) continue
    const covered = []
    for (let j = 0; j < anchors.length; j += 1) {
      if (j === i) continue
      if (targets[j].target === t.target) continue // 并进同一目标 = 合法合并
      if (isAncestorId(index, t.target, anchors[j].key)) covered.push(anchors[j].key)
    }
    if (covered.length === 0) continue
    stats.vetoed += 1
    stats.vetoes.push({
      sectionId: String(sections[i]?.id ?? ''),
      from: t.key,
      to: t.target,
      reason: 'covers-sibling-sections',
      coveredAnchors: covered,
    })
    targets[i] = {
      ...anchors[i],
      target: anchors[i].key,
      targetBox: anchors[i].box,
      vetoed: 'covers-sibling-sections',
    }
  }

  // ②-c 守卫后统计晋级（只认最终 target ≠ 原锚点的段）
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]
    if (t.target === t.key) continue
    stats.promoted += 1
    stats.promotions.push({
      sectionId: String(sections[i]?.id ?? ''),
      from: t.key,
      to: t.target,
      reason: t.setReason || 'set-container',
      members: t.members,
      uncovered: t.uncovered,
    })
  }

  if (stats.promoted === 0) {
    stats.skippedReason = stats.vetoed > 0 ? 'vetoed-covers-sibling' : 'no-narrow-anchor'
    return { sections, stats }
  }

  // ③ 按上提目标重写段（同目标合并）
  const out = []
  const byTarget = new Map()
  for (let i = 0; i < sections.length; i += 1) {
    const sec = sections[i]
    const t = targets[i]
    const existing = byTarget.get(t.target)
    if (existing) {
      // 合并进已存在的段：只并集事实，不改 type/title（保留首个＝数组序靠前者）
      mergeSectionFacts(existing, sec)
      stats.merged += 1
      continue
    }
    const rebuilt = t.target === t.key ? sec : promoteSection(sec, t)
    byTarget.set(t.target, rebuilt)
    out.push(rebuilt)
  }

  // ④ 已在上方按最终 target 统计过 `promoted`（> 0 才会走到这里）⇒ 必有变化，返回新数组
  return { sections: out, stats }
}

/** 把段的锚点与几何事实改为目标集合容器（内容字段不动） */
function promoteSection(sec, target) {
  const tBox = target.targetBox
  const next = {
    ...sec,
    id: target.target,
    sourceNodeIds: uniqIds([
      ...(Array.isArray(sec?.sourceNodeIds) ? sec.sourceNodeIds : []),
      target.target,
    ]),
    // 锚点四候选统一指向集合容器（G1：改的是「指向哪」，不是伪造内容）
    figmaAnchorId: target.target,
    figmaNodeId: target.target,
    nodeId: target.target,
  }
  if (tBox) {
    next.layoutMetadata = {
      ...(sec?.layoutMetadata || {}),
      height: tBox.h,
      width: tBox.w,
    }
    // 段高是几何事实：无 styles 时也要落，否则下游 buildSectionHeightsMap 继续读旧值
    next.styles = {
      ...(sec?.styles && typeof sec.styles === 'object' ? sec.styles : {}),
      figmaHeightPx: tBox.h,
      figmaWidthPx: tBox.w,
    }
  }
  next._scopePromotedFrom = { id: String(sec?.id ?? ''), reason: target.reason || 'narrow-anchor' }
  return next
}

/** 段事实并集（refs / 子段 / 内部子组件 / tab 面板），按 id 去重 */
function mergeSectionFacts(base, extra) {
  base.sourceNodeIds = uniqIds([
    ...(Array.isArray(base?.sourceNodeIds) ? base.sourceNodeIds : []),
    ...(Array.isArray(extra?.sourceNodeIds) ? extra.sourceNodeIds : []),
  ])
  base.children = mergeListById(
    Array.isArray(base?.children) ? base.children : [],
    Array.isArray(extra?.children) ? extra.children : [],
  )
  if (Array.isArray(extra?.internalSubcomponents) || Array.isArray(base?.internalSubcomponents)) {
    base.internalSubcomponents = mergeListById(
      Array.isArray(base?.internalSubcomponents) ? base.internalSubcomponents : [],
      Array.isArray(extra?.internalSubcomponents) ? extra.internalSubcomponents : [],
    )
  }
  const extraPanels = extra?.tabStructure?.panels
  if (Array.isArray(extraPanels) && extraPanels.length > 0) {
    const basePanels = Array.isArray(base?.tabStructure?.panels) ? base.tabStructure.panels : []
    base.tabStructure = {
      ...(base?.tabStructure || {}),
      panels: uniqIds([...basePanels, ...extraPanels]),
    }
  }
  return base
}

function mergeListById(a, b) {
  const out = [...a]
  const seen = new Set(out.map((x) => String(x?.id ?? '')))
  for (const item of b) {
    const k = String(item?.id ?? '')
    if (k && seen.has(k)) continue
    if (k) seen.add(k)
    out.push(item)
  }
  return out
}

function uniqIds(list) {
  const out = []
  const seen = new Set()
  for (const v of Array.isArray(list) ? list : []) {
    if (v == null) continue
    const s = String(v).trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export default auditSectionAnchorScope

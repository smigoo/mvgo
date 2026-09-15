/**
 * 🎯 阶段 B（2026-09-15）：高置信统计型 inline-row 的确定性成员装配。
 *
 * 纯函数、零依赖（仅 import section-tree.js 的共享事实入口）、无 import.meta，
 * 便于 jest（CJS require）直接单测。
 *
 * 背景（c-traffic-monitor-29570c8e / 21e2afd6 双实证）：
 *   prompt 只能预防、不能保证复杂统计成员的配对 —— 2:3660 统计行不仅左右反，
 *   还把卡片内部的「标题↔数值」也写反（LLM 把「隧道」配到 82,379、「江阴大桥」配到 34,620）。
 *   扁平文本列表治不了「配对错乱」；必须按成员把「标题 ↔ 数值 ↔ x」配成确定性事实。
 *
 * 铁律（阶段 B 执行边界）：
 *   **仅对满足高置信条件的统计型横向 section 做确定性装配；不满足条件时整节回退 LLM**，
 *   不允许出现「一部分由 assembler 生成、另一部分由 LLM 猜测」的半确定性混合结构。
 *   判定为 fallback 时，调用方必须继续走既有 LLM 路径，不得消费本模块的任何部分结果。
 *
 * 高置信条件（全部满足才 high）：
 *   ① 横向 section（body.layout/layout === 'horizontal'，或 layoutSource === 'inline-row'）；
 *   ② 能解析出 ≥2 个成员节点（sourceNodeIds 排除自身，或 children[].figmaNode/figmaNodeId）；
 *   ③ 每个成员子树恰好「1 个标题 + 1 个数值」（collectSubtreeTexts 的 isTitle 判定）；
 *   ④ 每个成员的 bbox.x 可解析，且成员按 x 严格递增、互不相同（可确定性排序）；
 *   ⑤ 标题文本跨成员唯一、数值文本跨成员唯一（无重复归属）；
 *   ⑥ 成员子树内无图片资源（统计行是纯文本，带背景图/插图的成员回退 LLM 兜底）。
 *
 * 与既有模块的职责边界（不得合并）：
 *   - inline-row-rebuilder：几何聚类 + 并查集 + 按 x 输出 members（不判断统计语义）；
 *   - inline-row-merger：结构变换 + 语义壳覆盖 + 写入 layout.sections（不生成成员配对）；
 *   - section-content-guard：验证优先的成员序/重复文本检测（不改结构）；
 *   - 本模块：只做「高置信判定 + 成员配对」，把 title/value/x 配成确定性事实供下游消费。
 */
import {
  indexFigmaNodes,
  buildChildrenMap,
  collectSubtreeTexts,
  getFigmaBox,
} from './section-tree.js'

/** 成员内部「标题/数值」配对的确定性事实。 */
// { figmaNodeId: string, title: string, value: string, x: number }

/** 判定 section 是否为横向（inline-row / horizontal）。 */
function isHorizontalSection(section) {
  if (!section || typeof section !== 'object') return false
  if (section.layoutSource === 'inline-row') return true
  if (section.body?.layout === 'horizontal') return true
  if (section.layout === 'horizontal') return true
  return false
}

/** 从 section 提取候选成员节点 id（排除 section 自身 id）。 */
function collectMemberIds(section) {
  const ids = []
  const push = (id) => {
    const s = String(id)
    if (!s) return
    if (s === String(section?.id)) return
    if (!ids.includes(s)) ids.push(s)
  }
  if (Array.isArray(section.sourceNodeIds)) section.sourceNodeIds.forEach(push)
  if (ids.length >= 2) return ids
  // 兜底：children[].figmaNode / figmaNodeId
  const kids = section.children || section.body?.children
  if (Array.isArray(kids)) {
    for (const c of kids) {
      if (c?.figmaNode) push(c.figmaNode)
      else if (c?.figmaNodeId) push(c.figmaNodeId)
    }
  }
  return ids
}

/** 成员子树内是否存在图片资源（背景图 / IMAGE 节点 / fills.imageRef）。 */
function subtreeHasImageResource(nodeId, index, childrenOf) {
  const seen = new Set()
  const walk = (id) => {
    const key = String(id)
    if (seen.has(key)) return false
    seen.add(key)
    const rec = index?.get(key)
    if (!rec) return false
    const raw = rec.rawNode || rec
    if (raw && raw.type === 'IMAGE') return true
    const fills = raw && Array.isArray(raw.fills) ? raw.fills : []
    for (const f of fills) {
      if (f && (f.type === 'IMAGE' || f.imageRef)) return true
    }
    for (const c of childrenOf?.get(key) || []) {
      if (walk(c)) return true
    }
    return false
  }
  return walk(nodeId)
}

/**
 * 判定一个横向 section 是否为「高置信统计型行」，并在 high 时生成确定性的成员配对。
 *
 * @param {object} section 横向 section（inline-row block 或 effectiveSection）
 * @param {object} figmaRoot figmaNodeData（document 树）
 * @param {object} [opts]
 * @param {number} [opts.minMembers=2] 最小成员数
 * @returns {{verdict: 'high'|'fallback', members?: Array, reason?: string}}
 */
export function assessStatRowConfidence(section, figmaRoot, opts = {}) {
  const fallback = (reason) => ({ verdict: 'fallback', reason })
  if (!section || typeof section !== 'object') return fallback('no-section')
  if (!isHorizontalSection(section)) return fallback('not-horizontal')

  const minMembers = opts.minMembers ?? 2
  const memberIds = collectMemberIds(section)
  if (memberIds.length < minMembers) {
    return fallback(`too-few-members(${memberIds.length}<${minMembers})`)
  }

  const index = indexFigmaNodes(figmaRoot)
  if (index.size === 0) return fallback('no-figma-index')
  const childrenOf = buildChildrenMap(index)

  // 逐成员解析「标题 ↔ 数值 ↔ x」
  const parsed = []
  for (const id of memberIds) {
    const box = getFigmaBox(index.get(id))
    const x = box && Number.isFinite(box.x) ? box.x : null
    if (x == null) return fallback(`unresolved-x(${id})`)

    if (subtreeHasImageResource(id, index, childrenOf)) {
      return fallback(`resource-owner-conflict(${id})`)
    }

    const items = collectSubtreeTexts(id, index, childrenOf)
    const titles = items.filter((i) => i.isTitle).map((i) => i.text)
    const values = items.filter((i) => !i.isTitle).map((i) => i.text)
    // 恰好 1 标题 + 1 数值，才满足「统计卡片」形态；多/少都不可靠
    if (titles.length !== 1 || values.length !== 1) {
      return fallback(
        `member-shape-mismatch(${id}:title=${titles.length},value=${values.length})`,
      )
    }
    parsed.push({ figmaNodeId: String(id), title: titles[0], value: values[0], x })
  }

  // 标题/数值跨成员唯一（无重复归属 → 左右配对不歧义）
  const titles = parsed.map((m) => m.title)
  const values = parsed.map((m) => m.value)
  if (new Set(titles).size !== titles.length) return fallback('duplicate-title')
  if (new Set(values).size !== values.length) return fallback('duplicate-value')

  // 按 x 升序，且 x 严格递增（可确定性排序，杜绝重叠/镜像歧义）
  const sorted = [...parsed].sort((a, b) => a.x - b.x)
  for (let i = 1; i < sorted.length; i++) {
    if (!(sorted[i].x > sorted[i - 1].x)) return fallback('ambiguous-x-order')
  }

  return { verdict: 'high', members: sorted }
}

/**
 * 高置信时返回确定性的成员配对（按 x 升序）；否则返回 null（调用方整节回退 LLM）。
 *
 * @returns {Array|null} [{ figmaNodeId, title, value, x }]
 */
export function assembleStatRowMembers(section, figmaRoot, opts = {}) {
  const r = assessStatRowConfidence(section, figmaRoot, opts)
  return r.verdict === 'high' ? r.members : null
}

/**
 * 🎯 阶段 B 结构层接管（2026-09-15）：确定性统计行 DOM 配对对齐。
 *
 * 真机证伪（mc-1789429951534-63bf998c）：命令式 prompt 对「成员左右序 / 卡片内标题数值互换」
 * 无效——LLM 写子组件模板时仍按自身判断猜配对。故在「子组件写盘前」用 facts 确定性重写
 * stat 卡片的标题/数值文本，把配对从 LLM 职责里剥离。
 *
 * 策略（**内容驱动**，不依赖 class 名；严格前置校验 + 不满足即 no-op，绝不误伤）：
 *   ① 用「文本内容 ∈ titles/values」识别标题/数值槽位（LLM 的 class 名 stat-name/stat-label
 *      等不稳定，但标题/数值的文本来自 Figma 事实是稳定的）；
 *   ② 标题槽位数量 == 数值槽位数量 == members 数量；
 *   ③ 文本集合一致（内容对得上，仅位置错）；
 *   ④ 已正确（标题序 == titles、数值序 == values）则 no-op。
 * 全部满足才按 DOM 序重写：标题槽位[i] = titles[i]、数值槽位[i] = values[i]（titles/values 已按
 * x 升序），同时纠正「左右序反」与「卡片内标题数值互换」两类错误。
 *
 * @param {string} sfcContent 子组件 SFC 内容
 * @param {Array} members [{title, value, x}] 按 x 升序的确定性配对
 * @returns {{content: string, changed: boolean}}
 */
export function healStatRowMemberPairing(sfcContent, members, opts = {}) {
  const noop = { content: sfcContent, changed: false }
  if (typeof sfcContent !== 'string' || !sfcContent) return noop
  if (!Array.isArray(members) || members.length < 2) return noop

  const titles = members.map((m) => m.title)
  const values = members.map((m) => m.value)
  if (titles.some((t) => typeof t !== 'string' || !t.trim())) return noop
  if (values.some((v) => typeof v !== 'string' || !v.trim())) return noop

  const titleSet = new Set(titles)
  const valueSet = new Set(values)

  // 🛡️ 限定 template 段扫描（与 sfc-template-extractor 同定位正则），避免误伤 <script>/<style>。
  // 注释 <!--…--> 不是 <tag> 形式，天然不被下面正则匹配，无需额外剥注释。
  const range = templateRegion(sfcContent)
  const scanTarget = range ? sfcContent.slice(range.start, range.end) : sfcContent

  // 提取所有「纯文本元素」<tag ...>text</tag>，按 DOM 序识别标题/数值槽位
  const titleSlots = []
  const valueSlots = []
  const textElemRe = /<[a-zA-Z][\w-]*\b[^>]*>([^<>]+)<\/[a-zA-Z][\w-]*>/g
  let m
  while ((m = textElemRe.exec(scanTarget))) {
    const text = m[1].trim()
    if (titleSet.has(text)) titleSlots.push(text)
    else if (valueSet.has(text)) valueSlots.push(text)
  }

  // ① 数量必须精确匹配（标题槽位 == 数值槽位 == 成员数），否则结构形态不可靠 → no-op
  if (titleSlots.length !== members.length || valueSlots.length !== members.length) {
    return noop
  }

  // ② 文本集合一致（内容对得上，仅位置错）
  const curSet = new Set([...titleSlots, ...valueSlots])
  const expSet = new Set([...titles, ...values])
  if (curSet.size !== expSet.size) return noop
  for (const t of expSet) if (!curSet.has(t)) return noop

  // ③ 已正确 → no-op
  const alreadyCorrect =
    titleSlots.every((t, i) => t === titles[i]) &&
    valueSlots.every((v, i) => v === values[i])
  if (alreadyCorrect) return noop

  // 重写：标题槽位按 DOM 序 = titles，数值槽位按 DOM 序 = values。
  // 🛡️ 回调返回（非字符串 replacement），杜绝 $&/$1/$$ 被 String.replace 特殊解释。
  let ti = 0
  let vi = 0
  const healedTarget = scanTarget.replace(textElemRe, (full, text) => {
    const t = text.trim()
    if (titleSet.has(t) && ti < titles.length) return full.replace(text, () => titles[ti++])
    if (valueSet.has(t) && vi < values.length) return full.replace(text, () => values[vi++])
    return full
  })

  const out = range
    ? sfcContent.slice(0, range.start) + healedTarget + sfcContent.slice(range.end)
    : healedTarget
  return { content: out, changed: true }
}

/** 定位 SFC 的 <template> 区（与 sfc-template-extractor 同定位正则：首个 template 到 script/style 边界）。 */
function templateRegion(content) {
  const start = content.search(/<template\b[^>]*>/i)
  if (start < 0) return null
  const rest = content.slice(start)
  const m = rest.search(/<script[\s>]|<style[\s>]/i)
  const end = m > 0 ? start + m : content.length
  return { start, end }
}

export default assessStatRowConfidence

/**
 * 🛡️ F1（2026-11-18 · E2 数据串位实锤 · mc-max 重点车辆监测 `136:129/128/127`）：
 * **stat-card 段 `name` 按 Figma 宿主 id 幂等回填**。
 *
 * ## 病灶（可复算）
 *
 * `preview-analysis.json` 里 stat-card 段的 `name` 是 vision「看图识内容」写的，
 * 而 Figma 节点 `136:129/128/127` 自身图层名是无语义序号 `1/2/3` ⇒ vision 重命名时
 * **首尾两张卡互换**：
 *
 *   id         vision name（错）   Figma 子树真值（对）
 *   136:129    超高车辆            危化品车 / 51 / 次
 *   136:128    重型货车  ✅        重型货车 / 2  / 次
 *   136:127    危化品车            超高车辆 / 19 / 次
 *
 * 中间卡因名称恰好匹配而未暴露 ⇒ 下游 `ContentSection4` alt=超高车辆、
 * label/value 空串（vision 把这张卡的文本 facts 给了指向错误内容的 name）。
 *
 * 为什么既有守卫全漏：`_validateVisionTextAgainstFigma` 只判「vision 文本值 ∈
 * Figma 文本集合」——「超高车辆」「危化品车」两个词**都在**真值里 ⇒ `hasSuspicious=false`。
 * 它校验「文本对不对」，**不校验「文本挂在哪张卡上」**。
 *
 * ## 判据（确定性 · 命名无关 · 零外部依赖 · 零单位表）
 *
 * 对每个 `role ∈ {stat-card, label-value}` 的段：
 *   ① `section.id` 能定位到 Figma 树（非伪造 id）且子树有 ≥1 个 TEXT，否则 fail-open 跳过；
 *   ② 取自己子树文本集 `ownTexts`；若 `name ∈ ownTexts` ⇒ **归属正确，零改动**；
 *   ③ 否则检查该 `name` 是否出现在**其他 stat-card** 的子树里；不出现 ⇒ 不是「宿主错位」
 *      （可能是 vision 的合理语义重命名，如「危化品车卡片」）⇒ **保守不介入**；
 *   ④ 只有「name 不在自己子树 ∧ 在别的卡子树里」才判**宿主错位**，用**自己子树的
 *      首个有效 label** 覆盖 `name`，并留 `nameReassignedFrom` 痕迹。
 *
 * 「首个有效 label」= 子树 TEXT 里 **y 最小（并列取 x 最小）且非纯数字** 的那一项。
 *   · 零单位表依赖：E2 三卡实测 label(y≈1009,fs≈12.32) / value(y≈1028,fs=20) /
 *     unit「次」(y≈1030,fs≈12.32) —— 单位 y 更大 ⇒ 天然被 y 序排除；
 *   · 几何判据（不依赖遍历序）⇒ 与「归属判据一律回到 Figma 几何」同哲学。
 *
 * ## 与既有能力的边界（查重结论，勿混）
 *
 *   · `vision-content-anchor-consistency#reanchorMisalignedDeclaredTexts` 改的是
 *     **`node.id`**（全树唯一命中才重锚），字段集 `CONTENT_TEXT_FIELDS`
 *     `['text','characters','content']` **不含 `name`** ⇒ 与本模块**不同字段**；
 *     且它只处理**叶子**条目，而 stat-card 是**容器**（有 children）⇒ 两刀互不触碰。
 *   · 本模块**不改 id**、**不改产物**、**不删任何字段**，只在 vision normalize 阶段
 *     校正 `name` 归属（纯附加 `nameReassignedFrom`）。
 *
 * ## 幂等
 *
 *   回填后 `name === ownLabel ∈ ownTexts` ⇒ 再跑命中 ② ⇒ 零改动。
 *
 * ## 纯函数
 *
 *   原地改 `section.name`（与 `sanitizeVisionSections` / `reanchor…` 同一约定：
 *   入参即被调用方持有的树引用），返回计数与明细供真机留痕。
 */

import { indexFigmaNodes, collectSubtreeTexts } from './section-tree.js'

/** Figma 节点 id 形态（单一来源哲学：只校验形态，存在性交给 index 查询） */
const FIGMA_ID_RE = /^\d+:\d+$/
/** 纯数字/千分位/百分号/正负号/空白 ⇒ 视为数值，不作为 label */
const PURE_NUMBER_RE = /^[\d,.\s%+\-]+$/
/** 参与回填的段角色（与 P0 v2 §1.3 一致，含泛化 label-value） */
const TARGET_ROLES = new Set(['stat-card', 'label-value'])
/** 遍历深度上限（段 → 卡 → 卡内子块，8 段足够） */
const MAX_DEPTH = 8

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '')

/**
 * 收集树内全部目标角色段（含嵌套 `children` / `body.children` / `body.items`）。
 *
 * 🔴 **`body.items` 必收**（2026-11-18 E2 重放实锤）：`body.items` 与 `body.children`
 *   是**同一事实的两种命名** —— vision **原生下发 `body.items`**（`debug-ai-response.txt`
 *   中 `136:121 统计卡片区` → `body.items[136:127,136:128,136:129]`），`body.children`
 *   是 preview-analysis schema 的同义字段名（既有澄清见 `section-tree.js:1478-1479`）。
 *   初版只认 `children` + `body.children` ⇒ 对真实产物恒 `examined=0`（判据「不生效」
 *   与「无病灶」离线不可辨的典型形态）。
 *
 * 🔴 **对象身份去重**（`WeakSet`）：产物存在**同义双写** —— 实测
 *   `c-vehicle-monitor-084e8c19` 的 `sections[1]` 同时挂 `.children` 与 `body.children`
 *   （JSON 两个独立副本、内容相同）⇒ 不去重会把 3 张卡数成 6 张，真机计数行误读。
 *
 * @returns {Array<object>} 按对象身份去重后的目标段列表
 */
function collectStatCards(sections) {
  const out = []
  const seen = new WeakSet()
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    if (seen.has(node)) return
    seen.add(node)
    if (TARGET_ROLES.has(node.role) && FIGMA_ID_RE.test(String(node.id || '').trim())) {
      out.push(node)
    }
    const kids = [].concat(
      node.children || [],
      node.body?.children || [],
      node.body?.items || [],
    )
    for (const kid of kids) walk(kid, depth + 1)
  }
  for (const s of sections) walk(s, 0)
  return out
}

/**
 * 取子树「首个有效 label」= y 最小（并列 x 最小）且非纯数字的 TEXT。
 * @returns {string|null}
 */
function pickLabel(items) {
  const sorted = items
    .filter((it) => it && typeof it.text === 'string' && it.text.trim())
    .slice()
    .sort((a, b) => {
      const ay = typeof a.y === 'number' ? a.y : Infinity
      const by = typeof b.y === 'number' ? b.y : Infinity
      if (ay !== by) return ay - by
      const ax = typeof a.x === 'number' ? a.x : Infinity
      const bx = typeof b.x === 'number' ? b.x : Infinity
      return ax - bx
    })
  for (const it of sorted) {
    const t = it.text.trim()
    if (t && !PURE_NUMBER_RE.test(t)) return t
  }
  return null
}

/**
 * stat-card 段 name 按 Figma 宿主 id 幂等回填（纯函数，原地改 name）。
 *
 * @param {object}  params
 * @param {Array}   params.sections        vision section 数组（原树引用）
 * @param {object}  params.figmaNodeData   Figma 节点树（`{document}` 或裸根）
 * @returns {{ examined:number, reassigned:number, skipped:number, details:Array<{id,from,to}> }}
 */
export function reassignStatCardNames(params = {}) {
  const sections = Array.isArray(params.sections) ? params.sections : []
  const root = params.figmaNodeData?.document ?? params.figmaNodeData
  const result = { examined: 0, reassigned: 0, skipped: 0, details: [] }
  if (!root || sections.length === 0) return result

  let index
  try {
    index = indexFigmaNodes(root)
  } catch {
    return result // 无索引 ⇒ fail-open
  }

  const cards = collectStatCards(sections)
  if (cards.length === 0) return result

  // 🔴 按 **id 分组**：产物里同一卡可能以**独立副本**双写在 `.children` 与 `body.children`
  //   （实测 084e8c19）⇒ 判定与计数一律按 id 去重（`examined` = 真实卡数，不是副本数），
  //   但回填必须覆盖**同 id 的所有副本**（否则下游读哪份不确定，会看回旧错名）。
  /** @type {Map<string, object[]>} */
  const byId = new Map()
  for (const card of cards) {
    const id = String(card.id).trim()
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(card)
  }

  // ① 每卡取 ownTexts（归一化集合）+ label
  const textSets = new Map() // id -> Set(normalized)
  const labels = new Map() // id -> label|null
  for (const id of byId.keys()) {
    let items = []
    try {
      items = collectSubtreeTexts(id, index)
    } catch {
      items = []
    }
    const texts = items.map((it) => norm(it?.text)).filter(Boolean)
    textSets.set(id, new Set(texts))
    labels.set(id, pickLabel(items))
  }

  // ② 逐 id 判宿主错位（判定只看「该 id 的首个副本的 name」——同 id 各副本本应同名）
  for (const [id, copies] of byId) {
    result.examined += 1
    const head = copies[0]
    const name = typeof head?.name === 'string' ? head.name.trim() : ''
    if (!name) {
      result.skipped += 1
      continue
    }
    const own = textSets.get(id)
    if (!own || own.size === 0) {
      result.skipped += 1 // 子树无文本 ⇒ 无法判定，fail-open
      continue
    }
    if (own.has(norm(name))) continue // 归属正确 ⇒ 零改动

    // 保守：name 必须出现在**其他** stat-card 子树，才是「宿主错位」
    let inOtherCard = false
    for (const [oid, oset] of textSets) {
      if (oid !== id && oset.has(norm(name))) {
        inOtherCard = true
        break
      }
    }
    if (!inOtherCard) {
      result.skipped += 1
      continue
    }

    const label = labels.get(id)
    if (!label) {
      result.skipped += 1
      continue
    }

    // 覆盖全部副本
    for (const card of copies) {
      card.nameReassignedFrom = card.name
      card.name = label
    }
    result.reassigned += 1
    result.details.push({ id, from: name, to: label, copies: copies.length })
  }

  return result
}

export default reassignStatCardNames

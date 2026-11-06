/**
 * 🛡️ 层 2（B 批 · 2026-10-26 · mc-max-1792985029695-58de7d47 真机实锤）：
 * **vision 声明的「锚点 id ↔ 可见文案」与 Figma 真值对账**。
 *
 * ## 病灶（真机取证，全部可复算）
 *
 * 真值树 `cp-设备详情`（36:1693）里属性列表 `81:7` 有 24 个 TEXT（12 组「标签/值」）。
 * vision 的输出（`.checkpoint/visual.json` → `layoutStructure.layout.sections[1]`）声明：
 *
 *   { id: '36:1699', text: '所属产品' }   ↔ 真值 36:1699 = '所属产品'      ✅ 命中
 *   { id: '36:1700', text: '爆闪灯' }     ↔ 真值 36:1700 = '所属路公司'    ❌ 错配
 *   { id: '36:1702', text: '感动科技' }   ↔ 真值 36:1702 = '产品厂家'      ❌ 错配
 *   { id: '36:1710', text: 'AP12343' }    ↔ 真值 36:1710 = '爆闪灯'        ❌ 错配
 *   …（实测 1 命中 / 22 错配 / 0 不在树中）
 *
 * 即：**vision 把「文案读对了」，却把 id 按行序顺延（1699,1700,1701…）贴上去**，
 * 而真值 id 序里插了非连续节点（`81:3` / `81:5`）⇒ 第 10 项起整体错位。
 *
 * 为什么既有防线全漏：
 *   - `section-anchor-truth#auditSectionAnchors` 只判「section 锚点是否为子级引用的祖先」
 *     （段级，不看 `{id,text}` 配对）；
 *   - `vision-anchor-validator#validateVisionAnchors` 只判「id 在不在树里」
 *     （真机 41 个 checked / 39 个 valid = 95.1% —— **id 全部存在**，只是配错了文案）；
 *   - `section-content-guard#checkSectionTruthCoverage` 判「本段真值文案是否出现」，
 *     真机属性列表的 24 条文案**确实都出现了**（只是挂错 id）⇒ 不报。
 *   ⇒ 三类守卫都「过」，产物却把「所属产品=爆闪灯」渲染出来 —— 用户侧感受即「效果太差」。
 *
 * ## 判据（确定性、类型无关、命名无关、零外部依赖）
 *
 *   对 vision 声明的每个 `{ id, text }` 对（`id` 合法 Figma 形态 ∧ `text` 非空）：
 *     ① `id` 不在真值树 ⇒ 计入 `notInTree`（**不报 issue**：幻觉 id 的归属方是
 *        `validateVisionAnchors`，单一来源，避免两处重复报同一事实）；
 *     ② 取真值文本域 = `collectSubtreeTexts(id)`（**TEXT 节点取自身 characters，
 *        容器节点取子树文本**——同一代码路径，单一来源）；
 *     ③ 归一化（剔空白）后双向包含匹配；不命中 ⇒ **内容-锚点错配** issue。
 *
 *   🔴 为什么用「子树文本域」而不是「只比 TEXT.characters」：vision 完全可能合法地
 *      把文案挂在**容器**节点上（卡片 id + 卡片标题文案）——只比 characters 会把这类
 *      全判错配（假阳）。取子树文本域后，「挂在祖先上」依然命中，与
 *      `auditSectionAnchors` 的「锚点须为内容祖先」同一哲学。
 *
 * ## 只诊断、不修复（纪律同 `section-plan-coverage.js` ①② / `plan-body-child-id-audit`）
 *
 *   真机上 vision 的**文案序**（逐行 label,value 交替）与真值**树序**（先 12 个 label、
 *   再 12 个 value）**不同** ⇒ 任何「按序重贴 id」的确定性修复都会猜错并静默丢内容。
 *   ⇒ 本模块只留痕 + 产出可消费的 issues，由调用方决定留痕/BLOCK/重跑 vision。
 */

// 🔴 单一来源：Figma 节点 id 形态（勿再写第二份正则）
import { FIGMA_ID_RE } from './section-anchor-truth.js'
// 🔴 单一来源：真值索引 / 子树文本收集（与 planner、content-guard 同一实现）
import { indexFigmaNodes, buildChildrenMap, collectSubtreeTexts } from './section-tree.js'

/**
 * 承载「可见文案」的字段名（单一来源）。
 * 刻意**不含** `name` / `title` / `label` / `value` / `role` / `type`：
 *   - `name` 是图层名（真机上 vision 写的是「所属产品值」这类**描述**，不是渲染文本）；
 *   - `role` / `type` / `layout` 是结构元数据；
 *   ⇒ 误收它们会把 pipeline 的注解当成「vision 声明的可见文案」，污染对账（真机实测：
 *     `_extractVisionTexts` 正是这么污染的，见同批 visual-parser 修复）。
 */
export const CONTENT_TEXT_FIELDS = Object.freeze(['text', 'characters', 'content'])

/** 递归深度上限（section → children → … 三段足够覆盖卡内层级） */
const MAX_DEPTH = 3
/** issue 明细上限（防幻觉风暴撑爆 checkpoint） */
const MAX_ISSUES = 40
/** 每条 issue 保留的真值样本上限 */
const TRUTH_SAMPLE_LIMIT = 3

/** 剔空白归一化（与 text-truth-guard#isCoveredByTruth 同口径，空格/换行差异不误报） */
function normalize(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '')
}

/** 双向包含（容错 OCR 截断/空格差异） */
function covers(a, b) {
  return a.includes(b) || b.includes(a)
}

/**
 * 🔴 形态门禁（**单一来源**，勿在任何调用侧另写一份）：
 * 一个条目是否「携带 Figma 形态 id 且声明了可见文案」。
 *
 *   判据 = `node.id` 匹配 `FIGMA_ID_RE` ∧ 至少一个 `CONTENT_TEXT_FIELDS` 字段为非空字符串。
 *
 * 🔴 为什么必须是**形态**门禁，而不是「键白名单」或「排除技术键」：
 *   真机 58de7d47 实测三口径（同一份 `.checkpoint/visual.json`）：
 *     · 排除技术键（只排 5 个 key） → 采集 475 串，可疑 44 —— 把 pipeline 注解/
 *       图层名/段描述（「设备详情面板」「包含设备图标」「不是其内容」…）全当成 vision 文案；
 *     · 键白名单（只收 text/characters/content） → 采集 80 串，可疑 41 —— `text`/`name`
 *       键里仍混着**段描述**，噪声只掉了一层；
 *     · **形态门禁（本函数）** → 采集 29 串，可疑 **0** ✅
 *   ⇒ 只有「同时声称自己是 Figma 节点 + 声明了文案」的条目才是**可对账的可见文案**。
 *
 * @param {any} node 候选条目
 * @returns {boolean}
 */
export function isDeclaredContentEntry(node) {
  if (!node || typeof node !== 'object') return false
  const id = typeof node.id === 'string' ? node.id.trim() : ''
  if (!FIGMA_ID_RE.test(id)) return false
  return CONTENT_TEXT_FIELDS.some((f) => typeof node[f] === 'string' && node[f].trim())
}

/**
 * 读出条目声明的全部可见文案（按 `CONTENT_TEXT_FIELDS` 顺序，剔空白）。
 * 与 `isDeclaredContentEntry` 同源：门禁放行的条目，这里的读数即它的「声明文案集」。
 *
 * @returns {string[]}
 */
export function readDeclaredTexts(node) {
  const out = []
  if (!node || typeof node !== 'object') return out
  for (const field of CONTENT_TEXT_FIELDS) {
    const raw = node[field]
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (text) out.push(text)
  }
  return out
}

/**
 * 全树扫描（形态门禁）：收集 vision 载荷里**任意位置**声明的可见文案，去重后返回。
 *
 * 消费方：`visual-parser#_extractVisionTexts` —— 该处需要「vision 声称可见的文案全集」
 * 去和 Figma TEXT 真值对账（抓 OCR 误读）。刻意**不限定在 sections 内**：vision 有时把
 * 文案挂在 `elements[]` / `charts[]` / `headerSlots[]` 等非 section 容器里，限定 sections
 * 会让那些位置的 OCR 误读**静默漏检**（= 检测力下降，不是噪声减少）。
 *
 * 🔴 真机核对（58de7d47）：全树口径 29 串 / 可疑 0，与「仅 sections 口径」**集合差为 0**
 *   —— 即全树口径在本例零多收，却不丢任何非 section 位置的检测力。
 *
 * 去重键 = `${id}\u0000${text}`（同文案挂不同 id 各自保留；同 id 同文案只留一次）。
 *
 * @param {any} root vision 载荷（`parsed`）
 * @returns {string[]}
 */
export function collectDeclaredTexts(root) {
  const texts = []
  const seen = new Set()
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }
    if (isDeclaredContentEntry(obj)) {
      const id = obj.id.trim()
      for (const text of readDeclaredTexts(obj)) {
        const key = `${id}\u0000${text}`
        if (seen.has(key)) continue
        seen.add(key)
        texts.push(text)
      }
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') walk(value)
    }
  }
  walk(root)
  return texts
}

/**
 * 从一段 section 子树收集 vision 声明的 `{ id, text }` 对。
 *
 * 判定域：`children` 与 `body.children`（与 `collectSectionFigmaRefs` 同源的两处挂载点）。
 * 门禁复用 `isDeclaredContentEntry` / `readDeclaredTexts`（**单一来源**，不另写判定）。
 *
 * @returns {Array<{sectionId:string, path:string, id:string, text:string}>}
 */
function collectDeclaredPairs(sections) {
  const pairs = []
  const seen = new Set()

  const visitNode = (node, sectionId, path, depth) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    if (isDeclaredContentEntry(node)) {
      const id = node.id.trim()
      for (const text of readDeclaredTexts(node)) {
        const key = `${id}\u0000${text}`
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push({ sectionId, path, id, text })
      }
    }
    for (const kid of [].concat(node.children || [], node.body?.children || [])) {
      visitNode(kid, sectionId, `${path}.children`, depth + 1)
    }
  }

  const visitSection = (section, path, depth) => {
    if (!section || typeof section !== 'object' || depth > 8) return
    const sectionId = typeof section.id === 'string' ? section.id : ''
    for (const kid of [].concat(section.children || [], section.body?.children || [])) {
      visitNode(kid, sectionId, path, 0)
    }
    for (const child of section.children || []) {
      visitSection(child, `${path}/${sectionId}`, depth + 1)
    }
  }

  ;(Array.isArray(sections) ? sections : []).forEach((s, i) => visitSection(s, `sections[${i}]`, 0))
  return pairs
}

/**
 * vision 声明文案 ↔ Figma 真值 对账。
 *
 * @param {object} params
 * @param {Array}  params.sections   vision 的 section 数组（`layout.sections` 等）
 * @param {object} params.figmaNodeData Figma 节点树（`{document}` 或裸根）
 * @returns {{
 *   evaluated:number, pairs:number, matched:number, mismatched:number, notInTree:number,
 *   ratio:number|null, issues:Array, skipped:boolean, skippedReason:string|null
 * }}
 *   issue: `{ sectionId, path, id, declared, truthTexts:string[], truthType:string, reason:string }`
 */
export function auditContentAnchorConsistency(params = {}) {
  // 🔴 显式收口：`null` 不会触发默认值（默认值只对 `undefined` 生效）
  //   ⇒ 用 `|| {}` 兜底，保证「非法入参 ⇒ fail-open 空报告」而不是抛 TypeError（自愈链内一律 fail-open）。
  const { sections, figmaNodeData } = params || {}
  const empty = (reason) => ({
    evaluated: 0,
    pairs: 0,
    matched: 0,
    mismatched: 0,
    notInTree: 0,
    ratio: null,
    issues: [],
    skipped: true,
    skippedReason: reason,
  })

  if (!Array.isArray(sections) || sections.length === 0) return empty('no-sections')
  const index = indexFigmaNodes(figmaNodeData?.document || figmaNodeData)
  if (index.size === 0) return empty('no-figma-tree')

  const pairs = collectDeclaredPairs(sections)
  if (pairs.length === 0) return empty('no-declared-pairs')

  const childrenOf = buildChildrenMap(index)
  const issues = []
  let matched = 0
  let mismatched = 0
  let notInTree = 0

  for (const p of pairs) {
    const node = index.get(p.id)
    if (!node) {
      notInTree += 1
      continue
    }
    const truthTexts = collectSubtreeTexts(p.id, index, childrenOf)
      .map((it) => String(it.text || '').trim())
      .filter(Boolean)
    const declared = normalize(p.text)
    const hit = truthTexts.some((t) => covers(normalize(t), declared))
    if (hit) {
      matched += 1
      continue
    }
    mismatched += 1
    if (issues.length < MAX_ISSUES) {
      issues.push({
        sectionId: p.sectionId,
        path: p.path,
        id: p.id,
        declared: p.text,
        truthTexts: truthTexts.slice(0, TRUTH_SAMPLE_LIMIT),
        truthType: node.type || '?',
        reason: truthTexts.length === 0
          ? `真值 ${p.id} 子树内无任何文本（声明文案「${p.text}」无对应真值）`
          : `声明文案「${p.text}」不在真值 ${p.id} 的文本域 [${truthTexts.slice(0, TRUTH_SAMPLE_LIMIT).join(' / ')}] 中`,
      })
    }
  }

  const judged = matched + mismatched
  return {
    evaluated: pairs.length,
    pairs: pairs.length,
    matched,
    mismatched,
    notInTree,
    ratio: judged > 0 ? Math.round((matched / judged) * 1000) / 10 : null,
    issues,
    skipped: false,
    skippedReason: null,
  }
}

export default auditContentAnchorConsistency

/**
 * 🧱 段粒度过粗的局部 E1 展开（V-5 · 2026-11-08 · mc-1794128973091-c3fe924f 实锤）。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 同一 Figma 节点（`2:8417 cp-设备监测`）三次生成，vision 给出**三套不同粒度**的段树：
 *
 *   | 段数 | 段划分 | 产物 |
 *   |---|---|---|
 *   | 4 | `2:8419 / 89:38 / 2:8439 / 2:8438` | 单卡+单卡底图被当段 → 刀53 覆盖 CardGrid，12 卡全丢 |
 *   | 3 | `2:8419 / 2:8787 / 89:37` | **合格**：12 卡齐全、左侧分类栏完整、高度对 |
 *   | 2 | `2:8419 / 89:40`（整块内容区） | LLM 把整块画成一张大卡，12 卡网格丢失 |
 *
 * 既有 `structure-source` 闸门只判「锚点是否存在」（`hasAnchoredContent`）：`89:40`
 * 是根槽容器、锚点有效 ⇒ 闸门放行 ⇒ 粗粒度骨架直入下游。**锚点存在 ≠ 锚点粒度合理。**
 *
 * ── 判据（几何事实，零命名/零业务值） ───────────────────────────────────────
 * 段锚点 `A` 判为「过粗容器」，当且仅当其直接子容器中存在 ≥2 个同时满足：
 *   ① 沿垂直方向**依次堆叠**（y 升序、相邻不重叠）；
 *   ② 该堆叠序列在垂直方向**覆盖 `A` 高度的 ≥80%**（说明 A 就是这一串区块的外壳）；
 *   ③ 每个高度 ≥ `A` 高的 10%、面积 ≥ `A` 的 10%（排除 header 细条/装饰条）；
 *   ④ 每个子树有实质内容（有文本，或节点数 ≥5；排除纯装饰层）。
 *
 * ▸ 为什么不要求「铺满 A 的宽度」：真机 `89:40` 的两个子是 `89:38`（396×65 switch，
 *   铺满）与 `89:37`（46×317，**只有 46 宽**——Figma 里它是左竖 tab 条，横向 auto-layout
 *   把 bbox 报成条宽而不是整行宽）。要求铺满会漏掉这个真实形态。
 *
 * ▸ 为什么不误伤「卡片内 title + body」：`TEXT` 节点不是容器类型，被 ① 的类型过滤排除；
 *   且要求堆叠序列覆盖 A 高 80%，普通卡片内的分区很难满足。
 *
 * ── 处置 ────────────────────────────────────────────────────────────────────
 * 命中 ⇒ 用 **既有** `deriveSectionsFromFigmaTree({ document: 锚点节点 })` 局部递归展开
 * （同一函数、同一判据族，不写第二套结构推导），结果替换原段并留痕。
 * fail-open：展开为空 / 子段数越界 / 子段有锚点无法解析 ⇒ 保留原段。
 */
import { deriveSectionsFromFigmaTree, getFigmaBox, indexFigmaNodes } from './section-tree.js'
import { FIGMA_ID_RE, sectionAnchorKey } from './section-anchor-truth.js'

/** 堆叠序列需覆盖锚点高度的比例 */
const VERTICAL_COVER_RATIO = 0.8

/** 相邻兄弟允许的重叠容差（占锚点高度比例）——Figma 边框/阴影常造成 1~3px 交叠 */
const STACK_OVERLAP_TOL_RATIO = 0.02

/** 子容器最小高度占比（排除横向细条/分隔条） */
const MIN_SIZE_RATIO = 0.1

/** 过粗容器至少有的子容器数 */
const MIN_COARSE_CHILDREN = 2

/** 单段展开后的最大子段数（防段数爆炸） */
const MAX_EXPANDED = 4

const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET'])

function isContainer(node) {
  return CONTAINER_TYPES.has(String(node?.type || '').toUpperCase())
}

/** 子树是否有实质内容（有文本，或节点数够多） */
function hasSubstance(node) {
  let texts = 0
  let total = 0
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    total += 1
    if (typeof n.characters === 'string' && n.characters.trim()) texts += 1
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c)
    if (total > 500) return
  }
  walk(node)
  return texts >= 1 || total >= 5
}

/**
 * 判断锚点节点是否为「过粗容器」（其子是一串垂直堆叠、共同覆盖锚点高度的区块）。
 * @param {object} anchorNode Figma 原始节点
 * @returns {{ over: boolean, reason: string, childIds?: string[], covered?: number }}
 */
export function isOverCoarseAnchor(anchorNode) {
  if (!anchorNode || typeof anchorNode !== 'object') return { over: false, reason: 'no-anchor' }
  const kids = (Array.isArray(anchorNode.children) ? anchorNode.children : []).filter(isContainer)
  if (kids.length < MIN_COARSE_CHILDREN) {
    return { over: false, reason: 'too-few-container-children' }
  }
  const ab = getFigmaBox(anchorNode)
  if (!ab || ab.w <= 0 || ab.h <= 0) return { over: false, reason: 'no-anchor-box' }
  const areaA = ab.w * ab.h

  const candidates = []
  for (const k of kids) {
    const b = getFigmaBox(k)
    if (!b) continue
    // 只按「高度占比」筛：真机 `89:37` 是 46×317 的左竖 tab 条，面积仅占 9.4%，
    //   用面积阈值会把它滤掉 → 只剩 1 个候选 → 过粗漏判（实锤 substantial-children=1）。
    //   横向细条由高度占比自然排除，装饰块由 hasSubstance 排除，故不再叠面积约束。
    if (b.h < ab.h * MIN_SIZE_RATIO) continue
    if (!hasSubstance(k)) continue
    candidates.push({ id: String(k.id ?? ''), box: b, areaRatio: (b.w * b.h) / areaA })
  }
  if (candidates.length < MIN_COARSE_CHILDREN) {
    return { over: false, reason: `substantial-children=${candidates.length}` }
  }

  const sorted = [...candidates].sort((a, b) => a.box.y - b.box.y)
  const overlapTol = Math.max(2, ab.h * STACK_OVERLAP_TOL_RATIO)
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].box
    if (sorted[i].box.y < prev.y + prev.h - overlapTol) {
      return { over: false, reason: 'not-vertically-stacked' }
    }
  }
  const top = sorted[0].box.y
  const bottom = Math.max(...sorted.map((c) => c.box.y + c.box.h))
  const covered = Math.min(1, (bottom - top) / ab.h)
  if (covered < VERTICAL_COVER_RATIO) {
    return { over: false, reason: `vertical-cover=${covered.toFixed(2)}` }
  }
  if (sorted.length > MAX_EXPANDED) {
    return { over: false, reason: `too-many-children=${sorted.length}` }
  }
  return { over: true, reason: 'coarse-container', childIds: sorted.map((c) => c.id), covered }
}

/**
 * 对过粗段做局部 E1 展开（复用 section-tree#deriveSectionsFromFigmaTree）。
 *
 * @param {Array<object>} sections planner effectiveSections
 * @param {object} figmaRoot Figma 真值树（或 { document }）
 * @returns {{ sections: Array<object>, stats: {
 *   evaluated: number, sections: number, expanded: number, skippedReason: string,
 *   details: Array<{sectionId:string, from:string, to:string[], reason:string, covered:number}>
 * }}}
 */
export function expandOverCoarseSections(sections, figmaRoot) {
  const stats = {
    evaluated: 0,
    sections: Array.isArray(sections) ? sections.length : 0,
    expanded: 0,
    skippedReason: '',
    details: [],
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    stats.skippedReason = 'no-sections'
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

  const out = []
  let changed = false
  const rejectReasons = []
  for (const sec of sections) {
    stats.evaluated += 1
    const key = sectionAnchorKey(sec)
    if (!key || !FIGMA_ID_RE.test(key)) {
      out.push(sec)
      continue
    }
    const anchor = index.get(String(key))?.rawNode
    const verdict = isOverCoarseAnchor(anchor)
    if (!verdict.over) {
      rejectReasons.push(`${key}:${verdict.reason}`)
      out.push(sec)
      continue
    }
    // 局部 E1：把锚点节点当作根，复用同一递归推导
    let derived = null
    try {
      derived = deriveSectionsFromFigmaTree({ document: anchor })
    } catch {
      derived = null
    }
    const kids = Array.isArray(derived?.sections) ? derived.sections : []
    if (kids.length < MIN_COARSE_CHILDREN || kids.length > MAX_EXPANDED) {
      rejectReasons.push(`${key}:derived=${kids.length}`)
      out.push(sec)
      continue
    }
    const allAnchored = kids.every((k) => {
      const kk = sectionAnchorKey(k)
      return kk && FIGMA_ID_RE.test(kk) && index.has(String(kk))
    })
    if (!allAnchored) {
      rejectReasons.push(`${key}:derived-unanchored`)
      out.push(sec)
      continue
    }
    for (const k of kids) {
      if (k.layoutMetadata && typeof k.layoutMetadata === 'object') {
        k.layoutMetadata = { ...k.layoutMetadata, flexGrow: undefined }
      }
      k._expandedFrom = String(sec.id ?? '')
    }
    stats.expanded += 1
    stats.details.push({
      sectionId: String(sec.id ?? ''),
      from: key,
      to: kids.map((k) => String(k.id ?? '')),
      reason: verdict.reason,
      covered: Number(verdict.covered) || 0,
    })
    changed = true
    out.push(...kids)
  }

  if (!changed) {
    stats.skippedReason = rejectReasons.length > 0 ? rejectReasons.slice(0, 3).join(' | ') : 'no-section'
    return { sections, stats }
  }
  stats.sections = out.length
  return { sections: out, stats }
}

export default expandOverCoarseSections

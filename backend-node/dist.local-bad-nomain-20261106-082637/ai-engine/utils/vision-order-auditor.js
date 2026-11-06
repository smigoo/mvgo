/**
 * 🛡️ V-3（2026-11-04 · mc-max-1793775618275-6f926db0 实锤）：vision 段序几何审计。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * planner 主路径刻意执行「结构骨架=vision，Figma 坐标不参与重排」（subcomponent-planner
 * :3133 决策）⇒ vision 数组序错时全链路忠实执行错序。6f926db0：vision 把图标操作区
 * （89:43，y 在下）排在 Tab 栏（y 在上）之前 ⇒ 产物 badge 以 100% 宽渲染成红条。
 *
 * ── 边界（不推翻「结构骨架=vision」，只在客观可判错时纠正） ───────────────────
 *   - 仅当【全部顶层段锚点有效】且【相邻段构成严格垂直堆叠（x 区间重叠率 ≥ 0.5）】时评估；
 *   - 垂直流中数组序 ≠ y 序没有语义解释，属客观错序 ⇒ 按 y 序稳定重排（y 相同保持原相对序）；
 *   - 锚点缺失 / 水平并排 / 段数不足 / 无 Figma 真值 ⇒ 一律不动，`skippedReason` 留痕；
 *   - 纯函数：不 import logger，日志由调用方按返回值打（计数行铁律：0 也打）。
 *
 * 锚点候选单一来源：`section-anchor-truth#sectionAnchorKey`（figmaAnchorId → figmaNodeId →
 * nodeId → figmaNode → id），不在此处另写候选序（副本纪律）。
 */
import { FIGMA_ID_RE, sectionAnchorKey } from './section-anchor-truth.js'
import { getFigmaBox, indexFigmaNodes } from './section-tree.js'

/** 相邻段 x 区间重叠率 ≥ 此值才视为同列垂直堆叠 */
const VERTICAL_OVERLAP_RATIO = 0.5

/**
 * 审计并（在满足窄判据时）纠正顶层段序。
 *
 * @param {Array<object>} sections 顶层 sections（planner effectiveSections 终态）
 * @param {object} figmaRoot Figma 真值树
 * @returns {{ sections: Array<object>, stats: {
 *   evaluated: number, sections: number, anchoredSections: number,
 *   verticalPairs: number, mismatch: number, reordered: boolean,
 *   skippedReason: string, order: {from: string[], to: string[]}|null
 * }}}
 *   `sections` 为原数组（未动）或重排后的**新数组**（绝不原地改）。
 */
export function auditVisionSectionOrder(sections, figmaRoot) {
  const stats = {
    evaluated: 0,
    sections: Array.isArray(sections) ? sections.length : 0,
    anchoredSections: 0,
    verticalPairs: 0,
    mismatch: 0,
    reordered: false,
    skippedReason: '',
    order: null,
  }
  if (!Array.isArray(sections) || sections.length < 2) {
    stats.skippedReason = 'insufficient-sections'
    return { sections, stats }
  }
  if (!figmaRoot || typeof figmaRoot !== 'object') {
    stats.skippedReason = 'no-figma-data'
    return { sections, stats }
  }

  const index = indexFigmaNodes(figmaRoot)
  const boxes = sections.map((s) => {
    const key = sectionAnchorKey(s)
    if (!key || !FIGMA_ID_RE.test(key)) return null
    const rec = index.get(key)
    if (!rec) return null
    return getFigmaBox(rec.rawNode)
  })
  stats.anchoredSections = boxes.filter(Boolean).length
  if (stats.anchoredSections < sections.length) {
    stats.skippedReason = 'unanchored-sections'
    return { sections, stats }
  }

  const overlapRatio = (a, b) => {
    const inter = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const minW = Math.max(1, Math.min(a.w, b.w))
    return inter / minW
  }
  for (let i = 0; i < boxes.length - 1; i += 1) {
    if (overlapRatio(boxes[i], boxes[i + 1]) >= VERTICAL_OVERLAP_RATIO) stats.verticalPairs += 1
  }
  if (stats.verticalPairs < sections.length - 1) {
    stats.skippedReason = 'not-strictly-vertical'
    return { sections, stats }
  }

  stats.evaluated = 1
  const indexed = sections.map((s, i) => ({ s, i, box: boxes[i] }))
  const sorted = [...indexed].sort((a, b) => a.box.y - b.box.y || a.i - b.i)
  const isSorted = sorted.every((e, idx) => e.i === idx)
  if (isSorted) {
    stats.mismatch = 0
    return { sections, stats }
  }

  stats.mismatch = 1
  stats.reordered = true
  const reordered = sorted.map((e) => e.s)
  stats.order = {
    from: sections.map((s) => sectionAnchorKey(s)),
    to: reordered.map((s) => sectionAnchorKey(s)),
  }
  return { sections: reordered, stats }
}

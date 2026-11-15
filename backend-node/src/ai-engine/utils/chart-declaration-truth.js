/**
 * 🛡️ 步骤 1（2026-11-15）：图表声明与几何归属的**单一判据来源**。
 *
 * ## 为什么收敛（步骤 0 已登记为次生缺口）
 * `CHART_TYPES` 曾在 `chart-conservation-audit.js`（观测）与
 * `section-height-ownership.js`（P0.5 修复器）各存一份逐字同源的副本；
 * `boxOf` / `findOwningContainer` 也只在 P0.5 内部。步骤 1 的归一修复器要用同一套
 * 「什么是图表声明 / 哪一层容器拥有内容体」判据 —— 三份副本任何一处漂移，都会出现
 * 「修复器算命中、观测器算没命中」的假绿/假红。故全部收敛到本模块：
 *   - 观测（chart-conservation-audit）
 *   - 修复（reclaim-chart-declarations / section-height-ownership）
 * 三方 import 同一份，不得再各自内联。
 *
 * ## 纪律
 * - 类型集合只用于「声明形态识别」，**不参与守恒裁决**（裁决看三段数量，见观测模块）。
 * - `findOwningChartContainer` 只读 Figma `absoluteBoundingBox`（结构事实），
 *   不读模型自报的 `geometryPx` / `styles.figmaHeightPx` / 图层语义。
 * - 纯函数、无副作用；上游无树 / 无 ref ⇒ 返回 null（fail-open，指空段 = 没给）。
 */

export const CHART_TYPES = new Set([
  'line', 'bar', 'pie', 'area', 'scatter', 'gauge', 'radar', 'candlestick',
  'heatmap', 'funnel', 'graph', 'chart',
])

/** 可辩驳阈值：真值剩余高度至少是声明高的这个倍数，才判「声明高只覆盖标题条」。 */
export const TAIL_CHART_MIN_HEIGHT_RATIO = 2

/** 只读 Figma 真值 box；缺失 / 非有限 / 非正尺寸 ⇒ null。 */
export function boxOfNode(node) {
  const b = node?.absoluteBoundingBox
  if (!b || typeof b !== 'object') return null
  const x = Number(b.x)
  const y = Number(b.y)
  const w = Number(b.width ?? b.w)
  const h = Number(b.height ?? b.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) return null
  return { x, y, w, h, top: y, bottom: y + h }
}

/**
 * 从 ref 节点向上找「拥有更下方内容」的容器。
 * 直接父级可能只是标题条（子节点全在同一 y），必须上溯到能容纳内容体的那一层。
 *
 * @param {{byId:Map, parentOf:Map}} tree `indexCoverageTree(figmaNodeData)` 产物
 * @param {string} refId 段 ref 的 Figma 节点 id
 * @param {ReturnType<boxOfNode>} refBox 段 ref 的真值 box
 * @returns {{id:string, box:ReturnType<boxOfNode>}|null}
 */
export function findOwningChartContainer(tree, refId, refBox) {
  if (!tree?.byId || !tree?.parentOf || !refId || !refBox) return null
  const { byId, parentOf } = tree
  let cur = parentOf.get(refId)
  let guard = 0
  while (cur && guard < 30) {
    guard += 1
    const node = byId.get(cur)
    const box = boxOfNode(node)
    if (box && box.bottom > refBox.top + refBox.h) {
      const kids = Array.isArray(node?.children) ? node.children : []
      const hasLowerContent = kids.some((k) => {
        const kb = boxOfNode(k)
        return kb && kb.top >= refBox.top + refBox.h - 1 && kb.bottom > refBox.bottom
      })
      if (hasLowerContent) return { id: cur, box }
    }
    cur = parentOf.get(cur)
  }
  return null
}

/** 节点是否带「图表声明」形态（role/type 二选一；不认 name 语义）。 */
export function isChartDeclarationShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const role = String(obj.role ?? obj.control ?? '').toLowerCase()
  const type = String(obj.type ?? '').toLowerCase()
  return role === 'chart' || CHART_TYPES.has(type)
}

export default CHART_TYPES

/**
 * 🛡️ B' 事实层（2026-09-18 治本）：从 Figma 节点树确定性编译「每节点布局模型」
 * display / flex-direction，覆盖标准 Auto-Layout 与不标准（绝对定位）文件。
 *
 * 与 `sectionLayoutFacts`（`buildSectionLayoutFacts` @ figma-section-heights.js，vision 派生 + 仅 section 范围）
 * 的区别：本函数直接读 Figma 几何真值（`layoutMode` + `absoluteBoundingBox`），作用于【所有】节点
 * （含子组件节点，如 tab 列表容器），而非仅对齐到 vision 的 section 序列。这也正是
 * `c-env-monitor-tabs-list` 这类「子组件内部容器、自身无 flex 信号」缺 display 的根因——
 * 该节点在 Figma 里 4 个子项 side-by-side（绝对定位、layoutMode='NONE'），几何事实=row，
 * 但此前任何一层都没输出它。
 *
 * 治本定调（用户 09-18）：源文件绝对定位 ≠ 输出绝对定位；不标准文件照样用 flex；
 *   absolute 仅作极少数低置信兜底（本版默认不发 absolute，统一输出 flex）。
 *
 * 输出：{ [figmaNodeId]: { display, flexDirection, source, confidence } }
 *   - 标准 Auto-Layout：layoutMode HORIZONTAL/VERTICAL → flex + row/column，source=figma-layoutMode，high
 *   - 不标准（layoutMode 缺失/NONE）：几何推断（areBoxesSideBySide）→ flex + row/column，source=geometric-inference
 *   - 均匀网格（子节点 x 聚成均匀列）→ grid + gridColumns，source=geometric-grid-inference（**G1，2026-09-22 治本**）
 *   - 方向模糊（side-by-side 比例介于 0.25~0.75）→ 默认 row（用户定调：common failure 是横排被堆纵），confidence=low
 *   - 单子节点容器 → 默认 column（single-child-default，防 LLM 漏写 flex-direction 默认 row）
 *
 * ⚠️ 职责边界（2026-09-22 治本后定）：本模块是「容器级」布局方向的**单一事实源**。
 *   - 覆盖 display（flex/grid）+ 主轴方向（row/column/gridColumns）。
 *   - 「卡内文本子组方向 + icon 实测尺寸」归 figma-item-facts.js（item 内部，禁止本模块产出）。
 *   - grid 列数的几何聚类必须在本模块（decideGeometricLayout 前置 detectGridColumns），
 *     禁止下游再加 grid 对冲层（血泪：mc-1790058609462 曾用 itemFacts 对冲本模块的
 *     side-by-side 比例判据 bug，两个几何推断打架，靠执行顺序碰巧压对）。
 */
import { areBoxesSideBySide } from './section-tree.js'

/**
 * 🛡️ 均匀网格检测（2026-09-22 · mc-1790058609462 实锤）：子节点按 x 聚成「均匀列」
 * （≥2 列、每列 ≥2 个、列间数量差 ≤1）→ 网格布局，而非 flex column。
 *
 * 治本：side-by-side 两两比例判据对「3×4 网格」会误判 column（side-by-side 对数
 *   12/66≈0.18 < 0.25 → 高置信 column）——网格里同行卡相邻才算 side-by-side，跨行都算
 *   堆叠，比例天然偏低。故网格必须先于 side-by-side 判据检测。
 */
function detectGridColumns(children) {
  const boxes = (children || []).filter(
    (c) => c && (c.absoluteBoundingBox || c.bbox),
  )
  if (boxes.length < 4) return 0
  const sorted = [...boxes].sort(
    (a, b) => (a.absoluteBoundingBox?.x ?? a.bbox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? b.bbox?.x ?? 0),
  )
  const cols = []
  let cur = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const bx = sorted[i].absoluteBoundingBox?.x ?? sorted[i].bbox?.x ?? 0
    const curXs = cur.map((c) => c.absoluteBoundingBox?.x ?? c.bbox?.x ?? 0)
    const curWs = cur.map((c) => c.absoluteBoundingBox?.width ?? c.bbox?.width ?? 0)
    const prevX = curXs[curXs.length - 1]
    const avgW = curWs.reduce((s, w) => s + w, 0) / curWs.length
    if (bx - prevX > avgW * 0.5) {
      cols.push(cur)
      cur = [sorted[i]]
    } else {
      cur.push(sorted[i])
    }
  }
  cols.push(cur)
  if (cols.length < 2) return 0
  const sizes = cols.map((c) => c.length)
  const min = Math.min(...sizes)
  const max = Math.max(...sizes)
  if (min < 2 || max - min > 1) return 0 // 非均匀 → 非网格
  return cols.length
}

/**
 * 基于子节点 bbox 几何推断主轴方向 + 置信度。
 * 复用 section-tree 的 areBoxesSideBySide（唯一事实源：absoluteBoundingBox）。
 * @returns {{display:'grid'|'flex', gridColumns?:number, flexDirection?:'row'|'column', confidence:'high'|'low', ratio?:number}|null}
 */
function decideGeometricLayout(children, opts = {}) {
  const boxes = (children || []).filter(
    (c) => c && (c.absoluteBoundingBox || c.bbox),
  )
  if (boxes.length < 2) return null

  // 🛡️ 均匀网格优先（side-by-side 比例对网格系统性误判 column）
  const gridCols = detectGridColumns(boxes)
  if (gridCols >= 2) {
    return {
      display: 'grid',
      gridColumns: gridCols,
      confidence: 'high',
    }
  }

  let sideBySide = 0
  let total = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      total++
      if (areBoxesSideBySide(boxes[i], boxes[j], opts)) sideBySide++
    }
  }
  if (total === 0) return null

  const ratio = sideBySide / total
  const direction = sideBySide > total / 2 ? 'row' : 'column'
  const confidence = ratio >= 0.75 || ratio <= 0.25 ? 'high' : 'low'
  // 模糊方向默认 row（用户定调：不标准文件仍 flex，横排被堆纵是最常见的失败）
  const flexDirection = confidence === 'low' ? 'row' : direction
  return { display: 'flex', flexDirection, confidence, ratio }
}

/**
 * 遍历 Figma 节点树，为每个「有子节点」的节点产出布局事实。
 * 🛡️ 约束覆盖范围扩大（2026-09-19）：单子节点容器也生成布局约束（默认 column），
 * 避免 LLM 在单子节点容器上漏写 flex-direction 导致默认 row。
 * 
 * @param {Object} figmaNodeData Figma 节点树（接受 {document} 包裹或直接根节点）
 * @param {Object} [opts] 透传给 areBoxesSideBySide（yOverlapRatio / xOverlapRatio）
 * @returns {Record<string,{display:string,flexDirection:'row'|'column',source:string,confidence:'high'|'low'}>}
 */
export function buildNodeLayoutFacts(figmaNodeData, opts = {}) {
  const root =
    figmaNodeData && typeof figmaNodeData === 'object'
      ? figmaNodeData.document ?? figmaNodeData
      : null
  if (!root || typeof root !== 'object') return {}

  const map = {}
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    const nodeId = node.id != null ? String(node.id) : ''
    const children = Array.isArray(node.children) ? node.children : []
    
    // 🛡️ 扩大覆盖范围：≥1 个子节点（原 ≥2）都生成布局事实
    if (children.length >= 1 && nodeId) {
      const mode = node.layoutMode
      let fact = null
      if (mode === 'HORIZONTAL') {
        fact = {
          display: 'flex',
          flexDirection: 'row',
          source: 'figma-layoutMode',
          confidence: 'high',
        }
      } else if (mode === 'VERTICAL') {
        fact = {
          display: 'flex',
          flexDirection: 'column',
          source: 'figma-layoutMode',
          confidence: 'high',
        }
      } else if (children.length >= 2) {
        // 非 Auto-Layout / 绝对定位文件 → 几何推断（默认 flex，不还原 absolute）
        const decide = decideGeometricLayout(children, opts)
        if (decide) {
          fact = {
            ...(decide.display === 'grid'
              ? { display: 'grid', gridColumns: decide.gridColumns, source: 'geometric-grid-inference' }
              : { display: 'flex', flexDirection: decide.flexDirection, source: 'geometric-inference' }),
            confidence: decide.confidence,
          }
        }
      } else {
        // 🛡️ 单子节点容器：默认 column（用户定调：纵向堆叠是最常见的失败）
        fact = {
          display: 'flex',
          flexDirection: 'column',
          source: 'single-child-default',
          confidence: 'low',
        }
      }
      if (fact) map[nodeId] = fact
    }
    for (const child of children) walk(child)
  }
  walk(root)
  return map
}

export default buildNodeLayoutFacts

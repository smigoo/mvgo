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
 *   - 方向模糊（side-by-side 比例介于 0.25~0.75）→ 默认 row（用户定调：common failure 是横排被堆纵），confidence=low
 *   - 子节点 < 2 个（无几何可推断）→ 不发事实（单子节点无需 flex 布局）
 */
import { areBoxesSideBySide } from './section-tree.js'

/**
 * 基于子节点 bbox 几何推断主轴方向 + 置信度。
 * 复用 section-tree 的 areBoxesSideBySide（唯一事实源：absoluteBoundingBox）。
 * @returns {{flexDirection:'row'|'column', confidence:'high'|'low', ratio:number}|null}
 */
function decideGeometricLayout(children, opts = {}) {
  const boxes = (children || []).filter(
    (c) => c && (c.absoluteBoundingBox || c.bbox),
  )
  if (boxes.length < 2) return null

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
  return { flexDirection, confidence, ratio }
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
            display: 'flex',
            flexDirection: decide.flexDirection,
            source: 'geometric-inference',
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

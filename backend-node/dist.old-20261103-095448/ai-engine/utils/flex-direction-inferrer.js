/**
 * 🛡️ Phase 3 L8（2026-09-07）：flexDirection 推断逻辑集中化
 * 
 * 问题：flexDirection 推断散落在多处（inline-row-rebuilder、planner、engineer），
 * 阈值不统一，导致同结构不同推断结果。
 * 
 * 治本：提取为纯函数，单一事实源，所有消费者调用同一函数。
 * 
 * @param {Array} siblings 兄弟节点数组，每个节点含 absoluteBoundingBox
 * @param {object} [opts]
 * @param {number} [opts.yOverlapRatio=0.5] y 重叠高度占较小高度的最小比例（低于则非同行）
 * @param {number} [opts.xOverlapRatio=0.15] x 重叠宽度占较小宽度的最大允许比例（超过则视为真正重叠/嵌套）
 * @returns {'horizontal'|'vertical'} 推断的布局方向
 */
import { areBoxesSideBySide } from './section-tree.js'

export function inferFlexDirection(siblings, opts = {}) {
  if (!Array.isArray(siblings) || siblings.length < 2) {
    return 'vertical' // 默认竖向堆叠
  }

  // 统计满足左右并列的兄弟对数；几何判定由共享 primitive 负责。
  const boxes = siblings.filter((node) => node && (node.absoluteBoundingBox || node.bbox))
  if (boxes.length < 2) return 'vertical'

  let sideBySidePairs = 0
  let totalPairs = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      totalPairs++
      if (areBoxesSideBySide(boxes[i], boxes[j], opts)) {
        sideBySidePairs++
      }
    }
  }

  // 若超过一半的兄弟对是左右并列，判定为 horizontal
  return sideBySidePairs > totalPairs / 2 ? 'horizontal' : 'vertical'
}

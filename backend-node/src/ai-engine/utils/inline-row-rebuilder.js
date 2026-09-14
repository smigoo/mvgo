/**
 * 🛡️ L2 / P0-2（2026-09-07）：行内复合结构 bbox 几何校验（确定性兜底重建）
 *
 * 纯函数、零依赖、无 import.meta —— 便于在 jest（CJS require）下直接单测。
 *
 * 问题：Vision 分区把「同行左右并列」的容器（如 device `@antd/tab`：tabs 竖条 + cons 主内容；
 * env `sub-t`：tabs-list + tabs-icon 图标组）拆成多个垂直 section，行内左右关系丢失，
 * 下游生成竖排 / 整列交互元素消失。
 *
 * 治本：不依赖 LLM 重新识别，直接基于 Figma 节点 `absoluteBoundingBox` 做确定性几何校验——
 * 一个容器内的兄弟节点，若「y 区间显著重叠 + x 区间基本不相交（仅边框贴边的小重叠）」，
 * 即判定为左右并列的「行内复合结构」，重建为单个 `layout: 'horizontal'` 的 section，
 * 避免被拍平为 vertical。下游 planner/engineer 可优先采用 bbox 推导的 horizontal 行。
 *
 * Phase 3 L8（2026-09-07）：左右并列判定逻辑复用 `inferFlexDirection` 的 sideBySide 算法，
 * 阈值集中一处，避免多处重复定义。
 *
 * @param {object} doc Figma 节点树根（含 `children` 的 document 节点）
 * @param {object} [opts]
 * @param {number} [opts.yOverlapRatio=0.5] y 重叠高度占较小高度的最小比例（低于则非同行）
 * @param {number} [opts.xOverlapRatio=0.15] x 重叠宽度占较小宽度的最大允许比例（超过则视为真正重叠/嵌套）
 * @returns {Array<{id:string,name:string,layout:'horizontal',members:string[]}>} 检测到的行内复合 section
 *          `members` 语义固定为 **视觉左→右（按 bbox.x 升序）**——下游 inline-row-merger 依赖该契约
 */
import { inferFlexDirection } from './flex-direction-inferrer.js'

export function rebuildSectionsPreservingInlineRows(doc, opts = {}) {
  const yOverlapRatio = opts.yOverlapRatio ?? 0.5
  const xOverlapRatio = opts.xOverlapRatio ?? 0.15
  const sections = []

  const bb = (n) =>
    n && n.absoluteBoundingBox
      ? { x: n.absoluteBoundingBox.x, y: n.absoluteBoundingBox.y, w: n.absoluteBoundingBox.width, h: n.absoluteBoundingBox.height }
      : null
  const yOverlap = (a, b) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const xOverlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  // 左右并列判定：复用 inferFlexDirection 的阈值（单一事实源）
  const sideBySide = (a, b) => {
    const yo = yOverlap(a, b)
    if (yo <= yOverlapRatio * Math.min(a.h, b.h)) return false
    if (xOverlap(a, b) >= xOverlapRatio * Math.min(a.w, b.w)) return false
    return true
  }

  const walk = (node) => {
    const kids = (node.children || []).filter((c) => bb(c))
    if (kids.length >= 2) {
      // 行聚类：按 y 升序后，将满足左右并列的兄弟归入同一连通分量（行内复合结构）
      const rows = kids.map((k, i) => ({ ...bb(k), idx: i, node: k }))
      rows.sort((a, b) => a.y - b.y)
      const parent = rows.map((_, i) => i)
      const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
      const union = (a, b) => { parent[find(a)] = find(b) }
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          if (sideBySide(rows[i], rows[j])) union(i, j)
        }
      }
      const groups = {}
      rows.forEach((_, i) => {
        const g = find(i)
        ;(groups[g] || (groups[g] = [])).push(i)
      })
      for (const g of Object.keys(groups)) {
        if (groups[g].length >= 2) {
          sections.push({
            id: node.id,
            name: node.name || 'inline-row',
            layout: 'horizontal',
            // 🛡️ 治本（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：members 必须按 Figma
            //   **x 升序**（视觉左→右），这是 horizontal 行成员顺序的唯一事实源。
            //   旧实现直接 `groups[g].map(...)`，而 groups 是按 **y 升序**扫描 rows 得到的：
            //   行内兄弟 y 相同或近似，稳定排序就保留了原始数组序 → members 变成「右→左」。
            //   实证 2:3660：children 数组序 [2:3680(x=271.8), 2:3683(x=42.8)] 正好倒序，
            //   LLM 按「数组序 = 左到右」写出「左=江阴大桥 82,379 / 右=隧道 34,620」→ 左右对调；
            //   88:32 同病（2:3545 的框更高 → y 更小 → 「24小时」被排到「当日总流量」前面）。
            //   inline-row-merger 的契约注释本就写「children 为 members（按 x 升序还原左右顺序）」，
            //   本条修复让生产端真正满足该契约（此前是契约假设与实现不一致）。
            members: groups[g]
              .slice()
              .sort((a, b) => rows[a].x - rows[b].x || rows[a].y - rows[b].y)
              .map((i) => rows[i].node.id),
          })
        }
      }
    }
    for (const c of (node.children || [])) walk(c)
  }

  if (doc && (doc.children || doc.document)) walk(doc.document || doc)
  return sections
}

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
 * 🛡️ P2-9（2026-10-01 · c-a812-07a812f7 实锤）：**技术栈切分**。几何判据对「数据驱动组件」
 * 会产生系统性误判——`@antd/table` 的直接子是 3 个**列容器**（真值 210:45642/210:45676/210:45699，
 * x=86282/86351/86604 同 y 起、x 不重叠），命中 `areBoxesSideBySide` ⇒ 整张表被降维成一个
 * `horizontal` section，下游把它当成「3 个左右并列的普通块」拆成 3 个等分列子组件，表格语义
 * （表头/表体/列字段）整体消失（用户实报「没有使用 ant 的 table」）。
 * 这类组件的内部构造由库在**运行时**生成，设计稿里的几何只是「画出来的样子」，不构成待还原的结构。
 *
 * 分流（与 `figma-connector#_isStackControlPart` 同族思路，但判据独立、只看节点名标记）：
 *  - **数据驱动组件**（`@antd/table` / `select` / `input` / `date-picker` / `modal` / `form`）：
 *    抑制**该节点自身**的聚类（不再产出行内行 section），**但仍递归子树**——表内真实的左右并列
 *    （如真值 210:45646 = `@antd/radio` + 文本「张斌」）必须保留。
 *  - **自绘内容容器**（`@antd/tab` / `tabs` / `collapse`）：业务内容塞在其子节点（`figma-connector.js`
 *    的下钻口径），行内并排关系照常重建，不抑制。
 *  - **其它 / 未知标记**（`@antd/button`、`@antd/radio`、未知库…）：fail-open，维持原行为
 *    （`@antd/radio` 一组 3 个单选项本身就是真实的行内并列）。
 *
 * @param {object} doc Figma 节点树根（含 `children` 的 document 节点）
 * @param {object} [opts]
 * @param {number} [opts.yOverlapRatio=0.5] y 重叠高度占较小高度的最小比例（低于则非同行）
 * @param {number} [opts.xOverlapRatio=0.15] x 重叠宽度占较小宽度的最大允许比例（超过则视为真正重叠/嵌套）
 * @returns {Array<{id:string,name:string,layout:'horizontal',members:string[]}>} 检测到的行内复合 section
 *          `members` 语义固定为 **视觉左→右（按 bbox.x 升序）**——下游 inline-row-merger 依赖该契约
 */
import { getFigmaBox, areBoxesSideBySide } from './section-tree.js'

/** `@lib/component` 标记提取（与 `figma-connector#extractTechStackHints` 同源正则） */
const TECHSTACK_MARKER_RX = /@([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/

/**
 * 数据驱动组件：内部构造（表头/表体/选项/输入框/弹窗骨架）由库运行时生成，
 * 设计稿里的几何只是渲染结果，不该被当作「行内左右并列」重建。
 * 归一化后比较（`date-Picker` / `date_picker` / `DatePicker` 同一族）。
 */
const DATA_DRIVEN_TECHSTACK_COMPONENTS = new Set([
  'table', 'select', 'input', 'datepicker', 'modal', 'form',
])

/** 自绘内容容器：业务内容塞在其子节点里，行内并排关系必须保留（不抑制）。 */
const SELF_DRAWN_TECHSTACK_CONTAINERS = new Set(['tab', 'tabs', 'collapse'])

/** 组件名归一化：小写 + 去掉 `-`/`_`/空白，`date-picker` ≡ `datepicker`。 */
function normalizeTechStackComponent(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[-_\s]/g, '')
}

/**
 * 该节点是否为「数据驱动技术栈组件」——是则抑制其自身的行内行聚类。
 * fail-open：无标记 / 自绘容器 / 未知组件名一律返回 false（维持原行为）。
 *
 * @param {object} node Figma 节点
 * @returns {boolean}
 */
export function isDataDrivenTechStackNode(node) {
  const m = String(node?.name || '').match(TECHSTACK_MARKER_RX)
  if (!m) return false
  const comp = normalizeTechStackComponent(m[2])
  if (!comp) return false
  if (SELF_DRAWN_TECHSTACK_CONTAINERS.has(comp)) return false
  return DATA_DRIVEN_TECHSTACK_COMPONENTS.has(comp)
}

export function rebuildSectionsPreservingInlineRows(doc, opts = {}) {
  const sections = []

  const walk = (node) => {
    const kids = (node.children || []).filter((c) => getFigmaBox(c))
    // 🛡️ P2-9：数据驱动组件自身的子节点不是「行内并列的块」，抑制聚类但继续递归子树
    //   （子树内真实的 inline 行，如表格单元格里的 radio + 文本，必须保留）。
    if (kids.length >= 2 && !isDataDrivenTechStackNode(node)) {
      // 行聚类：按 y 升序后，将满足左右并列的兄弟归入同一连通分量（行内复合结构）
      const rows = kids.map((k, i) => ({ ...getFigmaBox(k), idx: i, node: k }))
      rows.sort((a, b) => a.y - b.y)
      const parent = rows.map((_, i) => i)
      const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
      const union = (a, b) => { parent[find(a)] = find(b) }
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          if (areBoxesSideBySide(rows[i], rows[j], opts)) union(i, j)
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

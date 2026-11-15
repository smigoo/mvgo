/**
 * 🛡️ P0.5（2026-11-15）：段→组件高度归属修复器（写盘前终裁 · 真值派生）
 *
 * ## 病灶（mc-max-1794751753773-12e2285e 实锤）
 * 视觉模型把「流量预测标题区」与「流量预测图表」两段都写成 `id=2:3571`，
 * 而 `2:3571` 在 Figma 真值里只是 `6sub-header` 内的 `tit`（y=730, h=24.3）。
 * V-7 `mergeCollidedSections` 按同 id 合并后保留 host 的 `styles.figmaHeightPx=24`，
 * donor 的 body.children 并进来了，但**高度归属没重算** ⇒ `code-generator.js`
 * 的 `resolveSectionFlexSize`（优先 `figmaHeightPx`）给整段只分到 `flex:0 1 24px`，
 * 图表容器 `min-height:160px` 被 24px 父级裁掉 ⇒ 折线图整块空白。
 * 真值：`1744:125 slot-con`(y=158.69, h=745.31 ⇒ bottom=904) 的最后一个子节点
 * `2:3604 @echarts/line-7`(y=764.3, h=140.7) ⇒ 该段应覆盖 730→904 = 174px。
 *
 * ## 判据（纯几何 / 零命名 / 零写死值）
 * ① 段内声明了图表内容（`role==='chart'` 或 `type` 属图表类型集合，
 *    挂载点自适应 `body.children` / `children` / `declaredContent.items` / `controls`）；
 * ② 段 ref 节点在 Figma 真值树里有 box，且能上溯到一个「其子节点中存在更下方内容」的容器；
 * ③ 该段是同批段里的**尾部段**（没有其它段的 ref 比它更靠下）；
 * ④ 真值剩余高度 `container.bottom − ref.top` > 段声明高 × TAIL_CHART_MIN_HEIGHT_RATIO
 *    ⇒ 说明声明高只覆盖标题条，内容体没有归属。
 * 处置：`styles.figmaHeightPx` 重算为真值剩余高度；纯附加 `heightOwnership` 记录
 * 可照抄的配方（`refId` / `containerId` / `formula` / `truthHeightPx`），供修复轮与
 * 上下文组装器消费，自适应字段名与产物建模差异。
 *
 * ## 纪律
 * - **单一真值来源**：只读 Figma `absoluteBoundingBox`，不读模型自报的 `geometryPx` 做裁决。
 * - **纯函数**：不改入参；未命中段保持同一引用；命中段浅拷贝后写回。
 * - **fail-open / 指空段=没给**：无树、无 ref、无容器、无声明高 ⇒ 原样返回并记 skippedReason。
 * - **恒打计数行**：调用方无论命中与否一律打 stats（0 也打），不得塞构造入参冒充读数。
 */
import { indexCoverageTree } from './section-plan-coverage.js'
// 🛡️ 步骤 1：图表类型 / box / 容器归属判据收敛为单一来源（与观测器、归一修复器同源）。
import {
  CHART_TYPES, boxOfNode, findOwningChartContainer, TAIL_CHART_MIN_HEIGHT_RATIO,
} from './chart-declaration-truth.js'

// 保留具名导出，既有 spec / 调用方 import 路径不变。
export { TAIL_CHART_MIN_HEIGHT_RATIO }

/** 收集段内所有「图表声明」，自适应多种挂载点（不认字段名语义 / 不认 name）。 */
function declaresChart(section) {
  const seen = new Set()
  const walk = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return false
    seen.add(o)
    if (Array.isArray(o)) return o.some(walk)
    const role = String(o.role ?? o.control ?? '').toLowerCase()
    const type = String(o.type ?? '').toLowerCase()
    if (role === 'chart' || CHART_TYPES.has(type)) return true
    return Object.keys(o).some((k) => k !== 'styles' && walk(o[k]))
  }
  // 只扫段自身声明，不扫 Figma 真值（真值只用于几何裁决）
  const mounts = [
    section?.body?.children,
    section?.children,
    section?.declaredContent?.items,
    section?.header?.controls,
    section?.controls,
  ]
  return mounts.some(walk)
}

/** 段 ref 候选：自适应 id / figmaAnchorId / figmaNodeId / sourceNodeIds。 */
function sectionRefCandidates(section) {
  const out = []
  const push = (v) => {
    if (v == null) return
    const s = String(v)
    if (s && !out.includes(s)) out.push(s)
  }
  push(section?.figmaAnchorId)
  push(section?.figmaNodeId)
  push(section?.id)
  for (const n of Array.isArray(section?.sourceNodeIds) ? section.sourceNodeIds : []) push(n)
  return out
}

/**
 * @param {{sections?: Array<object>, figmaNodeData?: object}} input
 * @returns {{sections: Array<object>, stats: {evaluated:number, chartSections:number,
 *   tailCandidates:number, recomputed:number, skipped:boolean, skippedReason:string|null,
 *   details:Array<object>}}}
 */
export function repairTailChartSectionHeight({ sections, figmaNodeData } = {}) {
  const stats = {
    evaluated: 0,
    chartSections: 0,
    tailCandidates: 0,
    recomputed: 0,
    skipped: false,
    skippedReason: null,
    details: [],
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    stats.skipped = true
    stats.skippedReason = 'no-sections'
    return { sections: sections || [], stats }
  }
  const tree = indexCoverageTree(figmaNodeData)
  if (!tree) {
    stats.skipped = true
    stats.skippedReason = 'no-figma-tree'
    return { sections, stats }
  }

  // 先解析全批段的 ref 几何，供「尾部段」判据使用（单一真值来源）。
  const { byId } = tree
  const refInfo = sections.map((s) => {
    stats.evaluated += 1
    const refs = sectionRefCandidates(s)
    const refId = refs.find((id) => byId.has(id)) || ''
    return { section: s, refId, box: refId ? boxOfNode(byId.get(refId)) : null }
  })
  const maxTop = Math.max(...refInfo.map((r) => (r.box ? r.box.top : -Infinity)))
  // 🔴 归属唯一性：同层若有多个图表段共享同一 top，判据无法指认「哪一段拥有内容体」
  //   ⇒ 全部不动（指空段 = 没给），绝不猜。真机 12e2285e 尾部只有 `2:3571` 一段。
  const tailChartIdx = refInfo
    .map((r, i) => (r.box && r.box.top === maxTop && declaresChart(sections[i]) ? i : -1))
    .filter((i) => i >= 0)

  const out = sections.map((s, i) => {
    const { refId, box } = refInfo[i]
    if (!declaresChart(s)) return s
    stats.chartSections += 1
    const declared = Number(s?.styles?.figmaHeightPx) || 0
    if (!refId || !box || !(declared > 0)) return s // 指空段 = 没给
    if (tailChartIdx.length !== 1 || tailChartIdx[0] !== i) return s // 非唯一尾部段
    const container = findOwningChartContainer(tree, refId, box)
    if (!container) return s
    stats.tailCandidates += 1
    const truthHeightPx = Math.round(container.box.bottom - box.top)
    if (!(truthHeightPx > declared * TAIL_CHART_MIN_HEIGHT_RATIO)) return s
    stats.recomputed += 1
    const recipe = {
      refId,
      containerId: container.id,
      formula: 'container.absoluteBoundingBox.bottom - ref.absoluteBoundingBox.top',
      declaredHeightPx: declared,
      truthHeightPx,
    }
    stats.details.push(recipe)
    return {
      ...s,
      styles: { ...(s.styles || {}), figmaHeightPx: truthHeightPx },
      heightOwnership: recipe,
    }
  })

  return { sections: out, stats }
}

export default repairTailChartSectionHeight

/**
 * 🛡️ 图表 section 兜底注入（2026-09-16 · mc-1789501340553-e25b9b55 实锤）
 *
 * 根因：visual-parser 有时完全漏识别图表区域（如环形图），导致 effectiveSections
 * 中无任何 chart 类型 section → LLM 不生成 echarts 代码 → 产物缺图表。
 *
 * 本工具在规划阶段扫描 Figma 节点树中的 @echarts 标记节点，若存在但
 * effectiveSections 尚无 chart 类型 section 覆盖，则强制注入 chart section，
 * 确保图表区域进入生成。
 *
 * 模式：与 nav-section.js 完全一致（detect → inject → 重算 isForced）。
 */

import {
  collectLeafSections,
  findSectionById,
} from './section-tree.js'
import { resolveEchartsType } from './chart-type-guard.js'

/**
 * 从 @echarts 节点名推断 echarts 类型。
 * @param {string} nodeName - 如 "@echarts/pie"、"@echarts/bar"、"@echarts"
 * @returns {string} echarts 类型（pie/bar/line/scatter/radar/gauge）
 */
function inferChartType(nodeName) {
  const name = String(nodeName || '').toLowerCase()
  if (name.includes('/pie') || name.includes('/donut') || name.includes('/ring') || name.includes('/环形') || name.includes('/饼')) return 'pie'
  if (name.includes('/bar') || name.includes('/柱')) return 'bar'
  if (name.includes('/line') || name.includes('/折线') || name.includes('/面积')) return 'line'
  if (name.includes('/scatter') || name.includes('/散点')) return 'scatter'
  if (name.includes('/radar') || name.includes('/雷达')) return 'radar'
  if (name.includes('/gauge') || name.includes('/仪表盘') || name.includes('/进度')) return 'gauge'
  return 'pie' // 默认兜底：环形/饼图最常见
}

/**
 * 递归收集 Figma 节点树中所有 @echarts 标记节点。
 * @param {object} figmaNodeData - Figma 节点树根
 * @returns {Array<{id: string, name: string, chartType: string, bbox: object}>}
 */
export function collectEchartsNodes(figmaNodeData) {
  const results = []
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return results

  const root = figmaNodeData.document || figmaNodeData
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.name && String(node.name).startsWith('@echarts')) {
      results.push({
        id: String(node.id),
        name: node.name,
        chartType: inferChartType(node.name),
        bbox: node.absoluteBoundingBox || null,
      })
      // 不递归子树：@echarts 节点本身就是图表容器
      return
    }
    for (const child of node.children || []) walk(child)
  }
  walk(root)
  return results
}

/**
 * 检测是否存在「图表」信号。
 *
 * 两路信号（2026-09-16 扩展，c-d7334a-d7334a67 实锤）：
 *   ① vision 顶层 charts[] 有真值（如 doughnut + series）—— 最权威信号，即便 Figma 节点名
 *      无 @echarts 标记（如「中间图表」这类中文名）也能命中；
 *   ② Figma 节点树中存在 @echarts 标记节点（原信号）。
 *
 * 实锤：d7334a67 charts 字段识别出 doughnut（section 臆造为 "2:200"），但 Figma 节点实际是
 * 「中间图表」(287:4)、无 @echarts 标记 → 原 detectChartSignal 只看 @echarts 返回 false →
 * 兜底不注入 → effectiveSections 无 chart section → LLM 不生成 echarts → 产物缺环形图。
 *
 * @param {{figmaNodeData?:object, charts?:Array}} sources
 * @returns {boolean}
 */
export function detectChartSignal(sources = {}) {
  const { figmaNodeData, charts } = sources
  if (Array.isArray(charts) && charts.length > 0) return true
  if (!figmaNodeData) return false
  const nodes = collectEchartsNodes(figmaNodeData)
  return nodes.length > 0
}

/**
 * 判断 section 是否为 chart 类型。
 */
function isChartSection(sec) {
  const hay = `${sec?.type || ''} ${sec?.title || ''} ${sec?.responsibility || ''}`.toLowerCase()
  return (
    hay === 'chart' ||
    /图表/.test(hay) ||
    /echarts/.test(hay) ||
    /chart/.test(hay)
  )
}

// ==================== 几何宿主归属（2026-11-04 · mc-max-1793771678347-18544d9c 实锤） ====================
// 病灶：vision 的 layout.sections 无 children、charts[] 无 id/父级（上游脱锚）→ planner 产出
//   扁平 content section → 本兜底把未覆盖的 @echarts 节点「追加到根末尾」：① 顺序丢失
//   （Content×3 在前、Chart×5 在后，真实视觉序被撕碎）；② 刀16b 兄弟间距在错误相邻关系上
//   补偿出 421px/91px/62px 像素 margin；③ 与宿主组件自绘图表双渲染（ContentForecast 与
//   ChartChart5 各画一遍流量预测）。F1 根容器高度契约让容器真实高度生效后，margin+flex
//   叠加 → 段溢出重叠、「section 缺失/样式失效」。
// 治本：未覆盖节点先找**几何宿主**（节点中心落在叶子 section 的 Figma 盒内，取最小盒）——
//   有宿主 ⇒ 挂为宿主 internalSubcomponents（R1 同款机制，宿主 prompt 明确告知），不做根级注入；
//   无宿主 ⇒ 根级**按视觉 Y 归并插入**（不再 append 末尾）。真机计数行见 injectChartSectionIfMissing 尾部。

/** memo 化 Figma 节点 id → absoluteBoundingBox 查找。 */
function makeFigmaBoxResolver(figmaNodeData) {
  const cache = new Map()
  return function boxOf(id) {
    const key = String(id ?? '')
    if (!key) return null
    if (cache.has(key)) return cache.get(key)
    let found = null
    const root = figmaNodeData && typeof figmaNodeData === 'object'
      ? (figmaNodeData.document || figmaNodeData)
      : null
    const walk = (node) => {
      if (!node || found) return
      if (node.id !== undefined && String(node.id) === key) {
        found = node.absoluteBoundingBox || null
        return
      }
      for (const c of node.children || []) walk(c)
    }
    if (root) walk(root)
    cache.set(key, found)
    return found
  }
}

/** section 几何盒：优先自身 figmaBox/absoluteBoundingBox，fallback 按 id/sourceNodeIds 查 Figma 树。 */
function sectionBoxOf(sec, boxOf) {
  const direct = sec?.figmaBox || sec?.absoluteBoundingBox
  if (direct && Number.isFinite(Number(direct.y))) return direct
  if (typeof boxOf !== 'function') return null
  const fromId = sec?.id !== undefined && sec?.id !== null ? boxOf(sec.id) : null
  if (fromId) return fromId
  const src = Array.isArray(sec?.sourceNodeIds) ? sec.sourceNodeIds[0] : null
  return src ? boxOf(src) : null
}

function boxArea(b) {
  return Math.max(0, Number(b?.width) || 0) * Math.max(0, Number(b?.height) || 0)
}

/** inner 中心点（几何中心）是否落在 outer 盒内（含边界）。 */
function boxContainsCenter(outer, inner) {
  if (!outer || !inner) return false
  const ox = Number(outer.x) || 0
  const oy = Number(outer.y) || 0
  const ow = Number(outer.width) || 0
  const oh = Number(outer.height) || 0
  if (ow <= 0 || oh <= 0) return false
  const cx = (Number(inner.x) || 0) + (Number(inner.width) || 0) / 2
  const cy = (Number(inner.y) || 0) + (Number(inner.height) || 0) / 2
  return cx >= ox && cx <= ox + ow && cy >= oy && cy <= oy + oh
}

/** 在叶子 section 中找几何宿主：节点中心落在其盒内，取最小面积（最内层）。
 *  chart section（type==='chart'）不当宿主；content section 标题含「图表」字样仍可为宿主。 */
function findGeometricHost(node, leafRefs, boxOf) {
  let best = null
  let bestArea = Infinity
  for (const sec of leafRefs) {
    if (sec?.type === 'chart') continue
    const b = sectionBoxOf(sec, boxOf)
    if (!b || boxArea(b) <= 0) continue
    if (!boxContainsCenter(b, node?.bbox)) continue
    const a = boxArea(b)
    if (a < bestArea) {
      bestArea = a
      best = sec
    }
  }
  return best
}

/** 遍历树中**真实对象引用**的每个 section（不 copy —— 宿主挂载靠对象身份对齐）。 */
function forEachSectionRef(list, fn) {
  for (const sec of list || []) {
    if (!sec || typeof sec !== 'object') continue
    fn(sec)
    if (Array.isArray(sec.children) && sec.children.length > 0) {
      forEachSectionRef(sec.children, fn)
    }
  }
}

function collectLeafRefs(list) {
  const refs = []
  forEachSectionRef(list, (sec) => {
    if (!Array.isArray(sec.children) || sec.children.length === 0) refs.push(sec)
  })
  return refs
}

/** chart section → internalSubcomponent 形状（与 planner R1 图表隔离同款，prompt 已支持）。 */
function chartSectionToInternalSub(cs) {
  return {
    type: 'chart-component',
    id: cs.id,
    name: cs.title || cs.id,
    responsibility: cs.responsibility || `图表组件：${cs.title || cs.id}`,
    reason: 'R1-geo: 几何宿主归属（@echarts 节点中心落在宿主 section 盒内，不再根级注入）',
    props: ['chartData', 'chartConfig'],
    emits: ['legendClick', 'dataZoom'],
    chartType: cs.chartType || null,
    sourceNodeIds: Array.isArray(cs.sourceNodeIds) ? cs.sourceNodeIds : [],
  }
}

/**
 * 判断 section 是否覆盖了指定的 Figma 节点 ID。
 */
function sectionCoversNode(sec, nodeId) {
  const ids = sec?.sourceNodeIds || []
  return ids.some((id) => String(id) === String(nodeId))
}

/**
 * 🛡️ 消重（2026-09-26 · mc-max-1790430725365-1652d1b7 / mc-max-1790420477334-6e065bd7 实锤）
 *
 * 病灶：`@echarts` 节点在 `effectiveSections` 中**常常已以容器形式存在** —— container-rebuild
 * 给它包了一层容器、其唯一子被当成通用叶子。本例：
 *   `89:41(container, column) › 2:7898(container, title=@echarts/line, child=2:7899)`
 *   而 `2:7899`（title=`Group 2136637691`，35 个矢量元素）就是该图表的**静态实现细节**。
 *
 * 但本模块的既有语义是「**@echarts 节点本身就是图表容器**」（见 collectEchartsNodes 注释），
 * 于是同一区域被**解释两次**：
 *   · 叶子 `2:7899`  → `ContentSection.vue`（内含 echarts line 图 A）
 *   · 合成 `chart-2:7898` → `ChartSection.vue`（echarts line 图 B）
 * 又因注入项被 `[...effectiveSections, ...chartSections]` **追加到根**，丢掉了它在 89:41 内的位置
 * → ① 图上出现**两个图表**；② 89:41 被根级兄弟挤成 `flex:1`，tabs 条比例（0.221）被压扁
 *   → 「tabs 依旧错误」。
 *
 * 治本：注入前先看该 @echarts 节点是否**已由树中同 id 的 section 代表**——是则**就地替换**该子树
 * （消重 + 位置与 flex 比例天然正确），否则维持旧的「根级追加」（零回归）。
 * 保守纪律：**仅按 id 精确相等**认定宿主，不做祖先/后代猜测，避免误删多子容器内的其它内容。
 */
function replaceSectionByIdDeep(sections, nodeId, replacement) {
  const walk = (list) => {
    let replaced = false
    const out = []
    for (const sec of list) {
      if (!replaced && sec && String(sec.id) === String(nodeId)) {
        out.push(replacement)
        replaced = true
        continue
      }
      if (sec && Array.isArray(sec.children) && sec.children.length > 0) {
        const inner = walk(sec.children)
        out.push(inner.replaced ? { ...sec, children: inner.list } : sec)
        if (inner.replaced) replaced = true
      } else {
        out.push(sec)
      }
    }
    return { list: out, replaced }
  }
  return walk(sections)
}

/**
 * 若 Figma 节点树中有 @echarts 标记节点 / vision charts[] 有真值，但 effectiveSections
 * 尚无 chart section 覆盖，则强制注入 chart section。
 *
 * 注入规则（两路，2026-09-16 扩展）：
 *   ① @echarts 标记节点：收集 → 检查覆盖 → 未覆盖的按 y 坐标排序 → 注入
 *   ② charts[] 真值：charts 字段有 type/series 但 effectiveSections 无 chart section
 *      （且 @echarts 未覆盖）→ 用 charts 真值注入（chartType 归一化，series 透传）
 *
 * @param {object} plan - subComponentPlan（含 effectiveSections）
 * @param {boolean} chartSignal - detectChartSignal 的结果
 * @param {{figmaNodeData?:object, charts?:Array}} [sources]
 * @returns {object} 可能修改后的 plan（新对象，不污染入参）
 */
export function injectChartSectionIfMissing(plan, chartSignal, sources = {}) {
  if (!chartSignal) return plan

  const { figmaNodeData, charts } = sources
  const effectiveSections = Array.isArray(plan?.effectiveSections) ? plan.effectiveSections : []
  const allLeaves = collectLeafSections(effectiveSections)
  const hasChartSection = allLeaves.some((sec) => isChartSection(sec))

  // ① @echarts 节点兜底
  const echartsNodes = collectEchartsNodes(figmaNodeData)
  const uncoveredNodes = echartsNodes.filter(
    (node) => !allLeaves.some((sec) => sectionCoversNode(sec, node.id)),
  )

  // ② charts[] 真值兜底（2026-09-16 · c-d7334a-d7334a67 实锤）：vision 顶层 charts 有真值
  // （doughnut + series），但 Figma 节点是「中间图表」无 @echarts 标记 → ① 找不到节点。
  // 只要 charts 有 type/series 且 effectiveSections 无 chart section，就按真值注入。
  const chartsTruth = (Array.isArray(charts) ? charts : []).filter(
    (c) => c && (c.type || (Array.isArray(c.series) && c.series.length > 0)),
  )
  const needChartFromTruth =
    uncoveredNodes.length === 0 && chartsTruth.length > 0 && !hasChartSection

  let chartSections = []
  if (uncoveredNodes.length > 0) {
    // 按 y 坐标排序（与视觉文档序一致）
    uncoveredNodes.sort(
      (a, b) =>
        ((a.bbox?.y ?? 0) - (b.bbox?.y ?? 0)) ||
        ((a.bbox?.x ?? 0) - (b.bbox?.x ?? 0)),
    )
    chartSections = uncoveredNodes.map((node, idx) => ({
      id: `chart-${node.id}`,
      type: 'chart',
      chartType: node.chartType,
      responsibility: '图表区域（echarts）',
      elementCount: 1,
      title: `图表${uncoveredNodes.length > 1 ? idx + 1 : ''}`,
      sourceNodeIds: [node.id],
      complexityScore: 1,
      complexityReasons: {
        elementCount: 1,
        charts: 1,
        interactions: 0,
        maxDepth: 1,
      },
      // 🛡️ 2026-09-30 复审 §8.8.4「P3/P4 决策」**结案：保留 `direction:'column'`，不改 null**。
      //   ① 本 section 是**合成**的（id = `chart-<nodeId>`，Figma 树里不存在该节点），
      //      其 `layoutMetadata` 属**构造者声明**，不是「Figma 派生事实」
      //      ⇒ `subcomponent-planner#extractLayoutMetadata` 的「无事实 → null」三态**不适用本路径**。
      //   ② 真机实测（§8.8.10）：`chart-2:7898` 的 direction 会经 `microcode-engineer.js`
      //      的「布局协调提示」**进入 prompt**（该处直接读 `sec.layoutMetadata`、不重算；
      //      `extractLayoutMetadata` 全仓仅在 planner 内两处调用）⇒ 改 null 会改动 prompt 与产物。
      //   ③ 对「单个填满容器的 echarts div」而言方向是空值（vacuous）但**无害**：
      //      A/B 实测 `common.less` 的 `.c-env-monitor-chart{flex-direction:column}` 未触发任何门禁。
      //      ⇒ 收益 0、风险非零（需再跑真机）⇒ 保留。`height` 是真实 bbox 事实，必须保留。
      layoutMetadata: {
        direction: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        height: node.bbox?.height || 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    }))
  } else if (needChartFromTruth) {
    chartSections = chartsTruth.map((c, idx) => ({
      id: `chart-truth-${idx}`,
      type: 'chart',
      chartType: resolveEchartsType(c.type) || 'pie',
      responsibility: '图表区域（echarts）',
      elementCount: 1,
      title: `图表${chartsTruth.length > 1 ? idx + 1 : ''}`,
      // 🛡️ 透传视觉真值（series/legend/colors），供下游 prompt/N2 兜底消费
      chartSeries: Array.isArray(c.series) ? c.series : [],
      chartLegend: c.legend || null,
      chartColors: Array.isArray(c.seriesColors) ? c.seriesColors : [],
      sourceNodeIds: c.section ? [c.section] : [],
      complexityScore: 1,
      complexityReasons: {
        elementCount: 1,
        charts: 1,
        interactions: 0,
        maxDepth: 1,
      },
      // 🛡️ 2026-09-30 复审 §8.8.4「P3/P4 决策」**结案：保留 `direction:'column'`，不改 null**。
      //   同上一分支（`chart-<nodeId>`）：本 section 由**视觉真值**合成（id = `chart-truth-<idx>`），
      //   同样绕过 `extractLayoutMetadata` ⇒ 不适用「Figma 派生事实无值 → null」。
      //   `height: 0` 表示此处**无几何事实**（下文由下游按真值回填）；`direction` 保留构造者声明。
      layoutMetadata: {
        direction: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        height: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      internalSubcomponents: [],
      shouldSplitInternally: false,
    }))
  }

  if (chartSections.length === 0) return plan

  // @echarts 节点 id → 节点（含 bbox），尾部几何宿主/归并需要（挂在闭包变量，不进 section 对象）
  const nodeById = new Map()
  if (uncoveredNodes.length > 0) {
    for (const n of uncoveredNodes) nodeById.set(String(n.id), n)
  }

  // 🛡️ 消重（2026-09-26）：@echarts 节点若已以「同 id 的容器 section」存在于树中，
  //   则**就地替换**该子树（消重 + 保留其父容器内的位置与 flex 比例）；
  //   树中确实没有该节点的才维持旧的「根级追加」。
  let tree = effectiveSections
  const appended = []
  let replacedCount = 0
  let skippedCount = 0
  for (const cs of chartSections) {
    const hostId = Array.isArray(cs.sourceNodeIds) && cs.sourceNodeIds.length > 0
      ? cs.sourceNodeIds[0]
      : null
    // 🛡️ 守卫（2026-09-26 · 全语料审计结论固化）：只有宿主确实是**图表语义容器**才就地替换。
    //   依据：① @echarts 分支（chart-<nodeId>）全语料 68 例撞 id，宿主 100% 是图表容器（title/type 含
    //   echarts|chart|图表）→ 就地替换安全；② chartsTruth 分支的 sourceNodeIds[0] 是 **vision 提供的
    //   c.section**（复用、不唯一，同一节点可承载多个不同图表，如 bc0c25aa 的 bar/pie/area 三条真值
    //   同挂 426:807），当前语料 0 例撞既有 section id，但**无类型校验的替换一旦撞上真实非图表 section
    //   就会连带删掉其子树**。故加语义守卫：不匹配即退回旧的「根级追加」，宁可多一个 section 也不误删。
    const host = hostId ? findSectionById(tree, hostId) : null
    const hostHay = host
      ? `${host.title || ''} ${host.type || ''} ${host.responsibility || ''}`
      : ''
    const hostIsChartish = /echarts|chart|图表/i.test(hostHay)
    if (host && !hostIsChartish) skippedCount++
    const r = host && hostIsChartish
      ? replaceSectionByIdDeep(tree, hostId, cs)
      : { list: tree, replaced: false }
    if (r.replaced) {
      tree = r.list
      replacedCount++
    } else {
      appended.push(cs)
    }
  }

  // 🛡️ 几何宿主归属（2026-11-04 · 18544d9c 实锤）：未就地替换的 chart section 先找几何宿主——
  //   有宿主 ⇒ 挂为宿主 internalSubcomponents（R1 同款机制），**不做根级注入**（杜绝顺序撕碎、
  //   像素间距错补偿、与宿主自绘双渲染）；无宿主 ⇒ 根级按视觉 Y 归并插入（不再 append 末尾）。
  const boxOf = makeFigmaBoxResolver(figmaNodeData)
  const hostedPairs = []
  const orphans = []
  for (const cs of appended) {
    const node = nodeById.get(String(cs.sourceNodeIds?.[0] ?? ''))
    const geoHost = node && node.bbox
      ? findGeometricHost(node, collectLeafRefs(tree), boxOf)
      : null
    if (geoHost) hostedPairs.push([geoHost, cs, node])
    else orphans.push(cs)
  }

  if (hostedPairs.length > 0) {
    const attachToHost = (list) =>
      list.map((sec) => {
        const pairs = hostedPairs.filter(([h]) => h === sec)
        if (pairs.length > 0) {
          const subs = pairs.map(([, cs]) => chartSectionToInternalSub(cs))
          return {
            ...sec,
            internalSubcomponents: [...(sec.internalSubcomponents || []), ...subs],
          }
        }
        if (sec && Array.isArray(sec.children) && sec.children.length > 0) {
          return { ...sec, children: attachToHost(sec.children) }
        }
        return sec
      })
    tree = attachToHost(tree)
  }

  // 孤儿 chart section：按视觉 Y 与既有顶层 section 归并（稳定排序：同 y 保持原相对顺序）。
  // 无几何事实的 section/chart 取 +Infinity，保持相对顺序落尾部（等价旧 append 语义）。
  let nextSections = tree
  if (orphans.length > 0) {
    const yOf = (sec) => {
      const node = nodeById.get(String(sec?.sourceNodeIds?.[0] ?? ''))
      if (node?.bbox && Number.isFinite(Number(node.bbox.y))) return Number(node.bbox.y)
      const b = sectionBoxOf(sec, boxOf)
      return b && Number.isFinite(Number(b.y)) ? Number(b.y) : Number.POSITIVE_INFINITY
    }
    nextSections = [...tree, ...orphans]
      .map((sec, idx) => ({ sec, idx, y: yOf(sec) }))
      .sort((a, b) => (a.y - b.y) || (a.idx - b.idx))
      .map((x) => x.sec)
  }

  // 宿主归属的 plan 级记账（prompt 分组按 parentSectionId 消费；与 planner R1 同形状）
  const hostedPlanSubs = hostedPairs.map(([host, cs]) => ({
    ...chartSectionToInternalSub(cs),
    parentSectionId: host.id || host.title || null,
    parentSectionTitle: host.title || null,
  }))

  const leafCount = collectLeafSections(nextSections).length
  const minSectionsForced = 3
  const isForced = leafCount >= minSectionsForced
  const totalInternalSubs =
    (Array.isArray(plan.internalSubcomponents) ? plan.internalSubcomponents.length : 0) +
    hostedPlanSubs.length

  // 🔴 计数行（0 也必须出现）：hosted/orphan/replaced 三分支真机可观测
  sources.logger?.info?.('[chart-section] 图表兜底注入裁决', {
    chartSections: chartSections.length,
    replacedInTree: replacedCount,
    hostedByGeometry: hostedPairs.length,
    rootMergedByY: orphans.length,
    rootOrder: nextSections.map((s) => s.id).filter(Boolean),
  })

  return {
    ...plan,
    effectiveSections: nextSections,
    // 🛡️ G2（2026-11-04）：图表宿主裁决计数进 plan 返回体（上游 component-meta 落盘）——
    //   resolved = 就地替换 + 几何宿主归属；unresolved = 根级 Y 归并（无宿主）；
    //   skippedNonChartish = 宿主存在但非图表语义被守卫拦下（走归并/追加）。
    chartHostStats: {
      resolved: replacedCount + hostedPairs.length,
      unresolved: orphans.length,
      skippedNonChartish: skippedCount,
    },
    ...(hostedPlanSubs.length > 0
      ? {
          internalSubcomponents: [
            ...(Array.isArray(plan.internalSubcomponents) ? plan.internalSubcomponents : []),
            ...hostedPlanSubs,
          ],
        }
      : {}),
    isForced,
    minFiles: isForced ? leafCount + totalInternalSubs : 0,
    reason: isForced
      ? `叶子 sections=${leafCount} ≥ ${minSectionsForced} → 强制拆分（含强制注入的 ${chartSections.length} 个图表 section${replacedCount > 0 ? `，其中 ${replacedCount} 个就地替换既有容器` : ''}${hostedPairs.length > 0 ? `，${hostedPairs.length} 个几何宿主归属（挂 internalSubcomponents）` : ''}${orphans.length > 0 ? `，${orphans.length} 个根级按 Y 归并` : ''}${skippedCount > 0 ? `，${skippedCount} 个宿主非图表语义→走归并/追加` : ''}）`
      : `叶子 sections=${leafCount} < ${minSectionsForced} → 不强制拆分（已注入 ${chartSections.length} 个图表 section${replacedCount > 0 ? `，其中 ${replacedCount} 个就地替换既有容器` : ''}${hostedPairs.length > 0 ? `，${hostedPairs.length} 个几何宿主归属` : ''}${orphans.length > 0 ? `，${orphans.length} 个根级按 Y 归并` : ''}${skippedCount > 0 ? `，${skippedCount} 个宿主非图表语义→走归并/追加` : ''}）`,
  }
}

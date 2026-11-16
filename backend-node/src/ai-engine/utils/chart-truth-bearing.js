import { collectEchartsNodes } from './chart-section.js'

/**
 * 图表真值承载段（2026-11-16 · 锚定事实优先）
 *
 * 断点（实单 `mc-max-1794760772053-c12d0e52` 实锤）：
 *   视觉 LLM 对同一张图三次给出不同段语义（段数 6/5/7、`headerRelation` 三种、
 *   图表归属 id 三次全错：标题容器 / 编造 id / 文字节点）。visual-parser 已经把段
 *   **锚回** Figma 真值（该段 `id=2:3604`、`figmaNodeId=2:3604`、`reanchoredFrom=2:3565`），
 *   但 planner 的 `isPanelHeader` 只看 `headerRelation === 'title-itself'` 一个字符串，
 *   不看这段已经锚到哪个真实节点 ⇒ 整段被当 chrome 删掉（`filteredCount:1`）
 *   ⇒ plan 少一段 ⇒ 产物缺 `ContentForecast.vue` ⇒ 「流量预测」整块没有折线图。
 *
 * 本函数输出「该段承载图表真值」的**确定性事实**，供过滤判据豁免：
 *   ① 段 id 本身就是 @echarts 节点；
 *   ② 段 id 是某个 @echarts 节点的祖先（段盒包住图表）；
 *   ③ 段内容轨里引用的节点是 @echarts 节点。
 *
 * 🔴 判据单一来源：@echarts 的识别**复用** `chart-section.js#collectEchartsNodes`
 *   （含「命中即止、不递归子树」既有口径），本文件不另立第二份规则。
 * 🔴 纯函数：不读盘、不打日志、不改入参；无 `figmaNodeData` 时返回空集（零影响）。
 */

export const CHART_TRUTH_BEARING_VERSION = 'step1-20261116'

/** 内容轨可能承载元素的字段（与 chart-truth-coverage 的 SKIP_KEYS 思路一致，只取结构字段） */
const CONTENT_TRACK_KEYS = ['children', 'items', 'elements', 'body', 'declaredContent']

/**
 * @param {Array} sections - plan 段（每段至少有 id；可含 body/children/items/elements）
 * @param {object} figmaNodeData - Figma 节点树根（`{document}` 或根节点本身）
 * @returns {{version: string, ids: Set<string>, details: Array<{sectionId: string, via: string, chartId: string}>}}
 */
export function collectChartTruthBearingSectionIds(sections, figmaNodeData) {
  const version = CHART_TRUTH_BEARING_VERSION
  const ids = new Set()
  const details = []
  if (!figmaNodeData || typeof figmaNodeData !== 'object') {
    return { version, ids, details }
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return { version, ids, details }
  }

  const chartNodes = collectEchartsNodes(figmaNodeData)
  if (chartNodes.length === 0) {
    return { version, ids, details }
  }
  const chartIds = new Set(chartNodes.map((n) => String(n.id)))

  // 一次遍历建 parent 链：用于「段是图表的祖先」判定
  const parentOf = new Map()
  const root = figmaNodeData.document || figmaNodeData
  const walk = (node, parentId) => {
    if (!node || typeof node !== 'object') return
    const id = node.id != null ? String(node.id) : ''
    if (id) parentOf.set(id, parentId)
    for (const child of node.children || []) walk(child, id || parentId)
  }
  walk(root, null)

  /** 从某个 id 沿 parent 链向上，收集所有祖先 id（不含自身） */
  const ancestorsOf = (id) => {
    const out = []
    let cur = parentOf.get(String(id))
    let guard = 0
    while (cur && guard < 64) {
      out.push(cur)
      cur = parentOf.get(cur)
      guard += 1
    }
    return out
  }

  /** 段内容轨里引用的所有元素 id（递归结构字段，不碰样式/文案） */
  const collectContentIds = (node, out, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return
    if (Array.isArray(node)) {
      for (const item of node) collectContentIds(item, out, depth + 1)
      return
    }
    if (node.id != null) out.add(String(node.id))
    for (const key of CONTENT_TRACK_KEYS) {
      if (node[key]) collectContentIds(node[key], out, depth + 1)
    }
  }

  for (const sec of sections) {
    const sectionId = sec?.id != null ? String(sec.id) : ''
    if (!sectionId) continue

    // ① 段本身就是图表真值节点
    if (chartIds.has(sectionId)) {
      ids.add(sectionId)
      details.push({ sectionId, via: 'self', chartId: sectionId })
      continue
    }

    // ② 段是某个图表真值节点的祖先
    const chartUnder = chartNodes.find((n) => ancestorsOf(n.id).includes(sectionId))
    if (chartUnder) {
      ids.add(sectionId)
      details.push({ sectionId, via: 'ancestor', chartId: String(chartUnder.id) })
      continue
    }

    // ③ 段内容轨引用了图表真值节点
    const contentIds = new Set()
    collectContentIds(sec, contentIds)
    contentIds.delete(sectionId)
    const cited = [...contentIds].find((cid) => chartIds.has(cid))
    if (cited) {
      ids.add(sectionId)
      details.push({ sectionId, via: 'content', chartId: cited })
    }
  }

  return { version, ids, details }
}

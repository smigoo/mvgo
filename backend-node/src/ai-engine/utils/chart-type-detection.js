/**
 * 图表类型检测底层纯函数（无依赖叶子模块 · 2026-11-17 抽离）
 *
 * 抽离动机：判据单一来源。原实现在 validators/do-not-invent-validator.js 内，
 * 新增 utils/chart-missing-types.js（N2 兜底与门禁共用缺失类型判定）后若继续
 * 从 validator import 会形成循环依赖（validator → chart-missing-types → validator）。
 * 故把三个纯函数下沉到本无依赖模块，validator 与 chart-missing-types 各自 import，
 * validator 仍 re-export 保持对外 API 与既有 spec 的 import 路径零变更。
 */

/**
 * vision 图表类型归一化：
 * - pie / doughnut / donut / ring / 环形 / 饼图 → 'pie'
 * - bar / column / 柱状 / 柱形 → 'bar'
 * - line / area / curve / 折线 / 曲线 / 面积 → 'line'
 * - radar / gauge / scatter → 对应归一化值
 * - 无法归一化的（multiple / 空 / 未知）→ null（跳过检查，避免误伤）
 */
export function normalizeChartType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (!t) return null
  if (/pie|doughnut|donut|ring|环形|饼图/.test(t)) return 'pie'
  if (/bar|column|柱状|柱形/.test(t)) return 'bar'
  if (/line|area|curve|折线|曲线|面积/.test(t)) return 'line'
  if (/radar|雷达/.test(t)) return 'radar'
  if (/gauge|仪表/.test(t)) return 'gauge'
  if (/scatter|散点/.test(t)) return 'scatter'
  return null
}

/**
 * 收集产物代码中所有 echarts series 的 type 归一化集合（扫描全产物含子组件）。
 * 匹配 series 对象内 `type: 'xxx'`（单/双引号），逐条归一化去重。
 */
export function collectChartSeriesTypes(vueContent) {
  const types = new Set()
  if (!vueContent || typeof vueContent !== 'string') return types
  const typeRe = /type\s*:\s*['"]([a-zA-Z]+)['"]/g
  let m
  while ((m = typeRe.exec(vueContent)) !== null) {
    const norm = normalizeChartType(m[1])
    if (norm) types.add(norm)
  }
  return types
}

/**
 * 「文字数字卡承载」图表类型集合（豁免判据，2026-11-09 · 00f3626c 实锤）。
 * vision chart.section 的 Figma 子树内有 TEXT 节点（数据以文字形态在场）⇒ 该类型
 * 视为已被文字形态承载，不要求产物必须有对应 echarts series。
 *
 * 🛡️ G1 收紧（2026-11-18 · 图表承载链路三层静默）：旧判据只要子树有一个含数字的
 * TEXT 就豁免，轴刻度 `600/400/200` 因此把「整块没画」也豁免掉。本层新增 R4/R2/R3
 * 三条**上游真值**判据，R1（产物自证矛盾）因需要 content 落在 chart-missing-types.js。
 * 四层落层纪律：同一判据只在一处实现，禁止两处各写一份。
 *
 * @param {Array} charts vision charts（{section, type}）
 * @param {Map|null} figmaIndex indexFigmaNodes 产物；null ⇒ 空集（fail-open 不豁免）
 * @param {{r1:number,r2:number,r3:number,r4:number}|null} stats 计数行（调用方给则累加；零命中也打）
 * @returns {Set<string>} 归一化类型集合
 */
export function collectTextCarriedChartTypes(charts, figmaIndex, stats = null) {
  const out = new Set()
  const idx = figmaIndex && typeof figmaIndex.get === 'function' ? figmaIndex : null
  if (!idx) return out
  const s = stats && typeof stats === 'object' ? stats : null
  for (const c of Array.isArray(charts) ? charts : []) {
    const normT = normalizeChartType(c?.type)
    const sid = c?.section != null ? String(c.section) : ''
    if (!normT || !sid) continue
    const hit = idx.get(sid)
    const raw = hit?.rawNode
    if (!raw) continue
    // R2 图层名：设计侧显式标注为图表位 ⇒ 不允许用「文字承载」解释
    const layerName = hit.name || String(raw.name || '')
    if (CHART_LAYER_NAME_RE.test(layerName)) {
      if (s) s.r2 += 1
      continue
    }
    // R3 几何：大尺寸 + 多条文本 = 图位而非数字卡
    if (looksLikeChartGeometry(raw)) {
      if (s) s.r3 += 1
      continue
    }
    // R4 轴刻度排除后仍有有效数字文本 ⇒ 才成立豁免
    if (subtreeHasNumericText(raw, 0)) out.add(normT)
    else if (s) s.r4 += 1
  }
  return out
}

/**
 * R2：图层名显式标注为图表位。
 * 命中即禁豁免。只用 id/name 索引里已有的事实（section-tree.js:741），不新增扫描。
 */
const CHART_LAYER_NAME_RE =
  /@?echarts|chart|图表|环形|环图|饼图?|柱(?:图|状|形)?|折线|曲线|面积图|gauge|ring|doughnut|donut|pie|bar\b|line\b/i

/**
 * R3：大几何 + 足够文本数 ⇒ 图位。
 * 阈值来自 17 例实测：面积 ≥40000px²（380×113 / 379×131 / 387×142）或
 * 长边 ≥300px（329×112 / 329×69），且 TEXT ≥8。小数字卡（120×60 / 80×93）不命中。
 */
function looksLikeChartGeometry(raw) {
  const b = raw?.absoluteBoundingBox || raw?.bbox
  if (!b || typeof b.width !== 'number' || typeof b.height !== 'number') return false
  if (!(b.width > 0 && b.height > 0)) return false
  const chartSized = b.width * b.height >= 40000 || Math.max(b.width, b.height) >= 300
  return chartSized && countTextNodes(raw, 0) >= 8
}

/** 深度限 8 的 TEXT 计数（与 subtreeHasNumericText 同深度上限） */
function countTextNodes(node, depth) {
  if (!node || typeof node !== 'object' || depth > 8) return 0
  let n = String(node.type) === 'TEXT' ? 1 : 0
  for (const c of node.children || []) n += countTextNodes(c, depth + 1)
  return n
}

/**
 * R4：轴刻度文本识别。
 * 纯数字短标签（600 / 40 / 0）与纯单位（次 / km / %）是刻度，不构成「数据以文字承载」。
 * 带千分位的数值（如 `1,234`，长度 5）保留为真数据卡文本 —— T1 反例据此不误伤。
 */
function isAxisTickText(chars) {
  const s = String(chars ?? '').trim()
  if (!s) return true
  if (/^[-+]?\d[\d,]*(?:\.\d+)?$/.test(s) && s.length <= 4) return true
  if (!/\d/.test(s) && /^[%°℃kmhH次辆人台条个万千少时天年月日]+$/.test(s) && s.length <= 4) return true
  return false
}

/** 子树内是否存在「非刻度」的含数字 TEXT 节点（深度限 8；characters 缺失时按 TEXT 存在计） */
function subtreeHasNumericText(node, depth) {
  if (!node || typeof node !== 'object' || depth > 8) return false
  if (String(node.type) === 'TEXT') {
    const chars = node.characters
    if (chars == null) return true
    const s = String(chars)
    if (/\d/.test(s) && !isAxisTickText(s)) return true
  }
  for (const c of node.children || []) {
    if (subtreeHasNumericText(c, depth + 1)) return true
  }
  return false
}

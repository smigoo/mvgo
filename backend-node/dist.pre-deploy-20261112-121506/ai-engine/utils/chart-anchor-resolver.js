/**
 * 🛡️ V-2（2026-11-04 · mc-max-1793775515654-bf0f0342 实锤）：charts[].section 归属强制解析。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * vision 输出 charts 条目的 `section` 归属可为 null（bf0f0342 preview-analysis 实测
 * `charts:[{type:'bar', section:None}]` 全部 null）⇒ 三连断供：
 *   1. `preview-analysis-validator` 的 chart.section 交叉校验 `if (chart.section)` 直接跳过 null；
 *   2. `design-facts-compiler` `id: chart.id || chart.section || chart-N` 退化合成 id，段关系丢失；
 *   3. 下游几何宿主兜底反推不出 → 图表事实整条断供 → 4 组件零 echarts。
 *
 * ── 本模块的边界（确定性解析，绝不臆造） ─────────────────────────────────────
 *   对每个 chart 依次尝试（首个命中即止）：
 *   ① `chart.section` 已能对应某段（锚 key / 段 id 精确或互相包含，与 validator 同判据）
 *      ⇒ `alreadyAnchored`，不改写；
 *   ② `chart.bbox` 存在且合法 ⇒ 中心点落入的最小段锚 bbox（面积最小者优先）⇒ 写 `chart.section = 段id`；
 *   ③ `chart.title/name` 与 `section.name/title` 互相包含（语义匹配）⇒ 写 `chart.section = 段id`；
 *   ④ 全部失败 ⇒ `chart.sectionUnresolved = true`（显式标注，供下游「无宿主不注入」消费），
 *      绝不硬造归属。
 *
 * 纯函数（副作用仅限写 `chart.section` / `chart.sectionUnresolved`）、不 import logger。
 * 段锚候选单一来源：`section-anchor-truth#sectionAnchorKey`。
 */
import { sectionAnchorKey } from './section-anchor-truth.js'
import { getFigmaBox, indexFigmaNodes } from './section-tree.js'

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase()

/** 解析 chart.bbox 为 {x,y,w,h}（非法返回 null） */
function chartBoxOf(chart) {
  const b = chart?.bbox
  if (!b || typeof b !== 'object') return null
  const x = Number(b.x)
  const y = Number(b.y)
  const w = Number(b.width ?? b.w)
  const h = Number(b.height ?? b.h)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, w, h }
}

/**
 * @param {Array<object>} charts vision charts 数组
 * @param {Array<object>} sections 顶层 sections
 * @param {object} figmaRoot Figma 真值树
 * @returns {stats: {total, alreadyAnchored, resolvedByBBox, resolvedByName, unresolved,
 *   unresolvedDetail: Array<{index,title,type}>, skippedReason}}
 */
export function resolveChartSectionAnchors(charts, sections, figmaRoot) {
  const stats = {
    total: 0,
    alreadyAnchored: 0,
    resolvedByBBox: 0,
    resolvedByName: 0,
    unresolved: 0,
    unresolvedDetail: [],
    skippedReason: '',
  }
  if (!Array.isArray(charts) || charts.length === 0) {
    stats.skippedReason = 'no-charts'
    return stats
  }
  if (!Array.isArray(sections) || sections.length === 0 || !figmaRoot || typeof figmaRoot !== 'object') {
    stats.skippedReason = 'no-sections-or-figma'
    return stats
  }

  const index = indexFigmaNodes(figmaRoot)
  const secEntries = sections
    .map((section) => {
      const key = sectionAnchorKey(section)
      const rec = key ? index.get(key) : null
      const box = rec ? getFigmaBox(rec.rawNode) : null
      return { section, key, box }
    })
    .filter((e) => e.box)

  const sectionIdOf = (e) => String(e.section?.id || e.key || '')

  charts.forEach((chart, chartIndex) => {
    if (!chart || typeof chart !== 'object') return
    stats.total += 1

    const raw = norm(chart.section)
    if (raw) {
      const matched = sections.some((s) => {
        const id = norm(s?.id)
        const key = norm(sectionAnchorKey(s))
        const name = norm(s?.name || s?.title)
        return (
          id === raw ||
          (key && (key === raw || key.includes(raw) || raw.includes(key))) ||
          (name && (name.includes(raw) || raw.includes(name)))
        )
      })
      if (matched) {
        stats.alreadyAnchored += 1
        return
      }
    }

    const cb = chartBoxOf(chart)
    if (cb && secEntries.length > 0) {
      const cx = cb.x + cb.w / 2
      const cy = cb.y + cb.h / 2
      const hits = secEntries.filter(
        (e) =>
          cx >= e.box.x && cx <= e.box.x + e.box.w && cy >= e.box.y && cy <= e.box.y + e.box.h,
      )
      if (hits.length > 0) {
        hits.sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)
        chart.section = sectionIdOf(hits[0])
        stats.resolvedByBBox += 1
        return
      }
    }

    const t = norm(chart.title || chart.name)
    if (t) {
      const hit = sections.find((s) => {
        const n = norm(s?.name || s?.title)
        return n && (n.includes(t) || t.includes(n))
      })
      if (hit) {
        chart.section = String(hit.id || '')
        stats.resolvedByName += 1
        return
      }
    }

    chart.sectionUnresolved = true
    stats.unresolved += 1
    if (stats.unresolvedDetail.length < 20) {
      stats.unresolvedDetail.push({
        index: chartIndex,
        title: String(chart.title || chart.name || ''),
        type: String(chart.type || ''),
      })
    }
  })
  return stats
}

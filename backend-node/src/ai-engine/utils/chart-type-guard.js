/**
 * 🛡️ Loop 2.1.E（2026-09-10）：chartType 冻结进 block + 非法 series.type 拒收。
 *
 * 根因：traffic 样本出现 series.type:'分组柱状图'（非 echarts 注册名）→ 图表 init 失败 / 空白。
 * 治本：chartType 由 Manifest/Figma 真值驱动，LLM 只允许写合法 echarts 注册名；
 * 非法别名（分组柱状图/柱状图/折线图…）一律 fail-closed 回退。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔴 2026-09-11 修订：真值洗白事故（mc-max-1789062564333-f1ff01eb）
 * ─────────────────────────────────────────────────────────────────────────
 * 旧实现 `fallback = block.chartType` **直接采用未校验的真值**。当 vision 真值本身
 * 就是非法别名时（'area-line' / '面积折线图' / '分组柱状图'），非法值被「收敛」成
 * **同一个非法值**，并打印「已收敛 N 处」→ 守卫退化成洗白器，图表依旧空白。
 *
 * 实锤日志：
 *   2.1.E 非法 series.type 已收敛 2 处（真值=area-line）
 *   2.1.E 非法 series.type 已收敛 5 处（真值=分组柱状图）
 *
 * 修订内容：
 *   1. 真值先经 resolveEchartsType() 归一到注册名，再作为回退（无法识别 → 'line'）。
 *   2. 新增 normalizeSeriesInSource()：括号配平提取完整 series 数组 + **只改元素顶层
 *      type 键**；旧版 `/series\s*:\s*\[[\s\S]*?\]/`（lazy）只覆盖到第一个 `]`，且无差别
 *      替换数组内所有 `type:` → 把 lineStyle.type / 渐变 type 一起改坏。
 *   3. 新增嵌套键修复：`color:{type}` → linear/radial；`lineStyle:{type}` → solid/dashed/dotted。
 *
 * 另注：Figma 节点名 → 类型的映射见 `chart-type-mapper.js`，两者职责不同：
 * 本文件负责「任意脏值 → echarts 注册名」，输出保证落在 REGISTERED_ECHARTS_TYPES。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔴 2026-09-14 修订：多图互踩（流量监测 c-traffic-monitor-c6c228fb 实锤）
 * ─────────────────────────────────────────────────────────────────────────
 * 旧实现单值 `block.chartType` 取自 `chartsArr[0]?.type` → 全文件所有 series.type 被
 * 强制收敛到**第一张图**的类型。多图时「chart A 真值」硬塞给 chart B：
 *   charts 真值 = [bar(隧道), bar(大桥), area(流量预测)]，产物预测图应为 area/line，
 *   却被首图 bar 覆盖 → 折线图画成柱状图。
 * 与 2.1.E 原始事故（真值洗白）同族，但**真值本身合法**，错的是「一个真值跨图适用」。
 *
 * 治本：**真值集驱动**（而非按产物源码分布判定）。新增
 *   - `buildChartTypeTruthSet(charts)`：由 charts[] 真值构造允许集（area→line）→ {bar,line}；
 *   - `block.chartTypeSet`：逐 series 互不覆盖——series.type 落在集内即合法原样保留，
 *     只有落在集外才 fail-closed 收敛到集内。**禁用「首图真值覆盖全文件」**。
 * 单图（无集合）维持 2.1.E「chartType 冻结进 block」语义；`isMultiChartSource` 保留为
 * 无集合时的兜底自动判定。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；不修改入参。
 */

export const REGISTERED_ECHARTS_TYPES = new Set([
  'bar',
  'line',
  'pie',
  'scatter',
  'effectScatter',
  'radar',
  'gauge',
  'funnel',
  'candlestick',
  'heatmap',
  'graph',
  'tree',
  'treemap',
  'sunburst',
  'boxplot',
  'parallel',
  'sankey',
  'map',
  'lines',
  'pictorialBar',
  'themeRiver',
  'custom',
])

/** 别名 → 注册名。键在模块初始化时统一紧凑化（去空格/下划线/连字符/斜杠 + 小写）。 */
const RAW_CHART_TYPE_ALIASES = {
  // ── 折线 / 面积 ──
  折线图: 'line',
  折线: 'line',
  折线面积图: 'line',
  面积折线图: 'line',
  曲线图: 'line',
  曲线: 'line',
  面积图: 'line',
  面积: 'line',
  area: 'line',
  'area-line': 'line',
  arealine: 'line',
  'line-area': 'line',
  linearea: 'line',
  areachart: 'line',
  linechart: 'line',
  lineareachart: 'line',
  spline: 'line',
  smoothline: 'line',
  // ── 柱 / 条 ──
  柱状图: 'bar',
  柱形图: 'bar',
  柱图: 'bar',
  条形图: 'bar',
  条图: 'bar',
  分组柱状图: 'bar',
  分组柱形图: 'bar',
  双系列分组柱状图: 'bar',
  双列分组柱状图: 'bar',
  堆叠柱状图: 'bar',
  堆叠柱形图: 'bar',
  堆叠条形图: 'bar',
  水平柱状图: 'bar',
  横向柱状图: 'bar',
  水平条形图: 'bar',
  column: 'bar',
  columnchart: 'bar',
  barchart: 'bar',
  groupbar: 'bar',
  groupedbar: 'bar',
  stackbar: 'bar',
  stackedbar: 'bar',
  // ── 饼 / 环 ──
  饼图: 'pie',
  圆饼图: 'pie',
  扇形图: 'pie',
  环形图: 'pie',
  圆环图: 'pie',
  环图: 'pie',
  玫瑰图: 'pie',
  南丁格尔玫瑰图: 'pie',
  piechart: 'pie',
  donut: 'pie',
  doughnut: 'pie',
  donutchart: 'pie',
  // ── 其它 ──
  散点图: 'scatter',
  气泡图: 'scatter',
  scatterchart: 'scatter',
  涟漪散点图: 'effectScatter',
  特效散点图: 'effectScatter',
  雷达图: 'radar',
  radarchart: 'radar',
  仪表盘: 'gauge',
  仪表盘图: 'gauge',
  仪表图: 'gauge',
  gaugechart: 'gauge',
  漏斗图: 'funnel',
  funnelchart: 'funnel',
  k线图: 'candlestick',
  k线: 'candlestick',
  蜡烛图: 'candlestick',
  热力图: 'heatmap',
  热图: 'heatmap',
  关系图: 'graph',
  图谱: 'graph',
  矩形树图: 'treemap',
  树图: 'tree',
  旭日图: 'sunburst',
  桑基图: 'sankey',
  地图: 'map',
  箱线图: 'boxplot',
  箱型图: 'boxplot',
  平行坐标图: 'parallel',
  主题河流图: 'themeRiver',
  象形柱图: 'pictorialBar',
  线图: 'lines',
}

const compactKey = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-·／/]+/g, '')

const ALIAS_MAP = new Map(
  Object.entries(RAW_CHART_TYPE_ALIASES).map(([k, v]) => [compactKey(k), v]),
)
// 注册名自身也进别名表（紧凑形），保证 'effectscatter' 这类大小写变体能还原
for (const t of REGISTERED_ECHARTS_TYPES) ALIAS_MAP.set(compactKey(t), t)

/** 兜底关键词（别名表未收录时按语义词头归类）。顺序即优先级。 */
const KEYWORD_RULES = [
  [/柱|bar|column/, 'bar'],
  [/饼|扇形|donut/, 'pie'],
  [/环/, 'pie'],
  [/雷达|radar/, 'radar'],
  [/仪表|gauge/, 'gauge'],
  [/漏斗|funnel/, 'funnel'],
  [/散点|气泡|scatter/, 'scatter'],
  [/热力|heatmap/, 'heatmap'],
  [/桑基|sankey/, 'sankey'],
  [/旭日|sunburst/, 'sunburst'],
  [/矩形树|treemap/, 'treemap'],
  [/折线|曲线|面积|line|area|spline/, 'line'],
  [/^pie$|piechart/, 'pie'],
]

/**
 * 把任意脏值归一为 **echarts 注册名**。
 * 注册名原样返回；别名（含中文/连字符/大小写变体）按别名表归一；否则按关键词兜底；
 * 全都不识别 → null（调用方负责 fail-closed 回落）。
 *
 * @param {*} raw - 例如 'area-line' / '面积折线图' / '分组柱状图' / 'line'
 * @returns {string|null}
 */
export function resolveEchartsType(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (REGISTERED_ECHARTS_TYPES.has(s)) return s
  const compact = compactKey(s)
  if (ALIAS_MAP.has(compact)) return ALIAS_MAP.get(compact)
  const lower = s.toLowerCase()
  for (const [re, t] of KEYWORD_RULES) if (re.test(lower)) return t
  return null
}

/**
 * 判定某个值是否**本来就是**合法 echarts series.type。
 * 注意：别名（'area-line'）一律判 false —— 它非法，必须被改写。
 * 真值块存在时，还要求与真值一致（fail-closed）。
 *
 * @param {string} type - 待校验的 series.type
 * @param {Object} [block] - 真值块（含 chartType 字段，允许是脏别名）
 * @returns {boolean}
 */
export function isValidEchartsType(type, block) {
  const s = String(type ?? '').trim()
  if (!REGISTERED_ECHARTS_TYPES.has(s)) return false
  const truth = resolveEchartsType(block && block.chartType)
  if (truth && truth !== s) return false
  return true
}

/**
 * 由 charts[] 真值构造「允许 type 集合」：每种 chart.type 经 resolveEchartsType 归一后的注册名。
 * 流量监测实锤（c6c228fb）：charts = [bar, bar, area] → 集合 {bar, line}（area 在 echarts 是 line + areaStyle）。
 * 调用点把该集合作为 `chartTypeSet` 传给守卫，即可**逐 series 互不覆盖**地收敛，
 * 杜绝「首图真值覆盖全文件」（T-01 根因，§15b.4）。
 *
 * @param {Array<{type?:string}>} charts - vision/Figma 的 charts[] 真值
 * @returns {Set<string>}
 */
export function buildChartTypeTruthSet(charts) {
  const set = new Set()
  if (Array.isArray(charts)) {
    for (const c of charts) {
      const t = resolveEchartsType(c && c.type)
      if (t) set.add(t)
    }
  }
  return set
}

/**
 * 把 option.series[].type 规范成合法 echarts 注册名。
 * - 已是注册名且与真值一致 → 保留
 * - 真值存在 → 真值优先（fail-closed）
 * - 真值缺失/非法 → 用别名归一结果
 * - 都无法识别 → 'line'（不臆造）
 *
 * 🛡️ 多图（chartTypeSet 模式，2026-09-14）：series.type 只需落在真值集内即合法，
 *    绝不用「首图真值」覆盖另一个 chart 的合法类型（T-01 治本，§15b.4）。
 *
 * @param {Object} option - echarts option（含 series）
 * @param {Object} [block] - 真值块（{ chartType?, chartTypeSet? }）
 * @returns {Object} 新 option（series.type 已规范化）
 */
export function normalizeChartOptionType(option, block) {
  if (!option || typeof option !== 'object') return option
  const truth = resolveEchartsType(block && block.chartType)
  const truthSet = block && block.chartTypeSet instanceof Set ? block.chartTypeSet : null
  // 🛡️ 多图模式：调用方传了真值集 → 启用逐 series 互不覆盖。
  const useSetMode = !!truthSet && truthSet.size > 0
  // 兜底自动判定（无显式集合时）：同 option.series 出现 ≥2 种注册名 → 禁用真值覆盖。
  const distinct = new Set(
    (Array.isArray(option.series) ? option.series : [])
      .map((s) => (s && typeof s === 'object' ? resolveEchartsType(s.type) : null))
      .filter(Boolean),
  )
  const multiChart = useSetMode || distinct.size >= 2
  const next = Array.isArray(option.series)
    ? option.series.map((s) => {
        if (!s || typeof s !== 'object') return s
        const raw = String(s.type ?? '').trim()
        const resolved = resolveEchartsType(raw)
        if (multiChart) {
          // 🛡️ 真值集模式：series.type 只需落在集内即合法，互不覆盖（T-01 治本，§15b.4）。
          // 避免「首图真值（bar）覆盖本应 area 的合法 line/area」——旧版核心危害。
          if (useSetMode && truthSet) {
            let chosen
            if (REGISTERED_ECHARTS_TYPES.has(raw) && truthSet.has(raw)) chosen = raw
            else if (resolved && truthSet.has(resolved)) chosen = resolved
            else chosen = truthSet.size ? truthSet.values().next().value : 'line'
            if (chosen === raw) return s
            return { ...s, type: chosen }
          }
          // 兜底：无显式集合时沿用旧多图逻辑（已合法/可归一一律保留，不可识别才用真值兜底）。
          const chosen = resolved || truth || 'line'
          if (chosen === raw) return s
          return { ...s, type: chosen }
        }
        if (REGISTERED_ECHARTS_TYPES.has(raw) && (!truth || truth === raw)) return s
        const chosen = truth || resolved || 'line'
        if (chosen === raw) return s
        return { ...s, type: chosen }
      })
    : option.series
  return { ...option, series: next }
}

// ───────────────────────── 文本级收敛（源码改写） ─────────────────────────

/** 跳过字符串字面量（含模板串）与注释，返回下一个可安全扫描的下标。 */
function skipNonCode(src, i) {
  const c = src[i]
  if (c === '"' || c === "'" || c === '`') {
    const quote = c
    i += 1
    while (i < src.length) {
      if (src[i] === '\\') {
        i += 2
        continue
      }
      if (src[i] === quote) return i + 1
      i += 1
    }
    return i
  }
  if (c === '/' && src[i + 1] === '/') {
    const nl = src.indexOf('\n', i)
    return nl === -1 ? src.length : nl
  }
  if (c === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2)
    return end === -1 ? src.length : end + 2
  }
  return i
}

/**
 * 从 openIdx（必须指向 open 字符）起做括号配平扫描，返回 [start, end) 区间。
 * 字符串/注释内的括号不计入。配平失败返回 null。
 *
 * @param {string} src
 * @param {number} openIdx
 * @param {string} [open]
 * @param {string} [close]
 * @returns {{start:number,end:number}|null}
 */
export function findBalancedSpan(src, openIdx, open = '[', close = ']') {
  let i = openIdx
  let depth = 0
  while (i < src.length) {
    const skipped = skipNonCode(src, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const c = src[i]
    if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return { start: openIdx, end: i + 1 }
    }
    i += 1
  }
  return null
}

/**
 * 定位源码中所有 `series: [ ... ]` 的**完整**数组区间（括号配平）。
 * 旧实现的 lazy 正则会停在第一个 `]`（例如 colorStops 的闭合），导致同一 series
 * 数组后半段逃过收敛（实锤 c-traffic-monitor-ppheeeem-9c86b889）。
 *
 * @param {string} src
 * @returns {Array<{start:number,end:number}>}
 */
export function findSeriesArraySpans(src) {
  const spans = []
  if (typeof src !== 'string' || !src) return spans
  let i = 0
  while (i < src.length) {
    const skipped = skipNonCode(src, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    // 快速预筛：只有 's' 开头才做正则切片（避免每个字符都 slice）
    if (src[i] === 's') {
      const m = /^series\s*:\s*\[/.exec(src.slice(i, i + 24))
      if (m) {
        const openIdx = i + m[0].length - 1
        const span = findBalancedSpan(src, openIdx)
        if (span) {
          spans.push(span)
          i = span.end
          continue
        }
      }
    }
    i += 1
  }
  return spans
}

/**
 * 只读扫描：收集源码中所有 series 顶层 type 经 `resolveEchartsType` 归一后的注册名集合。
 * 用于判定「多图互踩」——同一文件出现 ≥2 种不同注册名即视为多图，
 * 此时必须放弃「单一真值覆盖」，改为逐 series 别名归一 + 已合法注册名保留。
 */
function collectSeriesLegalTypes(src) {
  const set = new Set()
  const spans = findSeriesArraySpans(src)
  if (!spans.length) return set
  for (const sp of spans) {
    const slice = src.slice(sp.start, sp.end)
    let i = 0
    let bracket = 0
    let brace = 0
    while (i < slice.length) {
      const skipped = skipNonCode(slice, i)
      if (skipped !== i) {
        i = skipped
        continue
      }
      const c = slice[i]
      if (c === '[') {
        bracket += 1
        i += 1
        continue
      }
      if (c === ']') {
        bracket -= 1
        i += 1
        continue
      }
      if (c === '{') {
        brace += 1
        i += 1
        continue
      }
      if (c === '}') {
        brace -= 1
        i += 1
        continue
      }
      if (bracket === 1 && brace === 1) {
        const m = /^type\s*:\s*(['"])([^'"]*)\1/.exec(slice.slice(i, i + 200))
        if (m) {
          const r = resolveEchartsType(m[2].trim())
          if (r) set.add(r)
          i += m[0].length
          continue
        }
      }
      i += 1
    }
  }
  return set
}

/**
 * 判断一个 series 元素对象**顶层**是否携带饼/环图特征键（radius / center / startAngle 等）。
 * 真机实锤（c-traffic-monitor-6b803ab0 · ContentSection4）：环形图（doughnut）被 LLM 误写成
 * `type:'bar'` 但带着 `radius:['55%','75%']` / `center:['50%','50%']` 这类饼图特征字段。
 * echarts 把 `bar` 当 cartesian → 找不到 xAxis → 抛 `xAxis "0" not found` → mounted 崩溃（RUNTIME-004）。
 *
 * @param {string} elemText - 单个 series 元素文本（含外层 {}）
 * @returns {boolean}
 */
function hasPieFeatureKeys(elemText) {
  // 顶层键：radius / center / startAngle / roseType / clockwise / selectedMode 都是饼图族专属
  return /\b(radius|center|roseType|startAngle|clockwise|selectedMode)\s*:/.test(elemText)
}

/**
 * 仪表盘（gauge）特征键 —— radius/center/startAngle 同为 gauge 所用，是「饼图特征」唯一的
 * 潜在歧义来源。**仅供诊断/审计量化误伤面使用，不参与类型裁决**。
 *
 * @param {string} elemText - 单个 series 元素文本
 * @returns {boolean}
 */
function hasGaugeFeatureKeys(elemText) {
  return /\b(axisLine|splitNumber|pointer|progress|anchor)\s*:/.test(elemText)
}

/**
 * 只改 series 数组**元素对象第一层**的 `type` 键。
 * 深层（lineStyle.type / areaStyle.color.type / markLine…）一律不碰。
 *
 * 🛡️ 形状错配归一（2026-09-14 · RUNTIME-004 治本）：series 元素含饼图特征键
 * （radius/center/startAngle…）且 type 是 cartesian（bar/line 等）→ 归一成 `pie`
 * （echarts 中 doughnut = `pie` + `radius`，不是 `bar`）。否则 bar 找不到 xAxis 崩 `xAxis "0" not found`。
 * 此归一优先于真值集/单图真值覆盖：饼图特征是不可辩驳的「这是饼图」事实。
 *
 * @param {string} arrText - series 数组文本
 * @param {Object} [block] - 真值块（{ chartType, chartTypeSet? }）
 * @param {boolean} [multiChart] - 是否启用真值集模式（调用点传了 chartTypeSet）
 * @param {Set<string>|null} [truthSet] - 真值集（charts[] 归一后的注册名集合，如 {bar,line}）
 * @param {Array} [collector] - 诊断出口（可选）：逐 series 元素 push 一个口径样本，
 *   供审计器**复用同一口径**统计影响面/误伤面。传入即不产生任何行为副作用。
 */
function rewriteSeriesElementTypes(arrText, block, multiChart, truthSet, collector) {
  const truth = resolveEchartsType(block && block.chartType)
  let out = ''
  let i = 0
  let changed = 0
  let bracket = 0
  let brace = 0
  let elemStart = -1 // 🛡️ 当前顶层 series 元素的 `{` 起点（用于「只判当前元素」而非整个数组）
  while (i < arrText.length) {
    const skipped = skipNonCode(arrText, i)
    if (skipped !== i) {
      out += arrText.slice(i, skipped)
      i = skipped
      continue
    }
    const c = arrText[i]
    if (c === '[') {
      bracket += 1
      out += c
      i += 1
      continue
    }
    if (c === ']') {
      bracket -= 1
      out += c
      i += 1
      continue
    }
    if (c === '{') {
      if (bracket === 1 && brace === 0) elemStart = i // 仅记录顶层元素起点
      brace += 1
      out += c
      i += 1
      continue
    }
    if (c === '}') {
      brace -= 1
      out += c
      i += 1
      continue
    }
    if (bracket === 1 && brace === 1) {
      const m = /^type\s*:\s*(['"])([^'"]*)\1/.exec(arrText.slice(i, i + 200))
      if (m) {
        const raw = m[2].trim()
        const resolved = resolveEchartsType(raw)
        // 🛡️ 只对「当前元素文本」做饼图特征判定（findBalancedSpan 取完整元素切片），
        // 绝不传整个 series 数组——否则同数组内「饼图 + 柱/线图」混排时，柱图会被误归一成 pie。
        const elemSpan = elemStart >= 0 ? findBalancedSpan(arrText, elemStart, '{', '}') : null
        const elemText = elemSpan ? arrText.slice(elemSpan.start, elemSpan.end) : arrText
        if (collector) {
          collector.push({
            raw,
            resolved,
            hasPieFeatures: hasPieFeatureKeys(elemText),
            hasGaugeFeatures: hasGaugeFeatureKeys(elemText),
          })
        }
        let chosen
        // 🛡️ 形状错配归一（RUNTIME-004 治本）：饼图特征**优先于一切类型归一**，含真值集。
        // series 元素带 radius/center/startAngle 等饼图特征 → 恒为 pie（echarts doughnut = pie + radius）。
        //
        // 🔴 2026-09-29 治本（RUNTIME-004 第 3 次复发 · mc-max-1790666499312-afc4b0f2 实锤）：
        //    旧条件 `hasPieFeatureKeys(elemText) && resolved && resolved !== 'pie'` 把
        //    「raw 已是 pie」**排除在保护之外** —— 而 raw==='pie' 时不会命中下面任何分支的
        //    「保留」条件（`truthSet.has('pie')` 为假），只会被 fail-closed 到真值集首元素，
        //    于是守卫**主动把 LLM 写对的 pie 改写成 bar** ⇒ bar 是 cartesian ⇒
        //    找不到 xAxis ⇒ `xAxis "0" not found` ⇒ mounted 崩溃（RUNTIME-004 + VISUAL-002 硬 BLOCK）。
        //    触发前提很常见：vision 只识别出 N 张笛卡尔图、**漏掉环形图** ⇒
        //    `buildChartTypeTruthSet` 得 {bar,line}（不含 pie），而该文件恰有一张环形图。
        //    实测（同仓 .tmp-pie2bar.mjs）：真值集 {bar,line} ⇒ changed=1、终态 bar=1/pie=0；
        //    真值集含 pie 或为空集 ⇒ changed=0、终态 pie 保留。即**真值集把正确的饼图拉走了**。
        //    修法：饼图特征键是**不可辩驳的几何事实**，不做 raw/resolved 前置判定 ——
        //    恒 `chosen='pie'`（raw 已是 pie 时 chosen===raw ⇒ changed=0，等价「原样保留」，
        //    同时挡住真值集/单图真值/文件内自动判定三条把 pie 拉走的路径）。
        // 全语料审计（49480 .vue / 9537 含 series / 14860 series 元素 / 2910 带饼图特征）：
        //    raw=pie 2803（本次修复面）、bar 85、分组柱状图 22（本分支原有目标）；同时带 gauge 特征键 = 0 ⇒ 误伤 0。
        if (hasPieFeatureKeys(elemText)) {
          chosen = 'pie'
        } else if (multiChart && truthSet) {
          // 🛡️ 真值集模式（2026-09-14 · 流量监测 T-01 治本，§15b.4）：
          // 多图组件 series.type 只需落在真值集内即合法，**绝不用「首图真值」去覆盖**
          // 另一个 chart 的合法类型（这是旧版「chartsArr[0] 全文件覆盖」的核心危害：
          // 会主动把本应 area 的合法 line/area 改成首图 bar）。
          //   - 已合法注册名且落在集内 → 保留（互不覆盖）
          //   - 别名（area-line）→ 归一并查集，在集内才用归一结果
          //   - 完全不可识别的脏值 → fail-closed 到集首个元素，再不行落 'line'（不臆造）
          // 注：本模式只**消除守卫主动破坏**；若 LLM 已把 forecast 图写成 bar（c6c228fb 实锤），
          // 因 bar 也在真值集内，守卫不会改它——彻底按文件真值修复需 §16 StatefulSectionContract。
          if (REGISTERED_ECHARTS_TYPES.has(raw) && truthSet.has(raw)) {
            chosen = raw
          } else if (resolved && truthSet.has(resolved)) {
            chosen = resolved
          } else {
            chosen = truthSet.size ? truthSet.values().next().value : 'line'
          }
        } else {
          // 单图：保持 2.1.E「chartType 冻结进 block」语义——真值优先覆盖。
          const keepAsIs =
            REGISTERED_ECHARTS_TYPES.has(raw) && (!truth || truth === raw)
          chosen = keepAsIs ? raw : truth || resolved || 'line'
        }
        if (chosen !== raw) {
          changed += 1
          out += `type: '${chosen}'`
        } else {
          out += m[0]
        }
        i += m[0].length
        continue
      }
    }
    out += c
    i += 1
  }
  return { text: out, changed }
}

/** 上下文类型键的合法值与回退值（这些键上的非法值属于污染，必须修复）。 */
const NESTED_TYPE_RULES = {
  // echarts 颜色对象：linear / radial 渐变，以及 pattern 图案填充
  color: { allowed: new Set(['linear', 'radial', 'pattern']), fallback: 'linear' },
  lineStyle: { allowed: new Set(['solid', 'dashed', 'dotted']), fallback: 'solid' },
}

/**
 * 修复嵌套上下文里的非法 `type` 键：
 * - `color: { type: 'area-line', … }` → 'linear'（渐变必须 linear/radial）
 * - `lineStyle: { …, type: '分组柱状图' }` → 'solid'（线型非法值无意义，回默认实线）
 */
function repairNestedTypeKeys(text) {
  let out = ''
  let cursor = 0
  let changed = 0
  let i = 0
  while (i < text.length) {
    const skipped = skipNonCode(text, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const c = text[i]
    if (c === 'c' || c === 'l') {
      const m = /^(color|lineStyle)\s*:\s*\{/.exec(text.slice(i, i + 24))
      if (m) {
        const rule = NESTED_TYPE_RULES[m[1]]
        const braceIdx = i + m[0].length - 1
        const span = findBalancedSpan(text, braceIdx, '{', '}')
        if (span) {
          const body = text.slice(span.start, span.end)
          const fixed = body.replace(/type\s*:\s*(['"])([^'"]*)\1/g, (mm, q, v) => {
            if (rule.allowed.has(String(v).trim().toLowerCase())) return mm
            changed += 1
            return `type: ${q}${rule.fallback}${q}`
          })
          if (fixed !== body) {
            out += text.slice(cursor, span.start) + fixed
            cursor = span.end
          }
          i = span.end
          continue
        }
      }
    }
    i += 1
  }
  if (cursor === 0) return { text, changed: 0 }
  out += text.slice(cursor)
  return { text: out, changed }
}

/**
 * 对源码文本做 series 类型收敛（治本入口，供 mc / vue3 两条产线共用）。
 * 幂等：对已合规文本调用返回 changed = 0。
 *
 * 两种模式（§15b.4）：
 *  - 单图（默认）：`block.chartType` 单一真值，保持 2.1.E「chartType 冻结进 block」语义。
 *  - 多图真值集（推荐）：`block.chartTypeSet`（由 charts[] 构造的允许集）→ 逐 series 互不覆盖，
 *    杜绝「首图真值覆盖全文件」（T-01 根因）。调用点传 `buildChartTypeTruthSet(charts)`。
 *
 * @param {string} src - .vue 源码
 * @param {Object} [block] - 真值块（{ chartType?, chartTypeSet? }）
 * @returns {{text:string, changed:number}}
 */
/**
 * 判定多图：同一文件/源码里出现 ≥2 种不同 echarts 注册名（基于 series 顶层 type）。
 * 多图时 `normalizeSeriesInSource` 放弃「单一真值覆盖」，改为逐 series 别名归一，
 * 避免把 chart A 的真值 type 硬塞给 chart B（流量监测 c6c228fb 实锤：bar/bar/area 互踩）。
 */
export function isMultiChartSource(src) {
  const types = collectSeriesLegalTypes(src)
  return types.size >= 2
}

export function normalizeSeriesInSource(src, block, collector) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }
  const spans = findSeriesArraySpans(src)
  if (!spans.length) return { text: src, changed: 0 }
  // 🛡️ 多图真值集模式（2026-09-14 · 流量监测 T-01 治本，§15b.4）：
  // 调用方传了 charts[] 构造的 chartTypeSet → 启用逐 series 互不覆盖，
  // 禁用「首图真值覆盖全文件」。否则退回旧的「文件内分布自动判定」兜底（多图不覆盖）。
  const truthSet =
    block && block.chartTypeSet instanceof Set ? block.chartTypeSet : null
  const useSetMode = !!truthSet && truthSet.size > 0
  const multiChart = useSetMode || isMultiChartSource(src)
  let out = ''
  let cursor = 0
  let changed = 0
  for (const sp of spans) {
    out += src.slice(cursor, sp.start)
    const r1 = rewriteSeriesElementTypes(
      src.slice(sp.start, sp.end),
      block,
      multiChart,
      useSetMode ? truthSet : null,
      collector,
    )
    const r2 = repairNestedTypeKeys(r1.text)
    changed += r1.changed + r2.changed
    out += r2.text
    cursor = sp.end
  }
  out += src.slice(cursor)
  return { text: out, changed }
}

/**
 * 🛡️ 诊断/审计入口（2026-09-29 立）：列出源码里每个 series 元素的「类型口径样本」。
 *
 * 与 `normalizeSeriesInSource` **逐字同源**（同一 `findSeriesArraySpans` / 同一元素切分 /
 * 同一 `hasPieFeatureKeys` / 同一 `resolveEchartsType`），因此可用于回答：
 *  - 全语料里「带饼图特征键」的 series 元素有多少、raw type 分布如何；
 *  - 其中有多少同时带 gauge 特征键（`radius/center` 的唯一潜在歧义来源）⇒ 误伤面上界。
 *
 * @param {string} src - .vue 源码
 * @returns {Array<{raw:string,resolved:string|null,hasPieFeatures:boolean,hasGaugeFeatures:boolean}>}
 */
export function collectSeriesTypeSamples(src) {
  if (typeof src !== 'string' || !src) return []
  const collector = []
  // 只借用扫描轨；传入空真值块，避免诊断本身改变裁决路径。
  normalizeSeriesInSource(src, {}, collector)
  return collector
}

// ───────────────────────── 坐标轴格式守卫（Loop 2.1.F）────────────────────────
// 🛡️ 2026-09-11 立：根治 `xAxis "0" not found`（c-traffic-monitor-5nxelujp-1a29a03f）。
//
// 根因链（三层叠加）：
//   1. prompt 示例（chart-standards.md）用对象格式 `xAxis: { ... }` → LLM 跟随生成对象格式。
//   2. 后处理链只守 series.type（Loop 2.1.E），**完全不碰** xAxis/yAxis 格式 → 无归一化防线。
//   3. 对象格式 xAxis + markLine 值定位点（`{ yAxis: 3000 }`）在部分 ECharts 5.x 版本下
//      轴索引查询失败 → 抛 `xAxis "0" not found`；字符串索引 `xAxisIndex: '0'` 同样触发。
//
// 治本（fail-closed 三连，纯函数文本级）：
//   ① xAxis/yAxis 对象 → 数组（`xAxis: {` → `xAxis: [{`，括号配平闭合）。
//   ② series 顶层字符串索引 → 数字（`xAxisIndex: '0'` → `xAxisIndex: 0`）。
//   ③ cartesian series（bar/line/scatter…）缺索引 → 注入 `xAxisIndex: 0, yAxisIndex: 0`
//      （等价于显式化 ECharts 默认值，语义安全）。
//   ④ 顺带修复 JS formatter 内 `calc(@fontSize * N)` 泄漏（@fontSize 是 LESS 变量，
//      浏览器运行时无法解析 → 静默降级）→ 改 `calc(var(--fontSize, 14px) * N)`。

/** cartesian 坐标系系列类型：才需要 xAxisIndex/yAxisIndex（pie/radar/gauge 等不适用）。 */
export const CARTESIAN_SERIES_TYPES = new Set([
  'bar',
  'line',
  'scatter',
  'effectScatter',
  'candlestick',
  'boxplot',
  'pictorialBar',
  'lines',
  'heatmap',
])

/**
 * ① xAxis/yAxis 对象 → 数组。
 * 只匹配 `xAxis\s*:\s*{`（负向排除 xAxisIndex，因为 xAxis 后必须紧跟 :），
 * 括号配平后把 `{ ... }` 包成 `[{ ... }]`。已是数组 `xAxis: [` 不匹配，天然幂等。
 */
function normalizeAxisObjectToArray(src) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }
  let out = ''
  let cursor = 0
  let changed = 0
  let i = 0
  while (i < src.length) {
    const skipped = skipNonCode(src, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const c = src[i]
    if (c === 'x' || c === 'y') {
      const m = /^(xAxis|yAxis)\s*:\s*\{/.exec(src.slice(i, i + 32))
      if (m) {
        const braceIdx = i + m[0].length - 1
        const span = findBalancedSpan(src, braceIdx, '{', '}')
        if (span) {
          out += src.slice(cursor, span.start)
          out += '[{' + src.slice(span.start + 1, span.end - 1) + '}]'
          cursor = span.end
          changed += 1
          i = span.end
          continue
        }
      }
    }
    i += 1
  }
  if (cursor === 0) return { text: src, changed: 0 }
  out += src.slice(cursor)
  return { text: out, changed }
}

/**
 * 判断 out 末尾（跳过空白/行注释/块注释）最后一个有效字符是否为逗号。
 * 用于注入轴索引时复用元素末尾已有的尾逗号，避免 `data: [1,2], , xAxisIndex` 双逗号语法错误。
 */
function endsWithTrailingComma(out) {
  let i = out.length - 1
  while (i >= 0) {
    const c = out[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i -= 1
      continue
    }
    if (c === '/' && out[i - 1] === '/') {
      const nl = out.lastIndexOf('\n', i)
      if (nl === -1) return false
      i = nl - 1
      continue
    }
    if (c === '/' && out[i - 1] === '*') {
      const open = out.lastIndexOf('/*', i)
      if (open === -1) return false
      i = open - 1
      continue
    }
    return c === ','
  }
  return false
}

/**
 * 检测源码是否已声明 xAxis/yAxis（数组或对象形态）。无轴时给 series 注入 xAxisIndex/yAxisIndex
 * 是**无效补丁**——echarts 对缺轴 cartesian series 仍崩 `xAxis "0" not found`（真机实锤
 * c-traffic-monitor-6b803ab0）。注入索引只在「轴已存在」时有意义（消除字符串索引 / 显式化默认值）。
 *
 * @param {string} src - .vue 源码
 * @returns {boolean}
 */
function hasAxisDeclared(src) {
  if (typeof src !== 'string' || !src) return false
  return /(^|[^A-Za-z])xAxis\s*:/.test(src) || /(^|[^A-Za-z])yAxis\s*:/.test(src)
}

/**
 * ②③ series 数组内轴索引修正：字符串索引 → 数字 + cartesian 缺索引注入。
 * 用 bracket/brace 深度追踪定位「顶层元素」：只有 brace===1 && bracket===1 时
 * 才识别 type/xAxisIndex/yAxisIndex 键，嵌套对象（lineStyle 等）与嵌套数组（data）不误判。
 *
 * 🛡️ 无轴守卫（2026-09-14 · RUNTIME-004 收敛）：`hasAxis` 为 false 时**不注入**索引，
 * 因为缺轴 option 的崩溃根因是「没有轴对象」，注入索引是噪音且无效（治本在 2.1.E 形状归一）。
 *
 * @param {string} arrText - series 数组文本（形如 "[{...},{...}]"）
 * @param {boolean} [hasAxis] - 整个 option 是否声明了 xAxis/yAxis
 * @returns {{text:string, changed:number}}
 */
function rewriteSeriesAxisIndex(arrText, hasAxis = true) {
  let out = ''
  let i = 0
  let changed = 0
  let bracket = 0
  let brace = 0
  let elemType = null
  let elemHasXIndex = false
  let elemHasYIndex = false

  while (i < arrText.length) {
    const skipped = skipNonCode(arrText, i)
    if (skipped !== i) {
      out += arrText.slice(i, skipped)
      i = skipped
      continue
    }
    const c = arrText[i]

    if (c === '[') {
      bracket += 1
      out += c
      i += 1
      continue
    }
    if (c === ']') {
      bracket -= 1
      out += c
      i += 1
      continue
    }
    if (c === '{') {
      if (brace === 0 && bracket === 1) {
        elemType = null
        elemHasXIndex = false
        elemHasYIndex = false
      }
      brace += 1
      out += c
      i += 1
      continue
    }
    if (c === '}') {
      if (brace === 1 && bracket === 1) {
        const injections = []
        // 无轴守卫：option 未声明轴时不注入（缺轴崩溃靠 2.1.E 形状归一治本，注入索引无效）。
        if (hasAxis && CARTESIAN_SERIES_TYPES.has(elemType)) {
          if (!elemHasXIndex) injections.push('xAxisIndex: 0')
          if (!elemHasYIndex) injections.push('yAxisIndex: 0')
        }
        if (injections.length) {
          // 复用元素末尾已有尾逗号（及其后空格），避免 `data: [1,2], , xAxisIndex` 双逗号
          out += (endsWithTrailingComma(out) ? '' : ', ') + injections.join(', ')
          changed += 1
        }
      }
      brace -= 1
      out += c
      i += 1
      continue
    }

    if (brace === 1 && bracket === 1) {
      const rest = arrText.slice(i, i + 64)
      const typeM = /^type\s*:\s*['"]([^'"]*)['"]/.exec(rest)
      if (typeM) {
        elemType = resolveEchartsType(typeM[1])
        out += typeM[0]
        i += typeM[0].length
        continue
      }
      const xiM = /^xAxisIndex\s*:\s*(['"]?)([^,'"}]*)\1/.exec(rest)
      if (xiM) {
        elemHasXIndex = true
        if (xiM[1] === '"' || xiM[1] === "'") {
          out += `xAxisIndex: ${xiM[2]}`
          changed += 1
        } else {
          out += xiM[0]
        }
        i += xiM[0].length
        continue
      }
      const yiM = /^yAxisIndex\s*:\s*(['"]?)([^,'"}]*)\1/.exec(rest)
      if (yiM) {
        elemHasYIndex = true
        if (yiM[1] === '"' || yiM[1] === "'") {
          out += `yAxisIndex: ${yiM[2]}`
          changed += 1
        } else {
          out += yiM[0]
        }
        i += yiM[0].length
        continue
      }
    }

    out += c
    i += 1
  }

  return { text: out, changed }
}

/**
 * ④ JS formatter 内 `calc(@fontSize * N)` 泄漏修复。
 * @fontSize 是 LESS 变量，只在构建期 .less/.vue style 块生效；LLM 把它写进 JS 模板字符串
 * 的内联 style 后，浏览器无法解析 `calc(@fontSize * ...)` → 整条 font-size 声明被丢弃。
 * 改为 `calc(var(--fontSize, 14px) * ...)`（CSS 变量，tooltip 在 body 下时 fallback 14px）。
 */
function normalizeLessVarInJs(src) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }
  let changed = 0
  const text = src.replace(/calc\(\s*@(\w[\w-]*)\s*\*/g, (m, name) => {
    changed += 1
    return `calc(var(--${name}, 14px) *`
  })
  return { text, changed }
}

/**
 * 🛡️ 2026-09-29 治本（RUNTIME-004 第 2 次复发：`mc-max-1790666499312-afc4b0f2`
 *   与 `mc-max-1790667846995-b91b3c60` 同签名）：
 *   为「含笛卡尔 series 却缺 xAxis/yAxis 的 setOption 对象」补默认轴。
 *
 * 背景：`hasAxisDeclared` 守卫（2026-09-14）已正确地**不再**给缺轴 option 注入
 *   `xAxisIndex/yAxisIndex`（那是无效补丁），但它**也不补轴本身** ⇒ `type:'bar'` +
 *   无轴的 option 一路放行到运行期 → ECharts 抛 `xAxis "0" not found` → mounted 崩溃 →
 *   整页只剩错误页 → `RUNTIME-004 render-error` + `VISUAL-002 score≈0.12` → 硬 BLOCK。
 *   真机实锤：`afc4b0f2` 的 `CardGrid.vue` 写的是
 *   `chart.setOption({ tooltip:{…}, series:[{ type:'bar', … }] })`，
 *   全文 `xAxis` 出现 **0** 次（**LLM 原始缓存段也是 0 次** ⇒ 不是后处理删的）。
 *
 * 判据（保守，只在**同一个 option 对象字面量内**判定，避免误伤自定义/变量形态的轴）：
 *   ① 该 `setOption(` 的**第一个实参是对象字面量**（`{` 开头）；
 *   ② 对象**顶层**缺 `xAxis` / `yAxis`；
 *   ③ 对象顶层有 `series`，且 series 文本里出现**笛卡尔类型**（bar/line/… ）。
 *   ⇒ 在对象开头补 `xAxis: [{ type:'category', data: [] }]`（缺哪个补哪个）。
 *   ⚠️ 注入**数组形态**（不是对象形态）：与 ① `normalizeAxisObjectToArray` 的归一目标一致，
 *      否则本次注入的对象会在下一次调用时被 ① 再改一遍 ⇒ 幂等性被破坏（实测 changed 不为 0）。
 *
 * 不注入 `grid`：崩因是缺**轴**而非缺 grid，ECharts 有默认 grid ⇒ 保持最小改动。
 * 幂等：补过后顶层即存在对应键，二次调用零改动。
 * 已知未覆盖（有意保守）：`const option = {…}; chart.setOption(option)` 这类**变量实参**
 *   形态不处理 —— 盲扫全文件找「像 option 的对象」误伤面太大。
 *
 * @param {string} src - .vue 源码
 * @returns {{text:string, changed:number, injected:number}}
 */
function injectMissingCartesianAxes(src) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0, injected: 0 }

  const re = /\bsetOption\s*\(/g
  const edits = []
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    while (i < src.length && /\s/.test(src[i])) i += 1
    if (src[i] !== '{') continue

    const objStart = i
    let depth = 0
    let j = i
    let closed = false
    while (j < src.length) {
      const skipped = skipNonCode(src, j)
      if (skipped !== j) {
        j = skipped
        continue
      }
      const c = src[j]
      if (c === '{') depth += 1
      else if (c === '}') {
        depth -= 1
        if (depth === 0) {
          j += 1
          closed = true
          break
        }
      }
      j += 1
    }
    if (!closed) continue

    const info = scanOptionTopLevelKeys(src.slice(objStart, j))
    if (!info.hasSeries || !info.seriesHasCartesian) continue

    const inject = []
    if (!info.hasXAxis) inject.push("xAxis: [{ type: 'category', data: [] }]")
    if (!info.hasYAxis) inject.push("yAxis: [{ type: 'value' }]")
    if (!inject.length) continue

    edits.push({ at: objStart + 1, text: inject.join(', ') + ', ' })
  }

  if (!edits.length) return { text: src, changed: 0, injected: 0 }

  // 从后往前插入，避免前面的插入使后面的下标位移
  let out = src
  for (let k = edits.length - 1; k >= 0; k -= 1) {
    out = out.slice(0, edits[k].at) + edits[k].text + out.slice(edits[k].at)
  }
  return { text: out, changed: edits.length, injected: edits.length }
}

/**
 * 扫描 option 对象字面量文本，判定**顶层**是否声明 xAxis / yAxis / series，
 * 以及 series 里是否含笛卡尔类型。用 brace/bracket 深度追踪：只有 depth===1
 * 才是 option 的顶层键，嵌套对象（`tooltip: {…}`）与嵌套数组（`data: […]`）不误判。
 *
 * @param {string} objText - 形如 `{…}` 的 option 对象文本（首字符 '{'）
 * @returns {{hasXAxis:boolean, hasYAxis:boolean, hasSeries:boolean, seriesHasCartesian:boolean}}
 */
function scanOptionTopLevelKeys(objText) {
  const res = {
    hasXAxis: false,
    hasYAxis: false,
    hasSeries: false,
    seriesHasCartesian: false,
  }
  let i = 0
  let depth = 0
  while (i < objText.length) {
    const skipped = skipNonCode(objText, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const c = objText[i]
    if (c === '{' || c === '[') {
      depth += 1
      i += 1
      continue
    }
    if (c === '}' || c === ']') {
      depth -= 1
      i += 1
      continue
    }

    if (depth === 1) {
      const rest = objText.slice(i, i + 16)
      if (/^xAxis\s*:/.test(rest)) res.hasXAxis = true
      else if (/^yAxis\s*:/.test(rest)) res.hasYAxis = true
      else if (/^series\s*:/.test(rest)) {
        res.hasSeries = true
        // 定位 series 的值，若为数组则取出其文本判定类型
        let p = i + 'series'.length
        while (p < objText.length && /\s/.test(objText[p])) p += 1
        if (objText[p] === ':') {
          p += 1
          while (p < objText.length && /\s/.test(objText[p])) p += 1
          if (objText[p] === '[') {
            let d2 = 0
            let q = p
            while (q < objText.length) {
              const sk = skipNonCode(objText, q)
              if (sk !== q) {
                q = sk
                continue
              }
              if (objText[q] === '[') d2 += 1
              else if (objText[q] === ']') {
                d2 -= 1
                if (d2 === 0) {
                  q += 1
                  break
                }
              }
              q += 1
            }
            res.seriesHasCartesian = seriesHasCartesianType(objText.slice(p, q))
          }
        }
      }
    }
    i += 1
  }
  return res
}

/**
 * series 数组文本里是否出现笛卡尔类型（bar/line/scatter/… ）。
 * 只认**字符串字面量** type；`type: someVar` 一律不算（无法静态判定，宁漏不误伤）。
 * `lineStyle: { type: 'solid' }` 这类嵌套 type 因 'solid' 不在集合内天然不命中。
 *
 * @param {string} arrText - series 数组文本（形如 `[{…},{…}]`）
 * @returns {boolean}
 */
function seriesHasCartesianType(arrText) {
  if (typeof arrText !== 'string' || !arrText) return false
  const re = /type\s*:\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(arrText))) {
    if (CARTESIAN_SERIES_TYPES.has(resolveEchartsType(m[1]))) return true
  }
  return false
}

/**
 * 坐标轴格式守卫治本入口（供 mc / vue3 两条产线共用，与 Loop 2.1.E 并列）。
 * 幂等：对已合规源码二次调用 changed = 0。
 *
 * @param {string} src - .vue 源码
 * @returns {{text:string, changed:number, injectedAxisOptions:number}}
 */
export function normalizeChartAxesInSource(src) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }

  // ① 对象 → 数组
  const a = normalizeAxisObjectToArray(src)
  let text = a.text
  let changed = a.changed

  // ①-b 🛡️ 补齐缺失的笛卡尔默认轴（2026-09-29，RUNTIME-004 第 2 次复发）
  //   必须排在 ②③ 之前：补完轴后 `hasAxisDeclared` 才为 true，随后的轴索引注入才有意义。
  const ax = injectMissingCartesianAxes(text)
  changed += ax.changed
  text = ax.text

  // ②③ series 轴索引修正（无轴 option 不注入索引 → 消除无效补丁）
  const hasAxis = hasAxisDeclared(text)
  const spans = findSeriesArraySpans(text)
  if (spans.length) {
    let out = ''
    let cursor = 0
    for (const sp of spans) {
      out += text.slice(cursor, sp.start)
      const r = rewriteSeriesAxisIndex(text.slice(sp.start, sp.end), hasAxis)
      changed += r.changed
      out += r.text
      cursor = sp.end
    }
    out += text.slice(cursor)
    text = out
  }

  // ④ @fontSize 泄漏修复
  const l = normalizeLessVarInJs(text)
  changed += l.changed
  text = l.text

  return { text, changed, injectedAxisOptions: ax.injected }
}

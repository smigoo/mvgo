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
 * 把 option.series[].type 规范成合法 echarts 注册名。
 * - 已是注册名且与真值一致 → 保留
 * - 真值存在 → 真值优先（fail-closed）
 * - 真值缺失/非法 → 用别名归一结果
 * - 都无法识别 → 'line'（不臆造）
 *
 * @param {Object} option - echarts option（含 series）
 * @param {Object} [block] - 真值块
 * @returns {Object} 新 option（series.type 已规范化）
 */
export function normalizeChartOptionType(option, block) {
  if (!option || typeof option !== 'object') return option
  const truth = resolveEchartsType(block && block.chartType)
  const next = Array.isArray(option.series)
    ? option.series.map((s) => {
        if (!s || typeof s !== 'object') return s
        const raw = String(s.type ?? '').trim()
        if (REGISTERED_ECHARTS_TYPES.has(raw) && (!truth || truth === raw)) return s
        const chosen = truth || resolveEchartsType(raw) || 'line'
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
 * 只改 series 数组**元素对象第一层**的 `type` 键。
 * 深层（lineStyle.type / areaStyle.color.type / markLine…）一律不碰。
 */
function rewriteSeriesElementTypes(arrText, block) {
  const truth = resolveEchartsType(block && block.chartType)
  let out = ''
  let i = 0
  let changed = 0
  let bracket = 0
  let brace = 0
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
        const keepAsIs =
          REGISTERED_ECHARTS_TYPES.has(raw) && (!truth || truth === raw)
        const chosen = keepAsIs ? raw : truth || resolveEchartsType(raw) || 'line'
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
 * @param {string} src - .vue 源码
 * @param {Object} [block] - 真值块（{ chartType }）
 * @returns {{text:string, changed:number}}
 */
export function normalizeSeriesInSource(src, block) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }
  const spans = findSeriesArraySpans(src)
  if (!spans.length) return { text: src, changed: 0 }
  let out = ''
  let cursor = 0
  let changed = 0
  for (const sp of spans) {
    out += src.slice(cursor, sp.start)
    const r1 = rewriteSeriesElementTypes(src.slice(sp.start, sp.end), block)
    const r2 = repairNestedTypeKeys(r1.text)
    changed += r1.changed + r2.changed
    out += r2.text
    cursor = sp.end
  }
  out += src.slice(cursor)
  return { text: out, changed }
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
 * ②③ series 数组内轴索引修正：字符串索引 → 数字 + cartesian 缺索引注入。
 * 用 bracket/brace 深度追踪定位「顶层元素」：只有 brace===1 && bracket===1 时
 * 才识别 type/xAxisIndex/yAxisIndex 键，嵌套对象（lineStyle 等）与嵌套数组（data）不误判。
 *
 * @param {string} arrText - series 数组文本（形如 "[{...},{...}]"）
 * @returns {{text:string, changed:number}}
 */
function rewriteSeriesAxisIndex(arrText) {
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
        if (CARTESIAN_SERIES_TYPES.has(elemType)) {
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
 * 坐标轴格式守卫治本入口（供 mc / vue3 两条产线共用，与 Loop 2.1.E 并列）。
 * 幂等：对已合规源码二次调用 changed = 0。
 *
 * @param {string} src - .vue 源码
 * @returns {{text:string, changed:number}}
 */
export function normalizeChartAxesInSource(src) {
  if (typeof src !== 'string' || !src) return { text: src, changed: 0 }

  // ① 对象 → 数组
  const a = normalizeAxisObjectToArray(src)
  let text = a.text
  let changed = a.changed

  // ②③ series 轴索引修正
  const spans = findSeriesArraySpans(text)
  if (spans.length) {
    let out = ''
    let cursor = 0
    for (const sp of spans) {
      out += text.slice(cursor, sp.start)
      const r = rewriteSeriesAxisIndex(text.slice(sp.start, sp.end))
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

  return { text, changed }
}

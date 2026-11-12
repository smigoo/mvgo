/**
 * 📊 chart-spec（2026-10-08 · WP1）
 *
 * 职责分工铁律（用户拍板）：结构归 node（文本/绑定/顺序/外层几何/techstack），
 * **像素归 vision**（图表内层配色/渐变/图例形态/markLine 形态/立体感/轴样式）。
 * 本模块是 chartSpec 的确定性消费面：
 *   - validateChartSpec：对 vision 产出的 charts[] 做红线校验（缺字段/数据字段混入/
 *     文字色产出/跨图色板分歧/seriesTypes 缺失或长度不符），全部只产出 issues 留痕，
 *     不阻断、不修改（fail-open）。
 *   - scanChartTextColors：扫描产物中 echarts 文字色宿主块（textStyle/axisLabel/
 *     nameTextStyle）内的硬编码颜色字面量 —— 文字色必须走主题 CSS 变量
 *     （实锤 feb1f87a legend.textStyle #EDF4FB 暗色文字、5edb480b axisLabel 硬编码白）。
 *   - buildChartSpecPromptRules：微码线（prompt-builder）与 Vue3 线（vue3-prompt）
 *     共用的 chartSpec 消费规则文本（单一来源，禁止两线各写一份漂移）。
 *
 * 硬约束：零硬编码（无组件名/颜色/尺寸字面量）；不可辨返回空结果，绝不猜（宁缺勿造）；
 * 纯函数、无 IO、无副作用，可独立 jest 与离线 A/B。
 */

// ===== 配置常量（集中、可调、带注释；非组件相关硬编码）=====

/** 红线：这些键属于「数值/文本数据」，归 chartDataHints / node TEXT 单源，混入 chartSpec 即留痕 */
const DATA_KEY_BLACKLIST = new Set([
  'data', 'values', 'labels', 'xdata', 'ydata', 'ticks', 'categories', 'datalist',
])

/** 文字色宿主键（echarts 中这些块内的 color 是「文字颜色」，必须走主题变量） */
const TEXT_COLOR_HOST_RX = /\b(textStyle|axisLabel|nameTextStyle)\s*:\s*\{/g

/** 图表产物判定：文件内出现 echarts 初始化调用才扫描（fail-open：无图表零开销） */
const ECHARTS_INIT_RX = /echarts\.init\s*\(/;

/** 跨图色板一致性判定阈值：>=2 张图且两两 seriesColors 无交集时留痕提示 */
const PALETTE_DIVERGENCE_MIN_CHARTS = 2

/** 多系列图要求逐系列类型（5edb480b 实锤：治理率/回用率折线被写成 bar）的系列数阈值 */
const SERIES_TYPES_MIN_SERIES = 2

/** hex → hue 分桶用（跨图色板分歧比较），非颜色输出 */
function _hueBucket(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 1e-6) return 'gray'
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d + 6) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return Math.round((h * 60) / 30) // 12 桶 ×30°
}

function _normKey(k) {
  return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * 校验 vision 产出的 charts[]（chartSpec 红线，全部只留痕）。
 * @param {Array} charts - 视觉分析 charts[]（可能缺字段/畸形，逐项容错）
 * @returns {{checked:number, issues:Array<{kind:string, chart?:string, index?:number, detail:string}>}}
 */
export function validateChartSpec(charts) {
  const result = { checked: 0, issues: [] }
  if (!Array.isArray(charts) || charts.length === 0) return result

  for (let i = 0; i < charts.length; i++) {
    const c = charts[i]
    if (!c || typeof c !== 'object') continue
    result.checked += 1
    const label = String(c.section || c.title || `charts[${i}]`)

    // 红线 1：数值/文本数据字段混入 chartSpec（应归 chartDataHints / node TEXT）
    for (const key of Object.keys(c)) {
      if (DATA_KEY_BLACKLIST.has(_normKey(key)) && Array.isArray(c[key])) {
        result.issues.push({
          kind: 'data-keys-in-chartSpec',
          chart: label,
          index: i,
          detail: `chartSpec 混入数据字段 "${key}"（数值/文本数据归 chartDataHints / node TEXT 单源）`,
        })
      }
    }

    // 红线 2：文字色产出（文字色走主题 CSS 变量，chartSpec 不产）
    const textColorHits = []
    if (c.legendStyle && typeof c.legendStyle === 'object') {
      if (c.legendStyle.textColor) textColorHits.push('legendStyle.textColor')
    }
    for (const ax of ['x', 'y']) {
      const s = c.axisStyle?.[ax]
      if (s && typeof s === 'object' && (s.labelColor || s.textColor)) {
        textColorHits.push(`axisStyle.${ax}.labelColor`)
      }
    }
    if (textColorHits.length > 0) {
      result.issues.push({
        kind: 'text-color-in-chartSpec',
        chart: label,
        index: i,
        detail: `chartSpec 产出文字色（${textColorHits.join(', ')}）——文字色走主题变量，禁止随 chartSpec 下发`,
      })
    }

    // 留痕 3：有图例信号但缺系列色（schema 必填，缺 = vision 未产出像素事实）
    const hasLegendSignal = !!(c.legendPosition || c.legendType)
    const hasColors = Array.isArray(c.seriesColors) && c.seriesColors.length > 0
    if (hasLegendSignal && !hasColors) {
      result.issues.push({
        kind: 'missing-seriesColors',
        chart: label,
        index: i,
        detail: '有图例信号（legendPosition/legendType）但 seriesColors 为空 —— 配色将退化为 LLM 臆造',
      })
    }

    // 留痕 4：多系列图缺 seriesTypes（per-series 类型盲区 → 折线被写成柱，5edb480b 实锤）
    const seriesLen = Array.isArray(c.series) ? c.series.length : 0
    if (
      seriesLen >= SERIES_TYPES_MIN_SERIES &&
      (!Array.isArray(c.seriesTypes) || c.seriesTypes.length === 0)
    ) {
      result.issues.push({
        kind: 'missing-seriesTypes',
        chart: label,
        index: i,
        detail: `${seriesLen} 个系列但无 seriesTypes —— per-series 类型无法校验，折线可能被写成柱`,
      })
    } else if (
      Array.isArray(c.seriesTypes) &&
      seriesLen > 0 &&
      c.seriesTypes.length !== seriesLen
    ) {
      result.issues.push({
        kind: 'seriesTypes-length-mismatch',
        chart: label,
        index: i,
        detail: `seriesTypes(${c.seriesTypes.length}) 与 series(${seriesLen}) 数量不符 —— 顺序对应关系不可信，宁缺勿造`,
      })
    }
  }

  // 留痕 5：跨图色板分歧（同组件多图且两两无同 hue 桶色 → 提示确认是否应统一色板）
  const palettes = charts
    .filter((c) => c && Array.isArray(c.seriesColors) && c.seriesColors.length > 0)
    .map((c) => c.seriesColors)
  if (palettes.length >= PALETTE_DIVERGENCE_MIN_CHARTS) {
    const bucketSets = palettes.map((p) => {
      const set = new Set()
      for (const col of p) {
        const b = _hueBucket(col)
        if (b !== null) set.add(b)
      }
      return set
    })
    const allValid = bucketSets.every((s) => s.size > 0)
    let anyOverlap = false
    if (allValid) {
      for (let a = 0; a < bucketSets.length && !anyOverlap; a++) {
        for (let b = a + 1; b < bucketSets.length; b++) {
          for (const v of bucketSets[a]) {
            if (bucketSets[b].has(v)) { anyOverlap = true; break }
          }
          if (anyOverlap) break
        }
      }
    }
    if (allValid && !anyOverlap) {
      result.issues.push({
        kind: 'palette-divergent',
        detail: `${palettes.length} 张图的 seriesColors 两两无同色相色 —— 请确认跨图色板是否应统一（同组件多图通常共享色板）`,
      })
    }
  }

  return result
}

/**
 * 扫描产物中的 echarts 文字色硬编码（文字色必须走主题 CSS 变量）。
 * @param {Array<{path:string, content:string}>} files - 产物文件（与 section-content-guard 同形状）
 * @returns {{checked:number, violations:Array<{file:string, line:number, key:string, color:string, hint:string}>}}
 */
export function scanChartTextColors(files) {
  const result = { checked: 0, violations: [] }
  if (!Array.isArray(files)) return result

  for (const f of files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue
    if (!/\.(vue|js)$/.test(f.path)) continue
    if (!ECHARTS_INIT_RX.test(f.content)) continue // 无图表零开销（fail-open）
    result.checked += 1

    const lines = f.content.split('\n')
    // 行级状态机：进入文字色宿主块后，块内 color: '<字面量>' 即违规
    let host = null
    let depth = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (host) {
        const opens = (line.match(/\{/g) || []).length
        const closes = (line.match(/\}/g) || []).length
        const cm = /\bcolor\s*:\s*(['"])([^'"]+)\1/.exec(line)
        if (cm && !/^var\(/i.test(cm[2].trim())) {
          result.violations.push({
            file: f.path,
            line: i + 1,
            key: host,
            color: cm[2],
            hint: `echarts ${host} 内硬编码文字色（实锤 feb1f87a #EDF4FB 类暗色文字事故）—— 文字色必须走主题 CSS 变量`,
          })
        }
        depth += opens - closes
        if (depth <= 0) { host = null; depth = 0 }
        continue
      }
      TEXT_COLOR_HOST_RX.lastIndex = 0
      if (TEXT_COLOR_HOST_RX.test(line)) {
        const keyMatch = /\b(textStyle|axisLabel|nameTextStyle)\s*:/.exec(line)
        const key = keyMatch?.[1] || null
        if (key) {
          // 同行 color 只在宿主 key 之后的子串找，且 key 与 color 之间无先闭合的 }
          // （防把同行前方 axisLine.lineStyle.color 误记到 axisLabel 宿主）
          const after = line.slice(keyMatch.index)
          const cm = /\bcolor\s*:\s*(['"])([^'"]+)\1/.exec(after)
          if (cm && !/\}/.test(after.slice(0, cm.index)) && !/^var\(/i.test(cm[2].trim())) {
            result.violations.push({
              file: f.path,
              line: i + 1,
              key,
              color: cm[2],
              hint: `echarts ${key} 内硬编码文字色（实锤 feb1f87a #EDF4FB 类暗色文字事故）—— 文字色必须走主题 CSS 变量`,
            })
          }
          const opens = (line.match(/\{/g) || []).length
          const closes = (line.match(/\}/g) || []).length
          const d = opens - closes
          if (d > 0) { host = key; depth = d }
        }
      }
    }
  }
  return result
}

/**
 * chartSpec 消费规则（微码线 / Vue3 线共用文本，单一来源）。
 * @param {Object} [stats] - 可选统计 { chartCount }
 * @returns {string} 注入 prompt 的规则段落（charts 为空时返回空串，零开销）
 */
export function buildChartSpecPromptRules(stats = {}) {
  const n = Number(stats.chartCount) || 0
  if (n <= 0) return ''
  return `

## 🎨 chartSpec 像素事实消费规则（charts[] 权威，禁止臆造）

charts[] 中由视觉分析产出的像素事实字段是**权威配色/形态来源**，逐条执行：

1. **配色**：\`seriesColors\` 是各系列颜色的唯一来源，按系列顺序一一对应；**禁止**使用 echarts 默认色板或凭印象套用常见 UI 库配色——必须逐系列取自 \`seriesColors\`。
2. **per-series 类型**：\`seriesTypes\` 数组与 series 顺序一一对应（bar/line/pie/...）——**折线系列必须写 \`type:'line'\`**，禁止把折线写成柱（实锤：治理率/回用率折线被写成 bar）。\`smooth\`/\`symbol\`/\`lineStyle\` 等折线属性只能出现在 line 系列。
3. **渐变**：\`gradient\`（方向/起止透明度）按字段还原到对应系列的 areaStyle/itemStyle。
4. **柱形态**：\`barStyle\`（宽度比/间距比/圆角）映射到 \`barWidth\`/\`barGap\`/\`borderRadius\`。
5. **环厚**：\`pieStyle.innerRadiusRatio\` 映射到 \`radius: [内, 外]\` 数组（禁止默认单值）。
6. **轴样式**：\`axisStyle\`（轴线/分割线显隐、颜色、粗细、线型）映射到 axisLine/axisTick/splitLine；**轴标签/图例/任何文字的颜色一律走主题 CSS 变量**，禁止硬编码色值（实锤 feb1f87a legend 文字 #EDF4FB 对比度≈0）。
7. **图例形态**：\`legendStyle\`（icon 形状/相对大小）映射到 legend.icon/itemWidth/itemHeight；图例位置仍以 \`legendPosition\`/\`legendType\` 为准。
8. **阈值线**：\`markLine\` 的颜色/线型/\`width\` 映射到 markLine.lineStyle；markLine 文案与数值仍以 Figma TEXT 真值为准。
9. **数据值**：一律来自 Figma 文本真值（微码线的「图表数据提示」/ chartDataHints；当前 prompt 无该块时取设计稿 TEXT 真值）；chartSpec 中**没有也不允许有**数值/文本数据字段。
10. 字段缺省时按 echarts 默认渲染，**禁止自行臆造补齐**（宁缺勿造）。
`
}

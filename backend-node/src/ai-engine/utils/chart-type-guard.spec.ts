/**
 * Loop 2.1.E：chartType 冻结进 block，非法 series.type 拒收。
 * Figma/Manifest 无 pie → 装配/门禁拒绝 type:'pie'；option.series.type 必须是 echarts 注册名
 * （bar/line/pie/scatter…），不得是「分组柱状图」等中文别名。
 *
 * 🔴 2026-09-11 新增「真值洗白」回归：真值本身是非法别名时，收敛结果必须落注册名，
 * 且不得污染 series 内的嵌套 type 键（lineStyle.type / 渐变 type）。
 */
import {
  isValidEchartsType,
  normalizeChartOptionType,
  resolveEchartsType,
  normalizeSeriesInSource,
  normalizeChartAxesInSource,
  findSeriesArraySpans,
} from './chart-type-guard.js'

describe('Loop 2.1.E chartType 冻结 + 非法 series.type 拒收', () => {
  test('中文别名「分组柱状图」不是合法 echarts type', () => {
    expect(isValidEchartsType('分组柱状图')).toBe(false)
    expect(isValidEchartsType('柱状图')).toBe(false)
  })

  test('注册名 bar/line/pie 合法', () => {
    expect(isValidEchartsType('bar')).toBe(true)
    expect(isValidEchartsType('line')).toBe(true)
    expect(isValidEchartsType('pie')).toBe(true)
  })

  test('block 无 pie 真值 → 拒绝 type:pis 并标记为非法（fail-closed）', () => {
    const block = { id: 'sec-a', chartType: 'bar' }
    const illegal = 'pie'
    expect(isValidEchartsType(illegal, block)).toBe(false)
  })

  test('normalizeChartOptionType：把中文别名 + 无真值 → 回退到 block 真值 bar', () => {
    const block = { id: 'sec-hourly', chartType: 'bar' }
    const opt = { series: [{ type: '分组柱状图' }] }
    const out = normalizeChartOptionType(opt, block)
    expect(out.series[0].type).toBe('bar')
  })

  test('normalizeChartOptionType：block 无 chartType 且无注册 type → 默认 line（fail-closed 不臆造）', () => {
    const opt = { series: [{ type: '未知图' }] }
    const out = normalizeChartOptionType(opt, { id: 'sec-x' })
    expect(out.series[0].type).toBe('line')
  })

  test('合法 type 原样保留', () => {
    const out = normalizeChartOptionType({ series: [{ type: 'pie' }] }, { id: 'sec-p', chartType: 'pie' })
    expect(out.series[0].type).toBe('pie')
  })
})

describe('resolveEchartsType：任意脏值 → echarts 注册名', () => {
  test.each([
    ['area-line', 'line'],
    ['area-line'.toUpperCase(), 'line'],
    ['面积折线图', 'line'],
    ['折线图', 'line'],
    ['分组柱状图', 'bar'],
    ['双系列分组柱状图', 'bar'],
    ['堆叠柱状图', 'bar'],
    ['柱状图', 'bar'],
    ['环形图', 'pie'],
    ['饼图', 'pie'],
    ['雷达图', 'radar'],
    ['仪表盘', 'gauge'],
    ['line', 'line'],
    ['bar', 'bar'],
    ['effectScatter', 'effectScatter'],
    ['EFFECTSCATTER', 'effectScatter'],
  ])('resolveEchartsType(%s) → %s', (input, expected) => {
    expect(resolveEchartsType(input)).toBe(expected)
  })

  test('完全不可识别 → null（交由调用方 fail-closed）', () => {
    expect(resolveEchartsType('未知图')).toBeNull()
    expect(resolveEchartsType('')).toBeNull()
    expect(resolveEchartsType(undefined)).toBeNull()
  })

  test('未收录别名走关键词兜底（如「柱状对比图」→ bar）', () => {
    expect(resolveEchartsType('柱状对比图')).toBe('bar')
    expect(resolveEchartsType('面积对比图')).toBe('line')
  })
})

describe('🔴 真值洗白回归（mc-max-1789062564333-f1ff01eb 事故）', () => {
  test('真值自身是非法别名 area-line → 收敛结果必须是 line，不能是 area-line', () => {
    const out = normalizeChartOptionType(
      { series: [{ type: 'area-line' }] },
      { chartType: 'area-line' },
    )
    expect(out.series[0].type).toBe('line')
    expect(out.series[0].type).not.toBe('area-line')
  })

  test('真值自身是中文别名 分组柱状图 / 面积折线图 → 分别落 bar / line', () => {
    expect(
      normalizeChartOptionType({ series: [{ type: '分组柱状图' }] }, { chartType: '分组柱状图' })
        .series[0].type,
    ).toBe('bar')
    expect(
      normalizeChartOptionType({ series: [{ type: '面积折线图' }] }, { chartType: '面积折线图' })
        .series[0].type,
    ).toBe('line')
  })

  test('真值非法且值不可识别 → 仍落 line（绝不写回非法真值）', () => {
    const out = normalizeChartOptionType(
      { series: [{ type: '???' }] },
      { chartType: '???确实不认识' },
    )
    expect(out.series[0].type).toBe('line')
  })
})

/** 真实事故片段（c-traffic-monitor-ppheeeem-9c86b889/ChartsSection.vue 简写） */
const REAL_WORLD_SRC = `
<script setup>
import * as echarts from 'echarts'
const option = {
  xAxis: { type: 'category', data: ['0', '2'] },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'A',
      type: '分组柱状图',
      data: [1, 2],
      lineStyle: { color: '#1890ff', width: 2, type: '分组柱状图' },
      areaStyle: {
        color: {
          type: '分组柱状图',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }]
        }
      }
    },
    {
      name: 'B',
      type: 'line',
      data: [3, 4],
      lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
      areaStyle: {
        color: { type: 'linear', colorStops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }
      }
    }
  ]
}
</script>
`

describe('normalizeSeriesInSource：括号配平 + 只改元素顶层 type', () => {
  test('series 顶层非法 type 被收敛；嵌套 lineStyle.type / 渐变 type 不被污染', () => {
    const { text, changed } = normalizeSeriesInSource(REAL_WORLD_SRC, { chartType: 'bar' })
    expect(changed).toBeGreaterThan(0)
    // 顶层 series.type 收敛为真值 bar
    expect(text).toMatch(/name: 'A',\s*\n\s*type: 'bar'/)
    // 🔴 关键：lineStyle.type 是线型语义，绝不能被图表类型覆盖
    expect(text).toContain("lineStyle: { color: '#1890ff', width: 2, type: 'solid' }")
    expect(text).not.toContain("lineStyle: { color: '#1890ff', width: 2, type: 'bar' }")
    // 合法的 dashed 线型保持不变
    expect(text).toContain("lineStyle: { color: '#52c41a', width: 2, type: 'dashed' }")
    // 渐变 type 归一为 linear（非法值）而非图表类型
    expect(text).not.toMatch(/color:\s*\{\s*type: 'bar'/)
    expect(text.match(/type: 'linear'/g)?.length).toBe(2)
  })

  test('Lazy 正则漏段落回归：首个 series 含 colorStops 嵌套数组，第二段仍须被收敛', () => {
    const src = `
const option = { series: [
  { name: 'A', type: 'line', data: [1,2], areaStyle: { color: { type: 'linear', colorStops: [{ offset: 0, color: '#a' }] } } },
  { name: 'B', type: 'area-line', data: [3,4] }
] }`
    const { text } = normalizeSeriesInSource(src, { chartType: 'line' })
    // 第二段的 area-line 必须被收敛（旧 lazy 正则到不了这里）
    expect(text).not.toContain("type: 'area-line'")
  })

  test('无真值时按别名归一：area-line → line、面积折线图 → line', () => {
    const src = "const o = { series: [{ type: 'area-line' }, { type: '面积折线图' }] }"
    const { text, changed } = normalizeSeriesInSource(src, {})
    expect(changed).toBe(2)
    expect(text).toBe("const o = { series: [{ type: 'line' }, { type: 'line' }] }")
  })

  test('幂等：对已合规源码二次调用 changed = 0', () => {
    const first = normalizeSeriesInSource(REAL_WORLD_SRC, { chartType: 'bar' })
    const second = normalizeSeriesInSource(first.text, { chartType: 'bar' })
    expect(second.changed).toBe(0)
    expect(second.text).toBe(first.text)
  })

  test('不误伤：注释与字符串里的 series/type 不被改写', () => {
    const src = `// series: [ { type: '乱写' } ]
const s = "series: [ { type: '乱写' } ]"
const o = { series: [{ type: 'line', data: [1, 2, 3] }] }`
    const { text, changed } = normalizeSeriesInSource(src, { chartType: 'line' })
    expect(changed).toBe(0)
    expect(text).toBe(src)
  })

  test('带命名 series 的 Vue SFC：echarts option 被正确收敛', () => {
    const src = `<script setup>
const option = { series: [{ name: 'zk3+785CO浓度', type: 'area-line', data: [1, 2] }] }
chart.setOption(option, true)
</script>`
    const { text } = normalizeSeriesInSource(src, { chartType: 'area-line' })
    expect(text).toContain("type: 'line'")
    expect(text).not.toContain('area-line')
  })
})

describe('findSeriesArraySpans：括号配平', () => {
  test('嵌套数组不会截断 span', () => {
    const src = "series: [{ a: [1, 2], b: { c: [3] } }, { d: 1 }]"
    const spans = findSeriesArraySpans(src)
    expect(spans).toHaveLength(1)
    expect(src.slice(spans[0].start, spans[0].end)).toBe(
      "[{ a: [1, 2], b: { c: [3] } }, { d: 1 }]",
    )
  })

  test('无 series 时返回空数组', () => {
    expect(findSeriesArraySpans('const a = 1')).toEqual([])
  })
})

/** 真实事故片段（c-traffic-monitor-5nxelujp-1a29a03f/HourlyChartBridge.vue 简写） */
const AXIS_BUG_SRC = `
<script setup>
import * as echarts from 'echarts'
const option = {
  xAxis: { type: 'category', data: ['2', '4'], name: '时' },
  yAxis: { type: 'value', min: 0, max: 4000 },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: [120, 180],
      markLine: { data: [{ yAxis: 3000, name: '建议分流' }] }
    },
    { name: '上海方向', type: 'bar', data: [100, 160] }
  ]
}
chart.setOption(option, true)
</script>
`

describe('normalizeChartAxesInSource：坐标轴格式守卫（Loop 2.1.F）', () => {
  test('对象格式 xAxis/yAxis → 数组格式（根治 xAxis "0" not found）', () => {
    const { text, changed } = normalizeChartAxesInSource(AXIS_BUG_SRC)
    expect(changed).toBeGreaterThan(0)
    expect(text).toContain('xAxis: [{ type:')
    expect(text).toContain('yAxis: [{ type:')
    expect(text).not.toMatch(/xAxis:\s*\{\s*type:/)
    expect(text).not.toMatch(/yAxis:\s*\{\s*type:/)
  })

  test('cartesian series（bar）注入显式 xAxisIndex/yAxisIndex', () => {
    const { text } = normalizeChartAxesInSource(AXIS_BUG_SRC)
    expect(text).toContain("name: '北京方向',")
    // 两个 bar series 都应注入 xAxisIndex: 0, yAxisIndex: 0
    expect((text.match(/xAxisIndex: 0/g) || []).length).toBe(2)
    expect((text.match(/yAxisIndex: 0/g) || []).length).toBe(2)
  })

  test('字符串索引 xAxisIndex: "0" → 数字 0', () => {
    const src = "const o = { xAxis: [{ type: 'category' }], series: [{ type: 'line', xAxisIndex: '0', yAxisIndex: '0' }] }"
    const { text, changed } = normalizeChartAxesInSource(src)
    expect(changed).toBeGreaterThan(0)
    expect(text).toContain('xAxisIndex: 0, yAxisIndex: 0')
    expect(text).not.toContain("xAxisIndex: '0'")
  })

  test('pie 系列不注入 xAxisIndex/yAxisIndex（非 cartesian）', () => {
    const src = "const o = { series: [{ type: 'pie', data: [{ value: 1, name: 'a' }] }] }"
    const { text, changed } = normalizeChartAxesInSource(src)
    // pie 无 xAxis/yAxis 也无 @fontSize → 完全无变化
    expect(changed).toBe(0)
    expect(text).toBe(src)
  })

  test('@fontSize 泄漏 → var(--fontSize, 14px)', () => {
    const src = "const fmt = `<div style=\"font-size: calc(@fontSize * 0.8571);\">x</div>`"
    const { text, changed } = normalizeChartAxesInSource(src)
    expect(changed).toBeGreaterThan(0)
    expect(text).toContain('calc(var(--fontSize, 14px) * 0.8571)')
    expect(text).not.toContain('calc(@fontSize')
  })

  test('已是数组格式 + 显式索引 → 幂等 changed = 0', () => {
    const src = "const o = { xAxis: [{ type: 'category' }], yAxis: [{ type: 'value' }], series: [{ type: 'line', xAxisIndex: 0, yAxisIndex: 0 }] }"
    const { text, changed } = normalizeChartAxesInSource(src)
    expect(changed).toBe(0)
    expect(text).toBe(src)
  })

  test('不误伤字符串/注释里的 xAxis/series', () => {
    const src = `// xAxis: { type: 'category' }
const s = "xAxis: { type: 'category' }"
const o = { xAxis: [{ type: 'category' }], series: [{ type: 'line', xAxisIndex: 0, yAxisIndex: 0 }] }`
    const { text, changed } = normalizeChartAxesInSource(src)
    expect(changed).toBe(0)
    expect(text).toBe(src)
  })

  test('xAxisIndex 键不被误当作 xAxis 对象转换', () => {
    const src = "const o = { xAxis: [{ type: 'category' }], series: [{ type: 'line', xAxisIndex: 1, yAxisIndex: 0 }] }"
    const { text, changed } = normalizeChartAxesInSource(src)
    // xAxisIndex: 1 是已有索引（数字），不注入也不转换；xAxis 已是数组不转换 → 无变化
    expect(changed).toBe(0)
    expect(text).toBe(src)
  })

  test('series 元素末尾有尾逗号 → 复用尾逗号，不产生双逗号（语法安全）', () => {
    const src = "const o = { xAxis: [{ type: 'category' }], series: [{ type: 'line', data: [1, 2], }] }"
    const { text } = normalizeChartAxesInSource(src)
    expect(text).not.toMatch(/,\s*,/)
    expect(text).toContain('xAxisIndex: 0')
    expect(text).toContain('yAxisIndex: 0')
    // 注入后 `data: [1, 2], xAxisIndex: 0, yAxisIndex: 0` 恰好一次逗号分隔
    expect(text).toContain('data: [1, 2], xAxisIndex: 0, yAxisIndex: 0')
  })
})

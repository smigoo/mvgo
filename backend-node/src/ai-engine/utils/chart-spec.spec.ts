import { validateChartSpec, scanChartTextColors, buildChartSpecPromptRules } from './chart-spec.js'

describe('validateChartSpec · chartSpec 红线校验（全留痕 fail-open）', () => {
  it('空/非数组输入：fail-open 返回空结果', () => {
    expect(validateChartSpec([])).toEqual({ checked: 0, issues: [] })
    expect(validateChartSpec(null as any)).toEqual({ checked: 0, issues: [] })
    expect(validateChartSpec(undefined as any)).toEqual({ checked: 0, issues: [] })
  })

  it('正常完备 chartSpec：0 issues', () => {
    const r = validateChartSpec([
      {
        section: 'chart-a',
        series: ['北京方向', '上海方向'],
        seriesTypes: ['bar', 'bar'],
        seriesColors: ['#1e5eff', '#00e5ff'],
        legendPosition: 'top-right',
        legendType: 'horizontal',
      },
    ])
    expect(r.checked).toBe(1)
    expect(r.issues).toHaveLength(0)
  })

  it('红线：数值/文本数据字段混入 chartSpec（data/labels/values）→ data-keys-in-chartSpec', () => {
    const r = validateChartSpec([
      { section: 'a', series: ['x'], seriesTypes: ['bar'], seriesColors: ['#123456'], data: [1, 2, 3] },
      { section: 'b', series: ['x'], seriesTypes: ['bar'], seriesColors: ['#123456'], Labels: ['a'] },
    ] as any)
    const kinds = r.issues.map((i) => i.kind)
    expect(kinds).toContain('data-keys-in-chartSpec')
    expect(kinds).not.toContain('seriesTypes-length-mismatch')
  })

  it('红线：chartSpec 产出文字色 → text-color-in-chartSpec（feb1f87a 教训）', () => {
    const r = validateChartSpec([
      {
        section: 'a',
        series: ['x'],
        seriesTypes: ['bar'],
        seriesColors: ['#123456'],
        legendStyle: { icon: 'roundRect', textColor: '#ffffff' },
        axisStyle: { x: { show: true, labelColor: '#333333' } },
      },
    ] as any)
    expect(r.issues.filter((i) => i.kind === 'text-color-in-chartSpec')).toHaveLength(1)
    const detail = r.issues.find((i) => i.kind === 'text-color-in-chartSpec')!.detail
    expect(detail).toContain('legendStyle.textColor')
    expect(detail).toContain('axisStyle.x.labelColor')
  })

  it('有图例信号但缺 seriesColors → missing-seriesColors（配色退化为臆造）', () => {
    const r = validateChartSpec([{ section: 'a', series: ['x'], legendPosition: 'top-right', legendType: 'horizontal' }])
    expect(r.issues.map((i) => i.kind)).toContain('missing-seriesColors')
  })

  it('多系列缺 seriesTypes → missing-seriesTypes（5edb480b 折线变柱盲区）', () => {
    const r = validateChartSpec([
      { section: 'a', series: ['去年10月', '10月', '治理率', '回用率'], seriesColors: ['#1', '#2', '#3', '#4'] },
    ] as any)
    expect(r.issues.map((i) => i.kind)).toContain('missing-seriesTypes')
  })

  it('seriesTypes 与 series 数量不符 → seriesTypes-length-mismatch（宁缺勿造）', () => {
    const r = validateChartSpec([
      { section: 'a', series: ['a', 'b', 'c'], seriesTypes: ['bar', 'line'] } as any,
    ])
    expect(r.issues.map((i) => i.kind)).toContain('seriesTypes-length-mismatch')
  })

  it('跨图色板分歧（两图 hue 两两无交集）→ palette-divergent；有交集则不判', () => {
    const divergent = validateChartSpec([
      { section: 'a', series: ['x'], seriesTypes: ['bar'], seriesColors: ['#ff0000', '#ff4040'] },
      { section: 'b', series: ['y'], seriesTypes: ['bar'], seriesColors: ['#00ff00', '#40ff40'] },
    ] as any)
    expect(divergent.issues.map((i) => i.kind)).toContain('palette-divergent')

    const consistent = validateChartSpec([
      { section: 'a', series: ['x'], seriesTypes: ['bar'], seriesColors: ['#1e5eff', '#00e5ff'] },
      { section: 'b', series: ['y'], seriesTypes: ['bar'], seriesColors: ['#1e5eff', '#37ff9b'] },
    ] as any)
    expect(consistent.issues.map((i) => i.kind)).not.toContain('palette-divergent')
  })
})

describe('scanChartTextColors · echarts 文字色硬编码扫描（产物留痕）', () => {
  const mk = (content: string) => [{ path: 'package/components/ChartSection.vue', content }]

  it('feb1f87a 阳性对照：legend.textStyle 多行块硬编码 rgba → 命中', () => {
    const src = `import * as echarts from 'echarts'
const chart = echarts.init(el)
option = {
  legend: {
    textStyle: {
      color: 'rgba(237,244,251,1)'
    }
  }
}`
    const r = scanChartTextColors(mk(src) as any)
    expect(r.checked).toBe(1)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].key).toBe('textStyle')
    expect(r.violations[0].color).toBe('rgba(237,244,251,1)')
    expect(r.violations[0].line).toBe(6)
  })

  it('5edb480b 阳性对照：axisLabel 同行硬编码 → 命中；nameTextStyle 亦命中', () => {
    const src = `import * as echarts from 'echarts'
echarts.init(el)
option = {
  xAxis: [{ axisLabel: { show: true, color: 'rgba(255,255,255,0.85)' } }],
  yAxis: [{ nameTextStyle: { color: 'rgba(255,255,255,0.65)' } }]
}`
    const r = scanChartTextColors(mk(src) as any)
    expect(r.violations.map((v) => v.key).sort()).toEqual(['axisLabel', 'nameTextStyle'])
  })

  it('var() 主题变量文字色 / itemStyle 数据色 / 轴线色 → 不命中', () => {
    const src = `import * as echarts from 'echarts'
echarts.init(el)
option = {
  legend: { textStyle: { color: 'var(--color-text-base, #fff)' } },
  series: [{ type: 'bar', itemStyle: { color: '#18c02e' }, lineStyle: { width: 2, color: '#2196f3' } }],
  xAxis: [{ axisLine: { lineStyle: { color: 'rgba(24,255,206,0.25)' } }, axisLabel: { color: 'var(--color-text-secondary, #ccc)' } }]
}`
    const r = scanChartTextColors(mk(src) as any)
    expect(r.violations).toHaveLength(0)
  })

  it('tooltip.textStyle.color 硬编码 → 命中', () => {
    const src = `import * as echarts from 'echarts'
echarts.init(el)
option = { tooltip: { textStyle: { color: '#333333' } } }`
    const r = scanChartTextColors(mk(src) as any)
    expect(r.violations).toHaveLength(1)
  })

  it('无 echarts.init 的文件零开销跳过；非 vue/js 跳过；畸形项容错', () => {
    const files = [
      { path: 'package/components/Plain.vue', content: "legend: { textStyle: { color: '#333' } }" },
      { path: 'package/resources/styles/index.css', content: "color: '#333'" },
      { path: 'x.vue' },
      null,
    ] as any
    const r = scanChartTextColors(files)
    expect(r.checked).toBe(0)
    expect(r.violations).toHaveLength(0)
  })
})

describe('buildChartSpecPromptRules · 双线共用规则文本（单一来源）', () => {
  it('无图表 → 空串（零开销）', () => {
    expect(buildChartSpecPromptRules({ chartCount: 0 })).toBe('')
    expect(buildChartSpecPromptRules({})).toBe('')
  })

  it('有图表 → 含 per-series 类型/配色/文字色主题变量/宁缺勿造四要素', () => {
    const s = buildChartSpecPromptRules({ chartCount: 2 })
    expect(s).toContain('seriesTypes')
    expect(s).toContain('seriesColors')
    expect(s).toContain('主题 CSS 变量')
    expect(s).toContain('宁缺勿造')
  })
})

import { checkEchartsInitTiming, checkEchartsResizeListener } from './echarts-init-guard.js'

/**
 * echarts-init-guard 单元测试：AST 结构分析识别「同步 init」vs「延迟/守卫上下文」。
 *
 * 背景：CODE-011 原用正则枚举延迟写法，模型每多一种等价写法就硬编码一个分支。
 * 本测试覆盖多种等价延迟写法 + 同步 init 反例 + 解析失败兜底。
 */

const cases: Array<{ name: string; code: string; expectSync: boolean }> = [
  {
    name: '同步 init（onMounted 直接调用）→ BLOCK',
    code: `onMounted(() => { echarts.init(chartRef.value) })`,
    expectSync: true,
  },
  {
    name: 'nextTick 回调内 init → 放行',
    code: `onMounted(() => { nextTick(() => { echarts.init(chartRef.value) }) })`,
    expectSync: false,
  },
  {
    name: 'await nextTick() 后 init → 放行',
    code: `onMounted(async () => { await nextTick(); echarts.init(chartRef.value) })`,
    expectSync: false,
  },
  {
    name: 'requestAnimationFrame → 放行',
    code: `onMounted(() => { requestAnimationFrame(() => echarts.init(chartRef.value)) })`,
    expectSync: false,
  },
  {
    name: 'setTimeout → 放行',
    code: `onMounted(() => { setTimeout(() => echarts.init(chartRef.value), 50) })`,
    expectSync: false,
  },
  {
    name: '尺寸守卫（clientWidth>0）→ 放行',
    code: `onMounted(() => { if (chartRef.value.clientWidth > 0) { echarts.init(chartRef.value) } })`,
    expectSync: false,
  },
  {
    name: 'new ResizeObserver 回调内 init → 放行',
    code: `onMounted(() => { new ResizeObserver(() => { echarts.init(chartRef.value) }).observe(el) })`,
    expectSync: false,
  },
  {
    name: 'watch 回调内 init → 放行',
    code: `watch(chartRef, (r) => { if (r) echarts.init(r) })`,
    expectSync: false,
  },
  {
    name: '跨函数：initChart 包装 + nextTick 调用点 → 放行',
    code: `const initChart = () => { echarts.init(chartRef.value) }
onMounted(() => { nextTick(() => { initChart() }) })`,
    expectSync: false,
  },
  {
    name: '跨函数：initChart 包装 + await 调用点 → 放行',
    code: `const initChart = () => { echarts.init(chartRef.value) }
onMounted(async () => { await nextTick(); initChart() })`,
    expectSync: false,
  },
  {
    name: '跨函数：initChart 同步调用点 → BLOCK',
    code: `const initChart = () => { echarts.init(chartRef.value) }
onMounted(() => { initChart() })`,
    expectSync: true,
  },
  {
    name: '尺寸守卫 + ResizeObserver 组合（今日事故）→ 放行',
    code: `const initChart = () => {
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    return
  }
  new ResizeObserver((entries) => {
    if (width > 0 && height > 0 && !chart) { chart = echarts.init(chartRef.value) }
  }).observe(chartRef.value)
}
onMounted(() => { initChart() })`,
    expectSync: false,
  },
  {
    name: '惰性守卫 + 延迟调用点 + 同步 refresh 调用点（17:00 事故）→ 放行',
    code: `const renderChart = async () => {
  if (!chartRef.value) return
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption({})
}
const handleRefresh = () => renderChart()
onMounted(async () => { await nextTick(); await renderChart() })`,
    expectSync: false,
  },
  {
    name: '惰性守卫但所有调用点同步（无延迟调用点）→ BLOCK',
    code: `const renderChart = () => {
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption({})
}
onMounted(() => { renderChart() })`,
    expectSync: true,
  },
]

describe('echarts-init-guard AST 结构分析', () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = checkEchartsInitTiming(c.code)
      expect(r.hasSyncInit).toBe(c.expectSync)
    })
  }

  it('语法错误（解析失败）→ 兜底不 BLOCK', () => {
    const r = checkEchartsInitTiming(`const x = { invalid syntax !!!`)
    expect(r.hasSyncInit).toBe(false)
    expect(r.reason).toBe('parse-failed')
  })

  it('无 echarts.init → 无同步 init', () => {
    const r = checkEchartsInitTiming(`const a = 1`)
    expect(r.hasSyncInit).toBe(false)
    expect(r.syncInitCount).toBe(0)
  })
})

describe('checkEchartsResizeListener AST 检测（漏检不误杀）', () => {
  const resizeCases: Array<{ name: string; code: string; expectHas: boolean }> = [
    { name: 'chart.resize() 调用', code: `onMounted(() => { chart.resize() })`, expectHas: true },
    { name: 'new ResizeObserver 构造', code: `new ResizeObserver(() => chart.resize()).observe(el)`, expectHas: true },
    { name: 'addEventListener resize', code: `window.addEventListener('resize', () => chart.resize())`, expectHas: true },
    { name: 'window.onresize 赋值（旧正则会误杀）', code: `window.onresize = () => chart.resize()`, expectHas: true },
    { name: '无任何 resize 信号 → BLOCK', code: `onMounted(() => { echarts.init(x) })`, expectHas: false },
  ]

  for (const c of resizeCases) {
    it(c.name, () => {
      const r = checkEchartsResizeListener(c.code)
      expect(r.hasResizeListener).toBe(c.expectHas)
    })
  }

  it('语法错误 → 兜底放行（宁漏勿杀）', () => {
    const r = checkEchartsResizeListener(`const x = { invalid !!!`)
    expect(r.hasResizeListener).toBe(true)
    expect(r.reason).toBe('parse-failed')
  })
})

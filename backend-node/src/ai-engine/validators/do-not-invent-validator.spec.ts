import { validateDoNotInvent, extractForbiddenPairs, countChartSeries, countDataPoints, extractSnippet } from './do-not-invent-validator.js'

describe('do-not-invent-validator', () => {
  it('放行：无文件直接 pass', () => {
    expect(validateDoNotInvent({ files: {}, analysis: {} }).pass).toBe(true)
  })

  // ── 核心文案篡改（BLOCK 级）──
  it('BLOCK：核心文案篡改（一氧化碳→二氧化碳）阻止发布', () => {
    const files = { 'package/index.vue': `<template><div>二氧化碳浓度</div></template>` }
    const res = validateDoNotInvent({ files, analysis: { doNotInvent: ['不要将一氧化碳写成二氧化碳'] } })
    expect(res.pass).toBe(false) // BLOCK 阻断
    expect(res.blockCount).toBe(1)
    const issue = res.issues.find(i => i.id === 'DO-NOT-INVENT-TEXT')
    expect(issue).toBeDefined()
    expect(issue.severity).toBe('BLOCK')
  })

  it('放行：组件声明 doNotInvent 但生成保留原词（一氧化碳）不算篡改', () => {
    const files = { 'package/index.vue': `<template><div>一氧化碳浓度</div></template>` }
    const res = validateDoNotInvent({ files, analysis: { doNotInvent: ['不要将一氧化碳写成二氧化碳'] } })
    expect(res.pass).toBe(true)
  })

  it('BLOCK 时 issue 包含 snippet 字段', () => {
    const files = { 'package/index.vue': `<template><div class="stat">二氧化碳 12ppm</div></template>` }
    const res = validateDoNotInvent({ files, analysis: { doNotInvent: ['不要将一氧化碳写成二氧化碳'] } })
    expect(res.pass).toBe(false)
    const issue = res.issues.find(i => i.id === 'DO-NOT-INVENT-TEXT')
    expect(issue.snippet).toBeDefined()
    expect(issue.snippet).toContain('二氧化碳')
  })

  // ── 图表系列膨胀（WARN 级）──
  it('WARN：单系列图表被扩写成多系列（提示不阻断）', () => {
    const files = {
      'package/index.vue': `<template><div ref="c"></div></template><script setup>
const option = { series: [{ name: '入口' }, { name: '出口' }] }
</script>`,
    }
    const res = validateDoNotInvent({ files, analysis: { charts: [{ type: 'line' }] } })
    expect(res.pass).toBe(true) // WARN 不阻断
    const issue = res.issues.find(i => i.id === 'DO-NOT-INVENT-CHART')
    expect(issue).toBeDefined()
    expect(issue.severity).toBe('WARN')
  })

  it('放行：单系列且生成也是单系列', () => {
    const files = {
      'package/index.vue': `<template><div ref="c"></div></template><script setup>
const option = { series: [{ name: '浓度' }] }
</script>`,
    }
    const res = validateDoNotInvent({ files, analysis: { charts: [{ type: 'line' }] } })
    expect(res.pass).toBe(true)
  })

  // ── 数据点膨胀（WARN 级）──
  it('WARN：数据点膨胀超过 1.5 倍', () => {
    const files = {
      'package/index.vue': `<template><div ref="c"></div></template><script setup>
const option = { series: [{ data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }] }
</script>`,
    }
    const res = validateDoNotInvent({ files, analysis: { dataPoints: 5 } })
    expect(res.pass).toBe(true) // WARN 不阻断
    const issue = res.issues.find(i => i.id === 'DO-NOT-INVENT-DATA')
    expect(issue).toBeDefined()
    expect(issue.severity).toBe('WARN')
  })

  it('放行：数据点数量在 1.5 倍以内', () => {
    const files = {
      'package/index.vue': `<template><div ref="c"></div></template><script setup>
const option = { series: [{ data: [1, 2, 3, 4, 5] }] }
</script>`,
    }
    const res = validateDoNotInvent({ files, analysis: { dataPoints: 5 } })
    expect(res.pass).toBe(true)
    expect(res.issues.find(i => i.id === 'DO-NOT-INVENT-DATA')).toBeUndefined()
  })

  it('放行：analysis 未提供 dataPoints 时跳过检测', () => {
    const files = {
      'package/index.vue': `<template><div ref="c"></div></template><script setup>
const option = { series: [{ data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] }
</script>`,
    }
    const res = validateDoNotInvent({ files, analysis: {} })
    expect(res.pass).toBe(true)
  })

  // ── extractForbiddenPairs ──
  it('解析 doNotInvent 中的「X→Y」禁止替换对', () => {
    const pairs = extractForbiddenPairs(['不要将 洞内照明 写成 洞外照明'])
    expect(pairs).toContainEqual({ from: '洞内照明', to: '洞外照明' })
  })

  it('解析：显式消费否定前缀，不把「不要将X写成Y」误解析为 from=不要将X', () => {
    const pairs = extractForbiddenPairs(['不要将一氧化碳写成二氧化碳'])
    expect(pairs).toContainEqual({ from: '一氧化碳', to: '二氧化碳' })
    expect(pairs).not.toContainEqual({ from: '不要将一氧化碳', to: '二氧化碳' })
  })

  // ── negPrefix 扩展覆盖度 ──
  it.each([
    '严禁将一氧化碳写成二氧化碳',
    '不能将一氧化碳写成二氧化碳',
    '不得将一氧化碳写成二氧化碳',
    '不应将一氧化碳写成二氧化碳',
    '切忌将一氧化碳写成二氧化碳',
    '切勿将一氧化碳写成二氧化碳',
    '避免将一氧化碳写成二氧化碳',
    '请勿将一氧化碳写成二氧化碳',
    '将一氧化碳误写为二氧化碳',
    '将一氧化碳错写成二氧化碳',
  ])('negPrefix 覆盖：%s', (rule) => {
    const pairs = extractForbiddenPairs([rule])
    expect(pairs).toContainEqual({ from: '一氧化碳', to: '二氧化碳' })
  })

  it('箭头符号 → 正确解析', () => {
    const pairs = extractForbiddenPairs(['一氧化碳→二氧化碳'])
    expect(pairs).toContainEqual({ from: '一氧化碳', to: '二氧化碳' })
  })

  // ── countChartSeries ──
  it('countChartSeries 统计 series 对象数', () => {
    expect(countChartSeries('series: [{a:1},{b:2}]')).toBe(2)
    expect(countChartSeries('no series here')).toBe(null)
  })

  it('countChartSeries 正确跳过 series 内嵌的 data/areaStyle 数组', () => {
    const realEcharts = `series: [
      { name: '入口方向', type: 'line', data: [392, 405, 418], areaStyle: { color: [1] } },
      { name: '出口方向', type: 'line', data: [386, 398, 424] }
    ]`
    expect(countChartSeries(realEcharts)).toBe(2)
    const single = `series: [{ name: 'CO浓度', type: 'line', data: [1, 2, 3] }]`
    expect(countChartSeries(single)).toBe(1)
  })

  // ── countDataPoints ──
  it('countDataPoints 统计 data 数组元素数', () => {
    expect(countDataPoints('data: [1, 2, 3]')).toBe(3)
    expect(countDataPoints('data: [{value:1}, {value:2}]')).toBe(2)
    expect(countDataPoints('no data here')).toBe(null)
  })

  it('countDataPoints 正确处理嵌套数组', () => {
    const nested = `data: [[1,2], [3,4], [5,6]]`
    expect(countDataPoints(nested)).toBe(3) // 顶层 3 个子数组
  })

  // ── extractSnippet ──
  it('extractSnippet 提取 keyword 所在行', () => {
    const content = `<div class="a">\n  <span>二氧化碳浓度</span>\n</div>`
    expect(extractSnippet(content, '二氧化碳')).toBe('<span>二氧化碳浓度</span>')
  })

  it('extractSnippet 超长行截断到 200 字符', () => {
    const longLine = 'x'.repeat(250)
    expect(extractSnippet(longLine, 'x')!.length).toBeLessThanOrEqual(201) // 200 + '…'
  })

  it('extractSnippet 找不到 keyword 返回 undefined', () => {
    expect(extractSnippet('hello world', 'zzz')).toBeUndefined()
  })
})

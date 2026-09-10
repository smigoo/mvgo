/**
 * Loop 2.1.E：chartType 冻结进 block，非法 series.type 拒收。
 * Figma/Manifest 无 pie → 装配/门禁拒绝 type:'pie'；option.series.type 必须是 echarts 注册名
 * （bar/line/pie/scatter…），不得是「分组柱状图」等中文别名。
 */
import { isValidEchartsType, normalizeChartOptionType } from './chart-type-guard.js'

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

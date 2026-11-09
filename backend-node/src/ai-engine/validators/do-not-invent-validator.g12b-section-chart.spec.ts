/**
 * G12b 段级图表存在性检查单测（2026-11-04 · mc-max-1793782995098-d703c55e 实锤）。
 * vision charts[] {section,type} 的承载文件无对应类型 series ⇒ WARN（先观测不拦停）。
 */
import { validateDoNotInvent } from './do-not-invent-validator.js'

const HOLDER = `<template>
  <div data-section-id="83:30" class="forecast">
    <span class="legend">实际流量</span>
  </div>
</template>
<script setup>
const legend = ['实际流量', '预测流量']
</script>`

const BAR_HOLDER = `<template>
  <div data-section-id="2:3550" class="daily"><div ref="chartRef"></div></div>
</template>
<script setup>
import * as echarts from 'echarts'
const chartRef = null
echarts.init(chartRef)
const option = { series: [{ type: 'bar' }] }
</script>`

describe('G12b 段级图表存在性（WARN）', () => {
  test('d703c55e 现场：83:30 段 vision 有 line 图但承载文件无 series ⇒ WARN 且不 BLOCK', () => {
    // 还原真实形态：他处组件（ChartChart）有 line series ⇒ 既有 2.5 全局检查满足；
    // 段承载文件 ContentForecast 无 series ⇒ 仅 G12b 段级 WARN。
    const chartComp = `<template><div ref="chartRef"></div></template>
<script setup>
import * as echarts from 'echarts'
echarts.init(chartRef)
const option = { series: [{ type: 'line' }] }
</script>`
    const res = validateDoNotInvent({
      files: {
        'package/components/ContentForecast.vue': HOLDER,
        'package/components/ChartChart.vue': chartComp,
      },
      analysis: { charts: [{ section: '83:30', type: '面积图', series: ['实际流量'] }] },
    })
    expect(res.pass).toBe(true) // WARN 不拦停
    expect(res.warnChartSectionMissing).toBe(1)
    const warn = res.issues.find((i) => i.id === 'DO-NOT-INVENT-CHART-SECTION-MISSING')
    expect(warn).toBeTruthy()
    expect(warn.severity).toBe('WARN')
    expect(warn.file).toBe('package/components/ContentForecast.vue')
  })

  test('承载文件有对应类型 series ⇒ 无 WARN', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/Daily.vue': BAR_HOLDER },
      analysis: { charts: [{ section: '2:3550', type: '柱状图' }] },
    })
    expect(res.warnChartSectionMissing).toBe(0)
  })

  test('找不到承载文件（段合并渲染）⇒ fail-open 跳过', () => {
    const res = validateDoNotInvent({
      files: { 'package/index.vue': '<template><div>other</div></template>' },
      analysis: { charts: [{ section: '99:99', type: 'pie' }] },
    })
    expect(res.warnChartSectionMissing).toBe(0)
  })

  test('type 归不出（null）⇒ 跳过', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/X.vue': HOLDER },
      analysis: { charts: [{ section: '83:30', type: '热点分布示意' }] },
    })
    expect(res.warnChartSectionMissing).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2026-11-09 · mc-max-1794208722463-00f3626c 实锤：文字数字卡承载豁免。
// 设计稿「车型分布环形图」实为 ELLIPSE+arcData 装饰环 + 数字 TEXT 卡（客车 66109/货车
// 16270），LLM 用底图+数字行形态等价还原 ⇒ 强行要求 pie series 是域误伤（BLOCK 杀死本单）。
// 守三条：①子树含 TEXT 数值 ⇒ 豁免不判 MISSING；②子树无 TEXT 且产物无 series ⇒ 仍 BLOCK；
// ③不传 figmaNodeData（旧口径）⇒ 行为不变（fail-open 不豁免）。
// ─────────────────────────────────────────────────────────────────────────
describe('G12b-豁免：文字数字卡承载的装饰性图表', () => {
  const figmaDoc = {
    children: [
      {
        id: '9:1',
        type: 'FRAME',
        children: [
          {
            id: '2:3446',
            type: 'FRAME',
            children: [
              { id: '2:3455', type: 'GROUP', children: [{ id: '2:3456', type: 'ELLIPSE' }] },
              { id: '2:3463', type: 'TEXT', characters: '客车 66109' },
              { id: '2:3468', type: 'TEXT', characters: '货车 16270' },
            ],
          },
          { id: '2:7999', type: 'FRAME', children: [{ id: '2:8000', type: 'ELLIPSE' }] },
        ],
      },
    ],
  }
  const FILES = {
    'package/index.vue':
      '<template><div data-section-id="2:3446"><div data-section-id="2:7999">x</div></div></template>',
  }
  const run = (charts: any[], withFigma = true) =>
    validateDoNotInvent({
      files: FILES,
      analysis: { charts },
      ...(withFigma ? { figmaNodeData: figmaDoc } : {}),
    })

  it('① 阳性：段子树含 TEXT 数值卡 ⇒ 豁免不判 CHART-MISSING', () => {
    const r = run([{ section: '2:3446', type: 'pie' }])
    expect(r.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING')).toBe(false)
  })

  it('② 阴性：段子树无 TEXT（纯装饰）且产物无 series ⇒ 仍 BLOCK（防线保留）', () => {
    const r = run([{ section: '2:7999', type: 'pie' }])
    expect(r.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING')).toBe(true)
  })

  it('③ 旧口径：不传 figmaNodeData ⇒ 不豁免（行为与旧版一致）', () => {
    const r = run([{ section: '2:3446', type: 'pie' }], false)
    expect(r.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING')).toBe(true)
  })
})

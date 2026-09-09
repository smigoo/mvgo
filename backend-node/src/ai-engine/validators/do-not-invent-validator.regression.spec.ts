/**
 * 历史回放回归夹具 —— 组件 mc-max-1786873908060-3b0eb599。
 *
 * 该组件曾被错误标记「完成」：Vision 识图成功，但生成模型无视 doNotInvent 约束，
 * 把「一氧化碳」(隧道核心监测气体) 臆写成「二氧化碳」，并把 Figma 单绿折线扩成
 * 蓝+黄双折线（系列膨胀）。本夹具用逐字摘录的真实产物反例，证明新门禁能拦截此类
 * 「识图成功但后续乱写」的事故，避免再次被 fail-open 放行。
 *
 * 反例片段均直接摘自 workspace/custom-components/mc-max-1786873908060-3b0eb599/package/index.vue。
 */
import { validateDoNotInvent } from './do-not-invent-validator.js'

// 真实产物摘录：co2 tab 文案为「二氧化碳」(无「一氧化碳」)，图例为 2 个系列。
const BAD_COMPONENT = `<template>
  <div class="c-env-monitor-root">
    <button v-for="tab in monitorTabs" :key="tab.key">{{ tab.label }}</button>
    <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>
<script setup>
const monitorTabs = [
  { key: 'co2', label: '二氧化碳', unit: 'ppm' },
  { key: 'visibility', label: '能见度', unit: 'm' }
]
const metricTitleMap = { co2: '二氧化碳趋势', visibility: '能见度趋势' }
const statusSourceMap = {
  co2: [{ key: 'sensor', name: 'CO₂传感器', text: '正常', level: 'normal' }]
}
const buildTrendOption = () => ({
  series: [
    { name: '入口方向', type: 'line', data: [392, 405, 418] },
    { name: '出口方向', type: 'line', data: [386, 398, 424] }
  ]
})
</script>`

// 修正版：保留原词「一氧化碳」，且为单系列折线。
const CORRECTED_COMPONENT = `<template>
  <div class="c-env-monitor-root">
    <button v-for="tab in monitorTabs" :key="tab.key">{{ tab.label }}</button>
    <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>
<script setup>
const monitorTabs = [
  { key: 'co', label: '一氧化碳', unit: 'ppm' },
  { key: 'visibility', label: '能见度', unit: 'm' }
]
const metricTitleMap = { co: '一氧化碳趋势', visibility: '能见度趋势' }
const statusSourceMap = {
  co: [{ key: 'sensor', name: 'CO传感器', text: '正常', level: 'normal' }]
}
const buildTrendOption = () => ({
  series: [{ name: 'CO浓度', type: 'line', data: [392, 405, 418] }]
})
</script>`

describe('regression: mc-max-1786873908060-3b0eb599 禁止臆造', () => {
  it('历史回放：一氧化碳→二氧化碳 臆造被阻断 (DO-NOT-INVENT-TEXT, BLOCK)', () => {
    const res = validateDoNotInvent({
      files: { 'package/index.vue': BAD_COMPONENT },
      analysis: { doNotInvent: ['一氧化碳为隧道核心监测气体，不要将一氧化碳写成二氧化碳'] },
    })
    expect(res.pass).toBe(false) // BLOCK 阻断
    const issue = res.issues.find((i) => i.id === 'DO-NOT-INVENT-TEXT')
    expect(issue).toBeDefined()
    expect(issue.severity).toBe('BLOCK')
    expect(issue.message).toContain('一氧化碳')
    expect(issue.message).toContain('二氧化碳')
  })

  it('历史回放：单绿折线被扩写成双线被提示 (DO-NOT-INVENT-CHART, WARN)', () => {
    const res = validateDoNotInvent({
      files: { 'package/index.vue': BAD_COMPONENT },
      analysis: { charts: [{ type: 'line', multiSeries: false }] },
    })
    expect(res.pass).toBe(true) // WARN 不阻断
    const issue = res.issues.find((i) => i.id === 'DO-NOT-INVENT-CHART')
    expect(issue).toBeDefined()
    expect(issue.severity).toBe('WARN')
    expect(issue.message).toContain('2')
  })

  it('回归安全：修正版（保留一氧化碳 + 单系列）不被误伤', () => {
    const res = validateDoNotInvent({
      files: { 'package/index.vue': CORRECTED_COMPONENT },
      analysis: {
        doNotInvent: ['一氧化碳为隧道核心监测气体，不要将一氧化碳写成二氧化碳'],
        charts: [{ type: 'line', multiSeries: false }],
      },
    })
    expect(res.pass).toBe(true)
    expect(res.issues).toHaveLength(0)
  })

  it('历史回放组合：真实产物（双系列 + 二氧化碳）同时触发文本篡改 BLOCK + 系列膨胀 WARN', () => {
    const res = validateDoNotInvent({
      files: { 'package/index.vue': BAD_COMPONENT },
      analysis: {
        doNotInvent: ['不要将一氧化碳写成二氧化碳'],
        charts: [{ type: 'line', multiSeries: false }],
      },
    })
    const ids = res.issues.map((i) => i.id)
    expect(ids).toContain('DO-NOT-INVENT-TEXT')
    expect(ids).toContain('DO-NOT-INVENT-CHART')
    expect(res.blockCount).toBe(1) // 文本篡改升级为 BLOCK，阻止发布
  })
})

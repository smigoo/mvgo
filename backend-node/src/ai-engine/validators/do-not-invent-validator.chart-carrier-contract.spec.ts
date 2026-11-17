/**
 * §2.5 图表「承载形态」契约单测（Task #35 ② 收口 · 2026-11-16）。
 *
 * 背景：同一 Figma 真值（fileKey=t8Cp4KOCt6VNQTAgQga4QQ / nodeId=53:34075）三连发，
 * 三次跑出三种承载形态，门禁只在其中两次 BLOCK：
 *   · mc-max-…-10176e21（xq5）ring→echarts pie + bar→echarts bar ⇒ pass
 *   · mc-max-…-eacfce31（xq3）ring→**纯 CSS 描边环** + bar→echarts bar ⇒ BLOCK pie
 *   · mc-max-…-2e7c55d4（xq1）ring→echarts pie + bar→**12 根 DOM div 柱条** ⇒ BLOCK bar
 *
 * 裁决（有明文依据，非臆断）：BLOCK **正确**，判据不扩域。依据 =
 * `roles/microcode/prompt-builder.js` 图表检查表：「如果组件包含图表，**必须使用 echarts**
 * 内置能力…**不要拆成独立 DOM**（如 chart-header、chart-badge）。整个图表区域应是**一个
 * echarts 实例**」。⇒ 拆成 DOM/CSS 的图表＝**真缺 echarts 图**，正是本门禁要拦的形态。
 *
 * 因此本 spec 把「非 echarts 承载 ⇒ 仍 BLOCK」钉成**被守护的契约**，防止后续把
 * border-radius:50% / v-for 高度条 误当「图表已承载」而放宽（全量语料尚有 190 处
 * `border-radius:50%`+`<img>` 图标圆底，放宽会大面积误放行）。
 *
 * ⚠️ 已知缺口（§8.3 · 00f3626c，**与 xq1/xq3 无关**）：`:chart-config` 动态承载的
 * 真 echarts 组件（有 `echarts.init` + `series:[`，但 series type 由 props 动态传入、
 * 全产物零 `type:'<literal>'`）当前被误判 BLOCK。此缺口在最后一组显式钉住，待立项修复
 * 后本组断言须**翻转**为 pass。
 */
import { validateDoNotInvent } from './do-not-invent-validator.js'

const hasMissing = (res: any) =>
  res.issues.some((i: any) => i.id === 'DO-NOT-INVENT-CHART-MISSING')

/** xq1 形态：数据驱动 DOM 柱条（v-for + :style 绑 height 百分比），无 echarts */
const DOM_BARS_VUE = `<template>
  <div class="c-traffic-trend-chart" data-section-id="53:34122">
    <div class="series-bar-group">
      <div v-for="hour in hourBars" :key="hour.label" class="series-bar-item"
           :class="hour.label === '10' ? 'is-highlight' : ''"
           :style="{ height: hour.height + '%' }">
        <span class="series-bar-label">{{ hour.label }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
const hourBars = [
  { label: '1', height: 33 }, { label: '2', height: 82 }, { label: '3', height: 96 },
  { label: '10', height: 82 }, { label: '12', height: 78 },
]
</script>`

/** xq3 形态：纯 CSS 描边环 + 中心数值文本，无 echarts */
const CSS_RING_VUE = `<template>
  <div class="c-traffic-trend-ring" data-section-id="53:34089">
    <span class="ring-glow"></span>
    <span class="ring-value">99.19%</span>
    <span class="ring-sub">98km/h</span>
  </div>
</template>
<style lang="less" scoped>
.ring-glow { inset: 0; border-radius: 50%; border: 2px solid #39d3a5;
  box-shadow: 0 0 16px rgba(57, 211, 165, 0.6), inset 0 0 12px rgba(57, 211, 165, 0.6); }
</style>`

/** echarts 真承载（bar / pie），与 xq5 通过样本同构 */
const ECHARTS_BAR_VUE = `<template><div class="chart" ref="chartRef"></div></template>
<script setup>
import * as echarts from 'echarts'
const chartRef = null
echarts.init(chartRef)
const option = { xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'bar' }] }
</script>`

const ECHARTS_PIE_VUE = `<template><div class="ring" ref="ringChartRef"></div></template>
<script setup>
import * as echarts from 'echarts'
const ringChartRef = null
echarts.init(ringChartRef)
const option = { series: [{ type: 'pie', radius: ['70%', '90%'] }] }
</script>`

/** §8.3 00f3626c 形态：echarts 在场但 series type 由 :chart-config 动态传入（零字面量） */
const ECHARTS_DYNAMIC_VUE = `<template><div class="chart" ref="chartRef"></div></template>
<script setup>
import * as echarts from 'echarts'
const chartRef = null
echarts.init(chartRef)
const option = { xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ data: [820, 932] }] }
</script>`

describe('§2.5 承载形态契约：非 echarts 承载仍检出（判据不扩域；2026-11-17 降 WARN 放行）', () => {
  it('xq1（2e7c55d4）：DOM 数据驱动柱条 ≠ bar 承载 ⇒ 检出缺失 bar（WARN）', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/ContentSection4.vue': DOM_BARS_VUE },
      analysis: { charts: [{ section: '53:34122', type: 'bar' }] },
    })
    expect(hasMissing(res)).toBe(true)
    expect(res.pass).toBe(true) // 判据仍检出，降 WARN 后放行
  })

  it('xq3（eacfce31）：纯 CSS 描边环 ≠ pie 承载 ⇒ 检出缺失 pie（WARN）', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/StatsSection.vue': CSS_RING_VUE },
      analysis: { charts: [{ section: '53:34089', type: 'ring' }] },
    })
    expect(hasMissing(res)).toBe(true)
    expect(res.pass).toBe(true) // 判据仍检出，降 WARN 后放行
  })

  it('xq3 镜像（2e7c55d4 反向）：有 echarts pie、缺 echarts bar ⇒ 只 BLOCK bar，pie 放行', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/ChartSection.vue': ECHARTS_PIE_VUE },
      analysis: { charts: [{ section: '53:34089', type: 'pie' }, { section: 'chart-bar', type: 'bar' }] },
    })
    const missing = res.issues.filter((i: any) => i.id === 'DO-NOT-INVENT-CHART-MISSING')
    expect(missing).toHaveLength(1)
    expect(missing[0].message).toContain('「bar」')
  })

  it('xq5（10176e21）通过形态：echarts pie + echarts bar 齐备 ⇒ pass（含 axis type 噪声不干扰）', () => {
    const res = validateDoNotInvent({
      files: {
        'package/components/StatsSection.vue': ECHARTS_PIE_VUE,
        'package/components/ContentSection.vue': ECHARTS_BAR_VUE,
      },
      analysis: { charts: [{ section: '53:34097', type: 'pie' }, { section: '53:34100', type: 'bar' }] },
    })
    expect(hasMissing(res)).toBe(false)
    expect(res.pass).toBe(true)
  })

  it('防线：`border-radius:50%` + `<img>` 图标圆底（190 处语料形态）不算 pie 承载', () => {
    // 全量语料 190 个文件命中此形态；若判据放宽到「圆角环即 pie」将大面积误放行。
    const iconVue = `<template>
  <div class="group-stats" data-section-id="53:34089">
    <span class="glow-circle"><img class="vehicle-icon" src="/static/icon.svg" /></span>
  </div>
</template>
<style lang="less" scoped>
.glow-circle { width: 63px; height: 63px; border-radius: 50%; border: 1.8px solid rgba(255, 255, 255, 0.6);
  background: linear-gradient(180deg, #fff, #c4e1ff); }
</style>`
    const res = validateDoNotInvent({
      files: { 'package/components/GroupStats.vue': iconVue },
      analysis: { charts: [{ section: '53:34089', type: 'pie' }] },
    })
    expect(hasMissing(res)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 已知缺口（§8.3 · mc-max-1794208722463-00f3626c）：动态 `:chart-config` 承载。
// 产物确实有 echarts（3 个 ChartChart 组件 + `series: [` 在场），但 series type 由
// props 动态传入 ⇒ 全产物零 `type:'bar'/'pie'/'area'` 字面量 ⇒ collectChartSeriesTypes
// 看不见 ⇒ 误判 BLOCK。修法方向：`series: [` 在场时联动读取产品侧 chart-config 的
// 类型字段（**不读 vision 自身的 seriesTypes，那是期望值不是产物证据**）。
// 本组为「当前行为钉住」；修复落地后须翻转为 pass。
// ─────────────────────────────────────────────────────────────────────────
describe('已知缺口：动态 chart-config 承载（待立项修复，本组断言将翻转）', () => {
  it('echarts 在场但 type 动态传入 ⇒ 当前仍 BLOCK（缺口证据）', () => {
    const res = validateDoNotInvent({
      files: { 'package/components/ChartChart.vue': ECHARTS_DYNAMIC_VUE },
      analysis: { charts: [{ section: '2:9778', type: 'bar' }] },
    })
    expect(hasMissing(res)).toBe(true)
  })
})

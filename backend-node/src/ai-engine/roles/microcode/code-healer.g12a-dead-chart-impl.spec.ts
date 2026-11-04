/**
 * G12a 父级死代码图表实现剥离单测（2026-11-04 · mc-max-1793783001034-74672f68 实锤）。
 * script 有 echarts.init(X) 但 template 无 ref="X"（图表由子组件承载）⇒ 整块剥离死实现，活代码零接触。
 */
import { stripDeadChartImpl } from './code-healer.js'

const DEAD_SFC = `<template>
  <div class="root" style="display:flex;flex-direction:column;height:100%;">
    <div v-for="tab in tabList" :key="tab.value" @click="handleTabChange(tab.value)">{{ tab.label }}</div>
    <MainSection style="flex: 1.675 1 0;" />
  </div>
</template>
<script setup>
import MainSection from './components/MainSection.vue'
import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

const activeTab = ref('all')
const tabList = [{ label: '全部', value: 'all' }]
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}
// 图表实例
let chart = null
let chartObserver = null
const chartRef = ref(null)
const updateChart = () => {
  const option = { series: [{ type: 'bar' }] }
  chart.setOption(option, true)
}
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver(() => {
    chart = echarts.init(chartRef.value)
  })
  chartObserver.observe(chartRef.value)
}
// === 监听 chartRef ===
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    nextTick(() => initChart())
  }
})
watch(activeTab, () => {
  if (chart) updateChart()
})
const handleResize = () => {
  if (chart) chart.resize()
}
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  chart?.dispose()
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
  window.removeEventListener('resize', handleResize)
})
</script>
<style lang="less" scoped>
.root { min-width: 0; }
</style>`

describe('stripDeadChartImpl', () => {
  test('74672f68 现场：死实现整块剥离，活代码（tab）逐字保留', () => {
    const r = stripDeadChartImpl(DEAD_SFC)
    expect(r.changed).toBe(true)
    const after = r.content
    // 死代码全清
    expect(/echarts\.init\(/.test(after)).toBe(false)
    expect(/import \* as echarts/.test(after)).toBe(false)
    expect(/chartRef/.test(after.replace(/\/\/[^\n]*chartRef[^\n]*/g, ''))).toBe(false)
    expect(/\bupdateChart\b/.test(after)).toBe(false)
    expect(/chartObserver/.test(after)).toBe(false)
    // 活代码保留
    expect(/tabList/.test(after)).toBe(true)
    expect(/handleTabChange/.test(after)).toBe(true)
    expect(/activeTab\.value = value/.test(after)).toBe(true)
    expect(/emitLoadEvent|MainSection/.test(after)).toBe(true)
  })

  test('template 有静态 ref 挂载点 ⇒ 不动（图表在本文件合法承载）', () => {
    const alive = DEAD_SFC.replace(
      '<MainSection style="flex: 1.675 1 0;" />',
      '<MainSection /><div ref="chartRef" style="height:200px;"></div>',
    )
    const r = stripDeadChartImpl(alive)
    expect(r.changed).toBe(false)
    expect(r.removed).toHaveLength(0)
  })

  test('动态 :ref ⇒ fail-open 不动（不可静态判定）', () => {
    const dyn = DEAD_SFC.replace(
      '<MainSection style="flex: 1.675 1 0;" />',
      '<MainSection /><div :ref="dynamicRef"></div>',
    )
    const r = stripDeadChartImpl(dyn)
    expect(r.changed).toBe(false)
    expect(r.skipped).toBe('dynamicRef')
  })

  test('无 echarts.init 的普通组件 ⇒ 原样返回', () => {
    const plain = `<template><div>{{ msg }}</div></template>\n<script setup>\nconst msg = 'hi'\n</script>`
    const r = stripDeadChartImpl(plain)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(plain)
  })
})

<template>
  <div class="c-monitor-trend-root">
    <section v-for="section in flowSections" :key="section.key" class="c-monitor-flow-section">
      <div class="c-monitor-flow-heading">
        <span class="c-monitor-heading-mark" aria-hidden="true"></span>
        <span>{{ section.title }}</span>
        <span class="c-monitor-legend"><i class="legend-blue"></i>北京方向 <i class="legend-cyan"></i>上海方向</span>
      </div>
      <div :ref="(element) => setChartRef(section.key, element)" class="c-monitor-flow-chart"></div>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

defineProps({ timeTab: { type: String, default: '24h' } })

const flowSections = [
  { key: 'tunnel', title: '江阴靖江长江隧道', threshold: 3000 },
  { key: 'bridge', title: '江阴大桥', threshold: 3000 }
]
const chartRefs = new Map()
const charts = new Map()

const setChartRef = (key, element) => {
  if (element) chartRefs.set(key, element)
}

const hours = Array.from({ length: 13 }, (_, index) => `${index * 2}`)
const tunnelBars = [280, 360, 520, 760, 1800, 1450, 2100, 1600, 2200, 1800, 1200, 800, 450]
const bridgeBars = [420, 500, 700, 950, 1900, 1600, 2300, 1800, 2400, 2100, 1450, 900, 520]

const barOption = (values, threshold) => ({
  animation: false,
  grid: { left: 34, right: 10, top: 22, bottom: 22, containLabel: true },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: hours, axisLine: { lineStyle: { color: '#9bb5cc' } }, axisLabel: { color: '#34495e', fontSize: 10 } },
  yAxis: { type: 'value', max: 4000, interval: 1000, axisLabel: { color: '#34495e', fontSize: 10 }, splitLine: { lineStyle: { color: '#c7dced', type: 'dashed' } } },
  series: [
    { name: '北京方向', type: 'bar', data: values.map((value) => Math.round(value * 0.92)), barWidth: 4, itemStyle: { color: '#118cf0' } },
    { name: '上海方向', type: 'bar', data: values, barWidth: 4, itemStyle: { color: '#08b7d4' }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#ff9561', type: 'dashed' }, label: { formatter: '建议分流', color: '#ff8e55', fontSize: 10 }, data: [{ yAxis: threshold }] } }
  ]
})

const initCharts = () => {
  chartRefs.forEach((element, key) => {
    if (element && !charts.has(key)) {
      const chart = echarts.init(element)
      chart.setOption(barOption(key === 'tunnel' ? tunnelBars : bridgeBars, 3000))
      charts.set(key, chart)
    }
  })
}

const resizeCharts = () => {
  charts.forEach((chart) => chart.resize())
}

onMounted(() => {
  nextTick(initCharts)
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  charts.forEach((chart) => chart.dispose())
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>

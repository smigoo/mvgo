<template>
  <div class="c-mc-1785752098305-41f2ffab-section">
    <div class="c-mc-1785752098305-41f2ffab-sub-header">
      <div class="c-mc-1785752098305-41f2ffab-title-group">
        <span class="c-mc-1785752098305-41f2ffab-title-indicator"></span>
        <span class="c-mc-1785752098305-41f2ffab-title-text">{{ title }}</span>
      </div>
    </div>
    <div class="c-mc-1785752098305-41f2ffab-chart-wrapper">
      <div ref="chartRef" class="c-mc-1785752098305-41f2ffab-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  title: { type: String, required: true },
  chartData: { type: Object, required: true }
})

const chartRef = ref(null)
let chart = null
let observer = null

const updateChart = (data) => {
  if (!chart) return
  const hours = data.beijing.map((_, i) => `${i * 2}`)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#333', fontSize: 12 } },
    grid: { left: 40, right: 16, top: 30, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: hours, axisLine: { lineStyle: { color: '#ccc' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#eee' } }, axisLabel: { color: '#666' } },
    series: [
      { name: '北京方向', type: 'bar', data: data.beijing, itemStyle: { color: '#1890ff' }, barWidth: 8 },
      { name: '上海方向', type: 'bar', data: data.shanghai, itemStyle: { color: '#69c0ff' }, barWidth: 8 }
    ]
  }, true)
}

const initChart = () => {
  const el = chartRef.value
  if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
  chart = echarts.init(el)
  updateChart(props.chartData)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el)
}

watch(() => props.chartData, (val) => updateChart(val), { deep: true })

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

onMounted(() => {
  if (chartRef.value) initChart()
})

onUnmounted(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

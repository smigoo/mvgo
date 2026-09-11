<template>
  <div class="c-monitor-distribution-root">
    <div class="c-monitor-distribution-card" :style="{ backgroundImage: `url(${bgm_3})` }">
      <div class="c-monitor-distribution-title">江阴靖江长江隧道</div>
      <div class="c-monitor-distribution-body">
        <div ref="tunnelChartRef" class="c-monitor-distribution-chart"></div>
        <div class="c-monitor-distribution-values"><strong class="value-blue">22350</strong><strong class="value-orange">16270</strong></div>
      </div>
    </div>
    <div class="c-monitor-distribution-card" :style="{ backgroundImage: `url(${bgm_4})` }">
      <div class="c-monitor-distribution-title">江阴大桥</div>
      <div class="c-monitor-distribution-body">
        <div ref="bridgeChartRef" class="c-monitor-distribution-chart"></div>
        <div class="c-monitor-distribution-values"><strong class="value-blue">66109</strong><strong class="value-orange">16270</strong></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import bgm_3 from '../../resources/images/bg-_m-36.png'
import bgm_4 from '../../resources/images/bg-_m-35.png'

defineProps({ timeTab: { type: String, default: '24h' } })

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null

const chartOption = (passenger, truck) => ({
  animation: false,
  tooltip: { show: false },
  series: [
    { type: 'pie', radius: ['42%', '68%'], data: [{ value: 1, itemStyle: { color: '#f2f9ff' } }], label: { show: false }, silent: true },
    { type: 'pie', radius: ['72%', '94%'], data: [{ value: passenger, itemStyle: { color: '#ff9c2c' } }, { value: truck, itemStyle: { color: '#2e9fff' } }], label: { show: false }, startAngle: 90 }
  ]
})

const initCharts = () => {
  if (tunnelChartRef.value && !tunnelChart) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(chartOption(22350, 16270))
  }
  if (bridgeChartRef.value && !bridgeChart) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(chartOption(66109, 16270))
  }
}

const resizeCharts = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  nextTick(initCharts)
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>

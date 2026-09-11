<template>
  <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-type">
    <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-header">
      <img :src="icon6" class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-icon" alt="icon" />
      <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-title">车型分布</span>
    </div>
    <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-content">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
        <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card-title">江阴靖江长江隧道</div>
        <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card-body">
          <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-chart-wrapper">
            <div ref="tunnelChartRef" class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-chart"></div>
          </div>
          <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stats">
            <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat">
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-label">客车</span>
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-value" style="color: #1399ff;">22350</span>
            </div>
            <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat">
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-label">货车</span>
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-value" style="color: #ff6a00;">16270</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 江阴大桥 -->
      <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
        <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card-title">江阴大桥</div>
        <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-card-body">
          <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-chart-wrapper">
            <div ref="bridgeChartRef" class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-chart"></div>
          </div>
          <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stats">
            <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat">
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-label">客车</span>
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-value" style="color: #1399ff;">66109</span>
            </div>
            <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat">
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-label">货车</span>
              <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-vehicle-stat-value" style="color: #ff6a00;">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon6 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let chartObserver = null

const tunnelData = [
  { value: 22350, name: '客车', itemStyle: { color: '#1399ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
]

const bridgeData = [
  { value: 66109, name: '客车', itemStyle: { color: '#1399ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
]

const getChartOption = (data) => ({
  series: [{
    type: 'pie',
    radius: ['65%', '85%'],
    data: data,
    label: { show: false },
    labelLine: { show: false },
    animation: false
  }]
})

const initChart = (chartRef, data) => {
  if (!chartRef.value) return null
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(chartRef.value)
    chart.setOption(getChartOption(data), true)
    return chart
  }
  return null
}

const initAllCharts = () => {
  if (!tunnelChart) tunnelChart = initChart(tunnelChartRef, tunnelData)
  if (!bridgeChart) bridgeChart = initChart(bridgeChartRef, bridgeData)
  
  if (!chartObserver) {
    chartObserver = new ResizeObserver(() => {
      tunnelChart?.resize()
      bridgeChart?.resize()
    })
    if (tunnelChartRef.value) chartObserver.observe(tunnelChartRef.value)
    if (bridgeChartRef.value) chartObserver.observe(bridgeChartRef.value)
  }
}

watch([tunnelChartRef, bridgeChartRef], () => {
  initAllCharts()
})

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initAllCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  chartObserver?.disconnect()
})
</script>
<template>
  <div class="c-monitor-vehicle-section">
    <div class="c-monitor-section-header">
      <span class="c-monitor-section-title">车型分布</span>
      <img :src="icon2" alt="info" class="c-monitor-info-icon" />
    </div>

    <div class="c-monitor-vehicle-grid">
      <!-- 江阴靖江长江隧道车型卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        <div class="c-monitor-card-content">
          <div class="c-monitor-chart-wrapper">
            <div ref="tunnelChartRef" class="c-monitor-donut-chart"></div>
          </div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value primary">22350</span>
            </div>
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value warning">16270</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-card-title">
          <span class="c-monitor-location-text">江阴靖江长江隧道</span>
        </div>
      </div>

      <!-- 江阴大桥车型卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
        <div class="c-monitor-card-content">
          <div class="c-monitor-chart-wrapper">
            <div ref="bridgeChartRef" class="c-monitor-donut-chart"></div>
          </div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value primary">66109</span>
            </div>
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value warning">16270</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-card-title">
          <span class="c-monitor-location-text">江阴大桥</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  icon2: String,
  bg2: String,
  bg3: String
})

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 隧道车型数据
const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

// 大桥车型数据
const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

const updateTunnelChart = () => {
  if (!tunnelChart) return
  
  const option = {
    color: ['#1990ff', '#ff8533'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data: tunnelData
    }]
  }
  
  tunnelChart.setOption(option, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  
  const option = {
    color: ['#1990ff', '#ff8533'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data: bridgeData
    }]
  }
  
  bridgeChart.setOption(option, true)
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateBridgeChart()
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
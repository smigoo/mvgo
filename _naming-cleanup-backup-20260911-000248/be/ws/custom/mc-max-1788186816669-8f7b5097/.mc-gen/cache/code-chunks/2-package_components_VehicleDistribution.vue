<template>
  <div class="c-monitor-section c-monitor-vehicle-distribution">
    <div class="c-monitor-section-header">
      <img :src="icon2" class="c-monitor-title-icon" alt="" />
      <span>车型分布</span>
    </div>
    <div class="c-monitor-section-body" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
      <div class="c-monitor-vehicle-cards">
        <div class="c-monitor-vehicle-card">
          <div class="c-monitor-vehicle-card-header">
            <span>江阴靖江长江隧道</span>
          </div>
          <div class="c-monitor-vehicle-card-body">
            <div ref="tunnelChartRef" class="c-monitor-donut-chart"></div>
            <div class="c-monitor-vehicle-stats">
              <div class="c-monitor-vehicle-stat-item">
                <span class="c-monitor-vehicle-stat-label">客车</span>
                <span class="c-monitor-vehicle-stat-value">22350</span>
              </div>
              <div class="c-monitor-vehicle-stat-item">
                <span class="c-monitor-vehicle-stat-label">货车</span>
                <span class="c-monitor-vehicle-stat-value">16270</span>
              </div>
            </div>
          </div>
        </div>
        <div class="c-monitor-vehicle-card">
          <div class="c-monitor-vehicle-card-header">
            <span>江阴大桥</span>
          </div>
          <div class="c-monitor-vehicle-card-body">
            <div ref="bridgeChartRef" class="c-monitor-donut-chart"></div>
            <div class="c-monitor-vehicle-stats">
              <div class="c-monitor-vehicle-stat-item">
                <span class="c-monitor-vehicle-stat-label">客车</span>
                <span class="c-monitor-vehicle-stat-value">66109</span>
              </div>
              <div class="c-monitor-vehicle-stat-item">
                <span class="c-monitor-vehicle-stat-label">货车</span>
                <span class="c-monitor-vehicle-stat-value">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明
const icon2 = ref('')
const bg3 = ref('')

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 22350, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#ff9800' } }
        ]
      }
    ]
  }
  tunnelChart.setOption(option, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 66109, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#ff9800' } }
        ]
      }
    ]
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
  tunnelChart?.resize()
  bridgeChart?.resize()
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

<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-box">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <!-- Section Body -->
    <div class="c-monitor-vehicle-body">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-passenger"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-truck"></span>
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-passenger"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-truck"></span>
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 江阴靖江长江隧道数据
const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

// 江阴大桥数据
const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: '{b}: {c} ({d}%)'
    },
    color: ['#1890ff', '#faad14'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: tunnelData
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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: '{b}: {c} ({d}%)'
    },
    color: ['#1890ff', '#faad14'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: bridgeData
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

.c-monitor-vehicle-distribution {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-vehicle-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-chart-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 100px;
}

.c-monitor-vehicle-chart {
  width: 100%;
  height: 100%;
}

.c-monitor-vehicle-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-vehicle-stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-vehicle-stat-dot-passenger {
  background: #1890ff;
}

.c-monitor-vehicle-stat-dot-truck {
  background: #faad14;
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  font-weight: 400;
  color: rgba(51, 51, 51, 0.65);
  line-height: 18px;
}

.c-monitor-vehicle-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  line-height: 18px;
  margin-left: auto;
}
</style>

<template>
  <div class="c-monitor-vehicle-type-section">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-group">
        <img :src="icon2" class="c-monitor-section-icon" alt="icon" />
        <span class="c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- Section Body -->
    <div class="c-monitor-vehicle-type-body">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        <div class="c-monitor-vehicle-content">
          <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
          <div class="c-monitor-vehicle-chart-wrapper">
            <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
          </div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-passenger">22350</span>
            </div>
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-cargo">16270</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-bg" :style="{ backgroundImage: `url(${bg4})` }"></div>
        <div class="c-monitor-vehicle-content">
          <div class="c-monitor-vehicle-label">江阴大桥</div>
          <div class="c-monitor-vehicle-chart-wrapper">
            <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
          </div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-passenger">26109</span>
            </div>
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-cargo">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

const bridgeData = [
  { name: '客车', value: 26109 },
  { name: '货车', value: 16270 }
]

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
        data: tunnelData,
        label: {
          show: false
        },
        itemStyle: {
          color: (params) => {
            const colors = ['#1890ff', '#ff6a00']
            return colors[params.dataIndex]
          }
        }
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
        data: bridgeData,
        label: {
          show: false
        },
        itemStyle: {
          color: (params) => {
            const colors = ['#1890ff', '#ff6a00']
            return colors[params.dataIndex]
          }
        }
      }
    ]
  }
  bridgeChart.setOption(option, true)
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

.c-monitor-vehicle-type-section {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-section-title-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
}

.c-monitor-vehicle-type-body {
  display: flex;
  gap: 12px;
  width: 100%;
}

.c-monitor-vehicle-card {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.c-monitor-vehicle-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  pointer-events: none;
}

.c-monitor-vehicle-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.c-monitor-vehicle-label {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
  margin-bottom: 8px;
  text-align: center;
}

.c-monitor-vehicle-chart-wrapper {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-vehicle-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.c-monitor-vehicle-stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.c-monitor-vehicle-stat-label {
  font-size: calc(@fontSize * 0.86);
  color: rgba(51, 51, 51, 0.65);
  margin-bottom: 4px;
}

.c-monitor-vehicle-stat-value {
  font-size: calc(@fontSize * 1.29);
  font-weight: 700;
}

.c-monitor-vehicle-stat-value-passenger {
  color: #1399ff;
}

.c-monitor-vehicle-stat-value-cargo {
  color: #ff6a00;
}
</style>

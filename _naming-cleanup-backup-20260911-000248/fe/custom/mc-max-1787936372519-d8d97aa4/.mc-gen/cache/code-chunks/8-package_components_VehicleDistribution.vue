<template>
  <div class="c-monitor-vehicle-section">
    <!-- 标题区域 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="icon2" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- 车型卡片容器 -->
    <div class="c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-monitor-pie-chart"></div>
        <div class="c-monitor-stats-row">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-dot-blue"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">22350</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-dot-orange"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-monitor-pie-chart"></div>
        <div class="c-monitor-stats-row">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-dot-blue"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">36109</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-dot-orange"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16270</span>
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

const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

const bridgeData = [
  { name: '客车', value: 36109 },
  { name: '货车', value: 16270 }
]

const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      data: tunnelData,
      color: ['rgba(25, 144, 255, 1)', 'rgba(255, 139, 0, 1)'],
      label: { show: false },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }
  tunnelChart.setOption(option, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      data: bridgeData,
      color: ['rgba(25, 144, 255, 1)', 'rgba(255, 139, 0, 1)'],
      label: { show: false },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
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

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-vehicle-section {
  display: flex;
  flex-direction: column;
  flex: 144 1 0;
  min-height: 0;
  gap: 12px;
}

.c-monitor-section-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 18px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 24px;
}

.c-monitor-vehicle-cards {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-monitor-vehicle-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.c-monitor-card-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  line-height: 20px;
  text-align: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-pie-chart {
  flex: 1;
  min-height: 100px;
  min-width: 0;
}

.c-monitor-stats-row {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
  flex-shrink: 0;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-dot-blue {
  background: rgba(25, 144, 255, 1);
}

.c-monitor-dot-orange {
  background: rgba(255, 139, 0, 1);
}

.c-monitor-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.85);
  line-height: 18px;
}

.c-monitor-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
}
</style>

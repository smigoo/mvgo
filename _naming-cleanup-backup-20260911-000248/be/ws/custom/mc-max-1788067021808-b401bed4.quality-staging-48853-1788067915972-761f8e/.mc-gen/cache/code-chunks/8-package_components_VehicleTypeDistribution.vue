<template>
  <div class="c-monitor-vehicle-type-section">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="c-monitor-vehicle-type-body">
      <!-- 江阴靖江长江隧道车型 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-color" style="background: rgba(56, 141, 255, 1);"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">22350</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-color" style="background: rgba(255, 135, 82, 1);"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16020</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥车型 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-label">江阴大桥</div>
        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-color" style="background: rgba(56, 141, 255, 1);"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">68109</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-color" style="background: rgba(255, 135, 82, 1);"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16020</span>
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

// 隧道车型数据
const tunnelData = [
  { value: 22350, name: '客车' },
  { value: 16020, name: '货车' }
]

// 大桥车型数据
const bridgeData = [
  { value: 68109, name: '客车' },
  { value: 16020, name: '货车' }
]

// 初始化隧道图表
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

// 初始化大桥图表
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

// 更新隧道图表
const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}'
    },
    series: [
      {
        name: '车型分布',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: () => {
            const total = tunnelData.reduce((sum, item) => sum + item.value, 0)
            return `{total|${total}}`
          },
          rich: {
            total: {
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(51, 51, 51, 1)'
            }
          }
        },
        labelLine: {
          show: false
        },
        data: tunnelData,
        color: ['rgba(56, 141, 255, 1)', 'rgba(255, 135, 82, 1)']
      }
    ]
  }
  tunnelChart.setOption(option, true)
}

// 更新大桥图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}'
    },
    series: [
      {
        name: '车型分布',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: () => {
            const total = bridgeData.reduce((sum, item) => sum + item.value, 0)
            return `{total|${total}}`
          },
          rich: {
            total: {
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(51, 51, 51, 1)'
            }
          }
        },
        labelLine: {
          show: false
        },
        data: bridgeData,
        color: ['rgba(56, 141, 255, 1)', 'rgba(255, 135, 82, 1)']
      }
    ]
  }
  bridgeChart.setOption(option, true)
}

// 监听 ref 变化
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
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 130 1 0;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
}

.c-monitor-vehicle-type-body {
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
}

.c-monitor-vehicle-label {
  font-size: 14px;
  color: rgba(51, 51, 51, 0.65);
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-vehicle-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-vehicle-chart {
  width: 100%;
  height: 100%;
  min-height: 100px;
  min-width: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 12px;
  flex-shrink: 0;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-stat-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.c-monitor-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-stat-value {
  font-size: 14px;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
</style>

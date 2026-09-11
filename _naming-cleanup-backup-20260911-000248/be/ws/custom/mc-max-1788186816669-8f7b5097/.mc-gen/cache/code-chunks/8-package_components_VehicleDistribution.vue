<template>
  <div class="c-monitor-vehicle-distribution">
    <div class="c-monitor-section-header">
      <img :src="icon2" class="c-monitor-header-icon" alt="icon" />
      <span class="c-monitor-section-title">车型分布</span>
    </div>

    <div class="c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        <div class="c-monitor-card-content">
          <div class="c-monitor-chart-section">
            <div ref="tunnelChartRef" class="c-monitor-chart-container"></div>
          </div>
          <div class="c-monitor-stats-section">
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value-primary">22350</span>
            </div>
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value-warning">16270</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-card-title">
          <span class="c-monitor-card-title-text">江阴靖江长江隧道</span>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg4})` }"></div>
        <div class="c-monitor-card-content">
          <div class="c-monitor-chart-section">
            <div ref="bridgeChartRef" class="c-monitor-chart-container"></div>
          </div>
          <div class="c-monitor-stats-section">
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value-primary">66109</span>
            </div>
            <div class="c-monitor-stat-row">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value-warning">16270</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-card-title">
          <span class="c-monitor-card-title-text">江阴大桥</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明
const icon2 = new URL('../../resources/images/icon-3441.png', import.meta.url).href
const bg2 = new URL('../../resources/images/bg-_m-36.png', import.meta.url).href
const bg4 = new URL('../../resources/images/bg-_m-35.png', import.meta.url).href

// 图表引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

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

// 更新大桥图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
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

// 监听图表容器
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口调整处理
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

.c-monitor-vehicle-distribution {
  width: 100%;
  flex: 142 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.c-monitor-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: contain;
  background-position: center top;
  background-repeat: no-repeat;
  pointer-events: none;
}

.c-monitor-card-content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.c-monitor-chart-section {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-stats-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.c-monitor-stat-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 0.84);
  color: #333333;
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 1.29);
  font-weight: 700;
  font-family: Roboto, sans-serif;
}

.c-monitor-stat-value-primary {
  color: #1399ff;
}

.c-monitor-stat-value-warning {
  color: #ff6a00;
}

.c-monitor-card-title {
  position: relative;
  flex-shrink: 0;
  padding: 4px 0;
  text-align: center;
}

.c-monitor-card-title-text {
  font-size: @fontSize;
  font-weight: 500;
  color: #333333;
}
</style>

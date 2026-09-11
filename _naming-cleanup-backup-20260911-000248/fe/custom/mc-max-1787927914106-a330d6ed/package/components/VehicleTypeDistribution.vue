<template>
  <div class="c-monitor-vehicle-type-section">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-group" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '426px 91px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <img :src="icon2" class="c-monitor-section-icon" alt="icon" />
        <span class="c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- 车型分布卡片区域 -->
    <div class="c-monitor-vehicle-type-body">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-card-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        
        <div class="c-monitor-vehicle-card-title">
          <span class="c-monitor-vehicle-card-title-text">江阴靖江长江隧道</span>
        </div>

        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart-container"></div>
        </div>

        <div class="c-monitor-vehicle-stats-row">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-passenger">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-truck">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-card-bg" :style="{ backgroundImage: `url(${bg4})` }"></div>
        
        <div class="c-monitor-vehicle-card-title">
          <span class="c-monitor-vehicle-card-title-text">江阴大桥</span>
        </div>

        <div class="c-monitor-vehicle-chart-wrapper">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart-container"></div>
        </div>

        <div class="c-monitor-vehicle-stats-row">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-passenger">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value-truck">16270</span>
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

// 隧道数据
const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

// 大桥数据
const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

// 更新隧道图表
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
        data: tunnelData,
        color: ['#1890ff', '#ff8648']
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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: '{b}: {c} ({d}%)'
    },
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
        data: bridgeData,
        color: ['#1890ff', '#ff8648']
      }
    ]
  }
  
  bridgeChart.setOption(option, true)
}

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

// 监听 ref
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口大小变化处理
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

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-vehicle-type-section {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
}

.c-monitor-section-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-type-body {
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.c-monitor-vehicle-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
}

.c-monitor-vehicle-card-title {
  position: relative;
  z-index: 1;
  padding: 8px 12px;
  text-align: center;
}

.c-monitor-vehicle-card-title-text {
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: #333333;
}

.c-monitor-vehicle-chart-wrapper {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-vehicle-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-vehicle-stats-row {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 12px;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-vehicle-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 18px;
}

.c-monitor-vehicle-stat-value-passenger {
  color: #1890ff;
}

.c-monitor-vehicle-stat-value-truck {
  color: #ff8648;
}
</style>
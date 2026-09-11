<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- 区域标题 -->
    <div class="c-monitor-vehicle-header">
      <div class="c-monitor-vehicle-title-wrapper">
        <span class="c-monitor-vehicle-title-text">车型分布</span>
        <img :src="icon2" class="c-monitor-vehicle-info-icon" alt="信息" />
      </div>
    </div>

    <!-- 车型分布卡片容器 -->
    <div class="c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-blue"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-orange"></span>
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-blue"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-monitor-vehicle-stat-dot-orange"></span>
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

// 资源变量声明
const bg2 = new URL('../../resources/images/bg-_m-36.png', import.meta.url).href
const bg4 = new URL('../../resources/images/bg-_m-35.png', import.meta.url).href
const icon2 = new URL('../../resources/images/icon-3441.png', import.meta.url).href

// 图表引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 隧道数据
const tunnelData = [
  { value: 22350, name: '客车' },
  { value: 16270, name: '货车' }
]

// 大桥数据
const bridgeData = [
  { value: 66109, name: '客车' },
  { value: 16270, name: '货车' }
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
        color: ['#1890ff', '#ff9400']
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
        color: ['#1890ff', '#ff9400']
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

// 监听图表容器
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口大小变化处理
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
}

.c-monitor-vehicle-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-vehicle-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-vehicle-title-text {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-vehicle-info-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-cards {
  flex: 114 1 0;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.c-monitor-vehicle-chart {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.c-monitor-vehicle-stats {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.c-monitor-vehicle-stat-dot-blue {
  background: #1890ff;
}

.c-monitor-vehicle-stat-dot-orange {
  background: #ff9400;
}

.c-monitor-vehicle-stat-label {
  font-size: calc(@fontSize * 0.86);
  color: #1890ff;
  line-height: 18px;
}

.c-monitor-vehicle-stat-value {
  font-size: calc(@fontSize * 1.29);
  font-weight: 500;
  color: #333333;
  line-height: 18px;
  margin-left: auto;
}
</style>

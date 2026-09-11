<template>
  <div class="c-monitor-dist-container">
    <!-- 隧道车型卡片 -->
    <div 
      class="c-monitor-dist-card" 
      :style="{ 
        backgroundImage: `url(${bgm_3})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-monitor-dist-card-title">江阴靖江长江隧道</div>
      <div class="c-monitor-dist-card-body">
        <div class="c-monitor-dist-stat">
          <span class="c-monitor-dist-label">客车</span>
          <span class="c-monitor-dist-value c-monitor-dist-value-blue">{{ tunnelStats[0] }}</span>
        </div>
        <div class="c-monitor-dist-chart-wrapper">
          <div ref="tunnelChartRef" class="c-monitor-dist-chart"></div>
        </div>
        <div class="c-monitor-dist-stat">
          <span class="c-monitor-dist-label">货车</span>
          <span class="c-monitor-dist-value c-monitor-dist-value-orange">{{ tunnelStats[1] }}</span>
        </div>
      </div>
    </div>

    <!-- 大桥车型卡片 -->
    <div 
      class="c-monitor-dist-card" 
      :style="{ 
        backgroundImage: `url(${bgm_4})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-monitor-dist-card-title">江阴大桥</div>
      <div class="c-monitor-dist-card-body">
        <div class="c-monitor-dist-stat">
          <span class="c-monitor-dist-label">客车</span>
          <span class="c-monitor-dist-value c-monitor-dist-value-blue">{{ bridgeStats[0] }}</span>
        </div>
        <div class="c-monitor-dist-chart-wrapper">
          <div ref="bridgeChartRef" class="c-monitor-dist-chart"></div>
        </div>
        <div class="c-monitor-dist-stat">
          <span class="c-monitor-dist-label">货车</span>
          <span class="c-monitor-dist-value c-monitor-dist-value-orange">{{ bridgeStats[1] }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, inject } from 'vue'
import * as echarts from 'echarts'

// --- 接收父组件配置 ---
const activeTime = inject('activeTime', ref('24h'))

// --- 响应式状态 ---
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelData = {
  '24h': [22350, 16270],
  '7d': [156450, 113890],
  '30d': [625800, 455560]
}

const bridgeData = {
  '24h': [66109, 16270],
  '7d': [462763, 113890],
  '30d': [1851052, 455560]
}

const tunnelStats = ref(tunnelData['24h'])
const bridgeStats = ref(bridgeData['24h'])

// --- 图表配置 ---
const getOption = (data) => ({
  tooltip: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['60%', '85%'],
      center: ['50%', '50%'],
      data: [
        { value: data[0], name: '客车', itemStyle: { color: '#1990ff' } },
        { value: data[1], name: '货车', itemStyle: { color: '#fa8c16' } }
      ],
      label: { show: false },
      emphasis: {
        scaleSize: 0
      },
      animation: false
    }
  ]
})

// --- 数据更新 ---
const updateCharts = (time) => {
  tunnelStats.value = tunnelData[time] || tunnelData['24h']
  bridgeStats.value = bridgeData[time] || bridgeData['24h']
  
  if (tunnelChart) {
    tunnelChart.setOption(getOption(tunnelStats.value), true)
  }
  if (bridgeChart) {
    bridgeChart.setOption(getOption(bridgeStats.value), true)
  }
}

// --- 图表初始化 ---
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(getOption(tunnelStats.value))
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(getOption(tunnelStats.value))
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(getOption(bridgeStats.value))
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(getOption(bridgeStats.value))
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

// --- 监听器 ---
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

watch(activeTime, (newVal) => {
  updateCharts(newVal)
})

// --- 事件处理 ---
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

// --- 生命周期 ---
onMounted(() => {
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

.c-monitor-dist-container {
  display: flex;
  gap: 12px;
  width: 100%;
  height: 100%;
}

.c-monitor-dist-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.c-monitor-dist-card-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  text-align: center;
  padding: 8px 0;
  position: relative;
  z-index: 1;
}

.c-monitor-dist-card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 12px;
  position: relative;
  z-index: 1;
}

.c-monitor-dist-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-dist-label {
  font-size: 12px;
  color: #666666;
}

.c-monitor-dist-value {
  font-size: 18px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-dist-value-blue {
  color: #1990ff;
}

.c-monitor-dist-value-orange {
  color: #fa8c16;
}

.c-monitor-dist-chart-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.c-monitor-dist-chart {
  width: 52px;
  height: 52px;
}
</style>
<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <!-- Section Body -->
    <div 
      class="c-monitor-vehicle-body" 
      :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
    >
      <!-- Tunnel Vehicle Card -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-primary"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">22350</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-secondary"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- Bridge Vehicle Card -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-primary"></span>
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value">66109</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-secondary"></span>
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-_m-35.png'


import * as echarts from 'echarts'

// 资源变量（系统注入）

// 图表引用
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

// 图表配置
const getChartOption = (data) => ({
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
      data: data,
      color: ['rgba(25,144,255,1)', 'rgba(255,127,80,1)']
    }
  ]
})

// 初始化隧道图表
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(getChartOption(tunnelData))
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(getChartOption(tunnelData))
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
    bridgeChart.setOption(getChartOption(bridgeData))
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(getChartOption(bridgeData))
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

// 监听图表引用
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口尺寸变化处理
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

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(var(--fontSize, 14px) * 1);
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
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.c-monitor-vehicle-label {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  flex-shrink: 0;
}

.c-monitor-vehicle-chart {
  width: 100px;
  height: 100px;
  flex-shrink: 0;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

.c-monitor-vehicle-stats {
  display: flex;
  gap: 16px;
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
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-stat-dot-primary {
  background: rgba(25,144,255,1);
}

.c-monitor-stat-dot-secondary {
  background: rgba(255,127,80,1);
}

.c-monitor-stat-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  line-height: 18px;
}

.c-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 600;
  color: #333333;
  line-height: 18px;
}
</style>
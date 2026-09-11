<template>
  <div class="c-monitor-vehicle-type-section">
    <!-- 标题行 -->
    <div class="c-monitor-vehicle-type-header">
      <span class="c-monitor-section-title">车型分布</span>
      <img :src="icon1" alt="info" class="c-monitor-info-icon" />
    </div>

    <!-- 车型卡片区 -->
    <div class="c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道卡片 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-chart" ref="tunnelChartRef"></div>
        <div class="c-monitor-vehicle-legend">
          <div class="c-monitor-legend-item">
            <span class="c-monitor-legend-dot" style="background: rgba(25, 144, 255, 1);"></span>
            <span class="c-monitor-legend-label">客车</span>
            <span class="c-monitor-legend-value">22350</span>
          </div>
          <div class="c-monitor-legend-item">
            <span class="c-monitor-legend-dot" style="background: rgba(250, 140, 22, 1);"></span>
            <span class="c-monitor-legend-label">货车</span>
            <span class="c-monitor-legend-value">0<!-- 🎯 待接入(16020) --></span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-chart" ref="bridgeChartRef"></div>
        <div class="c-monitor-vehicle-legend">
          <div class="c-monitor-legend-item">
            <span class="c-monitor-legend-dot" style="background: rgba(25, 144, 255, 1);"></span>
            <span class="c-monitor-legend-label">客车</span>
            <span class="c-monitor-legend-value">0<!-- 🎯 待接入(26109) --></span>
          </div>
          <div class="c-monitor-legend-item">
            <span class="c-monitor-legend-dot" style="background: rgba(250, 140, 22, 1);"></span>
            <span class="c-monitor-legend-label">货车</span>
            <span class="c-monitor-legend-value">0<!-- 🎯 待接入(16020) --></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'


import * as echarts from 'echarts'

// 资源变量（系统注入）

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 初始化江阴靖江长江隧道图表
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

// 初始化江阴大桥图表
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

// 更新江阴靖江长江隧道图表
const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    tooltip: { show: false },
    series: [
      {
        name: '车型分布',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 22350, name: '客车', itemStyle: { color: 'rgba(25, 144, 255, 1)' } },
          { value: 16020, name: '货车', itemStyle: { color: 'rgba(250, 140, 22, 1)' } }
        ]
      }
    ]
  }
  tunnelChart.setOption(option, true)
}

// 更新江阴大桥图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    tooltip: { show: false },
    series: [
      {
        name: '车型分布',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 26109, name: '客车', itemStyle: { color: 'rgba(25, 144, 255, 1)' } },
          { value: 16020, name: '货车', itemStyle: { color: 'rgba(250, 140, 22, 1)' } }
        ]
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

// 窗口 resize 处理
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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-vehicle-type-section {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-vehicle-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-section-title {
  font-size: @fontSize;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
}

.c-monitor-info-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
}

.c-monitor-vehicle-chart {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

.c-monitor-vehicle-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(@fontSize * 0.8571);
  color: rgba(51, 51, 51, 1);
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-legend-label {
  flex: 0 0 auto;
}

.c-monitor-legend-value {
  flex: 1;
  text-align: right;
  font-weight: 600;
}
</style>
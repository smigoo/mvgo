<template>
  <div class="c-traffic-monitor-vehicle-section">
    <!-- 标题区 -->
    <div class="c-traffic-monitor-vehicle-header">
      <span class="c-traffic-monitor-vehicle-title">车型分布</span>
      <img :src="icon1" class="c-traffic-monitor-vehicle-icon" alt="info" />
    </div>

    <!-- 车型卡片容器 -->
    <div class="c-traffic-monitor-vehicle-cards">
      <!-- 隧道车型卡片 -->
      <div 
        class="c-traffic-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-traffic-monitor-vehicle-card-label">江阴靖江长江隧道</span>
        <div class="c-traffic-monitor-vehicle-card-body">
          <div ref="tunnelChartRef" class="c-traffic-monitor-vehicle-chart"></div>
          <div class="c-traffic-monitor-vehicle-stats">
            <div class="c-traffic-monitor-vehicle-stat-item">
              <span class="c-traffic-monitor-vehicle-stat-label">客车</span>
              <span class="c-traffic-monitor-vehicle-stat-value" style="color: rgba(91, 210, 249, 1);">22350</span>
            </div>
            <div class="c-traffic-monitor-vehicle-stat-item">
              <span class="c-traffic-monitor-vehicle-stat-label">货车</span>
              <span class="c-traffic-monitor-vehicle-stat-value" style="color: rgba(255, 114, 108, 1);">16270</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 大桥车型卡片 -->
      <div 
        class="c-traffic-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-traffic-monitor-vehicle-card-label">江阴大桥</span>
        <div class="c-traffic-monitor-vehicle-card-body">
          <div ref="bridgeChartRef" class="c-traffic-monitor-vehicle-chart"></div>
          <div class="c-traffic-monitor-vehicle-stats">
            <div class="c-traffic-monitor-vehicle-stat-item">
              <span class="c-traffic-monitor-vehicle-stat-label">客车</span>
              <span class="c-traffic-monitor-vehicle-stat-value" style="color: rgba(91, 210, 249, 1);">66109</span>
            </div>
            <div class="c-traffic-monitor-vehicle-stat-item">
              <span class="c-traffic-monitor-vehicle-stat-label">货车</span>
              <span class="c-traffic-monitor-vehicle-stat-value" style="color: rgba(255, 114, 108, 1);">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  icon1: String,
  bg2: String,
  bg4: String
})

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      show: false
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 22350, name: '客车', itemStyle: { color: 'rgba(91, 210, 249, 1)' } },
          { value: 16270, name: '货车', itemStyle: { color: 'rgba(255, 114, 108, 1)' } }
        ]
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
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      show: false
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 66109, name: '客车', itemStyle: { color: 'rgba(91, 210, 249, 1)' } },
          { value: 16270, name: '货车', itemStyle: { color: 'rgba(255, 114, 108, 1)' } }
        ]
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

.c-traffic-monitor-vehicle-section {
  width: 100%;
  flex: 142 1 0;
  min-height: 0;
}

.c-traffic-monitor-vehicle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-traffic-monitor-vehicle-title {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: normal;
  color: rgba(51, 51, 51, 1);
}

.c-traffic-monitor-vehicle-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-traffic-monitor-vehicle-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-traffic-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
}

.c-traffic-monitor-vehicle-card-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(51, 51, 51, 1);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-traffic-monitor-vehicle-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-traffic-monitor-vehicle-chart {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

.c-traffic-monitor-vehicle-stats {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-traffic-monitor-vehicle-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-traffic-monitor-vehicle-stat-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(51, 51, 51, 0.65);
}

.c-traffic-monitor-vehicle-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  font-weight: bold;
}
</style>
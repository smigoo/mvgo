<template>
  <div class="c-monitor-vehicle-type-section">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon2" class="c-monitor-title-icon" alt="" />
        <span class="c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <div class="c-monitor-vehicle-type-body">
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-header">
            <div class="c-monitor-location-label" :style="{ backgroundImage: `url(${bg3})` }">
              <span class="c-monitor-location-bar"></span>
              <span class="c-monitor-location-text">江阴靖江长江隧道</span>
            </div>
          </div>

          <div class="c-monitor-chart-wrapper">
            <div ref="chartRefTunnel" class="c-monitor-chart-container"></div>
          </div>

          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value--blue">22350</span>
            </div>
            <div class="c-monitor-stat-item">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>

      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-card-bg" :style="{ backgroundImage: `url(${bg4})` }"></div>
        
        <div class="c-monitor-card-content">
          <div class="c-monitor-card-header">
            <div class="c-monitor-location-label" :style="{ backgroundImage: `url(${bg5})` }">
              <span class="c-monitor-location-bar"></span>
              <span class="c-monitor-location-text">江阴大桥</span>
            </div>
          </div>

          <div class="c-monitor-chart-wrapper">
            <div ref="chartRefBridge" class="c-monitor-chart-container"></div>
          </div>

          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item">
              <span class="c-monitor-stat-label">客车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value--blue">66109</span>
            </div>
            <div class="c-monitor-stat-item">
              <span class="c-monitor-stat-label">货车</span>
              <span class="c-monitor-stat-value c-monitor-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  bg2: { type: String, default: '' },
  bg3: { type: String, default: '' },
  bg4: { type: String, default: '' },
  bg5: { type: String, default: '' },
  icon2: { type: String, default: '' }
})

const chartRefTunnel = ref(null)
const chartRefBridge = ref(null)
let chartTunnel = null
let chartBridge = null
let observerTunnel = null
let observerBridge = null

const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

const updateChart = (chart, data) => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: data,
        color: ['#1890ff', '#ff8700']
      }
    ]
  }

  chart.setOption(option, true)
}

const initChart = (chartRef, data, setChart) => {
  if (!chartRef.value) return

  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(chartRef.value)
    setChart(chart)
    updateChart(chart, data)
    return
  }

  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      observer?.disconnect()
      const chart = echarts.init(chartRef.value)
      setChart(chart)
      updateChart(chart, data)
    }
  })
  observer.observe(chartRef.value)
  return observer
}

watch(chartRefTunnel, (newRef) => {
  if (newRef && !chartTunnel) {
    observerTunnel = initChart(chartRefTunnel, tunnelData, (chart) => { chartTunnel = chart })
  }
})

watch(chartRefBridge, (newRef) => {
  if (newRef && !chartBridge) {
    observerBridge = initChart(chartRefBridge, bridgeData, (chart) => { chartBridge = chart })
  }
})

const handleResize = () => {
  chartTunnel?.resize()
  chartBridge?.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartTunnel?.dispose()
  chartBridge?.dispose()
  observerTunnel?.disconnect()
  observerBridge?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-type-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 142 1 0;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-type-body {
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
}

.c-monitor-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
}

.c-monitor-card-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.c-monitor-card-header {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-location-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-location-bar {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-location-text {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-chart-container {
  width: 120px;
  height: 120px;
  min-width: 0;
  min-height: 0;
}

.c-monitor-stats-row {
  flex-shrink: 0;
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 8px;
}

.c-monitor-stat-item {
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
}

.c-monitor-stat-value--blue {
  color: #1399ff;
}

.c-monitor-stat-value--orange {
  color: #ff6a00;
}
</style>
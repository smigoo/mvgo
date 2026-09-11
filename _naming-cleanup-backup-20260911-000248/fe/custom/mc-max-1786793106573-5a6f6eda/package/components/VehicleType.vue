<template>
  <div class="c-vehicle-type-root">
    <div class="c-vehicle-type-header">
      <img :src="icon2" class="c-vehicle-type-header-icon" />
      <span class="c-vehicle-type-header-title">车型分布</span>
    </div>
    <div class="c-vehicle-type-content">
      <div class="c-vehicle-type-card">
        <div class="c-vehicle-type-card-bg" :style="{ backgroundImage: `url(${bgm_3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"></div>
        <div class="c-vehicle-type-card-header">
          <div class="c-vehicle-type-card-title-bg" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"></div>
          <span class="c-vehicle-type-card-title">江阴靖江长江隧道</span>
        </div>
        <div class="c-vehicle-type-card-body">
          <div class="c-vehicle-type-chart-wrapper">
            <div ref="tunnelChartRef" class="c-vehicle-type-chart"></div>
          </div>
          <div class="c-vehicle-type-stats">
            <div class="c-vehicle-type-stat-item">
              <span class="c-vehicle-type-stat-label">客车</span>
              <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">22350</span>
            </div>
            <div class="c-vehicle-type-stat-item">
              <span class="c-vehicle-type-stat-label">货车</span>
              <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>
      <div class="c-vehicle-type-card">
        <div class="c-vehicle-type-card-bg" :style="{ backgroundImage: `url(${bgm_4})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"></div>
        <div class="c-vehicle-type-card-header">
          <div class="c-vehicle-type-card-title-bg" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"></div>
          <span class="c-vehicle-type-card-title">江阴大桥</span>
        </div>
        <div class="c-vehicle-type-card-body">
          <div class="c-vehicle-type-chart-wrapper">
            <div ref="bridgeChartRef" class="c-vehicle-type-chart"></div>
          </div>
          <div class="c-vehicle-type-stats">
            <div class="c-vehicle-type-stat-item">
              <span class="c-vehicle-type-stat-label">客车</span>
              <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">66109</span>
            </div>
            <div class="c-vehicle-type-stat-item">
              <span class="c-vehicle-type-stat-label">货车</span>
              <span class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3561.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg5 from '../../resources/images/bg-3525.png'
import bgm_3 from '../../resources/images/bg-_m-36.png'
import bgm_4 from '../../resources/images/bg-_m-35.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[VehicleType] $mcComponentBuilder 失败:', e)
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let observer = null

const initChart = (el) => {
  if (!el) return null
  const chart = echarts.init(el)
  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['60%', '80%'],
      label: { show: false },
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 2
      },
      data: []
    }]
  })
  return chart
}

const updateCharts = () => {
  if (tunnelChart) {
    tunnelChart.setOption({
      series: [{
        data: [
          { value: 22350, name: '客车', itemStyle: { color: '#1990ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
        ]
      }]
    })
  }
  if (bridgeChart) {
    bridgeChart.setOption({
      series: [{
        data: [
          { value: 66109, name: '客车', itemStyle: { color: '#1990ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
        ]
      }]
    })
  }
}

const initAll = () => {
  if (tunnelChartRef.value && !tunnelChart) {
    tunnelChart = initChart(tunnelChartRef.value)
  }
  if (bridgeChartRef.value && !bridgeChart) {
    bridgeChart = initChart(bridgeChartRef.value)
  }
  updateCharts()
}

watch([tunnelChartRef, bridgeChartRef], () => {
  initAll()
})

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initAll()
  window.addEventListener('resize', handleResize)
  
  if (tunnelChartRef.value) {
    observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(tunnelChartRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  observer?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-type-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-vehicle-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-vehicle-type-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-vehicle-type-header-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-vehicle-type-content {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-vehicle-type-card {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.c-vehicle-type-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.c-vehicle-type-card-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  flex-shrink: 0;
}

.c-vehicle-type-card-title-bg {
  position: absolute;
  width: 130px;
  height: 9px;
  z-index: 0;
}

.c-vehicle-type-card-title {
  position: relative;
  z-index: 1;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-vehicle-type-card-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 8px 0;
}

.c-vehicle-type-chart-wrapper {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
}

.c-vehicle-type-chart {
  width: 100%;
  height: 100%;
}

.c-vehicle-type-stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}

.c-vehicle-type-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-vehicle-type-stat-label {
  font-size: 12px;
  color: #333333;
}

.c-vehicle-type-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-family: Roboto, sans-serif;
}

.c-vehicle-type-stat-value--blue {
  color: #1990ff;
}

.c-vehicle-type-stat-value--orange {
  color: #fa8c16;
}
</style>
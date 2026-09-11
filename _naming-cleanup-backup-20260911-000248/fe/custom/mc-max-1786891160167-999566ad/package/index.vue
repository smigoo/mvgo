<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-header">
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.key }]"
            :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
            @click="activeTab = tab.key"
          >
            <img :src="icontabsIcon" class="c-env-monitor-tab-icon" />
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <div class="c-env-monitor-body">
        <div 
          class="c-env-monitor-data-panel" 
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-env-monitor-stat-card">
            <img :src="icon1" class="c-env-monitor-stat-icon" />
            <div class="c-env-monitor-stat-info">
              <span class="c-env-monitor-stat-label">当前浓度</span>
              <span class="c-env-monitor-stat-value">450 <small>ppm</small></span>
            </div>
          </div>
          
          <div class="c-env-monitor-stat-card">
            <img :src="icon2" class="c-env-monitor-stat-icon" />
            <div class="c-env-monitor-stat-info">
              <span class="c-env-monitor-stat-label">环境状态</span>
              <span class="c-env-monitor-stat-value c-env-monitor-stat-value--normal">优良</span>
            </div>
          </div>
        </div>

        <div class="c-env-monitor-chart-panel">
          <div class="c-env-monitor-chart-header">
            <span class="c-env-monitor-chart-title">24小时趋势</span>
          </div>
          <div class="c-env-monitor-chart-wrapper">
            <div ref="chartRef" class="c-env-monitor-chart-container"></div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/g-7883.png'
import icon2 from '../resources/images/tabs-icon-43.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[c-env-monitor] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = ref([
  { key: 'co2', label: '二氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])
const activeTab = ref('co2')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表数据 ---
const dataMap = {
  co2: [420, 435, 450, 460, 455, 440, 430, 445, 460, 470, 465, 450],
  visibility: [120, 115, 110, 105, 100, 105, 110, 115, 120, 125, 130, 125],
  lighting: [80, 85, 90, 95, 100, 95, 90, 85, 80, 75, 70, 75],
  outdoor: [500, 550, 600, 650, 700, 680, 620, 580, 520, 480, 450, 420]
}

// --- 图表逻辑 ---
const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value] || []
  const xData = Array.from({ length: 12 }, (_, i) => `${i * 2}:00`)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#fff', fontSize: 12 }
    },
    grid: {
      left: 10,
      right: 20,
      top: 20,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '趋势',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2, color: '#1890ff' },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.4)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

const handleResize = () => {
  if (chart) chart.resize()
}

// --- 监听与生命周期 ---
watch(activeTab, () => {
  updateChart()
})

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
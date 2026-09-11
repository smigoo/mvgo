<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-root">
      <!-- 1. 标题栏 -->
      <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-header">
        <img :src="icon1" class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-header-icon" />
        <span class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-header-title">环境监测</span>
      </div>

      <!-- 2. 筛选与操作栏 -->
      <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-filter-bar">
        <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-indicator-tabs">
          <div 
            v-for="tab in indicatorTabs" 
            :key="tab.key"
            :class="['c-env-monitor-indicator-tab', { 'is-active': activeIndicator === tab.key }]"
            :style="activeIndicator === tab.key ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}"
            @click="activeIndicator = tab.key"
          >
            <img v-if="tab.key === 'co'" :src="icontabsIcon" class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-tab-icon" />
            <span class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-view-switch">
          <div 
            :class="['c-env-monitor-view-btn', { 'is-active': viewMode === 'chart' }]"
            @click="viewMode = 'chart'"
          >
            <img :src="icon2" class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-view-icon" />
            <span>柱状图视图</span>
          </div>
          <div 
            :class="['c-env-monitor-view-btn', { 'is-active': viewMode === 'list' }]"
            @click="viewMode = 'list'"
          >
            <span>列表视图</span>
          </div>
        </div>
      </div>

      <!-- 3. 数据图表区 -->
      <div class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-chart-area" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
        <div v-show="viewMode === 'chart'" ref="chartRef" class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-chart-container"></div>
        <div v-show="viewMode === 'list'" class="c-mc-max-1787577949692-37a8f1a3-c-env-monitor-list-container" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
          <!-- 列表视图内容区域 -->
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import icon2 from '../resources/images/tabs-icon-43.png'
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 1. 调用 $mcComponentBuilder（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 状态定义
const indicatorTabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])

const activeIndicator = ref('co')
const viewMode = ref('chart')

// 3. 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据映射（实际项目中可通过 componentApi 获取）
const dataMap = {
  co: {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    series: [12, 15, 28, 22, 18, 25, 14]
  },
  visibility: {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    series: [800, 750, 600, 650, 700, 680, 820]
  },
  lighting: {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    series: [150, 120, 80, 90, 110, 130, 160]
  },
  outdoor: {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    series: [50, 80, 300, 450, 350, 120, 40]
  }
}

const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeIndicator.value] || dataMap.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    grid: {
      left: 40,
      right: 20,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)' }
    },
    series: [
      {
        name: activeIndicator.value,
        type: 'bar',
        data: data.series,
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#1890ff' },
            { offset: 1, color: 'rgba(24,144,255,0.2)' }
          ]),
          borderRadius: [4, 4, 0, 0]
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

watch(activeIndicator, () => {
  if (viewMode.value === 'chart') {
    updateChart()
  }
})

watch(viewMode, (newMode) => {
  if (newMode === 'chart' && chart) {
    nextTick(() => {
      chart.resize()
    })
  }
})

const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

onMounted(() => {
  // 触发 onload 事件
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
  
  initChart()
  window.addEventListener('resize', handleResize)
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
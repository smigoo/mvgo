<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 标题栏左侧装饰小圆点，使用 icon1 资源 -->
    <template #title-left>
      <img :src="icon1" class="c-mc-1785679175385-9fe31edb-title-dot" alt="装饰" />
    </template>

    <!-- Fixed: 右上角视图切换图标及 Badge，使用 icontabsIcon 资源 -->
    <template #header-right>
      <div class="c-mc-1785679175385-9fe31edb-header-right">
        <img :src="icontabsIcon" class="c-mc-1785679175385-9fe31edb-view-icon" alt="视图切换" />
        <div class="c-mc-1785679175385-9fe31edb-badge">6</div>
      </div>
    </template>

    <!-- Fixed: 移除根容器的 background/box-shadow/padding，仅保留布局属性 -->
    <div class="c-mc-1785679175385-9fe31edb-content">
      <!-- Tab 切换栏 -->
      <div class="c-mc-1785679175385-9fe31edb-tabs-container">
        <div class="c-mc-1785679175385-9fe31edb-tabs-bg">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="[
              'c-mc-1785679175385-9fe31edb-tab-item',
              { 'c-mc-1785679175385-9fe31edb-tab-item--active': activeTab === tab.value }
            ]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-mc-1785679175385-9fe31edb-chart-wrapper">
        <div ref="chartRef" class="c-mc-1785679175385-9fe31edb-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// 1. 调用 $mcComponentBuilder 并解构 runtimeBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// 2. Tab 数据与状态
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
]
const activeTab = ref('co')

// 3. 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据（用于 Tab 切换联动演示）
const mockData = {
  co: [5, 8, 12, 15, 22, 28, 35, 25, 18, 10, 6, 4],
  visibility: [30, 28, 25, 20, 15, 10, 8, 12, 18, 25, 28, 32],
  indoor_light: [100, 120, 150, 180, 200, 220, 210, 190, 160, 130, 110, 100],
  outdoor_light: [500, 800, 1200, 1500, 1800, 2000, 1900, 1600, 1200, 800, 500, 300]
}

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 更新图表数据
const updateChart = () => {
  if (!chart) return
  const currentData = mockData[activeTab.value] || mockData.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e8e8e8',
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 30,
      right: 10,
      top: 20,
      bottom: 20,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { color: '#666', fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 10 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: currentData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#52c41a', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          data: [{ yAxis: 30, label: { formatter: '预警线', color: '#d32f2f', fontSize: 10 } }]
        }
      }
    ]
  }
  chart.setOption(option, true)
}

// 初始化图表
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

// 监听 chartRef 变化
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// Fixed: 监听 Tab 切换并更新图表数据
watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785679175385-9fe31edb-onload', {
      componentId: 'mc-1785679175385-9fe31edb',
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

/* Fixed: 补充 per-element 样式缺失，co-chart 的 width 和 height */
.c-mc-1785679175385-9fe31edb-chart-container {
  width: 380px;
  height: 113px;
  min-width: 0;
  min-height: 0;
}
</style>
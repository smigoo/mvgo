<template>
  <div class="c-ff0ff1-env-trend">
    <div class="c-ff0ff1-trend-header">
      <div class="c-ff0ff1-tabs-wrapper">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-ff0ff1-tab-item', { 'c-ff0ff1-tab-item--active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-ff0ff1-header-icons">
        <div class="c-ff0ff1-icon-wrapper">
          <img :src="icontabsIcon" alt="操作" class="c-ff0ff1-tabs-icon" />
          <span class="c-ff0ff1-badge">6</span>
        </div>
      </div>
    </div>

    <div class="c-ff0ff1-chart-wrapper">
      <div ref="chartRef" class="c-ff0ff1-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 响应式状态 ---
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
]
const activeTab = ref('co')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表数据 ---
const chartDataMap = {
  co: [10, 15, 12, 25, 32, 28, 20, 18, 22, 35, 30, 25],
  visibility: [20, 25, 18, 15, 22, 28, 30, 35, 25, 20, 15, 10],
  indoor_light: [15, 18, 20, 22, 25, 28, 26, 24, 20, 18, 15, 12],
  outdoor_light: [5, 10, 15, 25, 35, 40, 38, 30, 20, 10, 5, 2]
}

// --- 图表配置与更新 ---
const getChartOption = (data) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: { color: '#333', fontSize: 12 },
    axisPointer: { lineStyle: { color: '#ccc' } }
  },
  legend: {
    data: ['zk3+785CO浓度'],
    top: 0,
    right: 0,
    icon: 'rect',
    itemWidth: 14,
    itemHeight: 2,
    textStyle: { color: '#333', fontSize: 10 }
  },
  grid: {
    left: 30,
    right: 16,
    top: 30,
    bottom: 24,
    containLabel: false
  },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#e8e8e8' } },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    interval: 10,
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#333', fontSize: 12 }
  },
  series: [
    {
      name: 'zk3+785CO浓度',
      type: 'line',
      data: data,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#0fcd7d', width: 1 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ]
        }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
        data: [
          {
            yAxis: 30,
            label: {
              formatter: '预警线',
              position: 'end',
              color: '#d32f2f',
              fontSize: 12,
              distance: 5
            }
          }
        ]
      }
    }
  ]
})

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value] || chartDataMap.co
  chart.setOption(getChartOption(data), true)
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
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleTabChange = (value) => {
  activeTab.value = value
}

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
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
@import '../../resources/styles/index.less';
</style>
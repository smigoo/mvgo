<template>
  <base-panel panelKey="default-panel">
    <!-- [Layout Refine] Figma header > g bbox → 8x8 icon -->
    <template #title-left>
      <img :src="icon1" class="c-mc-1785691981393-80b24053-title-icon" alt="装饰" />
    </template>

    <div class="c-mc-1785691981393-80b24053-content">
      <!-- [Layout Refine] Figma sub-t layoutMode=HORIZONTAL → flex-direction: row -->
      <div class="c-mc-1785691981393-80b24053-tabs-controls">
        <div class="c-mc-1785691981393-80b24053-tab-switch" role="tablist">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="[
              'c-mc-1785691981393-80b24053-tab-item',
              { 'c-mc-1785691981393-80b24053-tab-item--active': activeTab === tab.key }
            ]"
            role="tab"
            :aria-selected="activeTab === tab.key"
            :aria-label="tab.label"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </div>
        </div>

        <div class="c-mc-1785691981393-80b24053-view-icons">
          <img :src="icontabsIcon" class="c-mc-1785691981393-80b24053-view-icon" alt="柱状图视图" aria-label="切换图表视图" />
          <img :src="icontabsIcon" class="c-mc-1785691981393-80b24053-view-icon" alt="列表视图" aria-label="切换列表视图" />
          <div class="c-mc-1785691981393-80b24053-badge">
            <span class="c-mc-1785691981393-80b24053-badge-text">6</span>
          </div>
        </div>
      </div>

      <!-- [Layout Refine] Figma @echarts/line bbox → flex: 1 -->
      <div class="c-mc-1785691981393-80b24053-chart-section">
        <div ref="chartRef" class="c-mc-1785691981393-80b24053-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 初始化失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
]
const activeTab = ref('co')

const mockData = {
  co: [12, 15, 18, 22, 28, 32, 25, 18, 14, 10, 8, 12],
  visibility: [20, 22, 25, 28, 30, 28, 25, 22, 20, 18, 15, 12],
  indoor: [15, 18, 20, 25, 28, 26, 22, 20, 18, 16, 14, 15],
  outdoor: [30, 35, 38, 40, 38, 35, 30, 25, 20, 18, 15, 12]
}

/* [Style Refine] ECharts config aligned with Figma fills/strokes/typography */
const getChartOption = (data) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 },
    axisPointer: { lineStyle: { color: '#cccccc' } }
  },
  legend: {
    data: ['zk3+785CO浓度'],
    top: 4,
    right: 7,
    textStyle: { color: '#333333', fontSize: 9.6 },
    itemWidth: 14,
    itemHeight: 2,
    itemGap: 16,
    icon: 'rect'
  },
  grid: {
    left: 20,
    right: 16,
    top: 24,
    bottom: 20,
    containLabel: false
  },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#b0c9de', width: 0.8 } },
    axisLabel: { color: '#333333', fontSize: 12 },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#333333', fontSize: 12 },
    splitLine: { lineStyle: { color: '#bdd4e8', width: 0.8 } }
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
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
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
              color: '#d32f2f',
              fontSize: 12,
              position: 'insideEndTop'
            }
          }
        ]
      }
    }
  ]
})

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value] || mockData.co
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

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)

  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785691981393-80b24053-onload', {
      componentId: 'mc-1785691981393-80b24053',
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

.c-mc-1785691981393-80b24053-title-icon {
  width: 8px;
  height: 8px;
  display: block;
}
</style>
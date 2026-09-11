<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-title-decorations">
        <img :src="icon1" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-deco-icon-lg" alt="" />
        <img :src="icon2" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-deco-icon-sm" alt="" />
        <img :src="icon3" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-deco-path" alt="" />
      </div>
    </template>

    <div class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-root">
      <!-- 筛选与工具栏 -->
      <div class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-controls">
        <div class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-tabs" role="tablist" aria-label="监测指标切换" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-tab-item"
            :class="{ 'is-active': activeTab === tab.key }"
            :style="activeTab === tab.key
              ? {
                  backgroundImage: `url(${bg3})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center center',
                  backgroundRepeat: 'no-repeat'
                }
              : null"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="handleTabChange(tab.key)"
          >
            <span class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>

        <div class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-actions">
          <a-button
            class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-icon-btn"
            type="text"
            size="small"
            title="柱状图视图"
            aria-label="柱状图视图"
            @click="handleChartView"
          >
            <img :src="icon4" alt="" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-action-icon" />
          </a-button>

          <span class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-badge-wrapper">
            <a-button
              class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-icon-btn"
              type="text"
              size="small"
              title="列表详情"
              aria-label="列表详情"
              @click="handleListView"
            >
              <img :src="icon5" alt="" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-action-icon" />
            </a-button>
            <span class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-badge">{{ badgeCount }}</span>
          </span>
        </div>
      </div>

      <!-- 趋势图表 -->
      <div
        class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-chart-section"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div
          class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-legend"
          :class="{ 'is-hidden': !legendVisible }"
          @click="toggleLegend('zk3+785CO浓度')"
        >
          <span class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-legend-swatch"></span>
          <span class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-legend-text">zk3+785CO浓度</span>
        </div>

        <div ref="chartRef" class="c-mc-max-1787709055958-01c93a0b-c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/circle-7884.png'
import icon2 from '../resources/images/circle-7885.png'
import icon3 from '../resources/images/path-7886.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon4 from '../resources/images/icon-7941.png'
import icon5 from '../resources/images/icon-7945.png'
import bg2 from '../resources/images/bg-7890.png'


import * as echarts from 'echarts'

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 状态与数据 ===
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor_light', label: '洞内照明' },
  { key: 'outdoor_light', label: '洞外光强' }
]
const activeTab = ref('co')
const badgeCount = ref(6)
const legendVisible = ref(true)

// 模拟不同 Tab 下的数据
const mockData = {
  co: [10, 15, 12, 25, 35, 28, 20, 18, 22, 30, 25, 15],
  visibility: [20, 22, 25, 30, 28, 26, 24, 22, 20, 18, 15, 12],
  indoor_light: [5, 8, 10, 12, 15, 18, 20, 22, 20, 18, 15, 10],
  outdoor_light: [10, 15, 25, 35, 40, 38, 30, 20, 15, 10, 5, 2]
}
// === 图表相关 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value] || mockData.co
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: { show: false }, // 使用自定义 DOM 图例
    grid: { left: 40, right: 20, top: 30, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#0fcd7d', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#F53F3F', type: 'dashed', width: 1 },
          label: {
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 30 }]
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
// === 交互事件 ===
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleChartView = () => {
  // 切换视图模式
}

const handleListView = () => {
  // 查看列表详情
}

const toggleLegend = (name) => {
  legendVisible.value = !legendVisible.value
  if (chart) {
    chart.dispatchAction({
      type: 'legendToggleSelect',
      name: name
    })
  }
}
// === 监听与生命周期 ===
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
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
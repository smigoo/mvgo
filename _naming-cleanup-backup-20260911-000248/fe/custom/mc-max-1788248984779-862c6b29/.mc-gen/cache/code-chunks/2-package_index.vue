<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-content">
      <!-- Tab 切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div
          class="c-env-monitor-tabs-list"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: 'contain', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="c-env-monitor-tab-item"
            :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.id }"
            :style="activeTab === tab.id ? { backgroundImage: `url(${bg2})`, backgroundSize: 'contain', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
            @click="handleTabChange(tab.id)"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-env-monitor-tabs-icons">
          <div class="c-env-monitor-tab-icon-wrapper">
            <img :src="icon1" class="c-env-monitor-tab-icon" alt="柱状图" />
          </div>
          <div class="c-env-monitor-tab-icon-wrapper">
            <img :src="icon2" class="c-env-monitor-tab-icon" alt="列表" />
            <span class="c-env-monitor-tab-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 24小时趋势图表 -->
      <div class="c-env-monitor-chart-section">
        <div class="c-env-monitor-chart-legend">
          <span class="c-env-monitor-chart-legend-item">
            <i class="c-env-monitor-chart-legend-dot"></i>zk3+785CO浓度
          </span>
        </div>
        <div class="c-env-monitor-chart-body">
          <div ref="chartRef" class="c-env-monitor-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === Tab 数据（文字严格取自设计稿清单）===
const tabs = ref([
  { id: 'co', label: '一氧化碳' },
  { id: 'visibility', label: '能见度' },
  { id: 'lighting', label: '洞内照明' },
  { id: 'outdoor', label: '洞外光强' }
])
const activeTab = ref('co')
// === 各 Tab 对应的图表数据（Mock，禁止臆造真实业务数据，仅用于演示切换效果）===
const chartDataMap = {
  co: [120, 132, 101, 134, 90, 230, 210, 180, 150, 200, 190, 160],
  visibility: [200, 180, 150, 170, 190, 210, 220, 200, 180, 160, 150, 170],
  lighting: [80, 90, 100, 110, 120, 130, 140, 130, 120, 110, 100, 90],
  outdoor: [50, 60, 70, 80, 100, 150, 180, 170, 140, 100, 70, 50]
}

const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const seriesData = chartDataMap[activeTab.value] || []
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(85, 158, 255, 0.3)',
      borderWidth: 1,
      textStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 }
    },
    grid: { left: 30, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: '时',
      nameTextStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: seriesData,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: 'rgba(85, 158, 255, 1)', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(85, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(85, 158, 255, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 30, name: '预警线' }],
          lineStyle: { type: 'dashed', color: 'rgba(255, 78, 78, 1)', width: 1 },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: 'rgba(255, 78, 78, 1)',
            fontSize: 12
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleTabChange = (id) => {
  if (activeTab.value === id) return
  activeTab.value = id
}

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
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

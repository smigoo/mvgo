<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- [Layout Refine] Figma header GROUP → 标题区 -->
      <div class="c-env-monitor-header">
        <span class="c-env-monitor-header-dot"></span>
        <span class="c-env-monitor-header-title">环境监测</span>
        <div class="c-env-monitor-header-line"></div>
      </div>

      <!-- [Layout Refine] Figma slot-con FRAME → 内容区 -->
      <div class="c-env-monitor-content">
        <!-- [Layout Refine] Figma sub-t FRAME → Tab栏 -->
        <div class="c-env-monitor-tab-bar">
          <div class="c-env-monitor-tabs-list">
            <div
              v-for="tab in tabs"
              :key="tab.key"
              class="c-env-monitor-tab-item"
              :class="{ 'is-active': activeTab === tab.key }"
              @click="activeTab = tab.key"
            >{{ tab.label }}</div>
          </div>
          <div class="c-env-monitor-view-icons">
            <div class="c-env-monitor-view-icon">
              <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="10" width="3" height="6" fill="#2C9AEA" rx="0.5"/><rect x="7.5" y="6" width="3" height="10" fill="#2C9AEA" rx="0.5"/><rect x="13" y="2" width="3" height="14" fill="#2C9AEA" rx="0.5"/></svg>
            </div>
            <div class="c-env-monitor-view-icon">
              <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="1.5" fill="#2C9AEA" rx="0.5"/><rect x="2" y="8" width="14" height="1.5" fill="#2C9AEA" rx="0.5"/><rect x="2" y="13" width="14" height="1.5" fill="#2C9AEA" rx="0.5"/></svg>
              <span class="c-env-monitor-badge">6</span>
            </div>
          </div>
        </div>

        <!-- [Layout Refine] Figma @echarts/line GROUP → 图表区 -->
        <div class="c-env-monitor-chart-area">
          <div ref="trendChartRef" class="c-env-monitor-chart"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[env-monitor] $mcComponentBuilder 失败:', e)
}

/* [Data Refine] Figma tabs: 一氧化碳/能见度/洞内照明/洞外光强 */
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])

const activeTab = ref('co')

const trendChartRef = ref(null)
let chart = null
let chartObserver = null

/* [Data Refine] Figma Y轴: 0-40, X轴: 2-24时 */
const chartDataMap = {
  co: [8, 12, 18, 25, 28, 32, 26, 22, 15, 10, 8, 6],
  visibility: [30, 28, 25, 20, 18, 15, 22, 26, 32, 35, 36, 38],
  lighting: [10, 15, 22, 30, 35, 38, 32, 25, 18, 12, 10, 8],
  outdoor: [5, 10, 20, 32, 38, 40, 35, 28, 18, 10, 6, 4]
}
const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value] || []
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    /* [Layout Refine] Figma chart grid: left=20, right=14, top=28, bottom=24 */
    grid: {
      left: 20,
      right: 14,
      top: 28,
      bottom: 24,
      containLabel: false
    },
    /* [Style Refine] Figma X轴标签: 12px Roboto #333, 单位"时" */
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(189, 212, 232, 0.5)' } },
      axisTick: { show: false },
      axisLabel: { color: '#333333', fontSize: 12, fontFamily: 'Roboto' },
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12, fontFamily: 'Source Han Sans CN', padding: [0, -10, -5, 0] }
    },
    /* [Style Refine] Figma Y轴: 0-40, 网格线 #BDD4E8, 标签 12px #333, 单位"辆" */
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: '#BDD4E8', width: 0.8 } },
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, fontFamily: 'Source Han Sans CN', align: 'right' }
    },
    /* [Style Refine] Figma legend: top-right, "zk3+785CO浓度" */
    legend: {
      show: true,
      top: 4,
      right: 0,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: { color: '#333333', fontSize: 10, fontFamily: 'Source Han Sans CN' },
      data: ['zk3+785CO浓度']
    },
    series: [{
      name: 'zk3+785CO浓度',
      type: 'line',
      data: data,
      smooth: true,
      symbol: 'none',
      /* [Style Refine] Figma Vector 1303: stroke #0FCD7E 1px */
      lineStyle: { color: '#0FCD7E', width: 1 },
      /* [Style Refine] Figma Vector 1304: gradient fill #0FCD7E 40%→0% */
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(15, 205, 126, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 126, 0)' }
          ]
        }
      },
      itemStyle: { color: '#0FCD7E' },
      /* [Style Refine] Figma 预警线: 红色虚线 #D32F2F at Y=30 */
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#D32F2F', type: 'dashed', width: 0.8 },
        label: {
          formatter: '预警线',
          color: '#D32F2F',
          fontSize: 12,
          fontFamily: 'Source Han Sans CN',
          position: 'end'
        },
        data: [{ yAxis: 30 }]
      }
    }]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!trendChartRef.value) return
  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(trendChartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(trendChartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(trendChartRef.value)
}

watch(trendChartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'env-monitor',
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
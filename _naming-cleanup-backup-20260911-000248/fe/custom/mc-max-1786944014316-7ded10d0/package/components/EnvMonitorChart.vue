<template>
  <div class="c-env-monitor-chart-root">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  activeTab: { type: String, default: 'co2' }
})

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[EnvMonitorChart] $mcComponentBuilder 初始化失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表配置 ---
const getChartOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#ccc' } }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333', fontSize: 10 },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 10,
      right: 20,
      top: 30,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      name: '时',
      nameTextStyle: { color: '#666', fontSize: 12, padding: [0, 0, 0, -10] },
      nameLocation: 'end'
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      name: '辆',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'left' },
      nameLocation: 'end'
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15,205,125,0.4)' },
              { offset: 1, color: 'rgba(15,205,125,0.05)' }
            ]
          }
        },
        data: [10, 12, 15, 18, 20, 22, 25, 28, 32, 35, 28, 20],
        markLine: {
          symbol: 'none',
          data: [
            {
              yAxis: 30,
              lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
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
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
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

const handleResize = () => { if (chart) chart.resize() }

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

.c-env-monitor-chart-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
<template>
  <div class="c-device-status-chart-root">
    <div ref="chartRef" class="c-device-status-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[DeviceStatusChart] $mcComponentBuilder 失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表配置与更新 ---
const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: '{b}: {c}台 ({d}%)'
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: '#333333', fontSize: 12 }
    },
    series: [
      {
        type: 'pie',
        radius: ['60%', '80%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: () => {
            return `{a|68562}\n{b|设备总数}`
          },
          rich: {
            a: { fontSize: 20, fontWeight: 'bold', color: '#1990ff', lineHeight: 28 },
            b: { fontSize: 12, color: '#999999', lineHeight: 18 }
          }
        },
        labelLine: { show: false },
        data: [
          { value: 67200, name: '正常设备', itemStyle: { color: '#1990ff' } },
          { value: 1362, name: '异常设备', itemStyle: { color: '#f53f3f' } }
        ]
      }
    ]
  }
  chart.setOption(option, true)
}

// --- 图表初始化 ---
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

.c-device-status-chart-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.c-device-status-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
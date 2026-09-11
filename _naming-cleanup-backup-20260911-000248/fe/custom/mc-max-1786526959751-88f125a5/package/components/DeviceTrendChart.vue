<template>
  <div class="c-device-trend-chart-root">
    <div class="c-device-trend-chart-header">
      <span class="c-device-trend-chart-title">设备状态趋势</span>
    </div>
    <div class="c-device-trend-chart-body">
      <div ref="chartRef" class="c-device-trend-chart-container"></div>
    </div>
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
  console.warn('[DeviceTrendChart] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表配置 ---
const getChartOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    legend: {
      data: ['在线设备', '故障设备'],
      top: 0,
      right: 0,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 16
    },
    grid: {
      top: 30,
      left: 10,
      right: 10,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      boundaryGap: true,
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '在线设备',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: [1100, 1150, 1180, 1160, 1190, 1200, 1180],
        itemStyle: {
          color: '#1990ff'
        },
        lineStyle: {
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(25, 144, 255, 0.25)' },
            { offset: 1, color: 'rgba(25, 144, 255, 0.0)' }
          ])
        }
      },
      {
        name: '故障设备',
        type: 'bar',
        data: [15, 20, 18, 25, 22, 10, 20],
        itemStyle: {
          color: '#f53f3f',
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: 12
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
  if (newRef && !chart) {
    initChart()
  }
})

const handleResize = () => {
  if (chart) {
    chart.resize()
  }
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

.c-device-trend-chart-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-device-trend-chart-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-device-trend-chart-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-device-trend-chart-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-device-trend-chart-container {
  width: 100%;
  height: 100%;
}
</style>
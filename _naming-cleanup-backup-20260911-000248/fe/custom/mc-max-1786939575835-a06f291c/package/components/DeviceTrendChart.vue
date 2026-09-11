<template>
  <div class="c-device-monitor-trend-chart">
    <div class="c-device-monitor-trend-header">
      <span class="c-device-monitor-trend-title">设备在线趋势</span>
    </div>
    <div class="c-device-monitor-trend-body">
      <div ref="chartRef" class="c-device-monitor-trend-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
  }
} catch (e) {
  console.warn('[DeviceTrendChart] $mcComponentBuilder 初始化失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        lineStyle: {
          color: '#1990FF',
          type: 'dashed'
        }
      }
    },
    grid: {
      top: 20,
      right: 20,
      bottom: 30,
      left: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: '#d9d9d9' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      }
    },
    series: [
      {
        name: '在线设备',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        data: [120, 132, 101, 134, 90, 230, 210],
        lineStyle: {
          color: '#1990FF',
          width: 2
        },
        itemStyle: {
          color: '#1990FF',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        emphasis: {
          itemStyle: {
            color: '#1990FF',
            borderColor: '#ffffff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(25, 144, 255, 0.3)'
          }
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(25, 144, 255, 0.25)' },
            { offset: 1, color: 'rgba(25, 144, 255, 0.02)' }
          ])
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

.c-device-monitor-trend-chart {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-device-monitor-trend-header {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-device-monitor-trend-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-device-monitor-trend-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-device-monitor-trend-container {
  width: 100%;
  height: 100%;
}
</style>
<template>
  <div class="c-env-monitor-chart-area">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    { value: 15, coord: [0, 15] },
    { value: 18, coord: [1, 18] },
    { value: 22, coord: [2, 22] },
    { value: 25, coord: [3, 25] },
    { value: 28, coord: [4, 28] },
    { value: 32, coord: [5, 32] },
    { value: 35, coord: [6, 35] },
    { value: 30, coord: [7, 30] },
    { value: 28, coord: [8, 28] },
    { value: 25, coord: [9, 25] },
    { value: 20, coord: [10, 20] },
    { value: 18, coord: [11, 18] }
  ]
}

const updateChart = () => {
  if (!chart) return

  const option = {
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)',
          type: 'dashed'
        }
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 8,
      right: 16,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect'
    },
    xAxis: {
      type: 'category',
      data: mockData.xAxis,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#f0f0f0',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: mockData.series.map(item => item.value),
        smooth: true,
        symbol: 'circle',
        symbolSize: 0,
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 2
          },
          data: [
            { yAxis: 30 }
          ]
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
  if (newRef && !chart) {
    nextTick(() => {
      initChart()
    })
  }
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
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-area {
  flex: 113 1 0;
  min-height: 100px;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}
</style>

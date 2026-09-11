<template>
  <div class="c-env-monitor-chart-area">
    <!-- 实时数值显示 -->
    <div class="c-env-monitor-stat-value">
      <span class="value-text">zk3+785CO浓度</span>
    </div>

    <!-- 图表容器 -->
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  yAxis: [0, 10, 20, 30, 40],
  series: [15, 18, 22, 28, 25, 30, 28, 26, 24, 22, 20, 18]
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

const updateChart = () => {
  if (!chart) return

  const option = {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
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
          color: 'rgba(85, 158, 255, 0.5)',
          type: 'dashed'
        }
      }
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
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
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
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
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
          color: 'rgba(0, 0, 0, 0.05)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
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
              { offset: 0, color: 'rgba(15, 205, 125, 0.55)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
            ]
          }
        },
        data: mockData.series,
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#f53f3f',
            fontSize: 12
          },
          lineStyle: {
            color: '#f53f3f',
            type: 'dashed',
            width: 1
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }

  chart.setOption(option, true)
}

const handleResize = () => {
  if (chart) chart.resize()
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

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
  position: relative;
  flex: 113 1 0;
  min-height: 100px;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-stat-value {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 10;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
  pointer-events: none;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

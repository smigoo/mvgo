<template>
  <div class="c-env-monitor-chart-wrapper">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// X轴刻度数据（2-24时）
const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
// 模拟CO浓度数据（14-18时出现峰值）
const yData = [5, 8, 12, 15, 22, 28, 35, 38, 32, 20, 12, 8]

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
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 0,
      top: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#666666',
        fontSize: 10
      }
    },
    grid: {
      left: 10,
      right: 30,
      top: 25,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, -10]
      },
      axisLabel: {
        color: '#333333',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        color: '#333333',
        fontSize: 10
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: yData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        markLine: {
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
            width: 1
          },
          data: [
            {
              yAxis: 30
            }
          ]
        }
      }
    ]
  }
  chart.setOption(option, true)
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

.c-env-monitor-chart-wrapper {
  width: 100%;
  flex: 113 1 0;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}
</style>
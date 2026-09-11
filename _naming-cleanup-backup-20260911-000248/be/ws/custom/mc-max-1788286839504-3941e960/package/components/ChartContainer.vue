<template>
  <div class="c-env-monitor-chart-wrapper">
    <div class="c-env-monitor-chart-body">
      <div ref="chartRef" class="c-env-monitor-chart-canvas" />
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'


import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => { if (!chart) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 8,
      right: 16,
      textStyle: {
        color: '#333333',
        fontSize: 10
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: '#e0e0e0'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      splitLine: {
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
        smooth: true,
        data: [12, 18, 15, 20, 22, 25, 28, 30, 26, 24, 20, 16],
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.5)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.1)' }
            ]
          }
        },
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#d32f2f',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            color: '#d32f2f',
            fontSize: 12
          },
          data: [
            {
              yAxis: 30,
              name: '预警线'
            }
          ]
        }
      }
    ]
  }

  chart.setOption(option, true)
}

const initChart = () => { if (!chartRef.value) return
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

const handleResize = () => { if (chart) chart.resize()
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
  min-width: 0;
  min-height: 0;
}

.c-env-monitor-chart-body {
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  overflow: hidden;
}

.c-env-monitor-chart-canvas {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
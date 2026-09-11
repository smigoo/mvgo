<template>
  <div class="c-env-monitor-chart-area">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ activeTab: { type: String, required: true
  },
  'c-env-monitor-viewMode': {
    type: String,
    default: 'chart'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟不同 tab 的数据
const dataMap = { co: [5, 8, 12, 10, 15, 13, 11, 9, 14, 12, 10, 8], visibility: [20, 25, 30, 28, 35, 32, 30, 28, 33, 31, 29, 27], lighting: [40, 45, 50, 48, 55, 52, 50, 48, 53, 51, 49, 47], outdoor: [60, 65, 70, 68, 75, 72, 70, 68, 73, 71, 69, 67]
}

const updateChart = () => { if (!chart) return

  const currentData = dataMap[props.activeTab] || dataMap.co

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 20,
      top: 10,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 30,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
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
      name: '辆',
      nameLocation: 'start',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
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
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: currentData,
        smooth: true,
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        symbol: 'none',
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1.5
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
  if (newRef && !chart) {
    initChart()
  }
})

watch(() => props.activeTab, () => {
  updateChart()
})

const handleResize = () => { if (chart) { chart.resize()
  }
}

onMounted(() => {
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
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
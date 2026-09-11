<template>
  <div class="c-env-monitor-chart-area">
    <!-- 图表容器 -->
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartType: {
    type: String,
    default: 'co'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据 - 根据图表类型返回不同数据
const getChartData = (type) => {
  const baseData = {
    co: Array.from({ length: 24 }, (_, i) => Math.floor(Math.random() * 30 + 10)),
    visibility: Array.from({ length: 24 }, (_, i) => Math.floor(Math.random() * 25 + 15)),
    lighting: Array.from({ length: 24 }, (_, i) => Math.floor(Math.random() * 20 + 10)),
    outdoor: Array.from({ length: 24 }, (_, i) => Math.floor(Math.random() * 35 + 5))
  }
  return baseData[type] || baseData.co
}

// 初始化图表
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

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = getChartData(props.chartType)
  
  const option = {
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
          width: 1
        }
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 40,
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
        show: true,
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#e8e8e8'
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
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#e8e8e8',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        showSymbol: false,
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
        }
      }
    ],
    graphic: [
      {
        type: 'text',
        right: 16,
        top: 16,
        style: {
          text: 'zk3+785CO浓度',
          fill: '#333333',
          fontSize: 12,
          fontWeight: 'normal'
        }
      },
      {
        type: 'line',
        shape: {
          x1: 40,
          y1: 89,
          x2: 386,
          y2: 89
        },
        style: {
          stroke: '#d32f2f',
          lineWidth: 1,
          lineDash: [5, 5]
        }
      },
      {
        type: 'text',
        right: 16,
        top: 82,
        style: {
          text: '预警线',
          fill: '#d32f2f',
          fontSize: 12,
          fontWeight: 'normal'
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 监听 chartRef 变化
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听 chartType 变化
watch(() => props.chartType, () => {
  updateChart()
})

// 窗口 resize 处理
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

.c-env-monitor-chart-area {
  flex: 113 1 0;
  min-height: 100px;
  width: 100%;
  position: relative;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
<template>
  <div class="trend-chart-container">
    <div ref="chartRef" class="chart-canvas" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Object,
    required: true,
    default: () => ({ categories: [], series: [] })
  },
  loading: {
    type: Boolean,
    default: false
  }
})

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[TrendChart] $mcComponentBuilder 失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return

  if (props.loading) {
    chart.showLoading('default', {
      text: '加载中...',
      color: '#1890ff',
      textColor: '#333333',
      maskColor: 'rgba(255, 255, 255, 0.6)',
      zlevel: 0
    })
  } else {
    chart.hideLoading()
  }

  const { categories = [], series = [] } = props.chartData

  // 兼容多系列，第一个系列作为主面积图使用绿色，其他系列使用不同颜色且不填充面积
  const seriesColors = ['#4ade80', '#1890ff', '#ffc53d', '#ff7a45']
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#d9d9d9',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const lines = params.map((item) => {
          const marker = item.marker || ''
          return `${marker} ${item.seriesName}: ${item.value}`
        })
        return `${params[0].name}<br/>${lines.join('<br/>')}`
      }
    },
    legend: {
      data: series.map((s) => s.name),
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 6,
      textStyle: {
        color: '#666666',
        fontSize: 12
      }
    },
    grid: {
      left: 40,
      right: 20,
      top: 28,
      bottom: 25,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: '#999999' }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: '#e0e0e0',
          type: 'dashed'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      }
    },
    series: series.map((s, index) => {
      const isMain = index === 0
      return {
        name: s.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: s.data,
        lineStyle: {
          color: seriesColors[index % seriesColors.length],
          width: isMain ? 2 : 1.5
        },
        areaStyle: isMain
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(74, 222, 128, 0.45)' },
                  { offset: 1, color: 'rgba(74, 222, 128, 0.05)' }
                ]
              }
            }
          : undefined,
        markLine: isMain
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#ff4d4f',
                type: 'dashed',
                width: 1
              },
              label: {
                show: true,
                position: 'end',
                color: '#ff4d4f',
                fontSize: 12,
                formatter: '预警线'
              },
              data: [{ yAxis: 30 }]
            }
          : undefined
      }
    })
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

// 监听图表容器 ref
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听数据变化
watch(
  () => props.chartData,
  () => {
    if (chart) updateChart()
  },
  { deep: true }
)

// 监听 loading 变化
watch(
  () => props.loading,
  () => {
    if (chart) updateChart()
  }
)

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

.trend-chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;

  .chart-canvas {
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }
}
</style>
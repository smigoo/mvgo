<template>
  <div class="c-env-monitor-chart-area">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// X轴刻度（2~24时）
const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 根据 activeTab 决定 Y 轴量程和阈值线位置
const getAxisConfig = (tab) => {
  switch (tab) {
    case '一氧化碳':
      return { max: 40, min: 0, interval: 10, thresholdValue: 28, unit: '时' }
    case '能见度':
      return { max: 600, min: 0, interval: 200, thresholdValue: 450, unit: '时' }
    case '洞内照明':
      return { max: 250, min: 0, interval: 50, thresholdValue: 200, unit: '时' }
    case '洞外光强':
      return { max: 600, min: 0, interval: 200, thresholdValue: 480, unit: '时' }
    default:
      return { max: 40, min: 0, interval: 10, thresholdValue: 28, unit: '时' }
  }
}

const buildOption = () => {
  const { max, min, interval, thresholdValue } = getAxisConfig(props.activeTab)
  const data = props.chartData && props.chartData.length > 0 ? props.chartData : []

  return {
    grid: {
      left: 36,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(30, 50, 80, 0.85)',
      borderColor: 'rgba(85, 158, 255, 0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12,
        fontFamily: 'Roboto, Source Han Sans CN, sans-serif'
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(85, 158, 255, 0.5)',
          width: 1,
          type: 'dashed'
        }
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.axisValue} 时<br/>${p.seriesName}：${p.value}`
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN, sans-serif'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto, sans-serif'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min,
      max,
      interval,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto, sans-serif'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.08)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: props.activeTab,
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.35)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN, sans-serif'
          },
          data: [
            { yAxis: thresholdValue }
          ]
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
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
      chartObserver = null
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听 chartRef 就绪（base-panel slot DOM 重建场景）
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听数据变化，更新图表
watch(
  () => props.chartData,
  () => { updateChart() },
  { deep: true }
)

// 监听 Tab 切换，更新图表
watch(
  () => props.activeTab,
  () => { updateChart() }
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
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-area {
  width: 100%;
  flex: 180 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
<template>
  <div
    class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-chart-section"
    :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div
      class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-chart-legend"
      :class="{ 'is-active': legendVisible }"
      @click="toggleLegend"
    >
      <span class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-chart-legend-color"></span>
      <span class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-chart-legend-text">{{ chartData.legend }}</span>
    </div>
    <div ref="chartRef" class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Object,
    required: true
  },
  activeTab: {
    type: String,
    default: 'co'
  }
})

const chartRef = ref(null)
const legendVisible = ref(true)

let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return

  const xData = props.chartData.xAxisData || []
  const sData = props.chartData.seriesData || []
  const legendName = props.chartData.legend || 'zk3+785CO浓度'
  const seriesColor = props.chartData.seriesColor || '#0fcd7d'
  const warningLine = props.chartData.warningLine || {}
  const yAxisMax = props.chartData.yAxisMax || 40
  const xAxisUnit = props.chartData.xAxisUnit || '时'
  const yAxisUnit = props.chartData.yAxisUnit || '辆'

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e6e6e6',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#bbbbbb',
          type: 'dashed'
        }
      }
    },
    grid: {
      left: 44,
      right: 36,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    legend: {
      show: false,
      data: [legendName],
      selected: {
        [legendName]: legendVisible.value
      }
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: xAxisUnit,
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [8, 0, 0, 4]
      },
      axisLine: {
        lineStyle: {
          color: '#d0d5db'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        margin: 10
      }
    },
    yAxis: {
      type: 'value',
      name: yAxisUnit,
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 8, 0]
      },
      min: 0,
      max: yAxisMax,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#e8eef5',
          width: 1
        }
      }
    },
    series: [
      {
        name: legendName,
        type: 'line',
        data: sData,
        smooth: false,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: seriesColor,
          width: 2
        },
        itemStyle: {
          color: seriesColor
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(90, 216, 166, 0.15)' },
            { offset: 1, color: 'rgba(90, 216, 166, 0)' }
          ])
        },
        markLine: {
          symbol: 'none',
          silent: true,
          animation: false,
          lineStyle: {
            color: warningLine.color || '#d32f2f',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            formatter: warningLine.label || '预警线',
            position: 'end',
            color: warningLine.color || '#d32f2f',
            fontSize: 12
          },
          data: [
            {
              yAxis: warningLine.value || 30
            }
          ]
        }
      }
    ]
  }

  chart.setOption(option, true)
}

const toggleLegend = () => {
  if (!chart) return

  const legendName = props.chartData.legend
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: legendName
  })

  legendVisible.value = !legendVisible.value
  updateChart()
}

const ensureObserver = () => {
  if (chartObserver) return

  chartObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!chart && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
      chart = echarts.init(chartRef.value)
      updateChart()
    } else if (chart) {
      chart.resize()
    }
  })

  chartObserver.observe(chartRef.value)
}

const initChart = () => {
  if (chart || !chartRef.value) return

  ensureObserver()

  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

watch(
  () => props.chartData,
  () => {
    updateChart()
  },
  { deep: true }
)

watch(
  () => props.activeTab,
  () => {
    if (chart) {
      updateChart()
    }
  }
)

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartObserver?.disconnect()
  chart?.dispose()
})
</script>

<style lang="less" scoped>
@font-size-base: 0px;

@import '../../resources/styles/index.less';

.c-env-monitor-chart-section {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.c-env-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-left: 4px;
  cursor: pointer;
  user-select: none;
}

.c-env-monitor-chart-legend-color {
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-env-monitor-chart-legend-text {
  font-size: calc(@font-size-base * 0.7);
  line-height: 1.4;
  color: #333333;
  font-family: 'Source Han Sans CN', 'PingFang SC', sans-serif;
}

.c-env-monitor-chart-legend:not(.is-active) .c-env-monitor-chart-legend-text {
  color: #999999;
}

.c-env-monitor-chart-container {
  flex: 1 1 auto;
  min-height: 80px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}
</style>
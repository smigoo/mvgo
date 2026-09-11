<template>
  <div class="c-env-monitor-chart-section">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// Figma 设计稿真实时间刻度与量程
const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
// 用于展示 CO 浓度变化趋势的示例数据（仅作视觉还原，不指代真实业务值）
const coData = [3, 6, 13, 22, 33, 31, 26, 19, 14, 9, 6, 4]

const getOption = () => ({
  legend: {
    data: ['zk3+785CO浓度'],
    right: 8,
    top: 6,
    itemWidth: 14,
    itemHeight: 2,
    icon: 'roundRect',
    textStyle: {
      color: '#333333',
      fontSize: 10,
      fontFamily: 'Source Han Sans CN, sans-serif'
    }
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff',
    borderColor: '#d9d9d9',
    borderWidth: 1,
    textStyle: {
      color: '#333333',
      fontSize: 12
    },
    formatter: (params) => {
      const p = Array.isArray(params) ? params[0] : params
      return `${p.axisValue}时<br/>${p.marker}${p.seriesName}：${p.value} 辆`
    }
  },
  grid: {
    left: 44,
    right: 24,
    top: 34,
    bottom: 28,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: xData,
    name: '时',
    nameLocation: 'end',
    nameGap: 12,
    nameTextStyle: {
      color: '#666666',
      fontSize: 12,
      fontFamily: 'Source Han Sans CN, sans-serif'
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 12,
      fontFamily: 'Roboto, sans-serif',
      margin: 8
    },
    axisTick: {
      show: true,
      alignWithLabel: true
    },
    axisLine: {
      lineStyle: { color: '#cccccc' }
    }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    interval: 10,
    name: '辆',
    nameLocation: 'end',
    nameGap: 10,
    nameTextStyle: {
      color: '#666666',
      fontSize: 12,
      fontFamily: 'Source Han Sans CN, sans-serif',
      align: 'right'
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 12,
      fontFamily: 'Roboto, sans-serif',
      formatter: '{value}'
    },
    axisTick: { show: true },
    axisLine: { show: false },
    splitLine: {
      lineStyle: {
        color: '#e0e0e0',
        type: 'solid'
      }
    }
  },
  series: [
    {
      name: 'zk3+785CO浓度',
      type: 'line',
      smooth: true,
      data: coData,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: {
        color: '#2ecc71',
        width: 2
      },
      itemStyle: {
        color: '#2ecc71'
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(46, 204, 113, 0.4)' },
            { offset: 1, color: 'rgba(46, 204, 113, 0.05)' }
          ]
        }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        label: {
          show: true,
          formatter: '预警线',
          position: 'insideEndTop',
          color: '#d32f2f',
          fontSize: 12,
          fontFamily: 'Source Han Sans CN, sans-serif'
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
})

function updateChart() {
  if (!chart) return
  chart.setOption(getOption(), true)
}

function initChart() {
  if (!chartRef.value) return

  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }

  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (!chart && width > 0 && height > 0) {
      chart = echarts.init(chartRef.value)
      updateChart()
    } else if (chart && width > 0 && height > 0) {
      chart.resize()
    }
  })

  chartObserver.observe(chartRef.value)

  // 初始尺寸可用时直接初始化
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0 && !chart) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

function handleResize() {
  if (chart) {
    chart.resize()
  }
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)

  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }

  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-section {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}
</style>
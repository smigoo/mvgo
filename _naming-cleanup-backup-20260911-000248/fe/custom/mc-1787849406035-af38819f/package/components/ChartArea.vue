<template>
  <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-chart-area">
    <div ref="chartRef" class="c-mc-max-1787845880584-5585e53c-c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// X 轴小时刻度（Figma 节点中 2~24，共 12 个刻度）
const xLabels = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// CO 浓度模拟数据（与 Figma 面积图走势大致一致）
const coData = [5, 9, 7, 14, 18, 12, 22, 20, 16, 24, 28, 21]

const updateChart = () => {
  if (!chart) return

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'transparent',
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      show: true,
      top: 0,
      left: 0,
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 16,
      icon: 'rect',
      textStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      data: ['zk3+785CO浓度']
    },
    grid: {
      left: 40,
      right: 12,
      top: 26,
      bottom: 26,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12, align: 'right' },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        interval: 0,
        margin: 6
      },
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12, align: 'right' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.08)', type: 'dashed' } },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: coData,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#0fcd7d', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.35)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          label: {
            show: true,
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            position: 'end'
          },
          data: [{ yAxis: 30 }]
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
    if (!chart) {
      chart = echarts.init(chartRef.value)
    }
    updateChart()
    chart.resize()
    return
  }

  if (!chartObserver) {
    chartObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        if (!chart) {
          chartObserver?.disconnect()
          chartObserver = null
          chart = echarts.init(chartRef.value)
          updateChart()
        } else {
          chart.resize()
        }
      }
    })
  }

  chartObserver.observe(chartRef.value)
}

const handleResize = () => {
  chart?.resize()
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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-area {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
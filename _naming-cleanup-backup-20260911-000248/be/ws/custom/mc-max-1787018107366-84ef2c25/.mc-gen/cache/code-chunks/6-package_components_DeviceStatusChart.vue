<template>
  <div class="c-device-status-chart">
    <div ref="chartRef" class="c-device-status-chart__container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 组件内部状态
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 设备状态数据（基于顶部统计指标：设备总数 68562，完好率 98%）
const stats = {
  total: 68562,
  intactRate: 98,
  normal: Math.round(68562 * 0.98), // 67191
  abnormal: 68562 - Math.round(68562 * 0.98) // 1371
}

const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      bottom: 0,
      left: 'center',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    series: [
      {
        name: '设备状态',
        type: 'pie',
        radius: ['60%', '75%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: [
          {
            value: stats.normal,
            name: '正常设备',
            itemStyle: { color: '#08A3A5' }
          },
          {
            value: stats.abnormal,
            name: '异常设备',
            itemStyle: { color: '#F53F3F' }
          }
        ]
      }
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: 'center',
        style: {
          text: `${stats.intactRate}%`,
          textAlign: 'center',
          fill: '#08A3A5',
          fontSize: 20,
          fontWeight: 'bold'
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

.c-device-status-chart {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-status-chart__container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
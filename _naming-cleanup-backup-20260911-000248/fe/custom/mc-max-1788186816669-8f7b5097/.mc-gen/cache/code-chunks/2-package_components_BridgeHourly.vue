<template>
  <div class="c-monitor-section c-monitor-bridge-hourly">
    <div class="c-monitor-section-header">
      <img :src="icon1" class="c-monitor-title-icon" alt="" />
      <span>江阴大桥</span>
    </div>
    <div class="c-monitor-section-body" :style="{ backgroundImage: 'url(' + bg2 + ')' }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-blue"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-orange"></i>
          上海方向
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明
const icon1 = ref('')
const bg2 = ref('')

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.15)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      axisLabel: { show: true, fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: { show: true, fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.08)' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [2200, 2600, 3000, 3400, 3600, 3800, 3700, 3500, 3300, 3000, 2600, 2200, 2000, 1800, 2000, 2400, 2800, 3200, 3400, 3200, 2800, 2400, 2000, 1600],
        itemStyle: { color: '#1890ff' },
        barWidth: 6,
        markLine: {
          silent: true,
          lineStyle: {
            color: '#ff9800',
            type: 'dashed'
          },
          data: [{ yAxis: 3000 }],
          label: {
            formatter: '建议分流',
            position: 'end',
            fontSize: 10
          }
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [2000, 2400, 2800, 3200, 3400, 3600, 3500, 3300, 3100, 2800, 2400, 2000, 1800, 1600, 1800, 2200, 2600, 3000, 3200, 3000, 2600, 2200, 1800, 1400],
        itemStyle: { color: '#ff9800' },
        barWidth: 6
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
</style>

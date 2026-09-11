<template>
  <div class="c-monitor-bridge-chart-section">
    <div class="c-monitor-chart-header">
      <span class="c-monitor-chart-title">江阴大桥</span>
    </div>
    <div class="c-monitor-chart-body">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [500, 800, 1200, 1800, 2500, 3200, 3800, 3500, 3000, 2400, 1800, 1200, 600],
  shanghai: [600, 900, 1300, 1900, 2600, 3300, 3900, 3600, 3100, 2500, 1900, 1300, 700]
})

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(24, 144, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          result += `${p.seriesName} ${p.value}车<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      right: 16,
      top: 8,
      textStyle: { color: '#333333', fontSize: 12 },
      itemWidth: 12,
      itemHeight: 12
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
      data: chartData.value.hours,
      name: '时',
      nameTextStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'grouped-bar',
        data: chartData.value.beijing,
        itemStyle: { color: '#1890FF' },
        barWidth: '40%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#FF7A45', width: 2 },
          label: { show: true, position: 'end', formatter: '建议分流', color: '#FF7A45', fontSize: 12 },
          data: [{ yAxis: 4000 }]
        }
      },
      {
        name: '上海方向',
        type: 'grouped-bar',
        data: chartData.value.shanghai,
        itemStyle: { color: '#FF7A45' },
        barWidth: '40%'
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
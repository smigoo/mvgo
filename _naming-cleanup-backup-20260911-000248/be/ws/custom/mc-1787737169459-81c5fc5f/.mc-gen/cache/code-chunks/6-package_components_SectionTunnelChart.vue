<template>
  <div class="c-monitor-section-tunnel">
    <div class="c-monitor-section-header">
      <span class="c-monitor-section-title">江阴靖江长江隧道</span>
    </div>
    <div class="c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0, 0, 0, 0.05)' } }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: '#666666', fontSize: 12 }
    },
    grid: {
      left: 10,
      right: 20,
      top: 36,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#999999', fontSize: 11, margin: 10 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#999999', fontSize: 11 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 8,
        barGap: '30%',
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        data: [1200, 1500, 1800, 2200, 2800, 3200, 3500, 3800, 3600, 3000, 2400, 1800]
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 8,
        itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
        data: [1000, 1300, 1600, 2000, 2500, 2900, 3100, 3400, 3200, 2800, 2200, 1600]
      },
      {
        name: '建议分流',
        type: 'line',
        symbol: 'none',
        lineStyle: { color: '#fa8c16', type: 'dashed', width: 1.5 },
        markLine: {
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: '#fa8c16', type: 'dashed', width: 1.5 },
          data: [{ yAxis: 3000 }]
        },
        data: []
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

const handleResize = () => { if (chart) chart.resize() }

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

.c-monitor-section-tunnel {
  width: 100%;
  flex: 200 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-section-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 32px;
  margin-bottom: 8px;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  display: flex;
  align-items: center;
  
  &::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    background: #1990ff;
    transform: rotate(45deg);
    margin-right: 8px;
    flex-shrink: 0;
  }
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
}
</style>
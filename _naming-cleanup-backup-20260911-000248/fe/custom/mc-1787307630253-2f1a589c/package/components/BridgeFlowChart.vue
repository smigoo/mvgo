<template>
  <div class="c-monitor-bridge-flow">
    <div class="c-monitor-bridge-flow-header">
      <div class="c-monitor-bridge-flow-title-bar"></div>
      <span class="c-monitor-bridge-flow-title">江阴大桥</span>
      <div class="c-monitor-bridge-flow-legend">
        <span 
          class="c-monitor-bridge-flow-legend-item" 
          :class="{ 'is-active': legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-bridge-flow-legend-dot" style="background: #1890ff;"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-bridge-flow-legend-item" 
          :class="{ 'is-active': legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-bridge-flow-legend-dot" style="background: #69c0ff;"></i>
          上海方向
        </span>
      </div>
    </div>
    <div class="c-monitor-bridge-flow-chart-wrapper">
      <div ref="chartRef" class="c-monitor-bridge-flow-chart"></div>
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

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [100, 200, 150, 300, 400, 600, 800, 825, 500, 300, 200, 100]
const shanghaiData = [120, 180, 160, 280, 420, 580, 750, 831, 480, 320, 220, 110]

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
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
            <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:2px;"></span>
            <span>${p.seriesName}</span>
            <span style="margin-left:auto;font-weight:500;">${p.value} 辆</span>
          </div>`
        })
        return res
      }
    },
    legend: { show: false },
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 4,
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#fa8c16', type: 'dashed' },
          data: [{ yAxis: 3000, label: { formatter: '建议分流', color: '#fa8c16', fontSize: 12 } }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] }
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

.c-monitor-bridge-flow {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  
  &-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    flex-shrink: 0;
  }
  
  &-title-bar {
    width: 3px;
    height: 12px;
    background: #388dff;
    border-radius: 6px;
    margin-right: 3px;
  }
  
  &-title {
    font-size: 14px;
    font-weight: 400;
    line-height: 21px;
    color: #333333;
  }
  
  &-legend {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
  
  &-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    color: #333333;
    cursor: pointer;
    transition: opacity 0.3s;
    
    &.is-active {
      opacity: 1;
    }
    
    &:not(.is-active) {
      opacity: 0.4;
    }
  }
  
  &-legend-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  
  &-chart-wrapper {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
  }
  
  &-chart {
    width: 100%;
    height: 100%;
  }
}
</style>
<template>
  <div class="c-monitor-section c-monitor-section-tunnel">
    <div class="c-monitor-section-header">
      <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ 'is-active': legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ 'is-active': legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #13c2c2;"></i>上海方向
        </span>
      </div>
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

const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const xData = Array.from({ length: 23 }, (_, i) => `${i + 2}时`)
const beijingData = [1200, 800, 600, 500, 700, 1500, 2800, 3200, 2900, 2600, 2400, 2200, 2500, 2800, 3100, 3400, 3200, 2800, 2200, 1800, 1500, 1200, 900]
const shanghaiData = [1000, 700, 500, 400, 600, 1200, 2400, 2900, 2700, 2400, 2100, 1900, 2200, 2500, 2800, 3000, 2900, 2500, 2000, 1600, 1300, 1000, 800]

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        let res = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`
        params.forEach(p => {
          res += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b> 辆</div>`
        })
        return res
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 10, 
      right: 20, 
      top: 20, 
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisLabel: { color: '#666', fontSize: 11 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 11 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: 8,
        barGap: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d6' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: 8,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#fa8c16',
            type: 'dashed',
            width: 1.5
          },
          label: {
            formatter: '建议分流',
            color: '#fa8c16',
            fontSize: 11,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 3000 }]
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

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-section-tunnel {
  display: flex;
  flex-direction: column;
  flex: 220 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 32px;
  padding: 0 4px;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  transition: opacity 0.3s;
  white-space: nowrap;

  &.is-active {
    color: #333333;
  }

  &:not(.is-active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
}
</style>
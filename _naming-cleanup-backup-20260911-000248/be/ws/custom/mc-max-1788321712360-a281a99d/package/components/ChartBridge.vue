<template>
  <div class="c-monitor-chart-bridge">
    <div class="c-monitor-chart-bridge-header">
      <div class="c-monitor-chart-bridge-title" :style="{ backgroundImage: `url(${bg3})` }">
        <span class="c-monitor-chart-bridge-title-icon"></span>
        <span class="c-monitor-chart-bridge-title-text">江阴大桥</span>
      </div>
      <div class="c-monitor-chart-bridge-legend">
        <span 
          class="c-monitor-chart-bridge-legend-item" 
          :class="{'is-active': legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-chart-bridge-legend-dot c-monitor-chart-bridge-legend-dot--beijing"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-chart-bridge-legend-item" 
          :class="{'is-active': legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-chart-bridge-legend-dot c-monitor-chart-bridge-legend-dot--shanghai"></i>
          上海方向
        </span>
      </div>
    </div>
    <div class="c-monitor-chart-bridge-chart" ref="chartRef"></div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'


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

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [600, 400, 200, 600, 800, 1200, 1600, 2000, 2400, 1800, 1200, 800]
const shanghaiData = [400, 300, 200, 400, 600, 1000, 1400, 1800, 2200, 1600, 1000, 600]

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px">${params[0].axisValue}时</div>`;
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
            <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:1px"></span>
            <span>${p.seriesName}</span>
            <span style="margin-left:auto;font-weight:500">${p.value} 辆</span>
          </div>`;
        });
        return res;
      }
    },
    legend: { show: false },
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -10] },
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisTick: { show: true, alignWithLabel: true },
      axisLine: { lineStyle: { color: '#e8e8e8' } }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 30, 0, 0] },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 4,
        barGap: '30%',
        itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff984e', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 2000,
              name: '建议分流',
              label: {
                formatter: '建议分流',
                color: '#ff984e',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        itemStyle: { color: '#7dd3fc', borderRadius: [2, 2, 0, 0] }
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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-chart-bridge {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-bridge-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.c-monitor-chart-bridge-title {
  display: flex;
  align-items: center;
  gap: 3px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: left center;
  padding-left: 4px;
}

.c-monitor-chart-bridge-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-chart-bridge-title-text {
  font-size: @fontSize;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-bridge-legend {
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-monitor-chart-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: calc(@fontSize * 0.8571);
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

.c-monitor-chart-bridge-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;

  &--beijing {
    background: #3b82f6;
  }

  &--shanghai {
    background: #7dd3fc;
  }
}

.c-monitor-chart-bridge-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
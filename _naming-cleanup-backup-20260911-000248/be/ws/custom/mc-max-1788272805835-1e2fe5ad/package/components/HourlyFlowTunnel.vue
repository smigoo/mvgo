<template>
  <div class="c-monitor-hourly-tunnel">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <span class="c-monitor-section-icon"></span>
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>
    <div class="c-monitor-chart-wrapper">
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ inactive: !legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ inactive: !legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #ff7a45;"></i>
          上海方向
        </span>
      </div>
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
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [120, 250, 380, 520, 850, 1250, 1600, 825, 1850, 2300, 1550, 820]
const shanghaiData = [150, 280, 420, 600, 950, 1350, 1700, 831, 1950, 2450, 1650, 900]

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        let res = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          res += `${p.marker} ${p.seriesName}: ${p.value} 辆<br/>`
        })
        return res
      }
    },
    legend: { show: false },
    grid: { left: 35, right: 15, top: 15, bottom: 25, containLabel: false },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { color: '#999', fontSize: 12 },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: { color: '#999', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 4,
        barGap: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff7a45', type: 'dashed', width: 1 },
          data: [{ 
            yAxis: 2000, 
            name: '建议分流',
            label: {
              show: true,
              position: 'end',
              formatter: '建议分流',
              color: '#ff7a45',
              fontSize: 12
            }
          }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: { color: '#ff7a45', borderRadius: [2, 2, 0, 0] },
        barWidth: 4
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

.c-monitor-hourly-tunnel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-section-icon {
  width: 3px;
  height: 12px;
  background: #388dff;
  border-radius: 6px;
}

.c-monitor-section-title {
  font-size: var(--fontSize, 14px);
  color: #333333;
  font-weight: 400;
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-legend {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  cursor: pointer;
  transition: opacity 0.3s;

  &.inactive {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 2px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
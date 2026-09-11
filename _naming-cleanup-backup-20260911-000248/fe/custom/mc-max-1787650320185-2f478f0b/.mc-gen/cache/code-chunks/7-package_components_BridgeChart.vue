<template>
  <div class="c-monitor-section-bridge">
    <div class="c-monitor-section-header">
      <img :src="icon6" class="c-monitor-section-icon" alt="icon" />
      <span class="c-monitor-section-title">江阴大桥</span>
    </div>
    <div class="c-monitor-chart-body">
      <div class="c-monitor-chart-legend">
        <span
          class="c-monitor-legend-item"
          :class="{ 'is-active': legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #1890ff"></i>
          <span>北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ 'is-active': legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #13c2c2"></i>
          <span>上海方向</span>
        </span>
      </div>
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化 ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// Mock 数据 (2-24时)
const xData = Array.from({ length: 23 }, (_, i) => `${i + 2}时`)
const beijingData = [1200, 1500, 1800, 2200, 2800, 3200, 3500, 3100, 2600, 2100, 1800, 1500, 1200, 1000, 900, 1100, 1400, 1900, 2400, 2900, 3300, 2800, 2000]
const shanghaiData = [1000, 1300, 1600, 2000, 2500, 2900, 3100, 2800, 2300, 1900, 1600, 1300, 1100, 900, 800, 1000, 1300, 1700, 2200, 2700, 3000, 2500, 1800]

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px">${params[0].axisValue}</div>`
        params.forEach(p => {
          res += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b> 辆</div>`
        })
        return res
      }
    },
    legend: { show: false },
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 11 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 8,
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#fa8c16', type: 'dashed', width: 1.5 },
          label: {
            formatter: '建议分流',
            color: '#fa8c16',
            fontSize: 11,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 3000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 8,
        itemStyle: { color: '#13c2c2', borderRadius: [2, 2, 0, 0] }
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

.c-monitor-section-bridge {
  width: 100%;
  flex: 200 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.c-monitor-chart-legend {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #666666;
  transition: opacity 0.3s;

  &.is-active {
    color: #333333;
  }

  &:not(.is-active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
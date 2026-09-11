<template>
  <div class="c-monitor-tunnel-chart-root">
    <div class="c-monitor-tunnel-chart-header">
      <div class="c-monitor-tunnel-chart-indicator"></div>
      <span class="c-monitor-tunnel-chart-title">江阴靖江长江隧道</span>
    </div>
    <div class="c-monitor-tunnel-chart-legend">
      <div
        class="c-monitor-tunnel-chart-legend-item"
        :class="{ inactive: !legendState.beijing }"
        @click="toggleLegend('北京方向', 'beijing')"
      >
        <span class="c-monitor-tunnel-chart-legend-dot" style="background: #1990ff"></span>
        <span>北京方向</span>
      </div>
      <div
        class="c-monitor-tunnel-chart-legend-item"
        :class="{ inactive: !legendState.shanghai }"
        @click="toggleLegend('上海方向', 'shanghai')"
      >
        <span class="c-monitor-tunnel-chart-legend-dot" style="background: #00d2ff"></span>
        <span>上海方向</span>
      </div>
    </div>
    <div ref="chartRef" class="c-monitor-tunnel-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[TunnelChart] $mcComponentBuilder 失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({
  beijing: true,
  shanghai: true
})

const toggleLegend = (name, key) => {
  legendState.value[key] = !legendState.value[key]
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
}

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let res = `<div style="font-size:12px;color:#333;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:2px;"></span>
            <span style="color:#666;">${p.seriesName}</span>
            <span style="margin-left:auto;font-weight:500;color:#333;">${p.value}辆</span>
          </div>`
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
      right: 10,
      top: 10,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12, formatter: '{value}时' }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        barGap: '20%',
        data: [600, 400, 200, 600, 1200, 1800, 2400, 3200, 2800, 2000, 1400, 800],
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff7a45', type: 'dashed', width: 1 },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '建议分流',
            color: '#ff7a45',
            fontSize: 12
          },
          data: [{ yAxis: 3000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        data: [500, 300, 200, 500, 1000, 1600, 2200, 3000, 2600, 1800, 1200, 600],
        itemStyle: {
          color: '#00d2ff',
          borderRadius: [2, 2, 0, 0]
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

.c-monitor-tunnel-chart-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-tunnel-chart-header {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-tunnel-chart-indicator {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
}

.c-monitor-tunnel-chart-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-tunnel-chart-legend {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.c-monitor-tunnel-chart-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.3s;

  &.inactive {
    color: #999999;
    .c-monitor-tunnel-chart-legend-dot {
      opacity: 0.3;
    }
  }
}

.c-monitor-tunnel-chart-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-tunnel-chart-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  min-width: 0;
}
</style>
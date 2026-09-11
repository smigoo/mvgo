<template>
  <div class="c-monitor-tunnel-hourly">
    <div class="c-monitor-tunnel-header">
      <div class="c-monitor-tunnel-header-icon"></div>
      <span class="c-monitor-tunnel-header-title">江阴靖江长江隧道</span>
    </div>
    <div class="c-monitor-tunnel-chart-wrapper">
      <div ref="chartRef" class="c-monitor-tunnel-chart"></div>
    </div>
    <div class="c-monitor-tunnel-legend">
      <div 
        class="c-monitor-legend-item" 
        :class="{ inactive: !legendState.beijing }" 
        @click="toggleLegend('北京方向')"
      >
        <span class="c-monitor-legend-dot" style="background: #1890ff;"></span>
        <span class="c-monitor-legend-text">北京方向</span>
      </div>
      <div 
        class="c-monitor-legend-item" 
        :class="{ inactive: !legendState.shanghai }" 
        @click="toggleLegend('上海方向')"
      >
        <span class="c-monitor-legend-dot" style="background: #ff7766;"></span>
        <span class="c-monitor-legend-text">上海方向</span>
      </div>
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
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
  updateChart()
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
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.05)' } },
      formatter: (params) => {
        let res = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          res += `${p.marker}${p.seriesName} ${p.value}辆<br/>`
        })
        return res
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向'],
      selected: {
        '北京方向': legendState.value.beijing,
        '上海方向': legendState.value.shanghai
      }
    },
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
      nameTextStyle: { color: '#999', fontSize: 12 },
      axisLabel: { color: '#999', fontSize: 12 },
      axisTick: { show: true, alignWithLabel: true },
      axisLine: { lineStyle: { color: '#e8e8e8' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: { color: '#999', fontSize: 12 },
      axisLabel: { color: '#999', fontSize: 12 },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [120, 200, 150, 80, 70, 110, 130, 825, 380, 320, 200, 150],
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 4,
        barGap: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff7766', type: 'dashed', width: 1 },
          data: [{ yAxis: 300, name: '建议分流' }],
          label: { 
            show: true, 
            position: 'insideEndTop', 
            formatter: '建议分流', 
            color: '#ff7766', 
            fontSize: 12 
          }
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [150, 180, 120, 90, 60, 100, 140, 831, 350, 300, 180, 120],
        itemStyle: { color: '#ff7766', borderRadius: [2, 2, 0, 0] },
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

.c-monitor-tunnel-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-tunnel-header {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-tunnel-header-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-tunnel-header-title {
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-tunnel-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-tunnel-chart {
  width: 100%;
  height: 100%;
}

.c-monitor-tunnel-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-top: 8px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: opacity 0.3s;
  
  &.inactive {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-legend-text {
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  line-height: 18px;
}
</style>
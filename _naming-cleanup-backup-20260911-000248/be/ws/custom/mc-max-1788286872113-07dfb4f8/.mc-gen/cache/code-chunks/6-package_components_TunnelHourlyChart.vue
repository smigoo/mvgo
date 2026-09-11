<template>
  <div class="c-monitor-tunnel-hourly-chart">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-group">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- Chart Body -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      
      <!-- Custom Legend -->
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: rgba(25,144,255,1);"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: rgba(255,127,80,1);"></i>
          上海方向
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据
const mockData = {
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 300, 250, 400, 350, 500, 600, 700, 825, 650, 550, 450, 300],
  shanghai: [250, 320, 280, 420, 380, 520, 620, 720, 831, 670, 570, 470, 320]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let html = `<div style="padding: 4px 8px;">`
        html += `<div style="margin-bottom: 4px; font-weight: 500;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">`
          html += `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>`
          html += `<span>${p.seriesName}</span>`
          html += `<span style="font-weight: 600; margin-left: auto;">${p.value}</span>`
          html += `<span style="color: #666;">辆</span>`
          html += `</div>`
        })
        html += `</div>`
        return html
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.xAxis,
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } },
      axisTick: { show: true }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1000,
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: true },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        itemStyle: { color: 'rgba(25,144,255,1)', borderRadius: [2, 2, 0, 0] },
        barWidth: 8,
        barGap: '20%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        itemStyle: { color: 'rgba(255,127,80,1)', borderRadius: [2, 2, 0, 0] },
        barWidth: 8,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: 'rgba(255,152,78,1)', type: 'dashed', width: 2 },
          label: { position: 'end', formatter: '建议分流', color: '#ff984e', fontSize: 12 },
          data: [{ yAxis: 700 }]
        }
      }
    ]
  }

  chart.setOption(option, true)
}

// 初始化图表
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 窗口 resize 处理
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

.c-monitor-tunnel-hourly-chart {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-section-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-body {
  flex: 150 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  position: relative;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 18px;
  color: #333333;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
</style>

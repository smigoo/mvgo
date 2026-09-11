<template>
  <div class="c-monitor-trend-container">
    <!-- 隧道流量 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <span class="c-monitor-chart-title">江阴靖江长江隧道</span>
        <div class="c-monitor-legend">
          <span class="c-monitor-legend-item"><i class="c-monitor-legend-icon" style="background:#1588f8"></i>北京方向</span>
          <span class="c-monitor-legend-item"><i class="c-monitor-legend-icon" style="background:#00d0ff"></i>上海方向</span>
        </div>
      </div>
      <div ref="tunnelChartRef" class="c-monitor-chart-canvas"></div>
    </div>

    <!-- 大桥流量 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <span class="c-monitor-chart-title">江阴大桥</span>
        <div class="c-monitor-legend">
          <span class="c-monitor-legend-item"><i class="c-monitor-legend-icon" style="background:#1588f8"></i>北京方向</span>
          <span class="c-monitor-legend-item"><i class="c-monitor-legend-icon" style="background:#00d0ff"></i>上海方向</span>
        </div>
      </div>
      <div ref="bridgeChartRef" class="c-monitor-chart-canvas"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

/* [Data Refine] 固定示例数据，严禁使用 Math.random() 伪造数据 */
const beijingData = [1200, 1100, 900, 800, 1000, 1500, 2200, 2800, 3200, 2900, 2500, 2100, 1900, 2000, 2400, 2800, 3100, 3500, 3200, 2800, 2200, 1800, 1500, 1300]
const shanghaiData = [1100, 1000, 850, 750, 950, 1400, 2100, 2700, 3100, 2800, 2400, 2000, 1800, 1900, 2300, 2700, 3000, 3400, 3100, 2700, 2100, 1700, 1400, 1200]

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let resizeObserver = null

const getBarOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.05)' } }
    },
    grid: { left: 10, right: 20, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => i),
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12, interval: 1 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: { 
          borderRadius: [2, 2, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ])
        },
        barWidth: 4,
        barGap: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff984e', type: 'dashed', width: 1 },
          data: [{ yAxis: 3000, label: { formatter: '建议分流', color: '#ff984e', fontSize: 12, position: 'insideEndTop' } }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: { 
          borderRadius: [2, 2, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d7' }
          ])
        },
        barWidth: 4
      }
    ]
  }
}

const initCharts = () => {
  if (tunnelChartRef.value && !tunnelChart) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(getBarOption())
  }
  if (bridgeChartRef.value && !bridgeChart) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(getBarOption())
  }
}

onMounted(() => {
  initCharts()
  resizeObserver = new ResizeObserver(() => {
    tunnelChart?.resize()
    bridgeChart?.resize()
  })
  if (tunnelChartRef.value) resizeObserver.observe(tunnelChartRef.value)
  if (bridgeChartRef.value) resizeObserver.observe(bridgeChartRef.value)
})

onUnmounted(() => {
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  resizeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-trend-container {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.c-monitor-legend {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #333333;
}

.c-monitor-legend-icon {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
</style>
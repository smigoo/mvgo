<template>
  <div class="c-monitor-trend-container">
    <div class="c-monitor-trend-block">
      <div class="c-monitor-trend-header">
        <span class="c-monitor-trend-icon"></span>
        <span class="c-monitor-trend-title">江阴靖江长江隧道</span>
      </div>
      <div class="c-monitor-trend-chart-wrapper">
        <div class="c-monitor-trend-legend">
          <span 
            class="c-monitor-trend-legend-item" 
            :class="{ active: tunnelLegend.beijing }" 
            @click="toggleTunnelLegend('北京方向', 'beijing')"
          >
            <i class="c-monitor-trend-legend-dot" style="background: #1890ff;"></i>
            北京方向
          </span>
          <span 
            class="c-monitor-trend-legend-item" 
            :class="{ active: tunnelLegend.shanghai }" 
            @click="toggleTunnelLegend('上海方向', 'shanghai')"
          >
            <i class="c-monitor-trend-legend-dot" style="background: #69c0ff;"></i>
            上海方向
          </span>
        </div>
        <div ref="tunnelChartRef" class="c-monitor-trend-chart"></div>
      </div>
    </div>

    <div class="c-monitor-trend-block">
      <div class="c-monitor-trend-header">
        <span class="c-monitor-trend-icon"></span>
        <span class="c-monitor-trend-title">江阴大桥</span>
      </div>
      <div class="c-monitor-trend-chart-wrapper">
        <div class="c-monitor-trend-legend">
          <span 
            class="c-monitor-trend-legend-item" 
            :class="{ active: bridgeLegend.beijing }" 
            @click="toggleBridgeLegend('北京方向', 'beijing')"
          >
            <i class="c-monitor-trend-legend-dot" style="background: #1890ff;"></i>
            北京方向
          </span>
          <span 
            class="c-monitor-trend-legend-item" 
            :class="{ active: bridgeLegend.shanghai }" 
            @click="toggleBridgeLegend('上海方向', 'shanghai')"
          >
            <i class="c-monitor-trend-legend-dot" style="background: #69c0ff;"></i>
            上海方向
          </span>
        </div>
        <div ref="bridgeChartRef" class="c-monitor-trend-chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[FlowTrend] $mcComponentBuilder 失败:', e)
}

const xData = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const tunnelData = {
  beijing: [100, 50, 30, 80, 200, 400, 600, 800, 1200, 1500, 1000, 600, 200],
  shanghai: [120, 60, 40, 100, 250, 450, 650, 850, 1300, 1600, 1100, 700, 250]
}

const bridgeData = {
  beijing: [200, 100, 80, 150, 400, 800, 1200, 1500, 2000, 2500, 1800, 1000, 400],
  shanghai: [220, 120, 90, 180, 450, 850, 1300, 1600, 2200, 2700, 2000, 1200, 500]
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let observer = null

const tunnelLegend = ref({ beijing: true, shanghai: true })
const bridgeLegend = ref({ beijing: true, shanghai: true })

const getChartOption = (data) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: { color: '#333', fontSize: 12 },
    axisPointer: { type: 'shadow' }
  },
  grid: {
    left: 10, right: 20, top: 10, bottom: 10,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: xData,
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisLabel: { color: '#666', fontSize: 10 },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    max: 4000,
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 10 }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: data.beijing,
      itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4,
      barGap: '30%',
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#fa8c16', type: 'dashed', width: 1 },
        label: { 
          formatter: '建议分流', 
          color: '#fa8c16', 
          fontSize: 10,
          position: 'insideEndTop'
        },
        data: [{ yAxis: 2500 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      data: data.shanghai,
      itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4
    }
  ]
})

const updateTunnelChart = () => {
  if (!tunnelChart) return
  tunnelChart.setOption(getChartOption(tunnelData), true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  bridgeChart.setOption(getChartOption(bridgeData), true)
}

const initAllCharts = () => {
  if (!tunnelChart && tunnelChartRef.value) {
    const { clientWidth, clientHeight } = tunnelChartRef.value
    if (clientWidth > 0 && clientHeight > 0) {
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  }
  if (!bridgeChart && bridgeChartRef.value) {
    const { clientWidth, clientHeight } = bridgeChartRef.value
    if (clientWidth > 0 && clientHeight > 0) {
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
    }
  }
  
  if ((!tunnelChart || !bridgeChart) && !observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          if (!tunnelChart && tunnelChartRef.value) {
            tunnelChart = echarts.init(tunnelChartRef.value)
            updateTunnelChart()
          }
          if (!bridgeChart && bridgeChartRef.value) {
            bridgeChart = echarts.init(bridgeChartRef.value)
            updateBridgeChart()
          }
          if (tunnelChart && bridgeChart) {
            observer?.disconnect()
            observer = null
          }
        }
      }
    })
    if (tunnelChartRef.value) observer.observe(tunnelChartRef.value)
    if (bridgeChartRef.value) observer.observe(bridgeChartRef.value)
  }
}

const toggleTunnelLegend = (name, key) => {
  tunnelChart?.dispatchAction({ type: 'legendToggleSelect', name })
  tunnelLegend.value[key] = !tunnelLegend.value[key]
}

const toggleBridgeLegend = (name, key) => {
  bridgeChart?.dispatchAction({ type: 'legendToggleSelect', name })
  bridgeLegend.value[key] = !bridgeLegend.value[key]
}

watch(tunnelChartRef, (newRef) => { if (newRef) initAllCharts() })
watch(bridgeChartRef, (newRef) => { if (newRef) initAllCharts() })

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initAllCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  observer?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-trend-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.c-monitor-trend-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-trend-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-trend-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-trend-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-trend-chart-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-trend-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  margin-bottom: 4px;
}

.c-monitor-trend-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.3s;

  &.active {
    opacity: 1;
  }

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-trend-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-trend-chart {
  flex: 1;
  width: 100%;
  min-height: 0;
  min-width: 0;
}
</style>
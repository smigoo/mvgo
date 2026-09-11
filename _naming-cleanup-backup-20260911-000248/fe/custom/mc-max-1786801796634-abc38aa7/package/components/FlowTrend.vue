<template>
  <div class="c-monitor-flow-trend">
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <div class="c-monitor-chart-title">
          <span class="c-monitor-title-decor"></span>
          <span class="c-monitor-title-text">江阴靖江长江隧道</span>
        </div>
        <div class="c-monitor-chart-legend">
          <div 
            class="c-monitor-legend-item" 
            :class="{ 'is-active': tunnelLegend.beijing }"
            @click="toggleTunnelLegend('北京方向')"
          >
            /* [Style Refine] fills[0].color → rgb(21, 136, 248) */
            <span class="c-monitor-legend-dot" style="background: #1588F8;"></span>
            <span class="c-monitor-legend-text">北京方向</span>
          </div>
          <div 
            class="c-monitor-legend-item" 
            :class="{ 'is-active': tunnelLegend.shanghai }"
            @click="toggleTunnelLegend('上海方向')"
          >
            /* [Style Refine] fills[0].color → rgb(0, 208, 255) */
            <span class="c-monitor-legend-dot" style="background: #00D0FF;"></span>
            <span class="c-monitor-legend-text">上海方向</span>
          </div>
        </div>
      </div>
      <div class="c-monitor-chart-body">
        <div ref="tunnelChartRef" class="c-monitor-chart-container"></div>
      </div>
    </div>

    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <div class="c-monitor-chart-title">
          <span class="c-monitor-title-decor"></span>
          <span class="c-monitor-title-text">江阴大桥</span>
        </div>
        <div class="c-monitor-chart-legend">
          <div 
            class="c-monitor-legend-item" 
            :class="{ 'is-active': bridgeLegend.beijing }"
            @click="toggleBridgeLegend('北京方向')"
          >
            <span class="c-monitor-legend-dot" style="background: #1588F8;"></span>
            <span class="c-monitor-legend-text">北京方向</span>
          </div>
          <div 
            class="c-monitor-legend-item" 
            :class="{ 'is-active': bridgeLegend.shanghai }"
            @click="toggleBridgeLegend('上海方向')"
          >
            <span class="c-monitor-legend-dot" style="background: #00D0FF;"></span>
            <span class="c-monitor-legend-text">上海方向</span>
          </div>
        </div>
      </div>
      <div class="c-monitor-chart-body">
        <div ref="bridgeChartRef" class="c-monitor-chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[FlowTrend] $mcComponentBuilder 失败:', e)
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelLegend = ref({ beijing: true, shanghai: true })
const bridgeLegend = ref({ beijing: true, shanghai: true })

const xData = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const tunnelBeijingData = [100, 150, 200, 300, 800, 1200, 1500, 1800, 2200, 1600, 1000, 600, 300]
const tunnelShanghaiData = [120, 180, 220, 350, 900, 1300, 1600, 1900, 2400, 1700, 1100, 700, 350]
const bridgeBeijingData = [200, 300, 400, 600, 1500, 2200, 2800, 3200, 3800, 2900, 1800, 1000, 500]
const bridgeShanghaiData = [250, 350, 450, 700, 1600, 2400, 3000, 3400, 4000, 3100, 2000, 1200, 600]

const getChartOption = (beijingData, shanghaiData) => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let res = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          res += `${p.marker} ${p.seriesName}: ${p.value} 辆<br/>`
        })
        return res
      }
    },
    legend: { show: false },
    grid: { left: 35, right: 20, top: 20, bottom: 30, containLabel: false },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisLabel: { color: '#666666', fontSize: 12 },
      axisTick: { show: false }
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
        barGap: '30%',
        /* [Style Refine] fills[0].color → rgb(21, 136, 248) */
        itemStyle: { color: '#1588F8', borderRadius: [2, 2, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          /* [Style Refine] fills[0].color → rgb(255, 152, 78) */
          lineStyle: { color: '#FF984E', type: 'dashed', width: 1 },
          data: [{ 
            yAxis: 3000, 
            label: { 
              show: true, 
              position: 'insideEndTop', 
              formatter: '建议分流', 
              color: '#fa8c16', 
              fontSize: 12 
            } 
          }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        /* [Style Refine] fills[0].color → rgb(0, 208, 255) */
        itemStyle: { color: '#00D0FF', borderRadius: [2, 2, 0, 0] }
      }
    ]
  }
}

const toggleTunnelLegend = (name) => {
  tunnelChart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  tunnelLegend.value[key] = !tunnelLegend.value[key]
}

const toggleBridgeLegend = (name) => {
  bridgeChart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  bridgeLegend.value[key] = !bridgeLegend.value[key]
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(getChartOption(tunnelBeijingData, tunnelShanghaiData))
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(getChartOption(tunnelBeijingData, tunnelShanghaiData))
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(getChartOption(bridgeBeijingData, bridgeShanghaiData))
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(getChartOption(bridgeBeijingData, bridgeShanghaiData))
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

watch(tunnelChartRef, (newRef) => { if (newRef && !tunnelChart) initTunnelChart() })
watch(bridgeChartRef, (newRef) => { if (newRef && !bridgeChart) initBridgeChart() })

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-flow-trend {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.c-monitor-chart-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-decor {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
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
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &.is-active {
    opacity: 1;
  }

  &:not(.is-active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-legend-text {
  font-size: 12px;
  color: #666666;
  line-height: 18px;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.c-monitor-chart-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
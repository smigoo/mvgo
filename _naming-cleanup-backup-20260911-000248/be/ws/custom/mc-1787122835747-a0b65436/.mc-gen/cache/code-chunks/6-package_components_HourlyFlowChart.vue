<template>
  <div class="c-hourly-flow-root">
    <div class="c-hourly-flow-card">
      <div class="c-hourly-flow-header">
        <span class="c-hourly-flow-title-decorator"></span>
        <span class="c-hourly-flow-title">江阴靖江长江隧道</span>
      </div>
      <div ref="tunnelChartRef" class="c-hourly-flow-chart"></div>
    </div>
    <div class="c-hourly-flow-card">
      <div class="c-hourly-flow-header">
        <span class="c-hourly-flow-title-decorator"></span>
        <span class="c-hourly-flow-title">江阴大桥</span>
      </div>
      <div ref="bridgeChartRef" class="c-hourly-flow-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 组件构建器安全初始化（满足 echarts 组件规范）
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[HourlyFlowChart] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const createChartOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#d9d9d9',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params : [params]
        if (!p.length) return ''
        let content = `${p[0].name}<br/>`
        p.forEach(item => {
          content += `${item.marker}${item.seriesName}: ${item.value}辆<br/>`
        })
        return content
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 8,
      textStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      selectedMode: true
    },
    grid: {
      left: 42,
      right: 16,
      top: 26,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: {
        lineStyle: { color: '#cccccc' }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      splitNumber: 5,
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      splitLine: {
        lineStyle: {
          color: '#e0e0e0',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 6,
        itemStyle: { color: '#3b82f6' },
        data: [300, 500, 700, 900, 750, 600, 800, 825, 780, 650, 500, 320]
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 6,
        itemStyle: { color: '#06b6d4' },
        data: [280, 520, 680, 880, 770, 620, 790, 831, 760, 630, 490, 300]
      }
    ]
  }
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const el = tunnelChartRef.value
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(el)
    tunnelChart.setOption(createChartOption())
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(el)
      tunnelChart.setOption(createChartOption())
    }
  })
  tunnelObserver.observe(el)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const el = bridgeChartRef.value
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(el)
    bridgeChart.setOption(createChartOption())
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(el)
      bridgeChart.setOption(createChartOption())
    }
  })
  bridgeObserver.observe(el)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

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
  tunnelChart = null
  bridgeChart = null
  tunnelObserver = null
  bridgeObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-hourly-flow-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 12px;
  box-sizing: border-box;
}

.c-hourly-flow-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.c-hourly-flow-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 6px;
}

.c-hourly-flow-title-decorator {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
}

.c-hourly-flow-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-hourly-flow-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
<template>
  <div class="c-hourly-flow-root">
    <div class="c-hourly-flow-chart-block">
      <div class="c-hourly-flow-chart-header">
        <span class="c-hourly-flow-chart-indicator"></span>
        <span class="c-hourly-flow-chart-title">江阴靖江长江隧道</span>
      </div>
      <div ref="tunnelChartRef" class="c-hourly-flow-chart-container"></div>
    </div>
    <div class="c-hourly-flow-chart-block">
      <div class="c-hourly-flow-chart-header">
        <span class="c-hourly-flow-chart-indicator"></span>
        <span class="c-hourly-flow-chart-title">江阴大桥</span>
      </div>
      <div ref="bridgeChartRef" class="c-hourly-flow-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, inject } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn('[HourlyFlowChart] $mcComponentBuilder 失败:', e) }

const hourlyFlowData = inject('hourlyFlowData', ref([]))

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const XAxisLabels = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const defaultTunnelData = {
  beijing: [520, 680, 980, 1350, 1620, 1580, 1460, 1580, 1720, 1480, 920, 640],
  shanghai: [430, 560, 820, 1180, 1420, 1380, 1300, 1400, 1520, 1260, 780, 550]
}

const defaultBridgeData = {
  beijing: [1050, 1250, 1750, 2150, 2380, 2280, 2100, 2200, 2350, 2050, 1500, 1120],
  shanghai: [920, 1080, 1550, 1950, 2180, 2080, 1920, 2000, 2150, 1880, 1350, 980]
}

const getTunnelData = () => {
  if (hourlyFlowData.value && hourlyFlowData.value.length > 0) {
    const tunnelItem = hourlyFlowData.value.find(item => item.location === '江阴靖江长江隧道' || item.id === 'chart-tunnel-hourly')
    if (tunnelItem) {
      return {
        beijing: tunnelItem.beijing || tunnelItem[0] || [],
        shanghai: tunnelItem.shanghai || tunnelItem[1] || []
      }
    }
  }
  return defaultTunnelData
}

const getBridgeData = () => {
  if (hourlyFlowData.value && hourlyFlowData.value.length > 0) {
    const bridgeItem = hourlyFlowData.value.find(item => item.location === '江阴大桥' || item.id === 'chart-bridge-hourly')
    if (bridgeItem) {
      return {
        beijing: bridgeItem.beijing || bridgeItem[0] || [],
        shanghai: bridgeItem.shanghai || bridgeItem[1] || []
      }
    }
  }
  return defaultBridgeData
}

const buildChartOption = (data) => {
  const beijingData = Array.isArray(data.beijing) ? data.beijing : []
  const shanghaiData = Array.isArray(data.shanghai) ? data.shanghai : []

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(25,144,255,0.06)'
        }
      },
      formatter: (params) => {
        if (!params || params.length === 0) return ''
        const hourLabel = params[0].name
        let result = `${hourLabel}时`
        params.forEach(param => {
          result += `<br/>${param.seriesName}: ${param.value} 辆`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 2,
      right: 0,
      icon: 'rect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    grid: {
      left: 12,
      right: 20,
      top: 32,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: XAxisLabels,
      boundaryGap: true,
      axisLine: {
        lineStyle: { color: '#d9d9d9' }
      },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#666666',
        interval: 0,
        margin: 8
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#666666'
      },
      splitLine: {
        lineStyle: {
          color: '#e8ecf0',
          type: 'solid',
          width: 1
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: '22%',
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#40a9ff'
          }
        },
        z: 2
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: '22%',
        itemStyle: {
          color: '#69c0ff',
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#91d5ff'
          }
        },
        z: 2
      }
    ],
    markLine: {
      symbol: 'none',
      silent: true,
      lineStyle: {
        type: 'dashed',
        color: '#fa8c16',
        width: 1.5,
        opacity: 0.9
      },
      label: {
        formatter: '建议分流',
        position: 'insideEndTop',
        color: '#fa8c16',
        fontSize: 12,
        fontWeight: '400',
        padding: [0, 0, 2, 0]
      },
      data: [
        { yAxis: 3200 }
      ]
    }
  }
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(buildChartOption(getTunnelData()), true)
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(buildChartOption(getTunnelData()), true)
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(buildChartOption(getBridgeData()), true)
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(buildChartOption(getBridgeData()), true)
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

const updateTunnelChart = () => {
  if (!tunnelChart) return
  tunnelChart.setOption(buildChartOption(getTunnelData()), true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  bridgeChart.setOption(buildChartOption(getBridgeData()), true)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

watch(hourlyFlowData, () => {
  updateTunnelChart()
  updateBridgeChart()
}, { deep: true })

const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('hourly-flow-chart-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
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

.c-hourly-flow-root {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.c-hourly-flow-chart-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.c-hourly-flow-chart-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
}

.c-hourly-flow-chart-indicator {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

.c-hourly-flow-chart-title {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', 'PingFang SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.c-hourly-flow-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}
</style>
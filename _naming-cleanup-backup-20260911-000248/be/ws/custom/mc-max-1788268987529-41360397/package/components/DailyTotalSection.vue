<template>
  <div class="c-monitor-daily-total-section">
    <!-- Section Header -->
    <div class="c-monitor-daily-total-header">
      <div class="c-monitor-daily-total-title">
        <span class="c-monitor-daily-total-icon"></span>
        <span class="c-monitor-daily-total-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-daily-total-time-selector">
        <a-select v-model:value="selectedTimeRange" class="c-monitor-time-select">
          <a-select-option value="24h">24小时</a-select-option>
          <a-select-option value="7d">7天</a-select-option>
          <a-select-option value="30d">30天</a-select-option>
        </a-select>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="c-monitor-daily-total-stats" :style="{ backgroundImage: `url(${bgStats})` }">
      <div class="c-monitor-stat-card c-monitor-stat-tunnel">
        <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-tunnel">34,620</span>
      </div>
      <div class="c-monitor-stat-card c-monitor-stat-bridge">
        <span class="c-monitor-stat-label">江阴大桥</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-bridge">82,379</span>
      </div>
    </div>

    <!-- Chart: 江阴靖江长江隧道 -->
    <div class="c-monitor-chart-section">
      <div class="c-monitor-chart-title">
        <span class="c-monitor-chart-icon"></span>
        <span class="c-monitor-chart-title-text">江阴靖江长江隧道</span>
      </div>
      <div ref="chartTunnelRef" class="c-monitor-chart-container" />
    </div>

    <!-- Chart: 江阴大桥 -->
    <div class="c-monitor-chart-section">
      <div class="c-monitor-chart-title">
        <span class="c-monitor-chart-icon"></span>
        <span class="c-monitor-chart-title-text">江阴大桥</span>
      </div>
      <div ref="chartBridgeRef" class="c-monitor-chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  bgStats: { type: String, default: '' }
})

const selectedTimeRange = ref('24h')

// 图表引用
const chartTunnelRef = ref(null)
const chartBridgeRef = ref(null)
let chartTunnel = null
let chartBridge = null
let tunnelObserver = null
let bridgeObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (chartInstance, name) => {
  chartInstance?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 模拟数据
const generateChartData = () => {
  const hours = Array.from({ length: 12 }, (_, i) => (i + 1) * 2)
  const beijingData = hours.map(() => Math.floor(Math.random() * 400) + 200)
  const shanghaiData = hours.map(() => Math.floor(Math.random() * 400) + 200)
  return { hours, beijingData, shanghaiData }
}

// 图表配置
const getChartOption = () => {
  const { hours, beijingData, shanghaiData } = generateChartData()
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach((p) => {
          result += `${p.seriesName}: ${p.value} 辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 10,
      right: 20,
      textStyle: { color: '#333333', fontSize: 12 },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#e8e8e8' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      splitNumber: 5,
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: { color: '#1890ff' },
        barWidth: 4
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: { color: '#69c0ff' },
        barWidth: 4
      }
    ]
  }
}

// 更新图表
const updateChart = (chart) => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
}

// 初始化图表
const initChart = (ref, setChart, setObserver) => {
  if (!ref.value) return
  const { clientWidth, clientHeight } = ref.value
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(ref.value)
    setChart(chart)
    updateChart(chart)
    return
  }
  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      observer.disconnect()
      const chart = echarts.init(ref.value)
      setChart(chart)
      updateChart(chart)
    }
  })
  setObserver(observer)
  observer.observe(ref.value)
}

// 监听 ref 变化
watch(chartTunnelRef, (newRef) => {
  if (newRef && !chartTunnel) {
    initChart(
      chartTunnelRef,
      (chart) => { chartTunnel = chart },
      (observer) => { tunnelObserver = observer }
    )
  }
})

watch(chartBridgeRef, (newRef) => {
  if (newRef && !chartBridge) {
    initChart(
      chartBridgeRef,
      (chart) => { chartBridge = chart },
      (observer) => { bridgeObserver = observer }
    )
  }
})

// 监听时间范围变化
watch(selectedTimeRange, () => {
  updateChart(chartTunnel)
  updateChart(chartBridge)
})

// 窗口尺寸变化
const handleResize = () => {
  if (chartTunnel) chartTunnel.resize()
  if (chartBridge) chartBridge.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartTunnel?.dispose()
  chartBridge?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total-section {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-daily-total-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-daily-total-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-daily-total-icon {
  width: 18px;
  height: 18px;
  background: #1990ff;
  transform: rotate(45deg);
  flex-shrink: 0;
}

.c-monitor-daily-total-title-text {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
}

.c-monitor-daily-total-time-selector {
  flex-shrink: 0;
}

.c-monitor-time-select {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    height: 30px;
    padding: 0 12px;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: calc(var(--fontSize, 14px) * 1);
    color: #333333;
    line-height: 28px;
  }
  
  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-daily-total-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 91px;
  padding: 0 32px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  margin-bottom: 16px;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.c-monitor-stat-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
}

.c-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  line-height: 1.17;
}

.c-monitor-stat-value-tunnel {
  color: #006fe3;
}

.c-monitor-stat-value-bridge {
  color: #0c9dbe;
}

.c-monitor-chart-section {
  flex: 131 1 0;
  min-height: 160px;
  margin-bottom: 12px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.c-monitor-chart-title {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  height: 21px;
  margin-bottom: 8px;
}

.c-monitor-chart-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-chart-title-text {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: #333333;
  line-height: 1.5;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
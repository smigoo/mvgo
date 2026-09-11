<template>
  <div class="c-monitor-trend-container">
    <!-- 隧道流量 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <span class="c-monitor-chart-title">江阴靖江长江隧道</span>
      </div>
      <div ref="tunnelChartRef" class="c-monitor-chart-canvas"></div>
    </div>

    <!-- 大桥流量 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <span class="c-monitor-chart-title">江阴大桥</span>
      </div>
      <div ref="bridgeChartRef" class="c-monitor-chart-canvas"></div>
    </div>

    <!-- 流量预测 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <span class="c-monitor-chart-title">流量预测</span>
        <div class="c-monitor-chart-controls">
          <div class="c-monitor-tab-group">
            <span 
              v-for="tab in predictionTabs" 
              :key="tab.value" 
              :class="['c-monitor-tab-item', { 'is-active': activePrediction === tab.value }]"
              @click="activePrediction = tab.value"
            >{{ tab.label }}</span>
          </div>
          <span class="c-monitor-holiday-link">节假日预测 ></span>
        </div>
      </div>
      <div ref="predictionChartRef" class="c-monitor-chart-canvas"></div>
      <div class="c-monitor-accuracy-bar">
        <span>准确率98%</span>
        <span>准确率96%</span>
        <span>准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  timeType: { type: String, default: '24h' }
})

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[TrafficTrend] $mcComponentBuilder 失败:', e)
}

// --- 预测 Tab ---
const predictionTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activePrediction = ref('tunnel')

// --- 图表 Refs ---
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const predictionChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let predictionChart = null

let tunnelObserver = null
let bridgeObserver = null
let predictionObserver = null

// --- 数据生成 ---
const generateBarData = () => {
  const beijing = []
  const shanghai = []
  for (let i = 0; i < 24; i++) {
    beijing.push(Math.floor(Math.random() * 2500) + 500)
    shanghai.push(Math.floor(Math.random() * 2500) + 500)
  }
  return { beijing, shanghai }
}

const generateAreaData = () => {
  return {
    actual: [1200, 1500, 1800, 2100, 2400],
    predict: [null, null, 1850, 2250, 2550]
  }
}

// --- 图表配置 ---
const getBarOption = (data) => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.05)' } }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: '#333', fontSize: 12 }
    },
    grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => i + 1),
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 10, interval: 1 }
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
          data: [{ yAxis: 3000, label: { formatter: '建议分流', color: '#fa8c16', fontSize: 10, position: 'insideEndTop' } }]
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
  }
}

const getAreaOption = (data) => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      icon: 'circle',
      itemWidth: 6,
      itemHeight: 6,
      itemGap: 16,
      textStyle: { color: '#333', fontSize: 12 }
    },
    grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 10 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#3385ff', width: 2 },
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#00cccc', width: 2 },
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
          ])
        }
      }
    ]
  }
}

// --- 初始化图表 ---
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    tunnelChart.setOption(getBarOption(generateBarData()))
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(getBarOption(generateBarData()))
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    bridgeChart.setOption(getBarOption(generateBarData()))
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(getBarOption(generateBarData()))
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

const initPredictionChart = () => {
  if (!predictionChartRef.value) return
  const { clientWidth, clientHeight } = predictionChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    predictionChart = echarts.init(predictionChartRef.value)
    predictionChart.setOption(getAreaOption(generateAreaData()))
    return
  }
  predictionObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !predictionChart) {
      predictionObserver?.disconnect()
      predictionChart = echarts.init(predictionChartRef.value)
      predictionChart.setOption(getAreaOption(generateAreaData()))
    }
  })
  predictionObserver.observe(predictionChartRef.value)
}

// --- 更新图表 ---
const updateCharts = () => {
  if (tunnelChart) tunnelChart.setOption(getBarOption(generateBarData()), true)
  if (bridgeChart) bridgeChart.setOption(getBarOption(generateBarData()), true)
  if (predictionChart) predictionChart.setOption(getAreaOption(generateAreaData()), true)
}

// --- 监听 Refs ---
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})
watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})
watch(predictionChartRef, (newRef) => {
  if (newRef && !predictionChart) initPredictionChart()
})

// --- 监听 timeType ---
watch(() => props.timeType, () => {
  updateCharts()
})

// --- 监听 prediction tab ---
watch(activePrediction, () => {
  if (predictionChart) predictionChart.setOption(getAreaOption(generateAreaData()), true)
})

// --- 生命周期 ---
onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  initPredictionChart()
})

onUnmounted(() => {
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  predictionChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
  predictionObserver?.disconnect()
})
</script>
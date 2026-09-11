<template>
  <div class="c-monitor-trend-root">
    <div class="c-monitor-trend-header">
      <div class="c-monitor-trend-title">
        <img :src="icon3" class="c-monitor-trend-icon" />
        <span class="c-monitor-trend-text">流量预测</span>
      </div>
      <div class="c-monitor-trend-tabs">
        <div 
          v-for="tab in tabs" 
          :key="tab.value"
          :class="['c-monitor-trend-tab', { active: activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-trend-link" @click="handleHolidayClick">
        节假日预测>
      </div>
    </div>
    
    <div class="c-monitor-trend-chart-wrapper">
      <div ref="chartRef" class="c-monitor-trend-chart"></div>
    </div>
    
    <div class="c-monitor-trend-accuracy">
      <span v-for="(acc, index) in currentAccuracy" :key="index" class="c-monitor-trend-accuracy-item">
        {{ acc }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, inject, computed } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[MonitorTrend] $mcComponentBuilder 失败:', e)
}

// --- 注入父组件状态 ---
const activeTime = inject('activeTime', ref('24h'))

// --- 响应式状态 ---
const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]

const activeTab = ref('tunnel')

const accuracyMap = {
  tunnel: ['准确率98%', '准确率96%', '准确率92%'],
  bridge: ['准确率95%', '准确率93%', '准确率90%']
}

const currentAccuracy = computed(() => accuracyMap[activeTab.value])

const chartDataMap = {
  tunnel: {
    actual: [1200, 1800, 2500, 2200, 1900],
    predict: [1100, 1700, 2600, 2400, 2100]
  },
  bridge: {
    actual: [3200, 4100, 5500, 4800, 4200],
    predict: [3000, 4000, 5800, 5200, 4500]
  }
}

// --- 图表相关 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#999' }
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 16,
      textStyle: { color: '#333', fontSize: 12 },
      icon: 'roundRect'
    },
    grid: {
      left: 10,
      right: 10,
      top: 30,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 6000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#3385ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.25)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
          ])
        },
        data: data.actual
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#00cccc' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.25)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
          ])
        },
        data: data.predict
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

// --- 监听器 ---
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

watch(activeTime, () => {
  updateChart()
})

// --- 事件处理 ---
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

const handleHolidayClick = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-holiday-click', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

const handleResize = () => {
  if (chart) chart.resize()
}

// --- 生命周期 ---
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
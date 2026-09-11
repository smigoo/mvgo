<template>
  <div class="c-monitor-trend-root">
    <div class="c-monitor-trend-header">
      <div class="c-monitor-trend-title-group">
        <img :src="icon1" alt="" class="c-monitor-trend-title-icon" />
        <span class="c-monitor-trend-title">流量预测</span>
      </div>
      <div class="c-monitor-trend-tabs">
        <div 
          v-for="tab in tabs" 
          :key="tab.value" 
          :class="['c-monitor-trend-tab-item', { 'is-active': activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-trend-link">
        节假日预测&gt;
      </div>
    </div>
    <div class="c-monitor-trend-body">
      <div class="c-monitor-trend-chart-wrapper">
        <div ref="chartRef" class="c-monitor-trend-chart"></div>
      </div>
      <div class="c-monitor-trend-accuracy">
        <span class="c-monitor-trend-accuracy-item">准确率98%</span>
        <span class="c-monitor-trend-accuracy-item">准确率96%</span>
        <span class="c-monitor-trend-accuracy-item">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[MonitorTrend] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const activeTab = ref('tunnel')
const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]

const mockData = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [1200, 1500, 1800, 2200, 2500],
    predict: [1100, 1400, 1900, 2100, 2600]
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2000, 2200, 2500, 2800, 3000],
    predict: [1900, 2100, 2600, 2700, 3100]
  }
}

// --- 图表相关 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#1890ff', type: 'dashed' } }
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
    grid: {
      top: 30,
      right: 16,
      bottom: 24,
      left: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#1890ff', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#1890ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(24,144,255,0.25)' },
            { offset: 1, color: 'rgba(24,144,255,0.02)' }
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
        itemStyle: { color: '#52c41a', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#52c41a' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82,196,26,0.25)' },
            { offset: 1, color: 'rgba(82,196,26,0.02)' }
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
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

.c-monitor-trend-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-monitor-trend-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.c-monitor-trend-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-trend-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-trend-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-trend-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.c-monitor-trend-tab-item {
  padding: 0 16px;
  height: 20px;
  line-height: 20px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid transparent;
  color: #ffffff;
  background: #6680a0;
  border-color: rgba(172, 196, 225, 1);

  &.is-active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    font-weight: 500;
  }
}

.c-monitor-trend-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-trend-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-trend-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-trend-chart {
  width: 100%;
  height: 100%;
}

.c-monitor-trend-accuracy {
  display: flex;
  justify-content: space-around;
  padding-top: 8px;
  flex-shrink: 0;
}

.c-monitor-trend-accuracy-item {
  font-size: 12px;
  font-weight: 500;
  color: #52c41a;
}
</style>
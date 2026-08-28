<template>
  <div class="c-monitor-flow-trend">
    <div class="c-monitor-flow-trend-header">
      <div class="c-monitor-flow-trend-title">
        <img :src="icon4" class="c-monitor-flow-trend-icon" />
        <span>流量预测</span>
      </div>
      <div class="c-monitor-flow-trend-controls">
        <div class="c-monitor-flow-trend-tabs">
          <div 
            v-for="tab in tabs" 
            :key="tab.value" 
            :class="['c-monitor-flow-trend-tab', { 'is-active': activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-monitor-flow-trend-link">节假日预测></div>
      </div>
    </div>
    
    <div class="c-monitor-flow-trend-legend">
      <div 
        v-for="item in legendItems" 
        :key="item.key" 
        class="c-monitor-flow-trend-legend-item"
        :class="{ 'is-disabled': !legendState[item.key] }"
        @click="toggleLegend(item.name, item.key)"
      >
        <span class="c-monitor-flow-trend-legend-line" :style="{ background: item.color }"></span>
        <span class="c-monitor-flow-trend-legend-dot" :style="{ borderColor: item.color }"></span>
        <span class="c-monitor-flow-trend-legend-text">{{ item.name }}</span>
      </div>
    </div>

    <div class="c-monitor-flow-trend-chart-wrapper">
      <div ref="chartRef" class="c-monitor-flow-trend-chart"></div>
    </div>

    <div class="c-monitor-flow-trend-accuracy">
      <span v-for="acc in accuracyData" :key="acc" class="c-monitor-flow-trend-accuracy-item">{{ acc }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[FlowTrend] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const activeTab = ref('tunnel')
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const legendState = ref({ actual: true, predict: true })
const legendItems = [
  { name: '实际流量', key: 'actual', color: '#3385ff' },
  { name: '预测流量', key: 'predict', color: '#00cccc' }
]

const accuracyData = ref(['准确率98%', '准确率96%', '准确率92%'])

const mockData = {
  tunnel: {
    actual: [1200, 1500, 1800, 2200, 2000],
    predict: [1100, 1400, 1900, 2100, 2300]
  },
  bridge: {
    actual: [2500, 2800, 3200, 3500, 3100],
    predict: [2400, 2700, 3100, 3600, 3300]
  }
}

// --- 图表相关 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const currentData = mockData[activeTab.value]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#ccc' } }
    },
    legend: { show: false },
    grid: {
      top: 10,
      left: 40,
      right: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
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
        showSymbol: true,
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#3385ff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
            ]
          }
        },
        data: currentData.actual
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#00cccc' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
            ]
          }
        },
        data: currentData.predict
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

const toggleLegend = (name, key) => {
  legendState.value[key] = !legendState.value[key]
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
}

const handleHolidayClick = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('flow-trend-holiday-click', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

// --- 监听与生命周期 ---
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

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

.c-monitor-flow-trend {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-flow-trend-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-flow-trend-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-flow-trend-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-flow-trend-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.c-monitor-flow-trend-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-flow-trend-tab {
  padding: 0 12px;
  height: 19px;
  line-height: 19px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 400;
  color: #ffffff;
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;

  &:hover {
    opacity: 0.9;
  }

  &.is-active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    font-weight: 500;
  }
}

.c-monitor-flow-trend-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-flow-trend-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.c-monitor-flow-trend-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  transition: opacity 0.3s;

  &.is-disabled {
    opacity: 0.4;
  }
}

.c-monitor-flow-trend-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
}

.c-monitor-flow-trend-legend-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid;
  margin-left: -4px;
}

.c-monitor-flow-trend-legend-text {
  line-height: 18px;
}

.c-monitor-flow-trend-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-flow-trend-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-flow-trend-accuracy {
  display: flex;
  justify-content: center;
  gap: 21px;
  margin-top: 4px;
  flex-shrink: 0;
}

.c-monitor-flow-trend-accuracy-item {
  font-size: 12px;
  font-weight: 500;
  color: #333333;
  line-height: 12px;
}
</style>
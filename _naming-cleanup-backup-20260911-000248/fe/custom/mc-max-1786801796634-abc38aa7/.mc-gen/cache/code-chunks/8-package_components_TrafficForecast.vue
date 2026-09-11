<template>
  <div class="c-monitor-forecast-root">
    <div class="c-monitor-forecast-header">
      <div class="c-monitor-forecast-title-group">
        <img :src="icon3" alt="流量预测图标" class="c-monitor-forecast-title-icon" />
        <span class="c-monitor-forecast-title">流量预测</span>
      </div>
      <div class="c-monitor-forecast-tabs">
        <div 
          v-for="tab in tabs" 
          :key="tab.value"
          :class="['c-monitor-forecast-tab', { 'is-active': activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-forecast-link" @click="handleHolidayClick">
        节假日预测&gt;
      </div>
    </div>
    
    <div class="c-monitor-forecast-chart-area">
      <div class="c-monitor-forecast-legend">
        <div 
          v-for="item in legendItems" 
          :key="item.name"
          :class="['c-monitor-forecast-legend-item', { 'is-disabled': !legendState[item.key] }]"
          @click="toggleLegend(item.name, item.key)"
        >
          <span class="c-monitor-forecast-legend-line" :style="{ background: item.color }"></span>
          <span class="c-monitor-forecast-legend-dot" :style="{ borderColor: item.color }"></span>
          <span class="c-monitor-forecast-legend-text">{{ item.name }}</span>
        </div>
      </div>
      <div ref="chartRef" class="c-monitor-forecast-chart"></div>
      <div class="c-monitor-forecast-accuracy">
        <span v-for="(acc, index) in accuracyData" :key="index" class="c-monitor-forecast-accuracy-item">
          准确率{{ acc }}%
        </span>
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
  console.warn('[TrafficForecast] $mcComponentBuilder 失败:', e)
}

const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]
const activeTab = ref('tunnel')

const legendItems = [
  { name: '实际流量', key: 'actual', color: '#1890ff' },
  { name: '预测流量', key: 'predict', color: '#52c41a' }
]
const legendState = ref({ actual: true, predict: true })

const accuracyData = ['98', '96', '92']

const mockData = {
  tunnel: {
    actual: [1200, 1500, 1800, 2200, 2500],
    predict: [1100, 1400, 1900, 2100, 2600]
  },
  bridge: {
    actual: [2000, 2500, 3000, 3500, 3800],
    predict: [1900, 2400, 3100, 3400, 3900]
  }
}

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
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } }
    },
    legend: { show: false },
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12, margin: 12 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        itemStyle: { color: '#1890ff', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { color: '#1890ff', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24,144,255,0.25)' },
              { offset: 1, color: 'rgba(24,144,255,0.02)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        itemStyle: { color: '#52c41a', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { color: '#52c41a', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82,196,26,0.25)' },
              { offset: 1, color: 'rgba(82,196,26,0.02)' }
            ]
          }
        }
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

const toggleLegend = (name, key) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value[key] = !legendState.value[key]
}

const handleHolidayClick = () => {
  console.log('跳转至节假日预测详情')
}

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

.c-monitor-forecast-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-forecast-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
  margin-bottom: 8px;
}

.c-monitor-forecast-title-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-forecast-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-forecast-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255,255,255,0.8);
  line-height: 24px;
}

.c-monitor-forecast-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
}

.c-monitor-forecast-tab {
  padding: 0 12px;
  height: 19px;
  line-height: 17px;
  font-size: 14px;
  font-weight: 400;
  color: #ffffff;
  background: #6680a0;
  border: 0.73px solid rgba(172,196,225,1);
  border-radius: 20.46px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;

  &.is-active {
    background: #1990ff;
    border: 0.73px solid rgba(199,224,255,1);
    font-weight: 500;
  }
}

.c-monitor-forecast-link {
  margin-left: auto;
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  line-height: 18px;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-forecast-chart-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-forecast-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-forecast-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #333333;

  &.is-disabled {
    opacity: 0.4;
  }
}

.c-monitor-forecast-legend-line {
  width: 14px;
  height: 2px;
  border-radius: 1px;
}

.c-monitor-forecast-legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid;
  margin-left: -10px;
}

.c-monitor-forecast-chart {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.c-monitor-forecast-accuracy {
  display: flex;
  justify-content: space-around;
  flex-shrink: 0;
  margin-top: 4px;
}

.c-monitor-forecast-accuracy-item {
  font-size: 12px;
  font-weight: 500;
  color: #52c41a;
  line-height: 12px;
}
</style>
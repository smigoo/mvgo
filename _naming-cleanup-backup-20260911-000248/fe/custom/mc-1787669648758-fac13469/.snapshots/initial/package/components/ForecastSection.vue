<template>
  <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-section">
    <!-- 头部：标题 + 控件 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-header">
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-title">
        <img :src="diamondIcon" class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-icon" />
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-title-text">流量预测</span>
      </div>
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-controls">
        <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-forecast-tab', { 'is-active': activeLocation === tab.value }]"
            @click="activeLocation = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-link">
          节假日预测&gt;
        </div>
      </div>
    </div>

    <!-- 自定义图例 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-legend">
      <div
        :class="['c-monitor-legend-item', { 'is-active': legendState.actual }]"
        @click="toggleLegend('实际流量')"
      >
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-legend-dot" style="background: #1890ff;"></span>
        <span>实际流量</span>
      </div>
      <div
        :class="['c-monitor-legend-item', { 'is-active': legendState.forecast }]"
        @click="toggleLegend('预测流量')"
      >
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-legend-dot" style="background: #52c41a;"></span>
        <span>预测流量</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-chart-wrapper">
      <div ref="chartRef" class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-chart"></div>
    </div>

    <!-- 底部准确率 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-forecast-accuracy">
      <span>准确率</span>
      <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-accuracy-value">98%</span>
      <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-accuracy-value">96%</span>
      <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-accuracy-value">92%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  diamondIcon: { type: String, default: '' }
})

// Tab 切换状态
const activeLocation = ref('tunnel')
const locationTabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]

// 图例状态
const legendState = ref({ actual: true, forecast: true })

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据
const mockData = {
  tunnel: {
    actual: [1200, 1350, 1500, 1800, 2200, 2500, 2800, 3000, 2900, 2600],
    forecast: [1100, 1250, 1450, 1750, 2100, 2450, 2750, 2950, 2850, 2550]
  },
  bridge: {
    actual: [2000, 2200, 2500, 2800, 3200, 3500, 3800, 3900, 3700, 3400],
    forecast: [1900, 2150, 2450, 2750, 3100, 3450, 3750, 3850, 3650, 3350]
  }
}

const xData = ['-2h', '-1h', '现在', '+1h', '+2h', '+3h', '+4h', '+5h', '+6h', '+7h']

// 图例联动
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'forecast'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  const data = mockData[activeLocation.value]
  
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } }
    },
    legend: {
      show: false,
      data: ['实际流量', '预测流量']
    },
    grid: {
      left: 10, right: 20, top: 20, bottom: 10, containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 }
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
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2, color: '#1890ff' },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(24, 144, 255, 0.25)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.02)' }
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
        showSymbol: false,
        lineStyle: { width: 2, color: '#52c41a', type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.25)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.02)' }
          ])
        },
        data: data.forecast
      }
    ]
  }, true)
}

// 初始化图表
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

watch(activeLocation, () => {
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

.c-monitor-forecast-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-forecast-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-forecast-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-forecast-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-forecast-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-forecast-controls {
  display: flex;
  align-items: center;
  margin-left: auto;
  gap: 16px;
}

.c-monitor-forecast-tabs {
  display: flex;
  background: #f0f5ff;
  border-radius: 4px;
  padding: 2px;
}

.c-monitor-forecast-tab {
  padding: 4px 12px;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &.is-active {
    background: #1990ff;
    color: #ffffff;
  }
}

.c-monitor-forecast-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-forecast-legend {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999999;
  cursor: pointer;
  transition: color 0.3s;

  &.is-active {
    color: #333333;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-forecast-chart {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */
}

.c-monitor-forecast-accuracy {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999999;
  margin-top: 8px;
  flex-shrink: 0;
}

.c-monitor-accuracy-value {
  color: #1990ff;
  font-weight: 500;
}
</style>
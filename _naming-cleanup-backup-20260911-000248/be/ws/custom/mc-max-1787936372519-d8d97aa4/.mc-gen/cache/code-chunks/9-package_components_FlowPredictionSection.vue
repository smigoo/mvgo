<template>
  <div class="c-monitor-section c-monitor-flow-prediction">
    <!-- 区域标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">流量预测</span>
      </div>

      <!-- Tab 切换 -->
      <div class="c-monitor-tab-group">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          :class="['c-monitor-tab-item', { 'c-monitor-tab-item-active': activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 节假日预测链接 -->
      <a href="javascript:void(0)" class="c-monitor-holiday-link">节假日预测</a>
    </div>

    <!-- 图表主体 -->
    <div class="c-monitor-section-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          :class="['c-monitor-legend-item', { 'c-monitor-legend-item-active': legendState.actual }]"
          @click="toggleLegend('实际流量')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-actual"></i>
          实际流量
        </span>
        <span
          :class="['c-monitor-legend-item', { 'c-monitor-legend-item-active': legendState.forecast }]"
          @click="toggleLegend('预测流量')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-forecast"></i>
          预测流量
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>

      <!-- 时间轴与准确率标签 -->
      <div class="c-monitor-timeline-labels">
        <div class="c-monitor-timeline-item">
          <span class="c-monitor-timeline-text">2小时前</span>
          <span class="c-monitor-accuracy-badge">准确率98%</span>
        </div>
        <div class="c-monitor-timeline-item">
          <span class="c-monitor-timeline-text">1小时前</span>
          <span class="c-monitor-accuracy-badge">准确率96%</span>
        </div>
        <div class="c-monitor-timeline-item">
          <span class="c-monitor-timeline-text">当前时间</span>
          <span class="c-monitor-accuracy-badge">准确率92%</span>
        </div>
        <div class="c-monitor-timeline-item">
          <span class="c-monitor-timeline-text">1小时后</span>
        </div>
        <div class="c-monitor-timeline-item">
          <span class="c-monitor-timeline-text">2小时后</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 配置
const tabs = ref([
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
])

// 当前激活 Tab
const activeTab = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, forecast: true })

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据（不同 Tab 对应不同数据）
const dataMap = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [1200, 1500, 1800, null, null], // 当前时间后无实际数据
    forecast: [1200, 1500, 1800, 1600, 1400]
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3200, 3500, null, null],
    forecast: [2800, 3200, 3500, 3300, 3000]
  }
}

// Tab 切换处理
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 图例切换处理
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'forecast'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = dataMap[activeTab.value]
  const option = {
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.65)', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      axisLine: { show: false },
      axisLabel: { color: 'rgba(255, 255, 255, 0.65)', fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#ffffff' }
    },
    legend: {
      show: false // 使用自定义图例
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        lineStyle: { color: '#00cccc', width: 2 },
        itemStyle: { color: '#00cccc' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        lineStyle: { color: '#3385ff', width: 2, type: 'dashed' },
        itemStyle: { color: '#3385ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.2)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        }
      }
    ]
  }

  chart.setOption(option, true)
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听 Tab 切换
watch(activeTab, () => {
  updateChart()
})

// 窗口 resize 处理
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

.c-monitor-flow-prediction {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 8px;

  .c-monitor-title-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .c-monitor-title-text {
    font-size: 16px;
    font-weight: 500;
    color: rgba(51, 51, 51, 1);
  }
}

.c-monitor-tab-group {
  display: flex;
  gap: 8px;
  margin-left: auto;
  margin-right: 12px;
}

.c-monitor-tab-item {
  padding: 4px 16px;
  background: rgba(102, 128, 160, 1);
  border: 1px solid rgba(172, 196, 225, 1);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background: rgba(25, 144, 255, 0.8);
  }

  &.c-monitor-tab-item-active {
    background: rgba(25, 144, 255, 1);
    border-color: rgba(199, 224, 255, 1);
    color: rgba(255, 255, 255, 1);
  }
}

.c-monitor-holiday-link {
  font-size: 12px;
  color: rgba(25, 144, 255, 1);
  text-decoration: none;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-section-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-chart-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.8;
  }

  &.c-monitor-legend-item-active {
    opacity: 1;
  }

  &:not(.c-monitor-legend-item-active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;

  &.c-monitor-legend-dot-actual {
    background: rgba(0, 204, 204, 1);
  }

  &.c-monitor-legend-dot-forecast {
    background: rgba(51, 133, 255, 1);
  }
}

.c-monitor-chart-container {
  flex: 1;
  width: 100%;
  min-height: 160px;
  min-width: 0;
}

.c-monitor-timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  flex-shrink: 0;
}

.c-monitor-timeline-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-timeline-text {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-accuracy-badge {
  padding: 2px 8px;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 10px;
  font-size: 12px;
  color: rgba(82, 196, 26, 1);
  font-weight: 600;
}
</style>

<template>
  <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-root">
    <!-- 标题栏：标题装饰 + Tab 切换 + 节假日预测链接 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-header">
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-title">
        <img :src="icon3" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-title-icon" alt="" />
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-title-text">流量预测</span>
      </div>

      <!-- Tab 切换 -->
      <div class="c-monitor-prediction-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          :class="['c-monitor-prediction-tab-item', { active: activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 节假日预测链接 -->
      <div class="c-monitor-prediction-link" :style="linkStyle">
        节假日预测
      </div>
    </div>

    <!-- 图例 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-legend">
      <div
        :class="['c-monitor-prediction-legend-item', { active: legendState.actual }]"
        @click="toggleLegend('实际流量')"
      >
        <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-dot-actual"></i>
        <span>实际流量</span>
      </div>
      <div
        :class="['c-monitor-prediction-legend-item', { active: legendState.predict }]"
        @click="toggleLegend('预测流量')"
      >
        <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-dot-predict"></i>
        <span>预测流量</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-chart-body">
      <div ref="chartRef" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-prediction-chart"></div>
    </div>

    <!-- 时间轴标签 -->
    <div class="c-monitor-prediction-timeline">
      <div v-for="(item, idx) in timelineLabels" :key="idx" class="c-monitor-prediction-timeline-item">
        <span class="c-monitor-prediction-timeline-text">{{ item.text }}</span>
        <span v-if="item.accuracy" class="c-monitor-prediction-timeline-accuracy">{{ item.accuracy }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'
import bg5 from '../../resources/images/bg-3525.png'

import { ref, computed, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// 资源变量（系统注入，不要手写 import）

// Tab 选项
const tabs = ref([
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
])

const activeTab = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, predict: true })

// 时间轴标签
const timelineLabels = ref([
  { text: '2小时前', accuracy: '准确率98%' },
  { text: '1小时前', accuracy: '准确率96%' },
  { text: '当前时间', accuracy: '准确率92%' },
  { text: '1小时后', accuracy: '' },
  { text: '2小时后', accuracy: '' }
])

// 节假日预测链接样式（背景图）
const linkStyle = computed(() => ({
  backgroundImage: `url(${bg5})`,
  backgroundSize: 'contain',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))

// Mock 数据（双站点数据）
const chartDataMap = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [1200, 1350, 1500, null, null],
    predict: [null, null, 1500, 1650, 1800]
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3100, 3400, null, null],
    predict: [null, null, 3400, 3700, 4000]
  }
}

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Tab 切换处理
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 图例切换处理
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'predict'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = chartDataMap[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        if (!p || p.value === null) return ''
        return `${p.axisValue}<br/>${p.seriesName}: ${p.value} 辆`
      }
    },
    legend: {
      show: false,
      data: ['实际流量', '预测流量']
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      axisLabel: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        itemStyle: { color: 'rgba(25, 144, 255, 1)' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 6,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(25, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        itemStyle: { color: 'rgba(25, 144, 255, 0.5)' },
        lineStyle: { width: 2, type: 'dashed' },
        symbol: 'circle',
        symbolSize: 6,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25, 144, 255, 0.15)' },
              { offset: 1, color: 'rgba(25, 144, 255, 0.02)' }
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

.c-monitor-prediction-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-prediction-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-prediction-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-prediction-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-prediction-title-text {
  font-size: 18px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-prediction-tabs {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.c-monitor-prediction-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: #333333;
  cursor: pointer;
  border-radius: 4px;
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  transition: all 0.3s;

  &:hover {
    background: rgba(225, 237, 248, 1);
  }

  &.active {
    background: rgba(25, 144, 255, 1);
    color: #ffffff;
    border-color: rgba(25, 144, 255, 1);
  }
}

.c-monitor-prediction-link {
  padding: 6px 16px;
  font-size: 12px;
  color: rgba(25, 144, 255, 1);
  cursor: pointer;
  border-radius: 4px;
  background: rgba(25, 144, 255, 0.08);
  transition: all 0.3s;

  &:hover {
    background: rgba(25, 144, 255, 0.15);
  }
}

.c-monitor-prediction-legend {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #333333;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-prediction-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.dot-actual {
    background: rgba(25, 144, 255, 1);
  }

  &.dot-predict {
    background: rgba(25, 144, 255, 0.5);
  }
}

.c-monitor-prediction-chart-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-prediction-chart {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

.c-monitor-prediction-timeline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 12px;
}

.c-monitor-prediction-timeline-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 0;}

.c-monitor-prediction-timeline-text {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  text-align: center;
}

.c-monitor-prediction-timeline-accuracy {
  font-size: 12px;
  color: rgba(82, 196, 26, 1);
  text-align: center;
  padding: 2px 8px;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 10px;
}
</style>
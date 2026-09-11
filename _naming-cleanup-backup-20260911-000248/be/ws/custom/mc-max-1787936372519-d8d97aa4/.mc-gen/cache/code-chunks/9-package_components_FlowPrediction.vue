<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-group">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- Tab切换 -->
        <div class="c-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-monitor-tab-item', { active: activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <a href="javascript:;" class="c-monitor-holiday-link">节假日预测</a>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-monitor-chart-container" />
    </div>

    <!-- 时间轴标签 -->
    <div class="c-monitor-timeline-labels">
      <div v-for="(item, index) in timelineLabels" :key="index" class="c-monitor-timeline-item">
        <span class="c-monitor-timeline-text">{{ item.text }}</span>
        <span v-if="item.accuracy" class="c-monitor-accuracy-badge">{{ item.accuracy }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, inject } from 'vue'
import * as echarts from 'echarts'

// 注入资源变量
const icon3 = inject('icon3', '')

// Tab选项
const tabs = ref([
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
])

// 当前激活Tab
const activeTab = ref('tunnel')

// 时间轴标签
const timelineLabels = ref([
  { text: '2小时前', accuracy: '准确率98%' },
  { text: '1小时前', accuracy: '准确率96%' },
  { text: '当前时间', accuracy: '准确率92%' },
  { text: '1小时后', accuracy: '' },
  { text: '2小时后', accuracy: '' }
])

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const dataMap = {
  tunnel: {
    actual: [1200, 1500, 1800, 2100, 2400, 2600, 2800, 3000, 3200],
    predict: [3200, 3400, 3600, 3500, 3300]
  },
  bridge: {
    actual: [2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400, 3600],
    predict: [3600, 3800, 4000, 3900, 3700]
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const currentData = dataMap[activeTab.value]
  const actualData = currentData.actual
  const predictData = currentData.predict
  const allData = [...actualData, ...predictData]
  const xAxisData = ['-2h', '-1.5h', '-1h', '-0.5h', '0h', '0.5h', '1h', '1.5h', '2h', '2.5h', '3h', '3.5h', '4h', '4.5h']

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}<br/>${p.seriesName}: ${p.value} 辆`
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      right: 16,
      top: 0,
      textStyle: {
        color: 'rgba(51, 51, 51, 1)',
        fontSize: 12
      },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData.slice(0, allData.length),
      axisLine: {
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10
      },
      splitLine: {
        lineStyle: { color: 'rgba(51, 51, 51, 0.08)' }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: actualData,
        lineStyle: {
          color: 'rgba(25, 144, 255, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)'
        },
        symbol: 'circle',
        symbolSize: 6
      },
      {
        name: '预测流量',
        type: 'line',
        data: Array(actualData.length - 1).fill(null).concat([actualData[actualData.length - 1]]).concat(predictData),
        lineStyle: {
          color: 'rgba(25, 144, 255, 0.5)',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: 'rgba(25, 144, 255, 0.5)'
        },
        areaStyle: {
          color: 'rgba(25, 144, 255, 0.1)'
        },
        symbol: 'circle',
        symbolSize: 6
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

// Tab切换处理
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 监听图表容器
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听Tab切换
watch(activeTab, () => {
  updateChart()
})

// 窗口resize处理
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
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.c-monitor-section-title-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 18px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 24px;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-tab-item {
  padding: 6px 16px;
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.08);
    color: rgba(25, 144, 255, 1);
  }

  &.active {
    background: rgba(25, 144, 255, 1);
    color: #ffffff;
  }
}

.c-monitor-holiday-link {
  font-size: 12px;
  color: rgba(25, 144, 255, 1);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-chart-wrapper {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
}

.c-monitor-timeline-labels {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  flex-shrink: 0;
  padding: 0 40px 0 40px;
}

.c-monitor-timeline-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.c-monitor-timeline-text {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  white-space: nowrap;
}

.c-monitor-accuracy-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(82, 196, 26, 0.1);
  color: rgba(82, 196, 26, 1);
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
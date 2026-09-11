<template>
  <div class="c-monitor-flow-prediction">
    <!-- 区块标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- Tab 切换 -->
        <div class="c-monitor-location-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-tab-item', { active: activeLocation === tab.value }]"
            @click="handleLocationChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测按钮 -->
        <div class="c-monitor-holiday-btn" @click="handleHolidayPrediction">
          节假日预测
        </div>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-body">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      <!-- 准确率标签 -->
      <div class="c-monitor-accuracy-labels">
        <span v-for="(acc, i) in accuracyData" :key="i" class="c-monitor-accuracy-item">
          {{ acc }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前激活的 Tab
const activeLocation = ref('tunnel')

// 准确率数据
const accuracyData = ref(['98%', '96%', '92%'])

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 数据源映射
const dataMap = {
  tunnel: {
    actual: [1200, 1500, 1800, 2200, 2800, 3200, 2900, 2400, 2000],
    predicted: [1300, 1600, 1900, 2300, 2900, 3300, 3000, 2500, 2100]
  },
  bridge: {
    actual: [2800, 3000, 3200, 3500, 3800, 4000, 3700, 3400, 3100],
    predicted: [2900, 3100, 3300, 3600, 3900, 4100, 3800, 3500, 3200]
  }
}

// Tab 切换处理
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
}

// 节假日预测按钮
const handleHolidayPrediction = () => {
  console.log('[FlowPrediction] 节假日预测按钮点击')
}

// 监听 Tab 变化，更新图表
watch(activeLocation, () => {
  updateChart()
})

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

// 更新图表
const updateChart = () => {
  if (!chart) return

  const currentData = dataMap[activeLocation.value]
  const xAxisData = ['-2h', '-1.5h', '-1h', '-0.5h', '当前', '+0.5h', '+1h', '+1.5h', '+2h']

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 28, 53, 0.8)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `<div style="font-weight: 600;">${params[0].name}</div>`
        params.forEach((p) => {
          result += `<div style="margin-top: 4px;">${p.marker}${p.seriesName}: ${p.value} 辆</div>`
        })
        return result
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      textStyle: { color: '#333333', fontSize: 12 },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      left: 40,
      right: 16,
      top: 32,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisTick: { show: true }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisTick: { show: true },
      splitLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.05)' }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: currentData.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: currentData.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        }
      }
    ]
  }

  chart.setOption(option, true)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 窗口尺寸变化处理
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
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-location-tabs {
  display: flex;
  align-items: center;
  gap: 0;
}

.c-monitor-tab-item {
  padding: 4px 12px;
  font-size: 12px;
  line-height: 18px;
  color: rgba(51, 51, 51, 0.65);
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid rgba(161, 206, 255, 1);
  background: #ffffff;

  &:first-child {
    border-radius: 4px 0 0 4px;
  }

  &:last-child {
    border-radius: 0 4px 4px 0;
    border-left: none;
  }

  &:not(:first-child):not(:last-child) {
    border-left: none;
  }

  &:hover {
    background: rgba(24, 144, 255, 0.05);
  }

  &.active {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    color: #333333;
    font-weight: 500;
  }
}

.c-monitor-holiday-btn {
  padding: 4px 12px;
  font-size: 12px;
  line-height: 18px;
  color: #1890ff;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-accuracy-labels {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-accuracy-item {
  padding: 2px 8px;
  font-size: 12px;
  line-height: 18px;
  color: #52c41a;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 4px;
  font-weight: 500;
}
</style>

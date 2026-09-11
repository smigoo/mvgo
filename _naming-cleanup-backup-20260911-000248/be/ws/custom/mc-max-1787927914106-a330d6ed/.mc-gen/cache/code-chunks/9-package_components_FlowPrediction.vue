<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon3" class="c-monitor-title-icon" alt="" />
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
        <!-- 节假日预测链接 -->
        <a href="#" class="c-monitor-holiday-link" @click.prevent="handleHolidayClick">节假日预测</a>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-body">
      <div ref="chartRef" class="c-monitor-chart-container" />
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

const activeLocation = ref('tunnel')

// 图表
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据
const mockDataMap = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2400, 2800, 3100, null, null],
    predict: [null, null, 3100, 2900, 2600],
    accuracy: ['准确率98%', '准确率96%', '', '准确率92%', '']
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [3200, 3500, 3800, null, null],
    predict: [null, null, 3800, 3600, 3300],
    accuracy: ['准确率97%', '准确率95%', '', '准确率91%', '']
  }
}

// 切换地点
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 点击节假日预测
const handleHolidayClick = () => {
  console.log('[FlowPrediction] 点击节假日预测')
  // 实际项目中可跳转或打开弹窗
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = mockDataMap[activeLocation.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let html = `<div style="padding:4px 8px;">`
        html += `<div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}</div>`
        params.forEach((p) => {
          if (p.value !== null) {
            html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">`
            html += `<span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:50%;"></span>`
            html += `<span>${p.seriesName}: ${p.value} 辆</span>`
            html += `</div>`
          }
        })
        html += `</div>`
        return html
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 10,
      right: 16,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#333333', fontSize: 12 }
    },
    grid: {
      left: 40,
      right: 16,
      top: 50,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.1)' } },
      axisLabel: { color: '#333333', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLine: { show: false },
      axisLabel: { color: '#333333', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.1)', type: 'dashed' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
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
        },
        symbol: 'circle',
        symbolSize: 6
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  }

  // 添加当前时间标记线
  option.series.push({
    name: '当前时间',
    type: 'line',
    markLine: {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#333333', type: 'dashed', width: 1 },
      data: [{ xAxis: '当前时间' }]
    }
  })

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

// 监听地点切换
watch(activeLocation, () => {
  updateChart()
})

// 窗口 resize
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

<style scoped lang="less">
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
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-location-tabs {
  display: flex;
  gap: 0;
}

.c-monitor-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: #333333;
  cursor: pointer;
  background: transparent;
  border-radius: 4px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.05);
  }

  &.active {
    background: linear-gradient(135deg, rgba(25, 144, 255, 0.15) 0%, rgba(25, 144, 255, 0.08) 100%);
    color: #1890ff;
    font-weight: 500;
  }
}

.c-monitor-holiday-link {
  font-size: 14px;
  color: #1890ff;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

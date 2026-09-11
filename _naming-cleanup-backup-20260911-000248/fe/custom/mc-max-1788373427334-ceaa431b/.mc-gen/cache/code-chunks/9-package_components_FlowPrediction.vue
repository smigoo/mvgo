<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- Tab切换 -->
        <div class="c-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-tab-item', { active: activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <a href="javascript:void(0)" class="c-monitor-holiday-link" @click="handleHolidayClick">
          节假日预测&gt;
        </a>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg4})` }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 导入背景图资源
const bg4 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Tab选项
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前激活的Tab
const activeTab = ref('tunnel')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 数据映射（不同Tab对应不同数据）
const dataMap = {
  tunnel: {
    actual: [
      { time: '2小时前', value: 1200 },
      { time: '1小时前', value: 1500 },
      { time: '当前时间', value: 1800 },
      { time: '1小时后', value: 2100 },
      { time: '2小时后', value: 2400 }
    ],
    predict: [
      { time: '2小时前', value: 1150 },
      { time: '1小时前', value: 1480 },
      { time: '当前时间', value: 1820 },
      { time: '1小时后', value: 2080 },
      { time: '2小时后', value: 2350 }
    ],
    accuracy: [
      { label: '准确率98%', position: 0 },
      { label: '准确率96%', position: 2 },
      { label: '准确率92%', position: 4 }
    ]
  },
  bridge: {
    actual: [
      { time: '2小时前', value: 2800 },
      { time: '1小时前', value: 3100 },
      { time: '当前时间', value: 3400 },
      { time: '1小时后', value: 3700 },
      { time: '2小时后', value: 4000 }
    ],
    predict: [
      { time: '2小时前', value: 2750 },
      { time: '1小时前', value: 3080 },
      { time: '当前时间', value: 3420 },
      { time: '1小时后', value: 3650 },
      { time: '2小时后', value: 3950 }
    ],
    accuracy: [
      { label: '准确率97%', position: 0 },
      { label: '准确率95%', position: 2 },
      { label: '准确率91%', position: 4 }
    ]
  }
}

// Tab切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

// 节假日预测链接点击
const handleHolidayClick = () => {
  console.log('跳转到节假日预测页面')
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

  // 使用ResizeObserver等待容器尺寸就绪
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

  const currentData = dataMap[activeTab.value]
  const times = currentData.actual.map(d => d.time)
  const actualValues = currentData.actual.map(d => d.value)
  const predictValues = currentData.predict.map(d => d.value)

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      itemWidth: 20,
      itemHeight: 10
    },
    grid: {
      left: 50,
      right: 20,
      top: 50,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: actualValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#00d4ff',
          width: 2
        },
        itemStyle: {
          color: '#00d4ff'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
              { offset: 1, color: 'rgba(0, 212, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: predictValues,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#52c41a',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: '#52c41a'
        },
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

  // 添加准确率标签（使用graphic）
  const accuracyGraphics = currentData.accuracy.map((item, index) => ({
    type: 'text',
    left: `${20 + index * 30}%`,
    bottom: 20,
    style: {
      text: item.label,
      fill: '#52c41a',
      fontSize: 12,
      fontWeight: 500
    }
  }))

  chart.setOption({
    graphic: accuracyGraphics
  })
}

// 监听Tab变化
watch(activeTab, () => {
  updateChart()
})

// 监听chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 窗口resize处理
const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
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
  margin-left: auto;
}

.c-monitor-tabs {
  display: flex;
  align-items: center;
  gap: 0;
}

.c-monitor-tab-item {
  padding: 4px 12px;
  font-size: 12px;
  color: #333333;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid #a1ceff;
  border-right: none;
  white-space: nowrap;
  flex-shrink: 0;

  &:first-child {
    border-radius: 4px 0 0 4px;
  }

  &:last-child {
    border-right: 1px solid #a1ceff;
    border-radius: 0 4px 4px 0;
  }

  &:hover {
    background: rgba(24, 144, 255, 0.08);
  }

  &.active {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    color: #1890ff;
    font-weight: 500;
  }
}

.c-monitor-holiday-link {
  font-size: 12px;
  color: #1890ff;
  text-decoration: none;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-chart-body {
  flex: 160 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

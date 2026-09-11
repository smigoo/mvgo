<template>
  <div class="c-monitor-flow-forecast">
    <!-- 标题行 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span>流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- Tab 切换 -->
        <div class="c-monitor-forecast-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-forecast-tab-item', { active: activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <div class="c-monitor-holiday-link" @click="handleHolidayClick">
          节假日预测 &gt;
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-forecast-body" :style="{ backgroundImage: `url(${bg4})` }">
      <div ref="chartRef" class="c-monitor-forecast-chart" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  icon3: { type: String, default: '' },
  bg4: { type: String, default: '' }
})

const { icon3, bg4 } = props

// Tab 选项
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前激活的 tab
const activeTab = ref('tunnel')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Tab 切换
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

// 节假日预测链接点击
const handleHolidayClick = () => {
  console.log('[FlowForecast] 节假日预测点击')
  // 可触发路由跳转或弹窗
}

// Mock 数据
const getMockData = () => {
  const tunnelData = {
    actual: [800, 1200, 1500, 1800, 2100, 2400],
    forecast: [2400, 2600, 2800, 3000, 3200]
  }
  const bridgeData = {
    actual: [1200, 1600, 2000, 2400, 2800, 3200],
    forecast: [3200, 3400, 3600, 3800, 4000]
  }
  return activeTab.value === 'tunnel' ? tunnelData : bridgeData
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

// 更新图表
const updateChart = () => {
  if (!chart) return
  const data = getMockData()
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
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
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 50,
      bottom: 60,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(161, 206, 255, 0.3)' }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(161, 206, 255, 0.3)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(161, 206, 255, 0.1)' }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [...data.actual, null, null, null],
        smooth: true,
        lineStyle: {
          color: '#1890ff',
          width: 2
        },
        itemStyle: {
          color: '#1890ff'
        },
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
        data: [null, null, data.actual[data.actual.length - 1], ...data.forecast],
        smooth: true,
        lineStyle: {
          color: '#52c41a',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: '#52c41a'
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

// 监听 activeTab
watch(activeTab, () => {
  updateChart()
})

// resize 处理
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
@fontSize: 14px;

@import '../../resources/styles/index.less';

.c-monitor-flow-forecast {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: @fontSize;
  font-weight: bold;
  color: rgba(51, 51, 51, 1);
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-forecast-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-forecast-tab-item {
  padding: 4px 12px;
  font-size: calc(@fontSize * 0.8571);
  color: rgba(51, 51, 51, 1);
  background: rgba(255, 255, 255, 1);
  border: 1px solid rgba(217, 217, 217, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(230, 247, 255, 1);
    border-color: rgba(24, 144, 255, 1);
  }

  &.active {
    background: rgba(230, 247, 255, 1);
    color: rgba(24, 144, 255, 1);
    border-color: rgba(24, 144, 255, 1);
  }
}

.c-monitor-holiday-link {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(25, 144, 255, 1);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    color: rgba(64, 169, 255, 1);
  }
}

.c-monitor-forecast-body {
  flex: 160 1 0;
  min-height: 160px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
}

.c-monitor-forecast-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
<template>
  <section class="c-monitor-flow-prediction">
    <!-- 区块头部：标题 + 地点切换 + 节假日预测 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-group">
        <div class="c-monitor-title-icon"></div>
        <h3 class="c-monitor-section-title">流量预测</h3>
      </div>
      
      <div class="c-monitor-header-controls">
        <!-- 地点切换标签 -->
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
          节假日预测>
        </div>
      </div>
    </div>

    <!-- 图表区域 - 使用 bg5 作为背景图 -->
    <div 
      class="c-monitor-chart-body"
      :style="{ 
        backgroundImage: `url(${bg5})`,
        backgroundSize: '100% auto',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 接收父组件传递的背景图资源
const props = defineProps({
  bg5: String
})

const { bg5 } = props

// 地点切换选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前选中的地点
const activeLocation = ref('tunnel')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3200, 3500, null, null],
    predicted: [null, null, 3500, 3300, 3100],
    accuracy: [98, 96, 92]
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2600, 3000, 3300, null, null],
    predicted: [null, null, 3300, 3100, 2900],
    accuracy: [98, 96, 92]
  }
}

// 地点切换处理
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 节假日预测处理
const handleHolidayPrediction = () => {
  console.log('跳转到节假日预测详情页')
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
  
  const data = mockData[activeLocation.value]
  
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
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
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
        lineStyle: {
          color: '#1890ff',
          width: 2
        },
        itemStyle: {
          color: '#1890ff'
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
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

// 监听地点切换
watch(activeLocation, () => {
  updateChart()
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
  flex: 150 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-group {
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

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  margin: 0;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-location-tabs {
  display: flex;
  gap: 4px;
  background: rgba(237, 244, 251, 1);
  border-radius: 4px;
  padding: 2px;
}

.c-monitor-tab-item {
  padding: 6px 12px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
  
  &:hover {
    background: rgba(24, 144, 255, 0.05);
  }
  
  &.active {
    background: #1890ff;
    color: #ffffff;
  }
}

.c-monitor-holiday-btn {
  font-size: 12px;
  color: #1890ff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  
  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

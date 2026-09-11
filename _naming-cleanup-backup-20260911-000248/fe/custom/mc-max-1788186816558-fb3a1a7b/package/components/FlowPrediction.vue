<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title-wrapper">
        <span class="c-monitor-flow-prediction-icon"></span>
        <span class="c-monitor-flow-prediction-title">流量预测</span>
      </div>
      
      <div class="c-monitor-flow-prediction-controls">
        <!-- 地点切换 Tab -->
        <div class="c-monitor-flow-prediction-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-flow-prediction-tab-item', { 'c-monitor-flow-prediction-tab-active': activeLocation === tab.value }]"
            @click="handleLocationChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        
        <!-- 日期选择 -->
        <a-select
          v-model:value="selectedDate"
          class="c-monitor-flow-prediction-date-select"
          @change="handleDateChange"
        >
          <a-select-option value="holiday-1">节假日前1天</a-select-option>
          <a-select-option value="holiday-2">节假日前2天</a-select-option>
          <a-select-option value="holiday-3">节假日前3天</a-select-option>
        </a-select>
      </div>
    </div>
    
    <!-- 图表容器 -->
    <div class="c-monitor-flow-prediction-chart-wrapper">
      <div ref="chartRef" class="c-monitor-flow-prediction-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 地点选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前选中的地点和日期
const activeLocation = ref('tunnel')
const selectedDate = ref('holiday-1')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3200, 3500, null, null],
    predicted: [null, null, 3500, 3200, 2900],
    accuracy: ['追溯98%', '追溯98%', '准确96%', '准确92%', '准确92%']
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [3200, 3600, 3800, null, null],
    predicted: [null, null, 3800, 3500, 3200],
    accuracy: ['追溯98%', '追溯98%', '准确96%', '准确92%', '准确92%']
  }
}

// Tab 切换
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 日期切换
const handleDateChange = () => {
  updateChart()
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
      },
      itemWidth: 10,
      itemHeight: 10
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
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
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
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
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
              { offset: 0, color: 'rgba(85, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(85, 158, 255, 0.05)' }
            ]
          }
        },
        lineStyle: {
          color: '#559EFF',
          width: 2
        },
        symbol: 'circle',
        symbolSize: 6
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
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
        },
        lineStyle: {
          color: '#52C41A',
          width: 2,
          type: 'dashed'
        },
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 窗口大小变化
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

.c-monitor-flow-prediction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-flow-prediction-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-flow-prediction-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-flow-prediction-title {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
  line-height: 21px;
}

.c-monitor-flow-prediction-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  gap: 0;
}

.c-monitor-flow-prediction-tab-item {
  padding: 4px 12px;
  font-size: calc(@fontSize * 0.857);
  color: #666666;
  cursor: pointer;
  background: transparent;
  border: 1px solid #d9d9d9;
  transition: all 0.3s;
  
  &:first-child {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }
  
  &:last-child {
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
    border-left: none;
  }
  
  &:not(:first-child):not(:last-child) {
    border-left: none;
  }
  
  &:hover {
    color: #1890ff;
    border-color: #1890ff;
    z-index: 1;
  }
}

.c-monitor-flow-prediction-tab-active {
  color: #ffffff;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  background: #1890ff;
  border-color: #1890ff;
  z-index: 2;
  
  &:hover {
    color: #ffffff;
  }
}

:deep(.c-monitor-flow-prediction-date-select) {
  width: 120px;
  
  .ant-select-selector {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    font-size: calc(@fontSize * 1);
    color: #333333;
  }
  
  .ant-select-arrow {
    color: #a8abb2;
  }
}

.c-monitor-flow-prediction-chart-wrapper {
  flex: 150 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-flow-prediction-chart {
  width: 100%;
  height: 100%;
}
</style>

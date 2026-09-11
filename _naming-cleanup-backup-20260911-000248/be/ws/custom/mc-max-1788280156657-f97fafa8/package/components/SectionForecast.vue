<template>
  <div class="c-monitor-section-forecast">
    <!-- 区域标题行 -->
    <div class="c-monitor-forecast-header">
      <div class="c-monitor-forecast-title-group">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-forecast-title">流量预测</span>
      </div>
      <div class="c-monitor-forecast-controls">
        <!-- Tab 切换 -->
        <div class="c-monitor-forecast-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-forecast-tab-item', {'is-active': activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <span class="c-monitor-forecast-link">节假日预测</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-forecast-chart-wrapper">
      <div ref="chartRef" class="c-monitor-forecast-chart-container" />
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'


import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 选项
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前激活的 Tab
const activeTab = ref('tunnel')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图表数据
const chartData = ref({
  tunnel: {
    actual: [1200, 1500, 1800, 2200, 2500],
    forecast: [2500, 2800, 3000, 3200, 3400],
    xLabels: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    accuracy: ['准确率98%', '准确率96%', '准确率92%']
  },
  bridge: {
    actual: [2000, 2300, 2600, 3000, 3200],
    forecast: [3200, 3500, 3700, 3900, 4100],
    xLabels: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    accuracy: ['准确率97%', '准确率95%', '准确率91%']
  }
})

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
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

  const data = chartData.value[activeTab.value]
  
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
      itemWidth: 14,
      itemHeight: 6,
      icon: 'rect'
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
      data: data.xLabels,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4500,
      interval: 1000,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#3385ff',
          borderWidth: 1,
          borderColor: '#3385ff'
        },
        lineStyle: {
          color: '#3385ff',
          width: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#00cccc',
          borderWidth: 1,
          borderColor: '#00cccc'
        },
        lineStyle: {
          color: '#00cccc',
          width: 1
        },
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
      }
    ]
  }

  chart.setOption(option, true)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-section-forecast {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-monitor-forecast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.c-monitor-forecast-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-forecast-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
}

.c-monitor-forecast-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-forecast-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-forecast-tab-item {
  padding: 4px 16px;
  border-radius: 20px;
  font-size: @fontSize;
  color: #ffffff;
  background: #6680a0;
  border: 1px solid rgba(172, 196, 225, 1);
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(102, 128, 160, 0.8);
  }

  &.is-active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    color: #ffffff;
  }
}

.c-monitor-forecast-link {
  font-size: calc(@fontSize * 0.8571);
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.c-monitor-forecast-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
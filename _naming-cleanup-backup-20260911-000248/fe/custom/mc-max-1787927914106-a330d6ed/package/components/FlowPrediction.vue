<template>
  <div class="prediction-root">
    <!-- 区域标题 -->
    <div class="prediction-header">
      <div class="prediction-title-wrapper">
        <img :src="icon3" class="prediction-icon" alt="" />
        <span class="prediction-title">流量预测</span>
      </div>
      
      <!-- Tab 切换 -->
      <div class="prediction-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          :class="['prediction-tab-item', { active: activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
         :style="activeTab === tab.key ? { backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          {{ tab.label }}
        </div>
      </div>
      
      <!-- 节假日预测链接 -->
      <a href="javascript:;" class="prediction-link">节假日预测</a>
    </div>

    <!-- 图表区域 -->
    <div class="prediction-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="prediction-legend">
        <span
          class="prediction-legend-item"
          :class="{ active: legendState.actual }"
          @click="toggleLegend('实际流量')"
        >
          <i class="prediction-legend-dot actual"></i>
          实际流量
        </span>
        <span
          class="prediction-legend-item"
          :class="{ active: legendState.predict }"
          @click="toggleLegend('预测流量')"
        >
          <i class="prediction-legend-dot predict"></i>
          预测流量
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="prediction-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg5 from '../../resources/images/bg-3525.png'
import icon3 from '../../resources/images/icon-3573.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 数据
const tabs = ref([
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
])

const activeTab = ref('tunnel')

// 图例状态
const legendState = ref({
  'actual': true,
  'predict': true
})

// 图表数据
const dataMap = {
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    'actual': [2800, 3200, 3500, null, null],
    'predict': [null, null, 3500, 3300, 3100],
    accuracy: ['准确率98%', '准确率96%', '准确率92%']
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    'actual': [3200, 3600, 3800, null, null],
    'predict': [null, null, 3800, 3600, 3400],
    accuracy: ['准确率97%', '准确率95%', '准确率91%']
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
  updateChart()
}

// 图例切换处理
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'predict'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const data = dataMap[activeTab.value]
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
      show: false
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      splitLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.05)' }
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
          width: 2
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
              { offset: 1, color: 'rgba(51, 133, 255, 0)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
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
          width: 2,
          type: 'dashed'
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

// 监听 activeTab 变化
watch(activeTab, () => {
  updateChart()
})

// 窗口大小变化处理
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

.prediction-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prediction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.prediction-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prediction-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.prediction-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.prediction-tabs {
  display: flex;
  gap: 8px;
  margin-left: auto;
  margin-right: 12px;
}

.prediction-tab-item {
  padding: 4px 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
  
  &:hover {
    background: rgba(25, 144, 255, 0.8);
  }
  
  &.active {
    color: #ffffff;
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
  }
}

.prediction-link {
  font-size: 12px;
  color: #1990ff;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  
  &:hover {
    color: #40a9ff;
  }
}

.prediction-chart-wrapper {
  flex: 174 1 0;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prediction-legend {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
}

.prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(51, 51, 51, 0.85);
  cursor: pointer;
  transition: opacity 0.3s;
  
  &:not(.active) {
    opacity: 0.4;
  }
  
  &:hover {
    opacity: 1;
  }
}

.prediction-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  
  &.actual {
    background: #3385ff;
  }
  
  &.predict {
    background: #00cccc;
  }
}

.prediction-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
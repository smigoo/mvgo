<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title-group">
        <span class="c-monitor-flow-prediction-icon"></span>
        <span class="c-monitor-flow-prediction-title">流量预测</span>
      </div>
      
      <div class="c-monitor-flow-prediction-controls">
        <!-- Tab 切换 -->
        <div class="c-monitor-flow-prediction-tabs">
          <span
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-flow-prediction-tab-item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </span>
        </div>
        
        <!-- 节假日预测链接 -->
        <span class="c-monitor-flow-prediction-holiday-link">节假日预测</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-flow-prediction-body">
      <div ref="chartRef" class="c-monitor-flow-prediction-chart"></div>
      
      <!-- 准确率指标 -->
      <div class="c-monitor-flow-prediction-accuracy">
        <span class="c-monitor-flow-prediction-accuracy-item">准确率98%</span>
        <span class="c-monitor-flow-prediction-accuracy-item">准确率96%</span>
        <span class="c-monitor-flow-prediction-accuracy-item">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 选项
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const activeTab = ref('tunnel')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const chartDataMap = {
  tunnel: {
    actual: [1200, 1800, 2200, 2800, 3200, 3600, 3400],
    predicted: [1300, 1900, 2300, 2900, 3300, 3700, 3500]
  },
  bridge: {
    actual: [1500, 2100, 2500, 3100, 3500, 3900, 3700],
    predicted: [1600, 2200, 2600, 3200, 3600, 4000, 3800]
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const data = chartDataMap[activeTab.value]
  
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
      right: 16,
      top: 8,
      itemWidth: 24,
      itemHeight: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 50,
      right: 16,
      top: 40,
      bottom: 60,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
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
          color: 'rgba(0, 0, 0, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
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
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)'
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
          color: 'rgba(25, 144, 255, 0.2)'
        },
        lineStyle: {
          color: '#1990ff',
          width: 2
        },
        itemStyle: {
          color: '#1990ff'
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
        areaStyle: {
          color: 'rgba(82, 196, 26, 0.2)'
        },
        lineStyle: {
          color: '#52c41a',
          width: 2
        },
        itemStyle: {
          color: '#52c41a'
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
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-flow-prediction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-flow-prediction-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-flow-prediction-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-flow-prediction-title {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  line-height: 1.5;
  color: #333333;
}

.c-monitor-flow-prediction-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  gap: 4px;
}

.c-monitor-flow-prediction-tab-item {
  padding: 2px 8px;
  font-size: calc(var(--fontSize, 14px) * 0.86);
  line-height: 1.5;
  color: #333333;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: transparent;
    transition: all 0.3s;
  }
  
  &.active {
    color: #1990ff;
    
    &::after {
      background: #1990ff;
    }
  }
}

.c-monitor-flow-prediction-holiday-link {
  font-size: calc(var(--fontSize, 14px) * 0.86);
  color: #1990ff;
  cursor: pointer;
  
  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-flow-prediction-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background-image: url('../../resources/images/bg-_m-35.png');
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
}

.c-monitor-flow-prediction-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-flow-prediction-accuracy {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
  margin-top: 8px;
}

.c-monitor-flow-prediction-accuracy-item {
  font-size: calc(var(--fontSize, 14px) * 0.86);
  color: #52c41a;
  font-weight: 400;
}
</style>
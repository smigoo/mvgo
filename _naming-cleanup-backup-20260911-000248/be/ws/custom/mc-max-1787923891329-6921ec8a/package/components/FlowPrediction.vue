<template>
  <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-flow-prediction">
    <!-- 标题行 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-header">
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-title-group">
        <img :src="icon3" class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-icon" alt="icon" />
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-title">流量预测</span>
      </div>
      
      <!-- 地点切换 Tab -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-location-tabs">
<span v-for="location in locations" :key="location.key" :class="['c-monitor-location-tab', { active: activeLocation === location.key }]" @click="handleLocationChange(location.key)" >
          {{ location.label }}
        </span>
      </div>
      
      <!-- 节假日预测链接 -->
      <a href="#" class="c-mc-max-1787923891329-6921ec8a-c-monitor-holiday-link" @click.prevent="handleHolidayClick">
        节假日预测&gt;
      </a>
    </div>
    
    <!-- 图表区域 -->
    <div class="c-monitor-chart-body">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-chart-legend">
<span class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-item" :class="{ active: legendState.c-mc-max-1787923891329-6921ec8a-actual }" @click="toggleLegend('实际流量')" >
          <i class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-dot c-mc-max-1787923891329-6921ec8a-actual"></i>实际流量
        </span>
<span class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-item" :class="{ active: legendState.c-mc-max-1787923891329-6921ec8a-predicted }" @click="toggleLegend('预测流量')" >
          <i class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-dot c-mc-max-1787923891329-6921ec8a-predicted"></i>预测流量
        </span>
      </div>
      
      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-mc-max-1787923891329-6921ec8a-c-monitor-chart-container"></div>
      
      <!-- 准确率标签 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-accuracy-labels">
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-accuracy-label">准确率98%</span>
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-accuracy-label">准确率96%</span>
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-accuracy-label">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// 地点选项
const locations = ref([ { label: '江阴靖江长江隧道', key: 'tunnel' }, { label: '江阴大桥', key: 'bridge' }
])

// 当前选中地点
const activeLocation = ref('tunnel')

// 图例状态
const legendState = ref({ 'c-mc-max-1787923891329-6921ec8a-actual': true, 'c-mc-max-1787923891329-6921ec8a-predicted': true
})

// 图表数据
const dataMap = { tunnel: { 'c-mc-max-1787923891329-6921ec8a-actual': [2800, 2900, 3100, 3000, 2950], 'c-mc-max-1787923891329-6921ec8a-predicted': [2850, 2920, 3050, 2980, 2900]
  },
  bridge: {
    'c-mc-max-1787923891329-6921ec8a-actual': [3200, 3300, 3400, 3350, 3300],
    'c-mc-max-1787923891329-6921ec8a-predicted': [3250, 3320, 3380, 3330, 3280]
  }
}

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 切换地点
const handleLocationChange = (key) => { if (activeLocation.value === key) return
  activeLocation.value = key
  updateChart()
}

// 节假日预测链接点击
const handleHolidayClick = () => { console.log('跳转节假日预测页面')
}

// 切换图例
const toggleLegend = (name) => { if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'predicted'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => { if (!chart) return
  
  const data = dataMap[activeLocation.value]
const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: 'rgba(161, 206, 255, 1)', borderWidth: 1, textStyle: { color: '#333333', fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(24, 144, 255, 0.5)',
          type: 'dashed'
        }
      }
    },
    legend: {
      show: false,
      data: ['实际流量', '预测流量']
    },
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLine: {
        lineStyle: { color: 'rgba(102, 102, 102, 0.3)' }
      },
      axisLabel: {
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
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(102, 102, 102, 0.1)',
          type: 'dashed'
        }
      },
      axisLabel: {
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
        lineStyle: {
          color: 'rgba(24, 144, 255, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(24, 144, 255, 1)'
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
        data: data.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: 'rgba(82, 196, 154, 1)',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: 'rgba(82, 196, 154, 1)'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 154, 0.2)' },
              { offset: 1, color: 'rgba(82, 196, 154, 0.02)' }
            ]
          }
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 初始化图表
const initChart = () => { if (!chartRef.value) return
  
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
  if (newRef && !chart) {
    initChart()
  }
})

// 监听地点切换
watch(activeLocation, () => {
  updateChart()
})

// 窗口 resize 处理
const handleResize = () => { if (chart) { chart.resize()
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
  gap: 6px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-location-tabs {
  display: flex;
  gap: 8px;
  margin-left: auto;
  margin-right: 12px;
}

.c-monitor-location-tab {
  padding: 4px 12px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  border-radius: 4px;
  background: rgba(24, 144, 255, 0.05);
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
  }

  &.active {
    background: rgba(24, 144, 255, 0.15);
    color: #1890ff;
    font-weight: 500;
  }
}

.c-monitor-holiday-link {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  color: #1890ff;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    color: #40a9ff;
    text-decoration: underline;
  }
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.c-monitor-chart-legend {
  display: flex;
  gap: 20px;
  justify-content: flex-end;
  padding: 0 16px 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  user-select: none;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;

  &.actual {
    background: rgba(24, 144, 255, 1);
  }

  &.predicted {
    background: rgba(82, 196, 154, 1);
  }
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-accuracy-labels {
  display: flex;
  justify-content: space-around;
  padding: 8px 50px 0 50px;
  flex-shrink: 0;
}

.c-monitor-accuracy-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  color: #52c49a;
  font-weight: 500;
}
</style>
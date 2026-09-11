<template>
  <div class="c-monitor-section c-monitor-hourly-bridge">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- Chart Container -->
    <div class="c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      
      <!-- Custom Legend -->
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-blue"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-orange"></i>
          <span class="c-monitor-legend-text">上海方向</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// Mock 数据
const chartData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [1200, 1500, 1800, 2200, 2800, 3200, 3500, 3200, 2800, 2400, 2000, 1600, 1200],
  shanghai: [1000, 1300, 1600, 2000, 2600, 3000, 3300, 3000, 2600, 2200, 1800, 1400, 1000]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: name
  })
  
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName}: ${item.value} 辆<br/>`
        })
        return result
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.hours,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
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
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.beijing,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(56, 141, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.shanghai,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(255, 135, 82, 1)',
          borderRadius: [2, 2, 0, 0]
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
  if (newRef && !chart) {
    initChart()
  }
})

// 处理窗口大小变化
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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-section {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 8px;
  justify-content: center;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-legend-dot-blue {
  background: rgba(56, 141, 255, 1);
}

.c-monitor-legend-dot-orange {
  background: rgba(255, 135, 82, 1);
}

.c-monitor-legend-text {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
}
</style>

<template>
  <div class="c-mc-1787844352169-0d77fb56-c-monitor-hourly-bridge">
    <!-- 区块标题 -->
    <div class="c-mc-1787844352169-0d77fb56-c-monitor-section-title">
      <span class="c-mc-1787844352169-0d77fb56-c-monitor-title-dot"></span>
      <span class="c-mc-1787844352169-0d77fb56-c-monitor-title-text">江阴大桥</span>
    </div>

    <!-- 图例 -->
    <div class="c-mc-1787844352169-0d77fb56-c-monitor-chart-legend">
      <span 
        class="c-mc-1787844352169-0d77fb56-c-monitor-legend-item" 
        :class="{ active: legendState.c-mc-1787844352169-0d77fb56-c-monitor-beijing }" 
        @click="toggleLegend('北京方向')"
      >
        <i class="c-monitor-legend-dot c-mc-1787844352169-0d77fb56-c-monitor-legend-dot-primary"></i>
        <span class="c-mc-1787844352169-0d77fb56-c-monitor-legend-label">北京方向</span>
      </span>
      <span 
        class="c-mc-1787844352169-0d77fb56-c-monitor-legend-item" 
        :class="{ active: legendState.c-mc-1787844352169-0d77fb56-c-monitor-shanghai }" 
        @click="toggleLegend('上海方向')"
      >
        <i class="c-monitor-legend-dot c-mc-1787844352169-0d77fb56-c-monitor-legend-dot-warning"></i>
        <span class="c-mc-1787844352169-0d77fb56-c-monitor-legend-label">上海方向</span>
      </span>
    </div>

    <!-- 图表容器 -->
    <div class="c-mc-1787844352169-0d77fb56-c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-mc-1787844352169-0d77fb56-c-monitor-chart-container"></div>
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
  'c-monitor-beijing': true,
  'c-monitor-shanghai': true
})

// Mock 数据（按小时）
const mockData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  'c-monitor-beijing': [150, 180, 220, 450, 820, 1200, 1850, 2100, 825, 1650, 1100, 600, 300],
  'c-monitor-shanghai': [120, 160, 200, 420, 780, 1100, 1750, 1980, 831, 1580, 1020, 550, 280]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(25, 144, 255, 0.1)'
        }
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.2)'
        }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 5,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.1)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 8,
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 8,
        itemStyle: {
          color: '#ff8533',
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

// 监听容器引用
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 窗口 resize 处理
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

.c-monitor-hourly-bridge {
  display: flex;
  flex-direction: column;
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-dot {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  margin-right: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 1;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  flex-shrink: 0;

  &.c-monitor-legend-dot-primary {
    background: #1990ff;
  }

  &.c-monitor-legend-dot-warning {
    background: #ff8533;
  }
}

.c-monitor-legend-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
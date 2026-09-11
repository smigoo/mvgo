<template>
  <div class="c-monitor-bridge-hourly-section">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-wrapper" :style="{ backgroundImage: `url(${bg5})` }">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <div
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <span class="c-monitor-legend-dot beijing"></span>
          <span class="c-monitor-legend-text">北京方向</span>
        </div>
        <div
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-legend-dot shanghai"></span>
          <span class="c-monitor-legend-text">上海方向</span>
        </div>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
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

// 模拟数据（按设计稿小时刻度0-24）
const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [300, 320, 280, 350, 400, 600, 800, 950, 825, 700, 650, 500, 400],
  shanghai: [280, 310, 290, 360, 420, 650, 850, 1000, 831, 720, 680, 520, 420]
})

// 背景图变量（系统注入）
const bg5 = null // 系统会自动注入

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
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach((item) => {
          result += `${item.marker}${item.seriesName}: ${item.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false // 使用自定义图例
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: false
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: (value) => {
          if (value === 0) return '0'
          if (value === 1000) return '1000'
          if (value === 2000) return '2000'
          if (value === 4000) return '4000'
          return value
        }
      },
      axisTick: {
        show: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#559EFF'
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#FF8B67'
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

// 窗口调整处理
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

.c-monitor-bridge-hourly-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 140 1 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
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
  flex-shrink: 0;

  &.beijing {
    background: #559EFF;
  }

  &.shanghai {
    background: #FF8B67;
  }
}

.c-monitor-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>

<template>
  <div class="c-monitor-bridge-hourly">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-wrapper" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-beijing"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-shanghai"></i>
          上海方向
        </span>
      </div>

      <!-- 图表主体 -->
      <div class="c-monitor-chart-body">
        <div ref="chartRef" class="c-monitor-chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 资源变量（系统自动注入）
const bg4 = ref(null)

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（实际应从 API 获取）
const chartData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 300, 250, 400, 600, 800, 900, 1200, 825, 700, 500, 400, 300],
  shanghai: [180, 280, 230, 380, 580, 780, 880, 1180, 831, 680, 480, 380, 280]
})

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
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.5)',
          width: 1
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxis,
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
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 10,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
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
        data: chartData.value.beijing,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)'
        },
        markLine: {
          symbol: 'none',
          data: [
            {
              yAxis: 3000,
              name: '建议分流',
              lineStyle: {
                color: 'rgba(255, 152, 78, 1)',
                type: 'dashed',
                width: 2
              },
              label: {
                show: true,
                position: 'end',
                formatter: '建议分流',
                color: 'rgba(255, 152, 78, 1)',
                fontSize: 12
              }
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(255, 127, 80, 1)'
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

// 窗口大小变化处理
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

.c-monitor-bridge-hourly {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, rgba(56, 141, 255, 1) 0%, rgba(56, 141, 255, 1) 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 150 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-chart-legend {
  flex-shrink: 0;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 8px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: calc(@fontSize * 0.857);
  color: rgba(51, 51, 51, 1);
  cursor: pointer;
  user-select: none;
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
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-beijing {
  background: rgba(25, 144, 255, 1);
}

.c-monitor-legend-dot-shanghai {
  background: rgba(255, 127, 80, 1);
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
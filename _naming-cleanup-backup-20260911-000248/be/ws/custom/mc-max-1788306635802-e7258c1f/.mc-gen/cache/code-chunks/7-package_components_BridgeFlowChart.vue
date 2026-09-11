<template>
  <div class="c-monitor-bridge-flow-chart-root">
    <!-- 标题区 -->
    <div class="c-monitor-bridge-flow-chart-header">
      <div class="c-monitor-bridge-flow-chart-title-wrapper">
        <span class="c-monitor-bridge-flow-chart-icon"></span>
        <span class="c-monitor-bridge-flow-chart-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图例区 -->
    <div class="c-monitor-bridge-flow-chart-legend">
      <div
        class="c-monitor-bridge-flow-chart-legend-item"
        :class="{ active: legendState.beijing }"
        @click="toggleLegend('北京方向')"
      >
        <span class="c-monitor-bridge-flow-chart-legend-dot beijing"></span>
        <span class="c-monitor-bridge-flow-chart-legend-text">北京方向</span>
      </div>
      <div
        class="c-monitor-bridge-flow-chart-legend-item"
        :class="{ active: legendState.shanghai }"
        @click="toggleLegend('上海方向')"
      >
        <span class="c-monitor-bridge-flow-chart-legend-dot shanghai"></span>
        <span class="c-monitor-bridge-flow-chart-legend-text">上海方向</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-bridge-flow-chart-body">
      <div ref="chartRef" class="c-monitor-bridge-flow-chart-container"></div>
    </div>

    <!-- 建议分流提示 -->
    <div class="c-monitor-bridge-flow-chart-notice">建议分流</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态（修复：使用符合 JS 规范的 key 名称）
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 模拟数据
const chartData = ref({
  xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijingData: [200, 300, 400, 500, 800, 1200, 1500, 1800, 2000, 1800, 1500, 1200, 800],
  shanghaiData: [180, 280, 380, 480, 750, 1150, 1450, 1750, 1950, 1750, 1450, 1150, 750]
})

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: name
  })
  
  // 更新图例状态
  if (name === '北京方向') {
    legendState.value.beijing = !legendState.value.beijing
  } else if (name === '上海方向') {
    legendState.value.shanghai = !legendState.value.shanghai
  }
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
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.5)'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxisData,
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
          color: 'rgba(161, 206, 255, 0.3)'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 4000,
      interval: 1000,
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
        show: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.2)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        data: chartData.value.beijingData,
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)'
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(250, 140, 22, 1)',
            type: 'dashed',
            width: 1
          },
          label: {
            show: false
          },
          data: [
            { yAxis: 3000 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        data: chartData.value.shanghaiData,
        itemStyle: {
          color: 'rgba(250, 140, 22, 1)'
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

// 监听 chartRef 变化
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

.c-monitor-bridge-flow-chart-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.c-monitor-bridge-flow-chart-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.c-monitor-bridge-flow-chart-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-bridge-flow-chart-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-flow-chart-title {
  font-size: 14px;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  line-height: 21px;
}

.c-monitor-bridge-flow-chart-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.c-monitor-bridge-flow-chart-legend-item {
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

.c-monitor-bridge-flow-chart-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 0;
  flex-shrink: 0;

  &.beijing {
    background: rgba(25, 144, 255, 1);
  }

  &.shanghai {
    background: rgba(250, 140, 22, 1);
  }
}

.c-monitor-bridge-flow-chart-legend-text {
  font-size: 12px;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
}

.c-monitor-bridge-flow-chart-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.c-monitor-bridge-flow-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-bridge-flow-chart-notice {
  position: absolute;
  top: 50%;
  right: 30px;
  transform: translateY(-50%);
  font-size: 12px;
  color: rgba(255, 152, 78, 1);
  font-weight: 400;
  line-height: 21.6px;
  pointer-events: none;
}
</style>

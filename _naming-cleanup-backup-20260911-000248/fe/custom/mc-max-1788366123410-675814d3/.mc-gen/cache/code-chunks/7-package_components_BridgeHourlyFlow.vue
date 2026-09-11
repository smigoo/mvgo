<template>
  <div class="c-monitor-bridge-flow">
    <!-- 区域标题 -->
    <div class="c-monitor-bridge-flow-header">
      <div class="c-monitor-bridge-flow-title-wrapper">
        <span class="c-monitor-bridge-flow-icon"></span>
        <span class="c-monitor-bridge-flow-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图表主体 -->
    <div class="c-monitor-bridge-flow-body" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <!-- 自定义图例 -->
      <div class="c-monitor-bridge-flow-legend">
        <span 
          class="c-monitor-bridge-flow-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <span class="c-monitor-bridge-flow-legend-dot beijing"></span>
          <span class="c-monitor-bridge-flow-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-bridge-flow-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-bridge-flow-legend-dot shanghai"></span>
          <span class="c-monitor-bridge-flow-legend-text">上海方向</span>
        </span>
      </div>

      <!-- ECharts 图表容器 -->
      <div ref="chartRef" class="c-monitor-bridge-flow-chart"></div>
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

// 图表数据（Mock 数据，实际应从接口获取）
const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 180, 150, 120, 300, 400, 600, 800, 825, 700, 500, 300, 200],
  shanghai: [180, 160, 140, 110, 280, 380, 580, 780, 831, 680, 480, 280, 180]
})

// 背景图变量
const bg4 = ref(null)

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
    legend: {
      show: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName}: ${item.value}辆<br/>`
        })
        return result
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
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
        fontSize: 12,
        align: 'right'
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: (value) => {
          if (value === 0) return '0'
          return value >= 1000 ? (value / 1000) + 'k' : value
        }
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.06)',
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
          color: '#1990ff'
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff984e',
            type: 'dashed',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 12
          },
          data: [
            { yAxis: 3000 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#ff8a60'
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

// 窗口大小调整
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

.c-monitor-bridge-flow {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 131 1 0;
  min-height: 0;
}

.c-monitor-bridge-flow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-bridge-flow-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-bridge-flow-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-flow-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-bridge-flow-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
}

.c-monitor-bridge-flow-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-bridge-flow-legend-item {
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

.c-monitor-bridge-flow-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background: #1990ff;
  }

  &.shanghai {
    background: #ff8a60;
  }
}

.c-monitor-bridge-flow-legend-text {
  font-size: 12px;
  line-height: 18px;
  color: #333333;
}

.c-monitor-bridge-flow-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>

<template>
  <div class="c-monitor-section-chart-bridge">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon2" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          class="c-monitor-legend-item"
          :class="{'is-active': legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-blue"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{'is-active': legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-green"></i>
          <span class="c-monitor-legend-text">上海方向</span>
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'


import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 模拟数据
const chartData = ref({
  xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijingData: [320, 410, 380, 450, 520, 480, 560, 620, 580, 540, 480, 420],
  shanghaiData: [280, 350, 320, 380, 450, 420, 480, 540, 510, 470, 420, 380],
  threshold: 600
})

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart || !chartData.value) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      }
    },
    legend: {
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
      data: chartData.value.xAxisData,
      name: '时',
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      },
      axisLabel: {
        show: true,
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      min: 0,
      max: 800,
      interval: 200,
      axisLine: {
        show: false
      },
      axisLabel: {
        show: true,
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijingData,
        itemStyle: {
          color: '#1990ff'
        },
        barMaxWidth: 20,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#fa8c16',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#fa8c16',
            fontSize: 12
          },
          data: [
            {
              yAxis: chartData.value.threshold,
              name: '建议分流'
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghaiData,
        itemStyle: {
          color: '#52c41a'
        },
        barMaxWidth: 20
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

// 窗口大小调整处理
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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-section-chart-bridge {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  flex-shrink: 0;
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
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 12px;
  justify-content: flex-end;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.is-active) {
    opacity: 0.5;
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
}

.c-monitor-legend-dot-blue {
  background: #1990ff;
}

.c-monitor-legend-dot-green {
  background: #52c41a;
}

.c-monitor-legend-text {
  font-size: calc(@fontSize * 0.8571);
  color: #333333;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
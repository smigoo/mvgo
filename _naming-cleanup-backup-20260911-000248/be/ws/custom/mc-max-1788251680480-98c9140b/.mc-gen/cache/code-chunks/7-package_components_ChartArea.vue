<template>
  <div class="c-env-monitor-chart-area">
    <!-- 图例 -->
    <div class="c-env-monitor-chart-legend">
      <span
        class="c-env-monitor-legend-item"
        :class="{ active: legendState.main }"
        @click="toggleLegend('zk3+785CO浓度')"
      >
        <i class="c-env-monitor-legend-dot" style="background: #0fcd7d"></i>
        zk3+785CO浓度
      </span>
      <span
        class="c-env-monitor-legend-item"
        :class="{ active: legendState.warning }"
        @click="toggleLegend('预警线')"
      >
        <i class="c-env-monitor-legend-dot" style="background: #d32f2f"></i>
        预警线
      </span>
    </div>

    <!-- 图表容器 -->
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
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
  main: true,
  warning: true
})

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === 'zk3+785CO浓度' ? 'main' : 'warning'
  legendState.value[key] = !legendState.value[key]
}

// 模拟数据
const generateData = () => {
  const hours = []
  const values = []
  for (let i = 0; i <= 24; i += 2) {
    hours.push(i)
    // 生成 0-35 之间的随机值
    values.push(Math.floor(Math.random() * 15) + 15)
  }
  return { hours, values }
}

const { hours, values } = generateData()

// 更新图表
const updateChart = () => {
  if (!chart) return

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
      show: false // 使用自定义图例
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
      data: hours,
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
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(24, 144, 255, 0.12)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(24, 144, 255, 0.12)',
          width: 1
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          symbol: 'none',
          data: [
            {
              name: '预警线',
              yAxis: 30,
              lineStyle: {
                color: '#d32f2f',
                type: 'dashed',
                width: 1.5
              },
              label: {
                show: false
              }
            }
          ]
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

// 窗口大小变化
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

.c-env-monitor-chart-area {
  width: 100%;
  flex: 145 1 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.c-env-monitor-chart-legend {
  position: absolute;
  top: 8px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10;
}

.c-env-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #666666;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-env-monitor-legend-dot {
  width: 12px;
  height: 2px;
  border-radius: 1px;
  display: inline-block;
}

.c-env-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>

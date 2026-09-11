<template>
  <div class="c-mc-max-1788165979299-01f105b7-c-env-monitor-chart-section">
    <div class="c-mc-max-1788165979299-01f105b7-c-env-monitor-chart-wrapper">
      <div ref="chartRef" class="c-mc-max-1788165979299-01f105b7-c-env-monitor-chart-container"></div>
    </div>
    <div class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stats-panel">
      <div class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-item">
        <img :src="icon1" class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-icon" />
        <span class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-label">2k3+785CO浓度</span>
      </div>
      <div class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-item">
        <img :src="icon2" class="c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-icon" />
        <span class="c-env-monitor-stat-label c-mc-max-1788165979299-01f105b7-c-env-monitor-stat-label-warning">预警线</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// 资源变量（系统自动注入）

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟图表数据
const chartData = {
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [30, 25, 28, 32, 35, 33, 30, 28, 26, 24, 22, 20]
}

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
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.xAxis,
      name: '时',
      nameTextStyle: {
        color: '#333333',
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
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
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
          color: 'rgba(0, 0, 0, 0.06)'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.series,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          data: [{ yAxis: 30 }],
          label: {
            show: false
          }
        }
      }
    ]
  }

  chart.setOption(option, true)
}

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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-env-monitor-chart-section {
width: 100%;

  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 160px;
  gap: 16px;
}

.c-env-monitor-chart-wrapper {
  flex: 1;
  min-width: 0;
  padding: 16px;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-env-monitor-stats-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex-shrink: 0;
}

.c-env-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-stat-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.c-env-monitor-stat-label {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.2;
}

.c-env-monitor-stat-label-warning {
  color: rgba(245, 63, 63, 1);
}
</style>
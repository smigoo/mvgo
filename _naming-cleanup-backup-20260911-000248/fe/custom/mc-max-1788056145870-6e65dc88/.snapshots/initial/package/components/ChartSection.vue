<template>
  <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-section">
    <!-- 数据标签 + 单位标签 -->
    <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-header">
      <span class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-title">zk3+785CO浓度</span>
      <span class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-unit">单位线</span>
    </div>

    <!-- 面积图容器 -->
    <div ref="chartRef" class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（24小时CO浓度）
const chartData = ref({
  xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  seriesData: [15, 22, 28, 32, 35, 30, 28, 25, 20, 18, 16, 12]
})

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
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
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
      max: 40,
      interval: 10,
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
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
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
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        data: chartData.value.seriesData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          data: [{ yAxis: 30 }]
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

// 窗口尺寸变化处理
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
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

.c-env-monitor-chart-section {
width: 100%;

  flex: 145 1 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-env-monitor-chart-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  flex-shrink: 0;
}

.c-env-monitor-chart-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 14.4px;
  color: rgba(51, 51, 51, 0.8);
}

.c-env-monitor-chart-unit {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 12px;
  color: #f53f3f;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
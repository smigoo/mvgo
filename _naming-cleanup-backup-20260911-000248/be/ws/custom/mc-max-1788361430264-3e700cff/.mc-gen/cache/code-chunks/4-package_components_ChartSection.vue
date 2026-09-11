<template>
  <div class="c-env-monitor-chart-section">
    <!-- Y轴单位标签 -->
    <div class="c-env-monitor-y-axis-label">辆</div>
    
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

// 模拟数据（实际应从 API 获取）
const chartData = ref({
  xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  seriesData: [8, 15, 22, 28, 32, 28, 25, 20, 18, 15, 12, 10]
})

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
      data: ['zk3+785CO浓度'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#666666',
        fontSize: 10
      },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 40,
      right: 20,
      top: 40,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxisData,
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
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
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value.seriesData,
        smooth: true,
        lineStyle: {
          color: '#0fcd7d',
          width: 2
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
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 11
          },
          lineStyle: {
            type: 'dashed',
            color: '#d32f2f',
            width: 1
          },
          data: [
            { yAxis: 30 }
          ]
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
@import '../../resources/styles/index.less';

.c-env-monitor-chart-section {
  position: relative;
  width: 100%;
  flex: 113 1 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-y-axis-label {
  position: absolute;
  left: 8px;
  top: 40px;
  font-size: 12px;
  color: #666666;
  z-index: 10;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

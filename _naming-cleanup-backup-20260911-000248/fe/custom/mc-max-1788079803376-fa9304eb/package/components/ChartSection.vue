<template>
  <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-section">
    <!-- 图表头部信息栏 -->
    <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-header">
      <span class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-label">时间</span>
      <span class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-value">zk3+785CO浓度</span>
      <span class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-badge">预警线</span>
    </div>

    <!-- 图表容器 -->
    <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-body">
      <div ref="chartRef" class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图表数据（模拟24小时监测数据）
const chartData = ref({ xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'], yAxis: [0, 10, 20, 30, 40], series: [ 15, 18, 22, 25, 28, 32, 30, 28, 26, 24, 20, 18, 16, 14, 12, 15, 18, 20, 22, 25, 28, 30, 28, 26
  ]
})

// 更新图表
const updateChart = () => { if (!chart) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
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
      data: chartData.value.xAxis,
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
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      axisTick: {
        show: true
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
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value.series,
        smooth: true,
        symbol: 'none',
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
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          data: [
            {
              yAxis: 30,
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
const initChart = () => { if (!chartRef.value) return
  
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
const handleResize = () => { if (chart) { chart.resize()
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

.c-env-monitor-chart-section {
  width: 100%;
  flex: 145 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-env-monitor-chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  flex-shrink: 0;
}

.c-env-monitor-chart-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.c-env-monitor-chart-value {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.85);
}

.c-env-monitor-chart-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f5222d;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
}

.c-env-monitor-chart-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 0 12px;
  background-image: url('../../resources/images/bg-7890.png');
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
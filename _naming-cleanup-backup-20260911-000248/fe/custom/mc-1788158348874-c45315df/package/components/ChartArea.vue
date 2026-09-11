<template>
  <div class="c-mc-max-env-monitor-verify-r6-c-env-monitor-chart-area">
    <!-- 面积图容器 -->
    <div ref="chartRef" class="c-mc-max-env-monitor-verify-r6-c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（24小时CO浓度数据）
const chartData = ref({ xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'], series: [ { name: 'CO浓度', data: [15, 18, 22, 25, 28, 32, 35, 33, 30, 27, 23, 20]
    }
  ]
})

// 更新图表
const updateChart = () => { if (!chart) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: {
      left: '5%',
      right: '5%',
      top: '15%',
      bottom: '15%',
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
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e5e5e5'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#e5e5e5'
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
        fontSize: 12,
        formatter: '{value}'
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e5e5e5'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#e5e5e5'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: chartData.value.series[0].name,
        type: 'line',
        data: chartData.value.series[0].data,
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
              {
                offset: 0,
                color: 'rgba(15, 205, 125, 0.3)'
              },
              {
                offset: 1,
                color: 'rgba(15, 205, 125, 0.05)'
              }
            ]
          }
        }
      }
    ],
    // 预警线
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
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          }
        }
      ]
    },
    // 当前数值显示
    graphic: [
      {
        type: 'text',
        right: 20,
        top: 20,
        style: {
          text: 'zk3+785CO浓度',
          fontSize: 10,
          fill: 'rgba(0, 0, 0, 0.65)'
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

  // 使用 ResizeObserver 等待容器就绪
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

.c-env-monitor-chart-area {
  flex: 113 1 0;
  min-height: 80px;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
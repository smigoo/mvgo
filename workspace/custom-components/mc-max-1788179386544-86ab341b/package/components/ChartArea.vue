<template>
  <div class="c-env-monitor-chart-area" :style="chartAreaStyle">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  activeTab: {
    type: String,
    default: 'co'
  },
  chartData: {
    type: Object,
    default: () => ({})
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 背景图样式
const chartAreaStyle = computed(() => ({
  backgroundImage: '',
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))

// Mock 数据 - 24小时CO浓度
const mockData = {
  co: [8, 12, 15, 18, 22, 28, 32, 30, 25, 20, 18, 15, 12, 10, 15, 20, 25, 28, 30, 28, 25, 20, 15, 10],
  visibility: [100, 95, 90, 88, 85, 80, 78, 75, 80, 85, 90, 92, 95, 98, 95, 92, 90, 88, 85, 82, 80, 85, 90, 95],
  lighting: [200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 180],
  outdoor: [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500, 400]
}

const timeLabels = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const updateChart = () => {
  if (!chart) return

  const data = mockData[props.activeTab] || mockData.co
  
  const option = {
    backgroundColor: 'transparent',
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
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 5]
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
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
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: [2, 8],
            borderRadius: 4
          },
          lineStyle: {
            type: 'dashed',
            color: '#d32f2f',
            width: 2
          },
          data: [
            {
              yAxis: 30
            }
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
  if (newRef && !chart) {
    initChart()
  }
})

watch(() => props.activeTab, () => {
  updateChart()
})

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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-area {
  width: 100%;
  flex: 113 1 0;
  min-height: 100px;
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
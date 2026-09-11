<template>
  <div class="c-mc-max-1788133479203-d7449268-c-env-monitor-chart-area">
    <div ref="chartRef" class="c-mc-max-1788133479203-d7449268-c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ chartData: { type: Object, default: () => null
  },
  activeTab: {
    type: String,
    default: 'co2'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = { xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'], series: [8, 12, 15, 20, 25, 28, 30, 32, 28, 25, 20, 15]
}

const updateChart = () => { if (!chart) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      },
      axisPointer: {
        type: 'cross',
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        }
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.xAxis,
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
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
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
        data: mockData.series,
        smooth: true,
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(15, 205, 125, 1)'
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
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false
      }
    ],
    legend: {
      show: true,
      data: ['zk3+785CO浓度'],
      left: 20,
      top: 10,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10
      }
    }
  }

  // 添加预警线
  option.series[0].markLine = {
    silent: true,
    symbol: 'none',
    label: {
      position: 'end',
      formatter: '预警线',
      color: '#d32f2f',
      fontSize: 12
    },
    lineStyle: {
      color: '#d32f2f',
      type: 'dashed',
      width: 1
    },
    data: [
      {
        yAxis: 30
      }
    ]
  }

  chart.setOption(option, true)
}

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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(() => props.activeTab, () => {
  updateChart()
})

watch(() => props.chartData, () => {
  updateChart()
})

const handleResize = () => { if (chart) chart.resize()
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
  flex: 160 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
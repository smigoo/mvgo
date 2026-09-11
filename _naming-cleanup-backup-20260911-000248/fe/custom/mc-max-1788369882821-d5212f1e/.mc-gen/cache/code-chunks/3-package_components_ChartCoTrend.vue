<template>
  <div class="c-env-monitor-chart-wrapper">
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  activeTab: {
    type: String,
    default: 'co'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟不同 Tab 的数据
const dataMap = {
  co: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [8, 12, 15, 18, 22, 28, 32, 30, 26, 20, 15, 10],
    legendName: 'zk3+785CO浓度',
    yUnit: '辆',
    xUnit: '时',
    warningLine: 30
  },
  visibility: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [50, 60, 70, 80, 90, 85, 75, 70, 65, 60, 55, 50],
    legendName: '能见度',
    yUnit: 'm',
    xUnit: '时',
    warningLine: null
  },
  lighting: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [100, 120, 150, 180, 200, 220, 240, 230, 210, 180, 150, 120],
    legendName: '洞内照明',
    yUnit: 'lux',
    xUnit: '时',
    warningLine: null
  },
  outdoor: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [200, 300, 400, 500, 600, 700, 650, 600, 500, 400, 300, 200],
    legendName: '洞外光强',
    yUnit: 'lux',
    xUnit: '时',
    warningLine: null
  }
}

const updateChart = () => {
  if (!chart) return

  const currentData = dataMap[props.activeTab] || dataMap.co

  const option = {
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
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
        return `${p.name}${currentData.xUnit}<br/>${p.seriesName}: ${p.value} ${currentData.yUnit}`
      }
    },
    legend: {
      data: [currentData.legendName],
      top: 8,
      right: 16,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect'
    },
    xAxis: {
      type: 'category',
      data: currentData.xData,
      name: currentData.xUnit,
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
          color: 'rgba(0, 0, 0, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      name: currentData.yUnit,
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
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
          color: 'rgba(0, 0, 0, 0.15)'
        }
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
        name: currentData.legendName,
        type: 'line',
        data: currentData.yData,
        smooth: true,
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
              { offset: 0, color: 'rgba(15, 205, 125, 0.25)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: currentData.warningLine
          ? {
              silent: true,
              symbol: 'none',
              label: {
                show: true,
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
              data: [{ yAxis: currentData.warningLine }]
            }
          : undefined
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

const handleResize = () => {
  if (chart) chart.resize()
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(() => props.activeTab, () => {
  updateChart()
})

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

.c-env-monitor-chart-wrapper {
  width: 100%;
  flex: 113 1 0;
  min-height: 100px;
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

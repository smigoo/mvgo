<template>
  <div class="c-env-monitor-section-chart">
    <div ref="chartRef" class="c-env-monitor-chart-container" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartType: {
    type: String,
    default: 'co'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据映射（不同监测指标对应不同数据）
const chartDataMap = {
  co: {
    xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [12, 18, 25, 28, 32, 35, 30, 28, 24, 20, 15, 10],
    name: 'zk3+785CO浓度',
    unit: '',
    warningLine: 30
  },
  visibility: {
    xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [80, 85, 90, 88, 92, 95, 90, 85, 82, 78, 75, 72],
    name: '能见度',
    unit: 'm',
    warningLine: null
  },
  lighting: {
    xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    name: '洞内照明',
    unit: 'lux',
    warningLine: null
  },
  outdoor: {
    xAxisData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [0, 0, 50, 200, 500, 800, 1000, 900, 600, 300, 50, 0],
    name: '洞外光强',
    unit: 'lux',
    warningLine: null
  }
}

const updateChart = () => {
  if (!chart) return

  const currentData = chartDataMap[props.chartType] || chartDataMap.co

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
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1
        }
      }
    },
    legend: {
      data: [currentData.name],
      top: 0,
      right: 0,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 40,
      right: 16,
      top: 30,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: currentData.xAxisData,
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: false
      },
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      nameGap: 5
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      nameGap: 10
    },
    series: [
      {
        name: currentData.name,
        type: 'line',
        data: currentData.seriesData,
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
        symbol: 'none'
      }
    ]
  }

  // 添加预警线（仅CO浓度有）
  if (currentData.warningLine !== null) {
    option.series.push({
      name: '预警线',
      type: 'line',
      data: currentData.xAxisData.map(() => currentData.warningLine),
      lineStyle: {
        color: '#d32f2f',
        width: 1,
        type: 'dashed'
      },
      symbol: 'none',
      markLine: {
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
    })
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

watch(() => props.chartType, () => {
  updateChart()
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

.c-env-monitor-section-chart {
  flex: 110 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
  padding: 12px 16px;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
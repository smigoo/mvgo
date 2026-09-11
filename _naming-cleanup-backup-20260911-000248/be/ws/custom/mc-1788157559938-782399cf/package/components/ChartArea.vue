<template>
  <div class="c-mc-max-env-monitor-verify-r5-c-env-monitor-chart-area">
    <div ref="chartRef" class="c-mc-max-env-monitor-verify-r5-c-env-monitor-chart-body"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => { if (!chart) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: 'rgba(0, 0, 0, 0.08)', borderWidth: 1, textStyle: { color: '#333333', fontSize: 12
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: {
      left: 36,
      right: 42,
      top: 24,
      bottom: 28,
      containLabel: true
    },
    legend: {
      show: true,
      orient: 'horizontal',
      left: '1%',
      top: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 4,
      data: ['zk3+785CO浓度'],
      textStyle: {
        color: '#333333',
        fontSize: 9.6
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
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
        lineStyle: { color: '#333333' }
      },
      axisLine: {
        show: true,
        lineStyle: { color: '#333333', width: 1 }
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
        show: true,
        lineStyle: { color: '#333333' }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.08)',
          width: 1
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: [9, 14, 19, 23, 26, 24, 21, 18, 15, 12, 10, 8],
        lineStyle: {
          color: '#0fcd7d',
          width: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.45)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            formatter: '预警线',
            position: 'end',
            color: '#d32f2f',
            fontSize: 12
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
      chartObserver = null
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
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
  width: 100%;
  flex: 113 1 0;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-body {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
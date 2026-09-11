<template>
  <div class="c-env-monitor-section-chart">
    <div ref="chartRef" class="c-env-monitor-chart-container" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
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

// 不同监测指标对应的模拟数据
const chartDataMap = {
  co: {
    name: 'zk3+785CO浓度',
    color: 'rgba(70,210,160,1)',
    unit: 'ppm',
    data: [
      [2, 5], [4, 8], [6, 6], [8, 4], [10, 3],
      [12, 10], [14, 18], [16, 22], [18, 16], [20, 12],
      [22, 8], [24, 6]
    ],
    warningLine: 30
  },
  visibility: {
    name: 'zk3+785能见度',
    color: 'rgba(85,158,255,1)',
    unit: 'm',
    data: [
      [2, 380], [4, 360], [6, 400], [8, 420], [10, 450],
      [12, 380], [14, 280], [16, 220], [18, 260], [20, 320],
      [22, 360], [24, 400]
    ],
    warningLine: 250
  },
  lighting: {
    name: 'zk3+785洞内照明',
    color: 'rgba(255,193,7,1)',
    unit: 'lux',
    data: [
      [2, 320], [4, 340], [6, 360], [8, 380], [10, 400],
      [12, 380], [14, 320], [16, 280], [18, 300], [20, 350],
      [22, 380], [24, 400]
    ],
    warningLine: 200
  },
  outdoor: {
    name: 'zk3+785洞外光强',
    color: 'rgba(245,63,63,1)',
    unit: 'lux',
    data: [
      [2, 0], [4, 0], [6, 10], [8, 80], [10, 280],
      [12, 580], [14, 820], [16, 950], [18, 780], [20, 420],
      [22, 120], [24, 10]
    ],
    warningLine: 800
  }
}

const buildOption = (tabKey) => {
  const info = chartDataMap[tabKey] || chartDataMap.co
  const xLabels = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

  return {
    color: [info.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50,60,80,0.92)',
      borderColor: 'rgba(85,158,255,0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(85,158,255,0.6)',
          type: 'dashed'
        }
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        return `${p.name}时<br/>${p.seriesName}: ${p.value} ${info.unit}`
      }
    },
    legend: {
      show: true,
      top: 0,
      right: 4,
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 8,
      textStyle: {
        color: 'rgba(80,100,130,1)',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      data: [info.name]
    },
    grid: {
      left: 32,
      right: 12,
      top: 22,
      bottom: 22,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      name: '时',
      nameLocation: 'end',
      nameGap: 4,
      nameTextStyle: {
        color: 'rgba(80,100,130,1)',
        fontSize: 9,
        fontFamily: 'Source Han Sans CN',
        padding: [2, 0, 0, 0]
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(180,200,220,0.6)',
          width: 0.5
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(180,200,220,0.6)'
        }
      },
      axisLabel: {
        show: true,
        color: 'rgba(80,100,130,1)',
        fontSize: 9,
        fontFamily: 'Roboto',
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(180,200,220,0.4)',
          type: 'dashed',
          width: 0.5
        }
      },
      axisLabel: {
        show: true,
        color: 'rgba(80,100,130,1)',
        fontSize: 9,
        fontFamily: 'Roboto',
        formatter: '{value}'
      }
    },
    series: [
      {
        name: info.name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        lineStyle: {
          width: 1.5,
          color: info.color
        },
        itemStyle: {
          color: info.color,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(70,210,160,0.35)' },
              { offset: 1, color: 'rgba(70,210,160,0.02)' }
            ]
          }
        },
        data: info.data,
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          label: {
            show: true,
            position: 'end',
            color: 'rgba(245,63,63,1)',
            fontSize: 9,
            fontFamily: 'Source Han Sans CN',
            formatter: '预警线'
          },
          lineStyle: {
            color: 'rgba(245,63,63,1)',
            type: 'dashed',
            width: 1
          },
          data: [
            {
              yAxis: info.warningLine,
              name: '预警线'
            }
          ]
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(props.activeTab), true)
}

const initChart = () => {
  if (!chartRef.value) return
  const el = chartRef.value
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(el)
    updateChart()
    registerResize()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const { width, height } = entry.contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(el)
      updateChart()
      registerResize()
    }
  })
  chartObserver.observe(el)
}

const registerResize = () => {
  window.addEventListener('resize', handleWindowResize)
}

const handleWindowResize = () => {
  chart?.resize()
}

watch(() => props.activeTab, () => {
  updateChart()
})

watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    nextTick(() => initChart())
  }
})

onMounted(() => {
  nextTick(() => initChart())
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  chartObserver?.disconnect()
  chartObserver = null
  chart?.dispose()
  chart = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-section-chart {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}
</style>
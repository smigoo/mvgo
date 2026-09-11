<template>
  <div class="c-monitor-tunnel-hourly-chart">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg3})` }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})

// 导入背景图资源（系统自动注入，此处仅作类型标注）
const bg3 = 'bg3'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const chartData = ref({
  xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: '北京方向',
      data: [120, 200, 150, 180, 220, 300, 450, 600, 825, 550, 380, 260, 180]
    },
    {
      name: '上海方向',
      data: [180, 240, 190, 220, 280, 350, 500, 680, 831, 600, 420, 300, 220]
    }
  ]
})

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

const updateChart = () => {
  if (!chart) return

  const option = {
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      itemWidth: 10,
      itemHeight: 10
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(25, 144, 255, 0.1)'
        }
      },
      formatter: (params) => {
        if (!Array.isArray(params)) return ''
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName}: ${item.value}辆<br/>`
        })
        return result
      }
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxisData,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
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
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: false
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
        fontSize: 10,
        formatter: '{value}'
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
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        data: chartData.value.series[0].data,
        itemStyle: {
          color: '#559EFF',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        data: chartData.value.series[1].data,
        itemStyle: {
          color: '#FF8B67',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#FF984E',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#FF984E',
            fontSize: 12
          },
          data: [
            {
              yAxis: 3000
            }
          ]
        }
      }
    ]
  }

  chart.setOption(option, true)
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
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tunnel-hourly-chart {
  width: 100%;
  flex: 131 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 21px;
  margin-bottom: 8px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388DFF 0%, #388DFF 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-family: Source Han Sans CN, sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

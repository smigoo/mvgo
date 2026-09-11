<template>
  <div class="c-monitor-bridge-hourly-flow">
    <div class="c-monitor-bridge-hourly-header">
      <div class="c-monitor-bridge-hourly-title">
        <span class="c-monitor-bridge-hourly-icon"></span>
        <span class="c-monitor-bridge-hourly-title-text">江阴大桥</span>
      </div>
    </div>
    <div class="c-monitor-bridge-hourly-body">
      <div ref="chartRef" class="c-monitor-bridge-hourly-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const chartData = ref({
  hours: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [300, 350, 280, 400, 500, 650, 800, 825, 750, 600, 450, 350],
  shanghai: [320, 360, 290, 410, 520, 670, 820, 831, 770, 620, 470, 360]
})

const legendState = ref({
  beijing: true,
  shanghai: true
})

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

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
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
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
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
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
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        barWidth: 8,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 8,
        itemStyle: {
          color: '#52c41a',
          borderRadius: [2, 2, 0, 0]
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

.c-monitor-bridge-hourly-flow {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 280 1 0;
}

.c-monitor-bridge-hourly-header {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.c-monitor-bridge-hourly-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-bridge-hourly-icon {
  width: 3px;
  height: 14px;
  background: linear-gradient(135deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-hourly-title-text {
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-bridge-hourly-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 12px 16px;
  overflow: hidden;
}

.c-monitor-bridge-hourly-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

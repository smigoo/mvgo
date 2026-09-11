<template>
  <div class="c-monitor-tunnel-flow">
    <div class="c-monitor-tunnel-flow-header">
      <div class="c-monitor-tunnel-flow-title">
        <span class="c-monitor-tunnel-flow-icon"></span>
        <span class="c-monitor-tunnel-flow-text">江阴靖江长江隧道</span>
      </div>
    </div>
    <div class="c-monitor-tunnel-flow-body">
      <div ref="chartRef" class="c-monitor-tunnel-flow-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [600, 800, 1200, 1500, 2000, 2200, 2500, 2800, 3200, 2900, 2400, 1800, 1200],
  shanghai: [500, 700, 1000, 1300, 1800, 2000, 2300, 2600, 3000, 2700, 2200, 1600, 1000]
})

const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(161, 206, 255, 0.1)'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      right: 16,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 50,
      right: 16,
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
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      min: 0,
      max: 4000,
      interval: 1000,
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
        fontSize: 12
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
        data: chartData.value.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          lineStyle: {
            color: '#ff984e',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 12
          },
          data: [
            {
              yAxis: 3000,
              name: '建议分流'
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#ff7a45',
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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tunnel-flow {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-tunnel-flow-header {
  flex-shrink: 0;
  height: 21px;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-tunnel-flow-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-tunnel-flow-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-tunnel-flow-text {
  font-size: calc(@fontSize * 1);
  color: #333333;
  line-height: 21px;
}

.c-monitor-tunnel-flow-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-tunnel-flow-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
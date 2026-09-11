<template>
  <div class="c-monitor-tunnel-hourly-flow">
    <div class="c-monitor-tunnel-hourly-flow-header">
      <div class="c-monitor-tunnel-hourly-flow-title">
        <span class="c-monitor-tunnel-hourly-flow-title-icon"></span>
        <span class="c-monitor-tunnel-hourly-flow-title-text">江阴靖江长江隧道</span>
      </div>
    </div>
    <div class="c-monitor-tunnel-hourly-flow-body">
      <div ref="chartRef" class="c-monitor-tunnel-hourly-flow-chart"></div>
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

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 模拟数据
const mockData = {
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 180, 220, 250, 320, 380, 450, 520, 600, 580, 520, 450, 350],
  shanghai: [180, 160, 200, 230, 300, 360, 420, 500, 580, 550, 500, 430, 330]
}

const updateChart = () => {
  if (!chart) return
  
  chart.setOption({
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
          color: 'rgba(255, 255, 255, 0.05)'
        }
      }
    },
    legend: {
      show: true,
      top: 10,
      right: 20,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 50,
      right: 20,
      top: 50,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.xAxis,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 5]
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 5, 0, 0]
      },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: false
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        formatter: (value) => {
          if (value === 0) return '0'
          return (value / 1000).toFixed(0) + 'k'
        }
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#f0f0f0',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 8,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 8,
        itemStyle: {
          color: '#52c41a',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '建议分流',
        type: 'line',
        data: Array(mockData.xAxis.length).fill(3000),
        lineStyle: {
          color: '#ff8700',
          type: 'dashed',
          width: 2
        },
        symbol: 'none',
        markLine: {
          silent: true,
          lineStyle: {
            color: '#ff8700',
            type: 'dashed',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff8700',
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
  }, true)
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

// 注意：根元素 flex 已在 common.less 中声明，此处不重复
.c-monitor-tunnel-hourly-flow {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.c-monitor-tunnel-hourly-flow-header {
  flex-shrink: 0;
  padding: 0 0 8px 0;
}

.c-monitor-tunnel-hourly-flow-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-tunnel-hourly-flow-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-tunnel-hourly-flow-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-tunnel-hourly-flow-body {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-tunnel-hourly-flow-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

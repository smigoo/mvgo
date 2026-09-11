<template>
  <div class="c-monitor-bridge-chart-root">
    <div class="c-monitor-bridge-header">
      <div class="c-monitor-bridge-decor"></div>
      <span class="c-monitor-bridge-title">江阴大桥</span>
    </div>
    <div class="c-monitor-bridge-chart-wrapper">
      <div ref="chartRef" class="c-monitor-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15);',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(25, 144, 255, 0.05)'
        }
      },
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
            <span>${p.seriesName}</span>
            <span style="font-weight:500;margin-left:auto;">${p.value}辆</span>
          </div>`
        })
        return res
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      }
    },
    grid: {
      left: 8,
      right: 16,
      top: 32,
      bottom: 8,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: {
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto',
        margin: 12
      }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        barGap: '30%',
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        },
        data: [600, 400, 200, 600, 1200, 1800, 2200, 3200, 2400, 1600, 1000, 600],
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: {
            color: '#ff7a45',
            type: 'dashed',
            width: 1
          },
          label: {
            formatter: '建议分流',
            color: '#ff7a45',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN',
            position: 'insideEndTop',
            distance: 4
          },
          data: [
            { yAxis: 3000 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#00d2ff',
          borderRadius: [2, 2, 0, 0]
        },
        data: [600, 400, 200, 600, 1400, 2000, 2400, 3400, 2200, 1400, 800, 400]
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
  chart?.dispose()
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-bridge-chart-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-bridge-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-bridge-decor {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: #388dff;
  flex-shrink: 0;
}

.c-monitor-bridge-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-bridge-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-monitor-bridge-chart {
  width: 100%;
  height: 100%;
}
</style>
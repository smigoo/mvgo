<template>
  <div class="c-monitor-bridge-hourly">
    <div class="c-monitor-bridge-hourly-header">
      <div class="c-monitor-bridge-hourly-title">
        <span class="c-monitor-bridge-hourly-icon"></span>
        <span class="c-monitor-bridge-hourly-title-text">江阴大桥</span>
      </div>
      <div class="c-monitor-bridge-hourly-legend">
        <span 
          class="c-monitor-bridge-hourly-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-bridge-hourly-legend-dot beijing"></i>北京方向
        </span>
        <span 
          class="c-monitor-bridge-hourly-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-bridge-hourly-legend-dot shanghai"></i>上海方向
        </span>
      </div>
    </div>
    <div class="c-monitor-bridge-hourly-body" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-bridge-hourly-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-_m-35.png'


import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

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
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      borderRadius: 4,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      padding: [8, 12],
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(161,206,255,0.5)'
        }
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.1)'
        }
      },
      axisTick: {
        show: true
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
        show: true
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 10
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [600, 550, 500, 650, 1200, 1800, 1500, 2000, 1800, 1600, 1400, 1200, 1000, 1500, 1800, 2200, 2400, 2200, 2000, 1800, 1500, 1200, 900, 700],
        itemStyle: {
          color: 'rgba(25,144,255,1)',
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: 4,
        barGap: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(255,152,78,1)',
            type: 'dashed',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 12
          },
          data: [{ yAxis: 3000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [650, 600, 550, 700, 1300, 1900, 1600, 2100, 1900, 1700, 1500, 1300, 1100, 1600, 1900, 2300, 2500, 2300, 2100, 1900, 1600, 1300, 1000, 750],
        itemStyle: {
          color: 'rgba(255,127,80,1)',
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: 4
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

.c-monitor-bridge-hourly {
  width: 100%;
  flex: 150 1 0;
  min-height: 0;
}

.c-monitor-bridge-hourly-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-bridge-hourly-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-bridge-hourly-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-hourly-title-text {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: #333333;
  font-weight: 400;
  line-height: 21px;
}

.c-monitor-bridge-hourly-legend {
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-monitor-bridge-hourly-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 1;
  }
}

.c-monitor-bridge-hourly-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;
  flex-shrink: 0;

  &.beijing {
    background: rgba(25,144,255,1);
  }

  &.shanghai {
    background: rgba(255,127,80,1);
  }
}

.c-monitor-bridge-hourly-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-bridge-hourly-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
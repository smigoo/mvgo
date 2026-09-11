<template>
  <div class="c-monitor-hourly-flow-bridge">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">江阴大桥</span>
      </div>
    </div>

    <div class="c-monitor-chart-area" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      
      <div class="c-monitor-chart-legend">
        <div 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <span class="c-monitor-legend-dot beijing"></span>
          <span class="c-monitor-legend-text">北京方向</span>
        </div>
        <div 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-legend-dot shanghai"></span>
          <span class="c-monitor-legend-text">上海方向</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'


import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

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

const mockData = {
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 180, 220, 280, 350, 500, 800, 1200, 1500, 1800, 1600, 1200, 800],
  shanghai: [150, 160, 200, 250, 320, 450, 750, 1100, 1400, 1700, 1500, 1100, 750]
}

const updateChart = () => {
  if (!chart) return
  
  const option = {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(24, 144, 255, 0.3)',
          width: 1
        }
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.marker}${item.seriesName}: ${item.value} 辆<br/>`
        })
        return result
      }
    },
    xAxis: {
      type: 'category',
      data: mockData.xAxis,
      name: '时',
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.08)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff7a45',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff7a45',
            fontSize: 12
          },
          data: [{ yAxis: 3000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
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

.c-monitor-hourly-flow-bridge {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-area {
  width: 100%;
  flex: 131 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 0 50px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;
  
  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  
  &.beijing {
    background: #1890ff;
  }
  
  &.shanghai {
    background: #ff7a45;
  }
}

.c-monitor-legend-text {
  font-size: calc(var(--fontSize, 14px) * 0.86);
  color: #333333;
  line-height: 18px;
}
</style>
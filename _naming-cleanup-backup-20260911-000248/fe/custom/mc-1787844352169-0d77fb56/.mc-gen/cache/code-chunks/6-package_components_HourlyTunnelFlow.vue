<template>
  <div class="c-monitor-hourly-tunnel">
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-bar">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>
    
    <div class="c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot beijing"></i>北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot shanghai"></i>上海方向
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

const mockData = {
  hours: Array.from({ length: 13 }, (_, i) => i * 2),
  beijing: [150, 180, 220, 280, 320, 380, 420, 450, 380, 320, 280, 240, 200],
  shanghai: [140, 170, 210, 260, 300, 360, 400, 430, 370, 310, 270, 230, 190]
}

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
      show: false,
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 12
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        },
        barMaxWidth: 16
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        itemStyle: {
          color: 'rgba(255, 133, 51, 1)',
          borderRadius: [2, 2, 0, 0]
        },
        barMaxWidth: 16
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

.c-monitor-hourly-tunnel {
  display: flex;
  flex-direction: column;
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-title-bar {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(135deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(51, 51, 51, 1);
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.5;
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background: rgba(25, 144, 255, 1);
  }

  &.shanghai {
    background: rgba(255, 133, 51, 1);
  }
}
</style>
```
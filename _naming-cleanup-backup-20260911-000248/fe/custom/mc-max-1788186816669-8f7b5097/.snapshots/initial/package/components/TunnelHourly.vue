<template>
  <div class="c-monitor-tunnel-hourly">
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg3})` }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>

      <div v-if="showTooltip" class="c-monitor-chart-tooltip" :style="tooltipStyle">
        <div class="c-monitor-tooltip-time">{{ tooltipData.time }}</div>
        <div class="c-monitor-tooltip-item">
          <span class="c-monitor-tooltip-dot c-monitor-tooltip-dot-beijing"></span>
          <span class="c-monitor-tooltip-label">北京方向</span>
          <span class="c-monitor-tooltip-value">{{ tooltipData.beijing }}</span>
          <span class="c-monitor-tooltip-unit">辆</span>
        </div>
        <div class="c-monitor-tooltip-item">
          <span class="c-monitor-tooltip-dot c-monitor-tooltip-dot-shanghai"></span>
          <span class="c-monitor-tooltip-label">上海方向</span>
          <span class="c-monitor-tooltip-value">{{ tooltipData.shanghai }}</span>
          <span class="c-monitor-tooltip-unit">辆</span>
        </div>
      </div>

      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-beijing"></i>
          北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-shanghai"></i>
          上海方向
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({
  beijing: true,
  shanghai: true
})

const showTooltip = ref(false)
const tooltipStyle = ref({})
const tooltipData = ref({
  time: '',
  beijing: '',
  shanghai: ''
})

const chartData = ref({
  hours: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [150, 180, 220, 280, 350, 420, 500, 825, 650, 580, 480, 380],
  shanghai: [140, 170, 200, 260, 330, 400, 480, 831, 620, 550, 460, 360]
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
      show: false
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
      data: chartData.value.hours,
      name: '时',
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameLocation: 'end',
      nameGap: 12,
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
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
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10,
        formatter: (value) => {
          if (value === 0) return '0'
          if (value >= 1000) return (value / 1000) + '000'
          return value
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        data: chartData.value.beijing
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#ff9800',
          borderRadius: [2, 2, 0, 0]
        },
        data: chartData.value.shanghai
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

    chart.on('mousemove', (params) => {
      if (params.componentType === 'series') {
        const hourIndex = params.dataIndex
        showTooltip.value = true
        tooltipData.value = {
          time: chartData.value.hours[hourIndex] + '时',
          beijing: chartData.value.beijing[hourIndex],
          shanghai: chartData.value.shanghai[hourIndex]
        }
        
        const chartRect = chartRef.value.getBoundingClientRect()
        tooltipStyle.value = {
          left: params.event.offsetX + 'px',
          top: (params.event.offsetY - 80) + 'px'
        }
      }
    })

    chart.on('mouseout', () => {
      showTooltip.value = false
    })

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

.c-monitor-tunnel-hourly {
  display: flex;
  flex-direction: column;
  flex: 131 1 0;
  min-height: 100px;
  width: 100%;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-wrapper {
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

.c-monitor-title-text {
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-body {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
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

.c-monitor-chart-tooltip {
  position: absolute;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 4px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 100;
}

.c-monitor-tooltip-time {
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  margin-bottom: 4px;
  font-weight: 400;
}

.c-monitor-tooltip-item {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.c-monitor-tooltip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-tooltip-dot-beijing {
  background: #1890ff;
}

.c-monitor-tooltip-dot-shanghai {
  background: #ff9800;
}

.c-monitor-tooltip-label {
  font-size: calc(@fontSize * 0.686);
  color: rgba(51, 51, 51, 0.8);
}

.c-monitor-tooltip-value {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
}

.c-monitor-tooltip-unit {
  font-size: calc(@fontSize * 0.686);
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-chart-legend {
  position: absolute;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-beijing {
  background: #1890ff;
}

.c-monitor-legend-dot-shanghai {
  background: #ff9800;
}
</style>
<template>
  <div class="c-monitor-tunnel-hourly-section">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon-bar"></span>
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
          <i class="c-monitor-legend-dot c-monitor-dot-blue"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-dot-orange"></i>
          <span class="c-monitor-legend-text">上海方向</span>
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

const legendState = ref({
  beijing: true,
  shanghai: true
})

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name
  })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const mockData = {
  hours: Array.from({ length: 24 }, (_, i) => `${i}`),
  beijing: [320, 302, 301, 334, 390, 530, 620, 720, 825, 890, 780, 690, 650, 720, 780, 850, 920, 880, 790, 720, 680, 590, 520, 420],
  shanghai: [220, 182, 191, 234, 290, 330, 410, 520, 831, 901, 954, 1090, 1230, 1300, 1280, 1170, 1090, 1000, 910, 850, 780, 690, 550, 390]
}

const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(25, 144, 255, 0.1)'
        }
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.15)'
        }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10,
        interval: 1
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12,
        align: 'right'
      },
      max: 4000,
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 10
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 8,
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 8,
        itemStyle: {
          color: '#ff8b00',
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

.c-monitor-tunnel-hourly-section {
  flex: 131 1 0;
  min-height: 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-section-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-title-icon-bar {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  justify-content: center;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-dot-blue {
  background: #1990ff;
}

.c-monitor-dot-orange {
  background: #ff8b00;
}

.c-monitor-legend-text {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}
</style>

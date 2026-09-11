<template>
  <div class="c-monitor-bridge-hourly">
    <div class="c-monitor-section-header">
      <div class="c-monitor-header-left">
        <div class="c-monitor-icon-wrapper">
          <div class="c-monitor-icon-rect"></div>
        </div>
        <span class="c-monitor-section-title">江阴大桥</span>
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
          <i class="c-monitor-legend-dot beijing"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot shanghai"></i>
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
  'beijing': true,
  'shanghai': true
})

const mockData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  'beijing': [120, 150, 180, 220, 350, 420, 520, 680, 825, 720, 580, 420, 280],
  'shanghai': [100, 130, 160, 200, 330, 400, 500, 660, 831, 700, 560, 400, 260]
}

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: name
  })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  
  const option = {
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
          color: 'rgba(25, 144, 255, 0.3)',
          type: 'solid'
        }
      },
      formatter: (params) => {
        let html = `<div style="padding: 4px 8px;">`
        html += `<div style="margin-bottom: 6px; font-weight: 500;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          const color = p.seriesName === '北京方向' ? '#1890ff' : '#ff8648'
          html += `<div style="display: flex; align-items: center; margin-bottom: 4px;">`
          html += `<span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>`
          html += `<span style="flex: 1;">${p.seriesName}</span>`
          html += `<span style="font-weight: 600; margin-left: 16px;">${p.value}</span>`
          html += `<span style="margin-left: 4px; color: #999;">辆</span>`
          html += `</div>`
        })
        html += `</div>`
        return html
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        interval: 0
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisTick: {
        show: false
      },
      name: '时',
      nameTextStyle: {
        color: '#333333',
        fontSize: 12,
        align: 'right',
        padding: [0, 10, 0, 0]
      }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      interval: 1000,
      axisLabel: {
        color: '#333333',
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
          color: 'rgba(51, 51, 51, 0.1)',
          type: 'dashed'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: '#333333',
        fontSize: 12,
        align: 'right',
        padding: [0, 0, 10, 0]
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
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#ff8648',
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

.c-monitor-bridge-hourly {
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

.c-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-icon-wrapper {
  width: 3px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-icon-rect {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 131 1 0;
  min-height: 100px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.c-monitor-chart-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  min-width: 0;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-right: 20px;
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
  border-radius: 50%;
  flex-shrink: 0;

  &.beijing {
    background: #1890ff;
  }

  &.shanghai {
    background: #ff8648;
  }
}

.c-monitor-legend-text {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}
</style>
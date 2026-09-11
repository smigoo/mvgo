<template>
  <div class="c-monitor-hourly-tunnel">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- Chart Container -->
    <div class="c-monitor-chart-wrapper" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <!-- Custom Legend -->
      <div class="c-monitor-chart-legend">
        <div 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <span class="c-monitor-legend-dot c-monitor-legend-dot-beijing"></span>
          <span class="c-monitor-legend-text">北京方向</span>
        </div>
        <div 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-legend-dot c-monitor-legend-dot-shanghai"></span>
          <span class="c-monitor-legend-text">上海方向</span>
        </div>
      </div>

      <!-- ECharts Container -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// Mock 数据
const mockData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [100, 120, 150, 200, 300, 350, 400, 450, 825, 500, 400, 300, 200],
  shanghai: [80, 100, 130, 180, 280, 320, 380, 420, 831, 480, 380, 280, 180]
}

// 背景图资源
const bg2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: name
  })
  
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
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
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName}: ${item.value} 辆<br/>`
        })
        return result
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
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
      data: mockData.hours,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 1000,
      interval: 200,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
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
        data: mockData.beijing,
        itemStyle: {
          color: '#1890ff'
        },
        barWidth: 4,
        barGap: '50%',
        markLine: {
          symbol: 'none',
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
              yAxis: 600,
              name: '建议分流'
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        itemStyle: {
          color: '#ff9966'
        },
        barWidth: 4
      }
    ]
  }

  chart.setOption(option, true)
}

// 初始化图表
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 窗口尺寸变化处理
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

.c-monitor-hourly-tunnel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
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
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.8;
  }

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-beijing {
  background: #1890ff;
}

.c-monitor-legend-dot-shanghai {
  background: #ff9966;
}

.c-monitor-legend-text {
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: #333333;
  line-height: 18px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>

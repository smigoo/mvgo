<template>
  <div class="c-monitor-bridge-hourly-flow">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <span class="c-monitor-section-icon" :style="{ backgroundImage: `url(${icon3})` }"></span>
        <span class="c-monitor-section-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-body">
      <!-- 自定义图例 -->
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

      <!-- 图表区域 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 图标资源
const icon3 = 'icon3'

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（24小时流量数据）
const mockData = {
  hours: Array.from({ length: 24 }, (_, i) => `${i}`),
  beijing: [
    150, 180, 200, 220, 250, 280, 320, 350, 380, 420, 450, 480,
    500, 520, 550, 580, 600, 620, 650, 680, 700, 720, 650, 500
  ],
  shanghai: [
    120, 150, 170, 190, 220, 240, 270, 300, 330, 360, 390, 420,
    440, 460, 480, 510, 540, 560, 590, 620, 640, 660, 600, 450
  ]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ 
    type: 'legendToggleSelect', 
    name 
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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(161, 206, 255, 1)',
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
      },
      formatter: (params) => {
        if (!Array.isArray(params)) return ''
        const hour = params[0].name
        let content = `${hour}时<br/>`
        params.forEach(p => {
          content += `${p.marker}${p.seriesName}: ${p.value}辆<br/>`
        })
        return content
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
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        interval: 1
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.08)',
          type: 'dashed'
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
          color: '#ff8648',
          borderRadius: [2, 2, 0, 0]
        }
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

// 窗口大小调整
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
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-bridge-hourly-flow {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 131 1 0;
  min-height: 0;
  gap: 8px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-section-icon {
  width: 3px;
  height: 12px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
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
    opacity: 1;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background-color: #1890ff;
  }

  &.shanghai {
    background-color: #ff8648;
  }
}

.c-monitor-legend-text {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}
</style>
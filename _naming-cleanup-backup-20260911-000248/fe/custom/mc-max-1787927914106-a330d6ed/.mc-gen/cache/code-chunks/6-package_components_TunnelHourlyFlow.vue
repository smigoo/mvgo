<template>
  <div class="c-monitor-tunnel-hourly">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <div class="c-monitor-section-icon" :style="{ backgroundImage: `url(${bg3})` }"></div>
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #ff8648;"></i>
          <span class="c-monitor-legend-text">上海方向</span>
        </span>
      </div>

      <!-- ECharts 容器 -->
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

// 模拟24小时数据
const hours = Array.from({ length: 24 }, (_, i) => `${i}`)
const beijingData = [
  120, 132, 101, 134, 90, 230, 210,
  182, 191, 234, 290, 330, 310,
  320, 332, 301, 334, 390, 330, 320,
  280, 250, 220, 180
]
const shanghaiData = [
  150, 142, 121, 144, 110, 250, 230,
  202, 211, 254, 310, 350, 330,
  340, 352, 321, 354, 410, 350, 340,
  300, 270, 240, 200
]

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
          color: 'rgba(161, 206, 255, 0.1)'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.2)'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, -10]
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.1)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
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

// 窗口大小变化
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
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-section-icon {
  width: 3px;
  height: 12px;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-chart-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding-left: 50px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.5;
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

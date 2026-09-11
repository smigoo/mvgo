<template>
  <div class="c-monitor-tunnel-hourly-flow">
    <!-- 标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
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
          <i class="c-monitor-legend-dot" style="background: rgba(25, 144, 255, 1);"></i>
          <span class="c-monitor-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: rgba(255, 139, 0, 1);"></i>
          <span class="c-monitor-legend-label">上海方向</span>
        </span>
      </div>

      <!-- 图表容器 -->
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

// 模拟数据（0-24小时）
const hours = Array.from({ length: 25 }, (_, i) => i)
const beijingData = [120, 150, 180, 200, 250, 300, 350, 400, 600, 700, 750, 800, 825, 800, 750, 700, 650, 600, 550, 500, 400, 300, 250, 200, 150]
const shanghaiData = [100, 130, 160, 190, 240, 290, 340, 390, 580, 680, 730, 780, 831, 790, 740, 690, 640, 590, 540, 490, 390, 290, 240, 190, 140]

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
      borderRadius: 4,
      padding: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(25, 144, 255, 0.3)',
          width: 1
        }
      },
      formatter: (params) => {
        if (!params || params.length === 0) return ''
        const hour = params[0].name
        let content = `${hour}时<br/>`
        params.forEach(item => {
          content += `${item.seriesName}: ${item.value}辆<br/>`
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
      data: hours,
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
      min: 0,
      max: 1000,
      interval: 200,
      axisLine: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 10
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
          color: 'rgba(25, 144, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(255, 139, 0, 1)',
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

// 窗口resize处理
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

.c-monitor-tunnel-hourly-flow {
  display: flex;
  flex-direction: column;
  flex: 131 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, rgba(56, 141, 255, 1) 0%, rgba(56, 141, 255, 1) 100%);
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

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
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
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-monitor-legend-label {
  font-size: 12px;
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>

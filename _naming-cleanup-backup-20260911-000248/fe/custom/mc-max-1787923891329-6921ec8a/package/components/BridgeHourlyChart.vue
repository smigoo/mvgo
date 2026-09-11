<template>
  <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-bridge-hourly">
    <!-- 区域标题 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-header">
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-title-with-icon">
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-title-bar"></span>
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-chart-legend">
        <span
          class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-mc-max-1787923891329-6921ec8a-c-monitor-legend-dot-blue"></i>
          <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-text">北京方向</span>
        </span>
        <span
          class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-mc-max-1787923891329-6921ec8a-c-monitor-legend-dot-orange"></i>
          <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-legend-text">上海方向</span>
        </span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-mc-max-1787923891329-6921ec8a-c-monitor-chart-container"></div>
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

// Mock 数据（24小时）
const hourlyData = ref({
  hours: Array.from({ length: 13 }, (_, i) => i * 2), // 0,2,4,...,24
  beijing: [350, 420, 380, 450, 520, 680, 820, 950, 825, 720, 650, 580, 520],
  shanghai: [280, 340, 310, 380, 460, 620, 780, 910, 831, 690, 610, 540, 480]
})

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
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
        fontSize: 10
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(161, 206, 255, 0.1)'
        }
      },
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const hour = params[0].name
        let html = `<div style="padding: 4px 8px; font-size: 10px;">
          <div style="margin-bottom: 4px; font-weight: 600;">${hour}时</div>`
        params.forEach(p => {
          const color = p.color
          html += `<div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${color};"></span>
            <span style="color: #666;">${p.seriesName}</span>
            <span style="font-weight: 600; margin-left: auto;">${p.value}</span>
            <span style="color: #666;">辆</span>
          </div>`
        })
        html += '</div>'
        return html
      }
    },
    legend: {
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
      data: hourlyData.value.hours,
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(204, 204, 204, 0.3)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(204, 204, 204, 0.3)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'grouped-bar',
        data: hourlyData.value.beijing,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(24, 144, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'grouped-bar',
        data: hourlyData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(255, 125, 0, 1)',
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
  if (newRef && !chart) initChart()
})

// 窗口 resize
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

.c-monitor-bridge-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-title-with-icon {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-bar {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-family: 'Source Han Sans CN', sans-serif;
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

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-blue {
  background: rgba(24, 144, 255, 1);
}

.c-monitor-legend-dot-orange {
  background: rgba(255, 125, 0, 1);
}

.c-monitor-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
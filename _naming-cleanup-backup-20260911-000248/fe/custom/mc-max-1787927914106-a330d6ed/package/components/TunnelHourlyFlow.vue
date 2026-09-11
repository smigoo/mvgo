<template>
  <div class="c-monitor-tunnel-hourly-flow">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="icon1" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 自定义图例 -->
    <div class="c-monitor-chart-legend">
      <span
        class="c-monitor-legend-item"
        :class="{ active: legendState.beijing }"
        @click="toggleLegend('北京方向')"
       :style="legendState.beijing ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
        <i class="c-monitor-legend-dot c-monitor-dot-beijing"></i>
        <span>北京方向</span>
      </span>
      <span
        class="c-monitor-legend-item"
        :class="{ active: legendState.shanghai }"
        @click="toggleLegend('上海方向')"
      >
        <i class="c-monitor-legend-dot c-monitor-dot-shanghai"></i>
        <span>上海方向</span>
      </span>
    </div>

    <!-- Chart Container -->
    <div class="c-monitor-chart-body">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import icon1 from '../../resources/images/icon-3561.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  'beijing': true,
  'shanghai': true
})

// 切换图例（联动图表）
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// Mock 数据（24小时）
const mockData = {
  hours: Array.from({ length: 24 }, (_, i) => `${i}`),
  'beijing': [120, 150, 180, 200, 350, 400, 500, 600, 800, 900, 700, 600, 825, 700, 600, 500, 400, 350, 300, 250, 200, 180, 150, 130],
  'shanghai': [100, 130, 160, 180, 320, 380, 480, 580, 780, 880, 680, 580, 831, 680, 580, 480, 380, 330, 280, 230, 180, 160, 130, 110]
}

// 更新图表
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
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      formatter: (params) => {
        const hour = params[0].axisValue
        let html = `<div style="font-weight: 600; margin-bottom: 4px;">${hour}时</div>`
        params.forEach(p => {
          html += `<div style="display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${p.color}; border-radius: 2px;"></span>
            <span style="color: #333;">${p.seriesName}</span>
            <span style="margin-left: auto; font-weight: 600; color: #333;">${p.value}</span>
            <span style="color: #666;">辆</span>
          </div>`
        })
        return html
      }
    },
    legend: {
      show: false // 使用自定义 DOM 图例
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        interval: 1
      },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisTick: { show: false },
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, -10]
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right',
        padding: [0, 0, 0, 0]
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
    ],
    // 建议分流阈值线
    graphic: [
      {
        type: 'line',
        z: 100,
        left: 50,
        right: 20,
        top: '38%',
        shape: {
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0
        },
        style: {
          stroke: '#ff8648',
          lineWidth: 1,
          lineDash: [4, 4]
        }
      },
      {
        type: 'text',
        z: 100,
        right: 25,
        top: '36%',
        style: {
          text: '建议分流',
          fill: '#666666',
          fontSize: 12
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

  // 容器尚未就绪，使用 ResizeObserver 等待
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

// 窗口 resize 处理
const handleResize = () => {
  if (chart) chart.resize()
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
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #333333;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.5;
  }

  &:hover {
    opacity: 0.8;
  }

  &.active {
    opacity: 1;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-dot-beijing {
  background: #1890ff;
}

.c-monitor-dot-shanghai {
  background: #ff8648;
}

.c-monitor-chart-body {
  flex: 131 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
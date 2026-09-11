<template>
  <div class="c-monitor-bridge-hourly-flow-section">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <div class="c-monitor-section-icon-decorator" />
        <span class="c-monitor-section-title">江阴大桥</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          class="c-monitor-legend-item"
          :class="{ 'is-active': legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-primary" />
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ 'is-active': legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-secondary" />
          <span class="c-monitor-legend-text">上海方向</span>
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  hours: Array.from({ length: 24 }, (_, i) => `${i}`),
  beijing: [420, 380, 350, 320, 410, 450, 520, 680, 825, 920, 880, 750, 825, 890, 920, 880, 850, 780, 650, 550, 480, 450, 440, 430],
  shanghai: [380, 350, 330, 310, 390, 420, 480, 650, 831, 890, 850, 720, 831, 860, 890, 850, 820, 750, 620, 520, 460, 430, 420, 410]
}

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
      borderColor: 'rgba(25, 144, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      padding: [8, 12],
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach((p) => {
          result += `${p.marker} ${p.seriesName}: ${p.value}辆<br/>`
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
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLine: {
        lineStyle: { color: 'rgba(51, 51, 51, 0.1)' }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12,
        interval: 1
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12,
        padding: [0, 0, 0, -20]
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: 'rgba(51, 51, 51, 0.06)' }
      },
      axisLabel: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: '40%',
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)',
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: '40%',
        itemStyle: {
          color: 'rgba(255, 139, 0, 1)',
          borderRadius: [4, 4, 0, 0]
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

// 窗口调整处理
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

.c-monitor-bridge-hourly-flow-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-section-icon-decorator {
  width: 3px;
  height: 14px;
  background: linear-gradient(180deg, rgba(56, 141, 255, 1) 0%, rgba(56, 141, 255, 1) 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.3s;

  &.is-active {
    opacity: 1;
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

  &.c-monitor-legend-dot-primary {
    background: rgba(25, 144, 255, 1);
  }

  &.c-monitor-legend-dot-secondary {
    background: rgba(255, 139, 0, 1);
  }
}

.c-monitor-legend-text {
  font-size: 12px;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 160px;
  min-width: 0;
}
</style>

<template>
  <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-bridge-chart-section">
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-bridge-chart-header">
      <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-bridge-chart-title">江阴大桥</span>
    </div>
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-bridge-chart-body">
      <div ref="chartRef" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-bridge-chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ chartData: { type: Object, default: () => ({ xAxisData: [], series: []
    })
  },
  activeLocation: {
    type: String,
    default: 'tunnel'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态（用于自定义图例联动）
const legendState = ref({ beijing: true, shanghai: true
})

// 切换图例（与图表联动）
const toggleLegend = (name) => { if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => { if (!chart || !props.chartData) return

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false // 使用自定义图例
    },
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.chartData.xAxisData || [],
      name: '时',
      nameTextStyle: {
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.15)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.08)'
        }
      }
    },
    series: (props.chartData.series || []).map((s, index) => ({
      name: s.name,
      type: 'bar',
      barWidth: 12,
      data: s.data || [],
      itemStyle: {
        color: index === 0 ? '#1890ff' : '#52c41a',
        borderRadius: [4, 4, 0, 0]
      }
    }))
  }

  // 添加建议分流阈值线（橙色虚线）
  option.series.push({
    name: '建议分流',
    type: 'line',
    data: new Array((props.chartData.xAxisData || []).length).fill(3000),
    lineStyle: {
      color: '#ff7a45',
      type: 'dashed',
      width: 2
    },
    symbol: 'none',
    markLine: {
      silent: true,
      label: {
        show: true,
        position: 'end',
        formatter: '建议分流',
        color: '#ff7a45',
        fontSize: 12
      }
    }
  })

  chart.setOption(option, true)
}

// 初始化图表
const initChart = () => { if (!chartRef.value) return
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

// 监听 chartRef 变化（处理 base-panel 重建 DOM 的情况）
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听数据变化
watch(
  () => props.chartData,
  () => {
    updateChart()
  },
  { deep: true }
)

// 监听地点切换（江阴大桥时才显示）
watch(
  () => props.activeLocation,
  (newLocation) => {
    if (newLocation === 'bridge' && chart) {
      updateChart()
    }
  }
)

// 窗口尺寸变化时重绘
const handleResize = () => { if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
  chart = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-bridge-chart-section {
  width: 100%;
  flex: 220 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-bridge-chart-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.c-monitor-bridge-chart-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-bridge-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
}

.c-monitor-bridge-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
<template>
  <div class="c-monitor-tunnel-hourly">
    <!-- 标题行 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <i class="c-monitor-title-icon" :style="{ backgroundImage: `url(${icon3})` }"></i>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图例区 -->
    <div class="c-monitor-chart-legend">
      <span 
        class="c-monitor-legend-item" 
        :class="{ active: legendState.beijing }" 
        @click="toggleLegend('北京方向')"
      >
        <i class="c-monitor-legend-dot c-monitor-legend-dot-blue"></i>
        <span class="c-monitor-legend-label">北京方向</span>
      </span>
      <span 
        class="c-monitor-legend-item" 
        :class="{ active: legendState.shanghai }" 
        @click="toggleLegend('上海方向')"
      >
        <i class="c-monitor-legend-dot c-monitor-legend-dot-green"></i>
        <span class="c-monitor-legend-label">上海方向</span>
      </span>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-body">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Object,
    default: () => null
  }
})

// 资源变量（系统自动注入，无需手写 import）
const icon3 = 'data:image/png;base64,...' // 系统注入

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// Mock 数据（实际应从 props.chartData 获取）
const mockData = computed(() => {
  if (props.chartData) return props.chartData
  
  return {
    xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    series: [
      {
        name: '北京方向',
        data: [200, 180, 150, 220, 400, 500, 600, 650, 825, 700, 550, 400, 300]
      },
      {
        name: '上海方向',
        data: [180, 160, 140, 200, 380, 480, 580, 620, 831, 680, 530, 380, 280]
      }
    ]
  }
})

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const data = mockData.value
  
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
        let result = `${params[0].name}时<br/>`
        params.forEach(p => {
          result += `${p.seriesName} ${p.value}辆<br/>`
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
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1000,
      interval: 200,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        data: data.series[0].data
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#52c41a',
          borderRadius: [2, 2, 0, 0]
        },
        data: data.series[1].data
      }
    ]
  }
  
  // 橙色阈值线
  option.series.push({
    name: '建议分流',
    type: 'line',
    data: Array(data.xAxis.length).fill(600),
    lineStyle: {
      color: '#ff984e',
      type: 'dashed',
      width: 1
    },
    symbol: 'none',
    silent: true
  })
  
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

// 监听数据变化
watch(() => props.chartData, () => {
  updateChart()
}, { deep: true })

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

.c-monitor-tunnel-hourly {
  width: 100%;
  flex: 180 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 21px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  height: 18px;
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
  flex-shrink: 0;
}

.c-monitor-legend-dot-blue {
  background: #1890ff;
}

.c-monitor-legend-dot-green {
  background: #52c41a;
}

.c-monitor-legend-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

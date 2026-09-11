<template>
  <div class="c-monitor-tunnel-chart-section">
    <!-- 标题区 -->
    <div class="c-monitor-tunnel-chart-header">
      <div class="c-monitor-tunnel-chart-title-wrapper" :style="{ backgroundImage: `url(${bg3})` }">
        <span class="c-monitor-tunnel-chart-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-tunnel-chart-body">
      <div ref="chartRef" class="c-monitor-tunnel-chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 资源变量（系统注入）
const bg3 = 'bg3'

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

// Mock 数据
const mockData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [300, 450, 520, 680, 900, 1200, 1500, 1800, 1650, 1400, 1100, 800, 500],
  shanghai: [280, 420, 500, 650, 880, 1150, 1480, 1750, 1620, 1350, 1080, 780, 480]
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName}: ${item.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      right: 16,
      top: 12,
      textStyle: {
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      itemWidth: 12,
      itemHeight: 12
    },
    grid: {
      left: 40,
      right: 16,
      top: 50,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      name: '时',
      nameTextStyle: {
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12,
        formatter: '{value}'
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.08)',
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
          color: '#1890FF'
        },
        barWidth: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#FF7A45',
            type: 'dashed',
            width: 2
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#FF7A45',
            fontSize: 12
          },
          data: [{ yAxis: 4000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        itemStyle: {
          color: '#FF7A45'
        },
        barWidth: '30%'
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

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
</style>
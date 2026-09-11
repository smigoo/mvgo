<template>
  <div class="c-monitor-section-chart-tunnel">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <img :src="icon2" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表内容区 -->
    <div class="c-monitor-chart-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState['beijing'] }" 
          @click="toggleLegend('北京方向')"
         :style="legendState['beijing'] ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-monitor-legend-dot" style="background: #1990ff;"></i>北京方向
        </span>
        <span 
          class="c-monitor-legend-item" 
          :class="{ active: legendState['shanghai'] }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #52c41a;"></i>上海方向
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import icon2 from '../../resources/images/icon-3441.png'


import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
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
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
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
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      axisLabel: { 
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: {
          color: '#d9e6f2'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: { 
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: {
          color: '#d9e6f2'
        }
      },
      splitLine: {
        lineStyle: {
          color: '#d9e6f2',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [1200, 1800, 2100, 2400, 2800, 3200, 3500, 3800, 3600, 3200, 2800, 2400, 2100, 1800, 1500, 1200, 1000, 800, 600, 400, 300, 200, 150, 100],
        itemStyle: {
          color: '#1990ff'
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [800, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 2800, 2400, 2100, 1800, 1500, 1200, 1000, 800, 600, 400, 300, 200, 150, 100, 80, 60],
        itemStyle: {
          color: '#52c41a'
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

// 窗口尺寸变化处理
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
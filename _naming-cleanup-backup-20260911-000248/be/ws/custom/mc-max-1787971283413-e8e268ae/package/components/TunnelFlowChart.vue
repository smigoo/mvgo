<template>
  <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-chart-wrapper">
    <!-- 区块标题 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-header">
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-title"><img :src="icon3" class="auto-mounted-icon" alt="icon" />
        <i class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-title-icon"></i>
        <span class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-chart-body">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-legend">
        <span 
          class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-legend-item" 
          :class="{ active: legendState.c-mc-max-1787971283413-e8e268ae-c-monitor-beijing }" 
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-legend-dot c-mc-max-1787971283413-e8e268ae-c-monitor-beijing"></i>
          北京方向
        </span>
        <span 
          class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-legend-item" 
          :class="{ active: legendState.c-mc-max-1787971283413-e8e268ae-c-monitor-shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-legend-dot c-mc-max-1787971283413-e8e268ae-c-monitor-shanghai"></i>
          上海方向
        </span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-mc-max-1787971283413-e8e268ae-c-monitor-tunnel-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 图例状态
const legendState = ref({
  'c-monitor-beijing': true,
  'c-monitor-shanghai': true
})

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据（实际应从 API 获取）
const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  'c-monitor-beijing': [200, 180, 150, 120, 300, 350, 400, 600, 825, 650, 500, 300, 250],
  'c-monitor-shanghai': [150, 160, 140, 130, 280, 320, 380, 580, 831, 620, 480, 280, 230]
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
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
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
        let result = `${params[0].name}时<br/>`
        params.forEach((item) => {
          result += `${item.marker} ${item.seriesName}: ${item.value} 辆<br/>`
        })
        return result
      }
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: { color: '#e0e0e0' }
      },
      axisLine: {
        lineStyle: { color: '#e0e0e0' }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 1000,
      interval: 200,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      axisTick: {
        show: true,
        lineStyle: { color: '#e0e0e0' }
      },
      axisLine: {
        lineStyle: { color: '#e0e0e0' }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#f0f0f0',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        barWidth: 8,
        itemStyle: {
          color: '#1890ff'
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 8,
        itemStyle: {
          color: '#52c41a'
        }
      }
    ],
    legend: {
      show: false
    }
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

.c-monitor-tunnel-chart-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-tunnel-header {
  flex-shrink: 0;
  padding-bottom: 12px;
}

.c-monitor-tunnel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-tunnel-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  display: inline-block;
}

.c-monitor-tunnel-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-tunnel-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-tunnel-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-tunnel-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.3s;

  &.active {
    opacity: 1;
  }

  &:hover {
    opacity: 1;
  }
}

.c-monitor-tunnel-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;

  &.beijing {
    background: #1890ff;
  }

  &.shanghai {
    background: #52c41a;
  }
}

.c-monitor-tunnel-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}
</style>
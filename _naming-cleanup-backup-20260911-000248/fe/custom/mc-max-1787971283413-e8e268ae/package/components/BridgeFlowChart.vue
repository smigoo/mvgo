<template>
  <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-flow">
    <!-- 标题栏 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-header">
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-title">
        <span class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-icon"></span>
        <span class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-legend">
        <span
          class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-legend-dot c-mc-max-1787971283413-e8e268ae-beijing"></i>
          北京方向
        </span>
        <span
          class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-legend-dot c-mc-max-1787971283413-e8e268ae-shanghai"></i>
          上海方向
        </span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-mc-max-1787971283413-e8e268ae-c-monitor-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  'beijing': true,
  'shanghai': true
})

// 模拟数据（24小时）
const hourlyData = {
  'beijing': [120, 200, 150, 180, 220, 240, 300, 350, 400, 380, 420, 450, 500, 480, 460, 440, 500, 520, 480, 450, 400, 350, 300, 250],
  'shanghai': [100, 180, 130, 160, 200, 220, 280, 320, 380, 360, 400, 430, 480, 460, 440, 420, 480, 500, 460, 430, 380, 330, 280, 230]
}

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
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#a1ceff',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let html = `${params[0].name}时<br/>`
        params.forEach(p => {
          html += `${p.marker}${p.seriesName}: ${p.value} 辆<br/>`
        })
        return html
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
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      interval: 200,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 10,
        formatter: '{value}'
      },
      axisTick: {
        show: true
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#e8e8e8',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: hourlyData.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: hourlyData.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#52c41a',
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

// 窗口大小变化处理
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

.c-monitor-bridge-flow {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-bridge-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 21px;
  margin-bottom: 10px;
}

.c-monitor-bridge-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-bridge-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-bridge-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-bridge-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-bridge-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background: #1890ff;
  }

  &.shanghai {
    background: #52c41a;
  }
}

.c-monitor-bridge-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
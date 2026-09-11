<template>
  <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-section">
    <!-- 图表标题行 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-header">
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-label">当</span>
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-value">40</span>
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-location">zk3+785CO浓度</span>
    </div>

    <!-- 阈值线 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-threshold-line">
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-threshold-value">30</span>
      <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-threshold-dash"></div>
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-threshold-label">阈值线</span>
    </div>

    <!-- 图表主体 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-body">
      <div ref="chartRef" class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-container"></div>
    </div>

    <!-- X轴时间刻度 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-x-axis">
      <span v-for="hour in xAxisData" :key="hour" class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-x-axis-item">{{ hour }}</span>
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-x-axis-unit">时</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  activeKey: { type: String, default: 'co' },
  activeName: { type: String, default: '一氧化碳' },
  businessConfig: { type: Object, default: () => ({}) }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// X轴时间刻度（从设计稿文字清单提取）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// Y轴数值刻度
const yAxisData = ref(['0', '10', '20', '30', '40'])

// 模拟数据生成器（按不同环境类型返回不同数据）
const generateData = (type) => {
  const dataMap = {
    co: [5, 12, 8, 15, 20, 28, 35, 40, 38, 32, 25, 18],
    visibility: [100, 120, 110, 130, 140, 150, 160, 155, 145, 135, 125, 115],
    lighting: [200, 220, 210, 230, 240, 250, 260, 255, 245, 235, 225, 215],
    outdoor: [300, 320, 310, 330, 340, 350, 360, 355, 345, 335, 325, 315]
  }
  return dataMap[type] || dataMap.co
}

const chartData = computed(() => generateData(props.activeKey))

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

// 更新图表配置
const updateChart = () => {
  if (!chart) return

  const option = {
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
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
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      axisLabel: {
        show: true,
        color: 'rgba(255, 255, 255, 0.45)',
        fontSize: 10
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        show: true,
        color: 'rgba(255, 255, 255, 0.45)',
        fontSize: 10
      },
      axisTick: { show: true },
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)'
        }
      }
    },
    series: [
      {
        name: props.activeName,
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#0fcd7d'
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 30,
              lineStyle: {
                type: 'dashed',
                color: '#f53f3f',
                width: 1,
                opacity: 0.6
              }
            }
          ]
        }
      }
    ]
  }

  chart.setOption(option, true)
}

// 监听 activeKey 变化，更新图表数据
watch(() => props.activeKey, () => {
  updateChart()
})

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

.c-env-monitor-chart-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-sizing: border-box;
}

.c-env-monitor-chart-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-env-monitor-chart-label {
  font-size: 12px;
  color: #559eff;
  font-weight: normal;
}

.c-env-monitor-chart-value {
  font-size: 12px;
  color: #559eff;
  font-weight: normal;
}

.c-env-monitor-chart-location {
  margin-left: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: normal;
}

.c-env-monitor-threshold-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-env-monitor-threshold-value {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: normal;
  flex-shrink: 0;
}

.c-env-monitor-threshold-dash {
  flex: 1;
  height: 0;
  border-top: 1px dashed rgba(245, 63, 63, 0.6);
}

.c-env-monitor-threshold-label {
  font-size: 10px;
  color: #f53f3f;
  font-weight: normal;
  flex-shrink: 0;
}

.c-env-monitor-chart-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-env-monitor-x-axis {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  margin-top: 4px;
  padding: 0 40px 0 40px;
}

.c-env-monitor-x-axis-item {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: normal;
}

.c-env-monitor-x-axis-unit {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: normal;
}
</style>
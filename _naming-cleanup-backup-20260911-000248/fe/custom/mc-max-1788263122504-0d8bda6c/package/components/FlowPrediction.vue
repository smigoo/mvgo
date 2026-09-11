<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-fp-header">
      <div class="c-monitor-fp-title-group">
        <div class="c-monitor-fp-title-icon"></div>
        <span class="c-monitor-fp-title">流量预测</span>
      </div>
      <div class="c-monitor-fp-controls">
        <div class="c-monitor-fp-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-fp-tab-item', { active: activeLocation === tab.value }]"
            @click="activeLocation = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <span class="c-monitor-fp-date-label">节假日预测</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-fp-body">
      <div ref="chartRef" class="c-monitor-fp-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const activeLocation = ref('tunnel')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  tunnel: {
    actual: [2100, 2300, 2500, 2800, 3200],
    predict: [2100, 2300, 2600, 2900, 3100]
  },
  bridge: {
    actual: [1800, 2000, 2200, 2400, 2800],
    predict: [1800, 2000, 2300, 2600, 2700]
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = mockData[activeLocation.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      right: 16,
      top: 0,
      textStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      itemWidth: 14,
      itemHeight: 6
    },
    grid: {
      left: 50,
      right: 16,
      top: 40,
      bottom: 60,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      axisTick: { show: true }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      axisLine: { show: false },
      axisTick: { show: true },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } },
      name: '辆',
      nameTextStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        lineStyle: { color: '#3385ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.25)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0)' }
          ])
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        lineStyle: { color: '#00cccc', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.25)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0)' }
          ])
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
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

// 监听 Tab 切换
watch(activeLocation, () => {
  updateChart()
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

.c-monitor-flow-prediction {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-fp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-fp-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-fp-title-icon {
  width: 18px;
  height: 18px;
  background: #1990ff;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-fp-title {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-fp-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-fp-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-fp-tab-item {
  padding: 4px 12px;
  font-size: calc(var(--fontSize, 14px) * 1);
  color: #ffffff;
  background: #6680a0;
  border: 0.73px solid #acc4e1;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    opacity: 0.85;
  }

  &.active {
    background: #1990ff;
    border-color: #c7e0ff;
  }
}

.c-monitor-fp-date-label {
  font-size: calc(var(--fontSize, 14px) * 0.86);
  color: #1990ff;
}

.c-monitor-fp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-fp-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
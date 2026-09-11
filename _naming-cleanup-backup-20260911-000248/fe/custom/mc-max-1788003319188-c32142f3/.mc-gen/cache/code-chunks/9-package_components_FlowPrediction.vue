<template>
  <div class="c-monitor-prediction">
    <!-- 头部：标题 + tab 切换 + 节假日预测链接 -->
    <div class="c-monitor-prediction-header">
      <div class="c-monitor-prediction-title">
        <img :src="icon3" class="c-monitor-prediction-title-icon" alt="icon" />
        <span class="c-monitor-prediction-title-text">流量预测</span>
      </div>

      <div class="c-monitor-prediction-tabs">
        <div
          v-for="tab in locationTabs"
          :key="tab.value"
          class="c-monitor-prediction-tab"
          :class="{ 'c-monitor-prediction-tab--active': currentLocation === tab.value }"
          @click="handleTabClick(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>

      <span class="c-monitor-prediction-link" @click="handleHolidayClick">节假日预测&gt;</span>
    </div>

    <!-- 图表区 -->
    <div class="c-monitor-prediction-chart-wrapper">
      <div ref="chartRef" class="c-monitor-prediction-chart"></div>
    </div>

    <!-- 底部准确率标注 -->
    <div class="c-monitor-prediction-accuracy">
      <span
        v-for="(item, idx) in accuracyList"
        :key="idx"
        class="c-monitor-prediction-accuracy-item"
      >
        准确率{{ item }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  predictionData: {
    type: Object,
    default: () => ({})
  },
  activeLocation: {
    type: String,
    default: 'tunnel'
  }
})

const emit = defineEmits(['location-change'])

// 地点切换 tab（文案逐字来自设计稿）
const locationTabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]

// 当前选中地点（优先跟随父组件传入）
const currentLocation = computed(() => props.activeLocation || 'tunnel')

// X 轴时间标签（来自设计稿）
const xAxisLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

// 默认 mock 数据（切换地点演示效果）
const defaultDataMap = {
  tunnel: {
    actual: [2100, 2600, 3100, null, null],
    predict: [null, null, 3100, 3450, 2900],
    accuracy: ['98%', '96%', '92%']
  },
  bridge: {
    actual: [3200, 3600, 4000, null, null],
    predict: [null, null, 4000, 3800, 3400],
    accuracy: ['98%', '96%', '92%']
  }
}

// 当前地点数据（优先使用父组件传入的 predictionData）
const currentData = computed(() => {
  const fromProps = props.predictionData?.[currentLocation.value]
  return fromProps || defaultDataMap[currentLocation.value] || defaultDataMap.tunnel
})

// 底部准确率列表
const accuracyList = computed(() => currentData.value?.accuracy || ['98%', '96%', '92%'])

const handleTabClick = (value) => {
  if (currentLocation.value === value) return
  emit('location-change', value)
}

const handleHolidayClick = () => {
  emit('location-change', currentLocation.value)
}

// ECharts 相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

const buildOption = () => {
  const data = currentData.value
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.08)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      extraCssText: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);'
    },
    legend: {
      show: true,
      right: 0,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      icon: 'rect',
      textStyle: { color: 'rgba(0, 0, 0, 0.65)', fontSize: 12 },
      data: ['实际流量', '预测流量']
    },
    grid: { left: 8, right: 8, top: 28, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisLabels,
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.45)', fontSize: 10 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.45)', fontSize: 10 },
      axisTick: { show: true },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        data: data.actual || [],
        itemStyle: { color: 'rgba(24, 144, 255, 1)' },
        lineStyle: { color: 'rgba(24, 144, 255, 1)', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(24, 144, 255, 0.35)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.02)' }
          ])
        },
        // 当前时间点垂直虚线标识
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: 'rgba(0, 0, 0, 0.25)' },
          label: { show: false },
          data: [{ xAxis: '当前时间' }]
        }
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        data: data.predict || [],
        itemStyle: { color: 'rgba(82, 196, 26, 1)' },
        lineStyle: { color: 'rgba(82, 196, 26, 1)', width: 2, type: 'dashed' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.02)' }
          ])
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

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

// 地点切换 / 数据变化时更新图表
watch([currentLocation, () => props.predictionData], () => {
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
  chart = null
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-prediction {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-prediction-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
}

.c-monitor-prediction-title {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.c-monitor-prediction-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-prediction-title-text {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-prediction-tabs {
  display: flex;
  align-items: center;
  margin-left: 16px;
  flex-shrink: 0;
}

.c-monitor-prediction-tab {
  padding: 2px 10px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.65);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.3s;
}

.c-monitor-prediction-tab--active {
  color: rgba(255, 255, 255, 1);
  background: rgba(24, 144, 255, 1);
  border-radius: 4px;
}

.c-monitor-prediction-link {
  margin-left: auto;
  font-size: 12px;
  color: rgba(24, 144, 255, 1);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-prediction-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-prediction-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-prediction-accuracy {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-shrink: 0;
  height: 16px;
  padding: 0 12px;
}

.c-monitor-prediction-accuracy-item {
  font-size: 10px;
  color: rgba(82, 196, 26, 1);
  white-space: nowrap;
}
</style>
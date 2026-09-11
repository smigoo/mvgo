<template>
  <div class="c-monitor-flow-prediction">
    <!-- section header：标题左对齐，右侧 tab + 节假日预测按钮 -->
    <div class="c-monitor-fp-header">
      <div class="c-monitor-fp-title">
        <img :src="icon99" class="c-monitor-fp-title-icon" alt="icon" />
        <span class="c-monitor-fp-title-text">流量预测</span>
      </div>
      <div class="c-monitor-fp-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-monitor-fp-tab', { 'c-monitor-fp-tab-active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-fp-holiday" @click="toggleHoliday">节假日预测</div>
    </div>

    <!-- 自定义图例 -->
    <div class="c-monitor-fp-legend">
      <span
        class="c-monitor-fp-legend-item"
        :class="{ 'c-monitor-fp-legend-off': !legendState.actual }"
        @click="toggleLegend('实际流量', 'actual')"
      >
        <i class="c-monitor-fp-dot c-monitor-fp-dot-actual"></i>实际流量
      </span>
      <span
        class="c-monitor-fp-legend-item"
        :class="{ 'c-monitor-fp-legend-off': !legendState.predict }"
        @click="toggleLegend('预测流量', 'predict')"
      >
        <i class="c-monitor-fp-dot c-monitor-fp-dot-predict"></i>预测流量
      </span>
    </div>

    <!-- 图表区 -->
    <div class="c-monitor-fp-chart-wrap">
      <div ref="chartRef" class="c-monitor-fp-chart"></div>
    </div>

    <!-- 准确率标签（对齐 X 轴时间点） -->
    <div class="c-monitor-fp-accuracy-row">
      <span
        v-for="(item, idx) in currentData.accuracy"
        :key="idx"
        class="c-monitor-fp-accuracy-item"
      >
        {{ item }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 地点切换 tab（默认江阴靖江长江隧道选中）
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activeTab = ref('tunnel')

// 节假日预测模式
const holidayMode = ref(false)

// X 轴时间刻度
const xAxisData = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

// 两地各自的实际/预测流量与准确率数据
const dataMap = {
  tunnel: {
    actual: [1200, 1800, 2400, null, null],
    predict: [null, null, 2400, 2800, 3200],
    accuracy: ['', '', '准确率98%', '准确率96%', '准确率92%']
  },
  bridge: {
    actual: [2200, 2800, 3200, null, null],
    predict: [null, null, 3200, 3600, 3800],
    accuracy: ['', '', '准确率98%', '准确率96%', '准确率92%']
  }
}

// 节假日模式下的数据（演示切换效果）
const holidayDataMap = {
  tunnel: {
    actual: [1600, 2400, 3000, null, null],
    predict: [null, null, 3000, 3400, 3800],
    accuracy: ['', '', '准确率97%', '准确率95%', '准确率90%']
  },
  bridge: {
    actual: [2600, 3200, 3600, null, null],
    predict: [null, null, 3600, 3900, 4000],
    accuracy: ['', '', '准确率96%', '准确率94%', '准确率89%']
  }
}

const currentData = computed(() => {
  const source = holidayMode.value ? holidayDataMap : dataMap
  return source[activeTab.value]
})

// 图例状态
const legendState = ref({ actual: true, predict: true })

const chartRef = ref(null)
let chart = null
let chartObserver = null

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

const toggleHoliday = () => {
  holidayMode.value = !holidayMode.value
}

const toggleLegend = (name, key) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value[key] = !legendState.value[key]
}

const buildOption = () => {
  const data = currentData.value
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 4px;'
    },
    legend: {
      show: false,
      data: ['实际流量', '预测流量']
    },
    grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: { lineStyle: { color: 'rgba(51,51,51,0.2)' } },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(51,51,51,0.08)' } },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        data: data.actual,
        itemStyle: { color: 'rgba(82, 196, 26, 1)' },
        lineStyle: { color: 'rgba(82, 196, 26, 1)', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.25)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.02)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        data: data.predict,
        lineStyle: { color: 'rgba(56, 141, 255, 1)', width: 2, type: 'dashed' },
        itemStyle: { color: 'rgba(56, 141, 255, 1)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56, 141, 255, 0.25)' },
            { offset: 1, color: 'rgba(56, 141, 255, 0.02)' }
          ])
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
  // 保持图例状态
  if (!legendState.value.actual) {
    chart.dispatchAction({ type: 'legendUnSelect', name: '实际流量' })
  }
  if (!legendState.value.predict) {
    chart.dispatchAction({ type: 'legendUnSelect', name: '预测流量' })
  }
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

// 监听 tab / 节假日模式变化，刷新图表数据
watch([activeTab, holidayMode], () => {
  updateChart()
})

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
  chart = null
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.c-monitor-fp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-fp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.c-monitor-fp-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-fp-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-fp-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  flex-shrink: 0;
}

.c-monitor-fp-tab {
  position: relative;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 21px;
  color: rgba(51, 51, 51, 0.65);
  cursor: pointer;
  white-space: nowrap;
  padding-bottom: 4px;
  transition: color 0.3s;

  &:hover {
    color: rgba(56, 141, 255, 1);
  }
}

.c-monitor-fp-tab-active {
  color: rgba(56, 141, 255, 1);
  font-weight: 500;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: rgba(56, 141, 255, 1);
    border-radius: 1px;
  }
}

.c-monitor-fp-holiday {
  margin-left: 16px;
  flex-shrink: 0;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 21px;
  color: rgba(25, 144, 255, 1);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-fp-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 4px;
}

.c-monitor-fp-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  line-height: 18px;
  color: #333333;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.3s;
}

.c-monitor-fp-legend-off {
  opacity: 0.4;
}

.c-monitor-fp-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-fp-dot-actual {
  background: rgba(82, 196, 26, 1);
}

.c-monitor-fp-dot-predict {
  background: rgba(56, 141, 255, 1);
}

.c-monitor-fp-chart-wrap {
  flex: 1;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-fp-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-fp-accuracy-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 4px;
  padding: 0 12px;
}

.c-monitor-fp-accuracy-item {
  flex: 1;
  text-align: center;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  line-height: 18px;
  color: rgba(82, 196, 26, 1);
  white-space: nowrap;
}
</style>

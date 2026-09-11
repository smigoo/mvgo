<template>
  <div class="c-env-monitor-content">
    <!-- Tab与图标栏 -->
    <div class="c-env-monitor-sub-t">
      <div class="c-env-monitor-tabs-list">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          class="c-env-monitor-tab-item"
          :class="{ 'is-active': activeTab === tab.value }"
          @click="handleTabChange(tab.value)"
        >
          <div
            v-if="activeTab === tab.value"
            class="c-env-monitor-tab-active-bg"
            :style="{ backgroundImage: 'url(' + bg2 + ')' }"
          ></div>
          <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
        </div>
      </div>
      <div class="c-env-monitor-tabs-icon">
        <div class="c-env-monitor-icon-wrapper">
          <img :src="icon1" alt="图表视图" class="c-env-monitor-icon" />
        </div>
        <div class="c-env-monitor-icon-wrapper">
          <img :src="icon2" alt="列表视图" class="c-env-monitor-icon" />
          <div class="c-env-monitor-badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-env-monitor-chart-area">
      <div ref="chartRef" class="c-env-monitor-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
]

const activeTab = ref('co')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟不同Tab对应的数据
const mockData = {
  co: [10, 15, 12, 20, 25, 30, 28, 22, 18, 15, 10, 8],
  visibility: [30, 28, 25, 20, 15, 10, 12, 18, 22, 25, 28, 32],
  indoor_light: [5, 8, 10, 12, 15, 18, 20, 18, 15, 12, 10, 8],
  outdoor_light: [20, 25, 30, 35, 38, 40, 38, 35, 30, 25, 20, 15]
}

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value] || mockData.co
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333333', fontSize: 10 },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 30,
      right: 10,
      top: 24,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -10] },
      axisLabel: { color: '#333333', fontSize: 12 },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -20] },
      axisLabel: { color: '#333333', fontSize: 12 },
      splitLine: { lineStyle: { color: '#e8e8e8', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15,205,125,1)',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.4)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          label: {
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            position: 'end'
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }
  chart.setOption(option, true)
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

.c-env-monitor-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-env-monitor-sub-t {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  height: 27px;
  padding: 3px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 1px solid #ffffff;
  border-radius: 4px;
  position: relative;
}

.c-env-monitor-tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  padding: 0 11px;
  cursor: pointer;
  z-index: 1;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  z-index: -1;
  border-radius: 2px;
}

.c-env-monitor-tab-text {
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-icon {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #ffffff;
  font-weight: 500;
  line-height: 1;
}

/* 使用 chart-area 避免与 common.less 中的 chart-container 冲突 */
.c-env-monitor-chart-area {
  flex: 113 1 0;
  min-height: 0;
  width: 100%;
  position: relative;
}

.c-env-monitor-chart {
  width: 100%;
  height: 100%;
}
</style>
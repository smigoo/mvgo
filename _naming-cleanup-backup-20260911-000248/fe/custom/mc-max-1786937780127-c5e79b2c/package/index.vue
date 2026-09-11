<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-tabs-tools">
        <div class="c-env-monitor-tabs-list">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            <div
              v-if="activeTab === tab.key"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: `url(${bg3})` }"
            ></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-view-icons">
          <div class="c-env-monitor-icon-wrapper">
            <img :src="icon2" class="c-env-monitor-tabs-icon" alt="视图切换" />
            <div class="c-env-monitor-badge">6</div>
          </div>
        </div>
      </div>
      <div class="c-env-monitor-chart-section">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon2 from '../resources/images/tabs-icon-43.png'


import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
]

const activeTab = ref('co')

const dataMap = {
  co: [10, 15, 12, 25, 20, 18, 28, 35, 22, 15, 10, 8],
  visibility: [50, 60, 55, 70, 65, 80, 75, 90, 85, 70, 60, 50],
  indoor: [20, 25, 30, 28, 22, 18, 15, 20, 25, 30, 28, 22],
  outdoor: [100, 120, 150, 180, 200, 220, 210, 190, 160, 130, 110, 90]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  updateChart()
}

const updateChart = () => {
  if (!chart) return
  const currentData = dataMap[activeTab.value] || dataMap.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#ccc' } }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: { color: '#333', fontSize: 10 }
    },
    grid: {
      left: 10,
      right: 20,
      top: 24,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'right' },
      axisLabel: { color: '#333', fontSize: 12 },
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: { color: '#666', fontSize: 12, padding: [0, 20, 0, 0] },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
            ]
          }
        },
        data: currentData,
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: 30,
              lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
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
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-tabs-tools {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to right, #b5deff, #d1ecff);
  border: 0.72px solid #ffffff;
  border-radius: 4px;
  padding: 0 8px;
  box-sizing: border-box;
  margin-bottom: 8px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-tab-item {
  position: relative;
  width: 78px;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 2px;
  overflow: hidden;
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
  z-index: 0;
}

.c-env-monitor-tab-text {
  position: relative;
  z-index: 1;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  line-height: 12px;
  white-space: nowrap;

  .is-active & {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-view-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-env-monitor-icon-wrapper {
  position: relative;
  width: 52px;
  height: 24px;
}

.c-env-monitor-tabs-icon {
  width: 52px;
  height: 24px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 2;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}
</style>
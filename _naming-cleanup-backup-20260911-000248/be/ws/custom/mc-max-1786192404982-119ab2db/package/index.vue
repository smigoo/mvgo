<template>
  <base-panel panelKey="default-panel">
    <div class="c-119ab2-root">
      <!-- 筛选与视图切换栏 -->
      <div 
        class="c-119ab2-filter-bar" 
        :style="{ 
          backgroundImage: `url(${bg1})`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-119ab2-tabs-list">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-119ab2-tab-item', { 'c-119ab2-tab-item--active': activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            <div 
              v-if="activeTab === tab.value" 
              class="c-119ab2-tab-active-bg" 
              :style="{ 
                backgroundImage: `url(${bgtabActive})`, 
                backgroundSize: '100% 100%', 
                backgroundPosition: 'center', 
                backgroundRepeat: 'no-repeat' 
              }"
            ></div>
            <span class="c-119ab2-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        
        <div class="c-119ab2-view-icons">
          <img :src="icontabsIcon" class="c-119ab2-tabs-icon" alt="视图切换" />
          <div class="c-119ab2-badge">6</div>
        </div>
      </div>

      <!-- 浓度趋势图 -->
      <div 
        class="c-119ab2-chart-section" 
        :style="{ 
          backgroundImage: `url(${bg1})`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-119ab2-chart-legend">
          <div class="c-119ab2-legend-item">
            <span class="c-119ab2-legend-line"></span>
            <span class="c-119ab2-legend-text">zk3+785CO浓度</span>
          </div>
        </div>
        <div ref="chartRef" class="c-119ab2-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
]
const activeTab = ref('co')

const dataMap = {
  co: [2, 3, 4, 3, 2, 2, 3, 5, 8, 12, 10, 8],
  visibility: [10, 12, 15, 14, 10, 8, 5, 4, 6, 9, 11, 10],
  indoor_light: [20, 22, 25, 24, 20, 18, 15, 14, 16, 19, 21, 20],
  outdoor_light: [30, 32, 35, 34, 30, 28, 25, 24, 26, 29, 31, 30]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 交互逻辑 ---
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

watch(activeTab, () => {
  updateChart()
})

// --- 图表逻辑 ---
const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 30,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -20] },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -20] },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)', type: 'dashed' } },
      axisLabel: { color: '#333333', fontSize: 12 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: data,
        lineStyle: { color: '#0fcd7d', width: 2 },
        areaStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 30,
              lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
              label: { 
                formatter: '预警线', 
                color: '#d32f2f', 
                fontSize: 12, 
                position: 'end' 
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

const handleResize = () => { if (chart) chart.resize() }

// --- 生命周期 ---
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('119ab2-onload', {
      componentId: '119ab2',
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

.c-119ab2-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-119ab2-filter-bar {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: relative;
  z-index: 2;
}

.c-119ab2-tabs-list {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-119ab2-tab-item {
  position: relative;
  width: 70px;
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

.c-119ab2-tab-active-bg {
  position: absolute;
  width: 78px;
  height: 21px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
  pointer-events: none;
}

.c-119ab2-tab-text {
  position: relative;
  z-index: 1;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
}

.c-119ab2-tab-item--active {
  .c-119ab2-tab-text {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-119ab2-view-icons {
  position: relative;
  display: flex;
  align-items: center;
}

.c-119ab2-tabs-icon {
  width: 52px;
  height: 24px;
  display: block;
}

.c-119ab2-badge {
  position: absolute;
  top: -4px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 10;
}

.c-119ab2-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.c-119ab2-chart-legend {
  position: absolute;
  top: 8px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10;
}

.c-119ab2-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-119ab2-legend-line {
  width: 14px;
  height: 2px;
  background: #0fcd7d;
}

.c-119ab2-legend-text {
  font-size: 10px;
  color: #333333;
  white-space: nowrap;
}

.c-119ab2-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  min-width: 0;
}
</style>
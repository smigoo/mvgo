<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab 导航栏 -->
      <div class="c-env-monitor-tabs-wrapper">
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
        
        <div class="c-env-monitor-tabs-right">
          <div class="c-env-monitor-view-icons">
            <img :src="icon2" class="c-env-monitor-view-icon" alt="视图切换" />
            <div class="c-env-monitor-badge">6</div>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-wrapper">
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

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[c-env-monitor] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting_in', label: '洞内照明' },
  { key: 'lighting_out', label: '洞外光强' }
])
const activeTab = ref('co')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- Mock 数据 ---
const mockData = {
  co: [5, 8, 12, 15, 22, 28, 35, 32, 25, 18, 10, 6],
  visibility: [10, 12, 15, 18, 20, 22, 25, 24, 20, 15, 12, 10],
  lighting_in: [20, 22, 25, 30, 35, 38, 36, 32, 28, 25, 22, 20],
  lighting_out: [35, 38, 40, 38, 35, 30, 25, 20, 15, 12, 10, 8]
}

// --- 图表逻辑 ---
const updateChart = () => {
  if (!chart) return
  const currentData = mockData[activeTab.value] || mockData.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#ccc' } }
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
      top: 24,
      bottom: 20,
      left: 10,
      right: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLabel: { color: '#666', fontSize: 12 },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: { color: '#666', fontSize: 12 },
      splitLine: { lineStyle: { color: '#e8e8e8', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 2 },
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
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                position: 'insideEndTop',
                color: '#d32f2f',
                fontSize: 12,
                distance: 5
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

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// --- 监听与生命周期 ---
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
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
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.c-env-monitor-tabs-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  padding: 0 4px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid #ffffff;
  border-radius: 4px;
  padding: 3px;
  box-sizing: border-box;
}

.c-env-monitor-tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 70px;
  height: 21px;
  cursor: pointer;
  z-index: 1;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -1;
  border-radius: 2px;
}

.c-env-monitor-tab-text {
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  line-height: 1;
  white-space: nowrap;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-view-icons {
  position: relative;
  display: flex;
  align-items: center;
}

.c-env-monitor-view-icon {
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
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 2;
}

.c-env-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 4px 8px 8px;
  box-sizing: border-box;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
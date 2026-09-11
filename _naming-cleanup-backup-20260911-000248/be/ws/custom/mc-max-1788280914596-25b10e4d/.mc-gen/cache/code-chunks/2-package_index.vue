<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs-section" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
        <div class="c-env-monitor-tabs-container">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { active: currentTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-env-monitor-tabs-actions">
          <img :src="icon1" class="c-env-monitor-action-icon" />
          <img :src="icon2" class="c-env-monitor-action-icon" />
        </div>
      </div>

      <!-- 图表展示区 -->
      <div class="c-env-monitor-chart-section">
        <div ref="chartRef" class="c-env-monitor-chart-container" />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab选项（按视觉顺序排列）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

const currentTab = ref('co')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  co: Array.from({ length: 12 }, (_, i) => Math.floor(Math.random() * 30) + 10),
  visibility: Array.from({ length: 12 }, (_, i) => Math.floor(Math.random() * 30) + 10),
  lighting: Array.from({ length: 12 }, (_, i) => Math.floor(Math.random() * 30) + 10),
  outdoor: Array.from({ length: 12 }, (_, i) => Math.floor(Math.random() * 30) + 10)
}

// Tab切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
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

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 }
    },
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
      nameTextStyle: { color: '#666', fontSize: 12 },
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: true }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#e8e8e8', type: 'solid' } }
    },
    series: [
      {
        type: 'line',
        data: mockData[currentTab.value],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#52c41a', width: 2 },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#ff4d4f', type: 'dashed', width: 2 },
          label: { show: true, position: 'end', formatter: '预警线', color: '#ff4d4f', fontSize: 12 },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 监听chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听Tab切换
watch(currentTab, () => {
  updateChart()
})

// 窗口尺寸变化
const handleResize = () => {
  if (chart) chart.resize()
}

// 生命周期
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // 触发onload事件
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-env-monitor-tabs-section {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-radius: 4px;
}

.c-env-monitor-tabs-container {
  display: flex;
  gap: 4px;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: #2c9bea;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(44, 155, 234, 0.1);
  }

  &.active {
    background: linear-gradient(135deg, #1099b1 0%, #038fff 100%);
    color: #ffffff;
    box-shadow: 0 1px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.c-env-monitor-action-icon {
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>

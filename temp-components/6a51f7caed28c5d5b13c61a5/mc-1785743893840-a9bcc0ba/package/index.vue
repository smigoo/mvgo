<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 移除根容器的 background 和 box-shadow，由 base-panel 统一处理 -->
    <div class="c-mc-1785743893840-a9bcc0ba-content">
      <!-- Tab 和工具栏区域 -->
      <div class="c-mc-1785743893840-a9bcc0ba-tabs-section">
        <!-- Fixed: 添加 role='tablist' 和键盘导航支持以提升可访问性 -->
        <div 
          class="c-mc-1785743893840-a9bcc0ba-tabs-list" 
          role="tablist" 
          aria-label="环境监测指标切换"
          @keydown="handleKeydown"
        >
          <div
            v-for="(tab, index) in tabs"
            :key="tab.value"
            :class="['c-mc-1785743893840-a9bcc0ba-tab-item', { 'is-active': activeTab === tab.value }]"
            role="tab"
            :aria-selected="activeTab === tab.value"
            :tabindex="activeTab === tab.value ? 0 : -1"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        
        <!-- 工具栏 -->
        <div class="c-mc-1785743893840-a9bcc0ba-toolbar">
          <img :src="icontabsIcon" alt="视图切换" class="c-mc-1785743893840-a9bcc0ba-toolbar-icon" />
          <div class="c-mc-1785743893840-a9bcc0ba-badge">6</div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-mc-1785743893840-a9bcc0ba-chart-section">
        <div ref="chartRef" class="c-mc-1785743893840-a9bcc0ba-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// Fixed: 使用 try-catch 包裹 $mcComponentBuilder 防止框架未就绪时模块加载失败
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// Tab 数据
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])
const activeTab = ref('co')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  co: [5, 8, 12, 15, 22, 28, 35, 32, 25, 18, 10, 6],
  visibility: [30, 28, 25, 20, 15, 10, 8, 12, 18, 25, 30, 35],
  lighting: [100, 120, 150, 200, 250, 300, 280, 220, 180, 150, 120, 100],
  outdoor: [500, 600, 800, 1000, 1200, 1500, 1400, 1100, 800, 600, 400, 300]
}

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 更新图表
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
      show: true,
      right: 10,
      top: 0,
      textStyle: { color: '#333', fontSize: 10 },
      data: ['zk3+785CO浓度']
    },
    grid: {
      left: 30,
      right: 20,
      top: 30,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 40,
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: '#0fcd7d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
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
          data: [
            {
              yAxis: 30,
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

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  // Fixed: 使用 ResizeObserver 等待容器就绪
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

// Fixed: watch chartRef 处理 DOM 替换
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

// Fixed: 键盘导航支持
const handleKeydown = (e) => {
  const tabsList = tabs.value
  const currentIndex = tabsList.findIndex(t => t.value === activeTab.value)
  let newIndex = currentIndex

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    newIndex = (currentIndex + 1) % tabsList.length
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    newIndex = (currentIndex - 1 + tabsList.length) % tabsList.length
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    return
  } else {
    return
  }

  const newTab = tabsList[newIndex]
  handleTabChange(newTab.value)
  
  // 移动焦点
  const tabElements = e.currentTarget.querySelectorAll('[role="tab"]')
  if (tabElements[newIndex]) {
    tabElements[newIndex].focus()
  }
}

// 监听 activeTab 变化
watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785743893840-a9bcc0ba-onload', {
      componentId: 'mc-1785743893840-a9bcc0ba',
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
</style>
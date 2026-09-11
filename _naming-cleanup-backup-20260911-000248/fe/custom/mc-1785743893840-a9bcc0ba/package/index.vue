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
const icontabsIcon = 'data:image/png;base64,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'

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
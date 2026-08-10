<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- Fixed: 使用icon1资源作为标题左侧装饰图标 -->
      <img :src="icon1" class="c-mc-1785481211230-a46c7bc9-title-icon" alt="" />
    </template>
    <template #header-right>
      <div class="c-mc-1785481211230-a46c7bc9-header-right">
        <img :src="icontabsIcon" class="c-mc-1785481211230-a46c7bc9-tabs-switch-icon" alt="" />
        <span class="c-mc-1785481211230-a46c7bc9-badge">6</span>
      </div>
    </template>
    <!-- 业务内容区 -->
    <div class="c-mc-1785481211230-a46c7bc9-content">
      <div class="c-mc-1785481211230-a46c7bc9-tabs-section">
        <div class="c-mc-1785481211230-a46c7bc9-tabs-list">
          <button
            v-for="(tab, index) in tabs"
            :key="tab.label"
            :class="[
              'c-mc-1785481211230-a46c7bc9-tab-item',
              { 'c-mc-1785481211230-a46c7bc9-tab-active': tab.active }
            ]"
            :aria-current="tab.active ? 'page' : undefined"
            @click="switchTab(index)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="c-mc-1785481211230-a46c7bc9-chart-wrapper">
        <!-- Fixed: 补充ECharts图表容器，支持ResizeObserver监听 -->
        <div ref="chartRef" class="c-mc-1785481211230-a46c7bc9-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// Fixed: $mcComponentBuilder 使用 try-catch 包裹，防止框架未就绪时崩溃
let runtimeBuilder = null
const componentProps = {}
try {
  const result = window.$mcComponentBuilder({
    componentId: 'mc-1785481211230-a46c7bc9',
    componentProps,
    componentName: 'mc-1785481211230-a46c7bc9'
  })
  runtimeBuilder = result?.runtimeBuilder || null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// Tab 切换数据
const tabs = ref([
  { label: '一氧化碳', active: true },
  { label: '能见度', active: false },
  { label: '洞内照明', active: false },
  { label: '洞外光强', active: false }
])

const switchTab = (index) => {
  tabs.value.forEach((tab, i) => {
    tab.active = i === index
  })
}

// ========== ECharts 图表初始化 ==========
const chartRef = ref(null)
let chart = null
let chartObserver = null

const getChartOption = () => ({
  grid: {
    top: 30,
    bottom: 20,
    left: 30,
    right: 20
  },
  tooltip: {
    trigger: 'axis'
  },
  legend: {
    data: ['zk3+785CO浓度'],
    right: 10,
    top: 0,
    textStyle: {
      color: '#5cdb95',
      fontSize: 10
    },
    icon: 'rect'
  },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    name: '时',
    nameLocation: 'end',
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#a0aab5' }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    interval: 10,
    name: '辆',
    splitLine: {
      lineStyle: {
        type: 'dashed',
        color: 'rgba(255,255,255,0.2)'
      }
    },
    axisLabel: { color: '#a0aab5' }
  },
  series: [{
    name: 'zk3+785CO浓度',
    type: 'line',
    smooth: true,
    symbol: 'none',
    lineStyle: { color: '#5cdb95' },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(92, 219, 149, 0.5)' },
          { offset: 1, color: 'rgba(92, 219, 149, 0.0)' }
        ]
      }
    },
    data: [2, 3, 4, 3, 2, 2, 3, 5, 8, 12, 10, 8],
    markLine: {
      symbol: 'none',
      label: {
        formatter: '预警线',
        position: 'end',
        color: '#f53f3f'
      },
      lineStyle: {
        type: 'dashed',
        color: '#f53f3f'
      },
      data: [{ yAxis: 30 }]
    }
  }]
})

const updateChart = () => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
}

// Fixed: 补充完整的 ECharts 初始化逻辑，含 ResizeObserver 处理容器尺寸为 0 的场景
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  // 容器尺寸为 0 时，使用 ResizeObserver 等待就绪
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

// Fixed: 使用 watch 处理 base-panel 渲染过程中 slot DOM 销毁重建的场景
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785481211230-a46c7bc9-onload', {
      componentId: 'mc-1785481211230-a46c7bc9',
      timestamp: Date.now()
    })
  }
})

// Fixed: onUnmounted 中清理 ECharts 实例和 ResizeObserver，防止内存泄漏
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<!-- Fixed: 补充 <style lang="less" scoped> 块并引入 index.less，符合 L4 样式合规标准 -->
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
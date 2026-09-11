<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" alt="标题装饰图标" class="c-mc-1785680347712-fedfc3c9-title-decoration" />
    </template>

    <div class="c-mc-1785680347712-fedfc3c9-content">
      <!-- [Layout Refine] 将 tabs-controls 移入内容区顶部，符合 Figma slot-con > sub-t 结构 -->
      <div class="c-mc-1785680347712-fedfc3c9-sub-header">
        <div class="c-mc-1785680347712-fedfc3c9-tabs-list">
          <div 
            v-for="tab in tabs" 
            :key="tab.value" 
            :class="['c-mc-1785680347712-fedfc3c9-tab-item', { 'is-active': activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        
        <div class="c-mc-1785680347712-fedfc3c9-view-icons">
          <div class="c-mc-1785680347712-fedfc3c9-view-icon-btn">
            <img :src="icontabsIcon" alt="图表视图" />
          </div>
          <div class="c-mc-1785680347712-fedfc3c9-view-icon-btn">
            <img :src="icontabsIcon" alt="列表视图" />
            <!-- [Layout Refine] badge 绝对定位覆盖在图标右上角 -->
            <span class="c-mc-1785680347712-fedfc3c9-badge">6</span>
          </div>
        </div>
      </div>

      <div ref="chartRef" class="c-mc-1785680347712-fedfc3c9-chart-container"></div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const activeTab = ref('co')
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
]

const mockData = {
  co: [10, 15, 12, 20, 25, 30, 28, 22, 18, 15, 12, 10],
  visibility: [20, 25, 22, 30, 35, 28, 25, 20, 18, 15, 12, 10],
  lighting: [15, 18, 20, 25, 30, 28, 25, 22, 18, 15, 12, 10],
  outdoor: [25, 30, 35, 38, 40, 35, 30, 28, 25, 20, 18, 15]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value]
  const option = {
    tooltip: { 
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    /* [Style Refine] 图例位置 top-right，颜色 #333333 */
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333333', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect'
    },
    grid: { left: 20, right: 10, top: 20, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#bde4e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#333333', fontSize: 12 },
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      max: 40,
      splitLine: { lineStyle: { color: '#bde4e8', type: 'solid' } },
      axisLabel: { color: '#333333', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        /* [Style Refine] 折线颜色 #0fcd7d，面积渐变 */
        lineStyle: { color: '#0fcd7d', width: 1 },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        symbol: 'circle',
        symbolSize: 4
      },
      {
        name: '预警线',
        type: 'line',
        data: Array(12).fill(30),
        /* [Style Refine] 预警线颜色 #d32f2f，虚线 */
        lineStyle: { color: '#d32f2f', width: 1, type: 'dashed' },
        itemStyle: { color: '#d32f2f' },
        symbol: 'none'
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

watch(activeTab, () => {
  updateChart()
})

onMounted(() => {
  initChart()
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785680347712-fedfc3c9-onload', {
      componentId: 'mc-1785680347712-fedfc3c9',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <img :src="icon1" class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-title-decor" />
    </template>

    <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-root">
      <!-- Tab 切换与工具栏 -->
      <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-tabs-bar" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
          <div 
            v-for="tab in tabs" 
            :key="tab.key" 
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            <div v-if="activeTab === tab.key" class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-view-icons">
          <img :src="icon2" class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-tabs-icons-img" />
        </div>
      </div>

      <!-- 数据图表区 -->
      <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-chart-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
        <div class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-chart-legend">
          <span 
            class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-legend-item" 
            :class="{ 'is-active': legendState.co }" 
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-legend-dot"></i>
            zk3+785CO浓度
          </span>
        </div>
        <div ref="chartRef" class="c-mc-max-1787641106442-1cba1f93-c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon2 from '../resources/images/tabs-icon-43.png'
import bg2 from '../resources/images/bg-7890.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// 1. 调用 $mcComponentBuilder（直接解构，声明+赋值一体）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 状态定义
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor_light', label: '洞内照明' },
  { key: 'outdoor_light', label: '洞外光强' }
])

const activeTab = ref('co')

const legendState = ref({
  co: true
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 3. 图表 Mock 数据
const mockDataMap = {
  co: [5, 8, 12, 15, 22, 28, 35, 32, 25, 18, 10, 6],
  visibility: [100, 120, 150, 180, 200, 220, 250, 230, 200, 180, 150, 120],
  indoor_light: [30, 35, 40, 45, 50, 55, 60, 55, 50, 45, 40, 35],
  outdoor_light: [10, 20, 40, 60, 80, 100, 120, 100, 80, 60, 40, 20]
}

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 4. 图例切换联动
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value.co = !legendState.value.co
}

// 5. 图表更新
const updateChart = () => {
  if (!chart) return
  
  const currentData = mockDataMap[activeTab.value] || mockDataMap.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: {
      show: false // 使用自定义 DOM 图例
    },
    grid: {
      left: 40,
      right: 20,
      top: 30,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#333', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: { 
        color: '#666', 
        fontSize: 12, 
        align: 'right',
        padding: [0, 30, 0, 0] 
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.1)', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2, color: '#0fcd7d' },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        data: currentData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          label: { 
            formatter: '预警线', 
            color: '#d32f2f', 
            fontSize: 12,
            position: 'end'
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 6. 初始化图表
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

// 7. 监听器
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

// 8. 生命周期
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // 触发 onload 事件
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
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
</style>
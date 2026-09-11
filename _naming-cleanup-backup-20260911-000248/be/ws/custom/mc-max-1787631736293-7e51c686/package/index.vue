<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <img :src="icon1" class="c-mc-max-1787631736293-7e51c686-c-env-monitor-title-deco" alt="" />
    </template>

    <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-root">
      <!-- 监测指标与视图切换 -->
      <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-tabs-section"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          padding: '8px',
          borderRadius: '4px'
        }">
        <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-tabs-list">
          <div
            v-for="item in tabList"
            :key="item.key"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === item.key }]"
            :style="activeTab === item.key ? { backgroundImage: `url(${bg3})` } : {}"
            @click="handleTabChange(item.key)"
          >
            <span class="c-mc-max-1787631736293-7e51c686-c-env-monitor-tab-label">{{ item.label }}</span>
          </div>
        </div>

        <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-view-icons">
          <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-view-icon chart-icon"></div>
          <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-view-icon list-icon"></div>
          <span class="c-mc-max-1787631736293-7e51c686-c-env-monitor-view-badge">6</span>
        </div>
      </div>

      <!-- 浓度趋势图表 -->
      <div
        class="c-mc-max-1787631736293-7e51c686-c-env-monitor-chart-section"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-mc-max-1787631736293-7e51c686-c-env-monitor-chart-legend" @click="toggleLegend">
          <span class="c-mc-max-1787631736293-7e51c686-c-env-monitor-legend-marker"></span>
          <span class="c-mc-max-1787631736293-7e51c686-c-env-monitor-legend-text">zk3+785CO浓度</span>
        </div>
        <div ref="chartRef" class="c-mc-max-1787631736293-7e51c686-c-env-monitor-chart-container"></div>
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

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 数据
const tabList = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])
const activeTab = ref('co')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ co: true })

// Mock 数据（不同 Tab 对应不同数据）
const mockDataMap = {
  co: [5, 12, 18, 25, 32, 28, 22, 15, 10, 8, 14, 20],
  visibility: [40, 38, 35, 30, 25, 20, 18, 22, 28, 35, 38, 40],
  lighting: [10, 15, 20, 25, 30, 35, 30, 25, 20, 15, 10, 5],
  outdoor: [35, 38, 40, 38, 35, 30, 25, 20, 15, 10, 8, 5]
}

// Tab 切换处理
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  updateChart()
}

// 图例切换处理
const toggleLegend = () => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name: 'zk3+785CO浓度' })
  legendState.value.co = !legendState.value.co
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  const data = mockDataMap[activeTab.value] || mockDataMap.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: {
        lineStyle: { color: '#d9d9d9' }
      }
    },
    legend: {
      show: false // 使用自定义 DOM 图例
    },
    grid: {
      left: 30,
      right: 20,
      top: 24,
      bottom: 32,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 12, padding: [0, 0, 0, -10] },
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'right' },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: '#0fcd7d', width: 2 },
        itemStyle: { color: '#0fcd7d' },
        emphasis: {
          focus: 'series',
          itemStyle: { borderWidth: 2 }
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.35)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
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

// 监听 chartRef 变化（处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景）
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 窗口 resize 处理
const handleResize = () => {
  if (chart) chart.resize()
}

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
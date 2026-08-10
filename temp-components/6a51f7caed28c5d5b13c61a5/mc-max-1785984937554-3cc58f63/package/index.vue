<template>
  <base-panel panelKey="default-panel">
    <!-- 标题左侧装饰图标 -->
    <!-- [Layout Refine] g GROUP bbox 8×8px，作为 title-left 装饰点 -->
    <template #title-left>
      <img :src="icon1" alt="装饰图标" class="c-mc-max-1785984937554-3cc58f63-title-dot" />
    </template>

    <!-- 默认插槽：业务内容区 -->
    <!-- [Style Refine] bg VECTOR: background-size: 100% 100%（红线规则1）；DROP_SHADOW offset(0,4) radius=10 → filter drop-shadow -->
    <div
      class="c-mc-max-1785984937554-3cc58f63-content"
      :style="{
        backgroundImage: `url(${bg1})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        filter: 'drop-shadow(0px 4px 10px rgba(74, 117, 141, 0.25))'
      }"
    >
      <!-- 子标题/Tab 区域 -->
      <!-- [Layout Refine] sub-t FRAME: bbox w=380,h=32，HORIZONTAL，tabs-list 左 + tabs-icon 右 -->
      <div class="c-mc-max-1785984937554-3cc58f63-sub-header">
        <!-- tabs 列表 -->
        <!-- [Style Refine] bg VECTOR: GRADIENT_LINEAR → backgroundImage；border 0.72px solid #ffffff -->
        <div
          class="c-mc-max-1785984937554-3cc58f63-tabs-list"
          :style="{
            backgroundImage: `url(${bg2})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <div
            v-for="(tab) in tabList"
            :key="tab.key"
            class="c-mc-max-1785984937554-3cc58f63-tab-item"
            :class="{ 'c-mc-max-1785984937554-3cc58f63-tab-item--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <!-- [Style Refine] bg-tab-active VECTOR: GRADIENT_LINEAR → backgroundImage；border 0.6px solid #ffffff -->
            <div
              v-if="activeTab === tab.key"
              class="c-mc-max-1785984937554-3cc58f63-tab-active-bg"
              :style="{
                backgroundImage: `url(${bgtabActive})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat'
              }"
            ></div>
            <span class="c-mc-max-1785984937554-3cc58f63-tab-label">{{ tab.label }}</span>
          </div>
        </div>

        <!-- tabs 图标区 -->
        <!-- [Layout Refine] tabs-icon FRAME bbox w=52,h=24；num GROUP 叠加在右上角 -->
        <div class="c-mc-max-1785984937554-3cc58f63-tabs-icon-wrapper">
          <img :src="icontabsIcon" alt="tabs-icon" class="c-mc-max-1785984937554-3cc58f63-tabs-icon" />
          <!-- [Layout Refine] num bbox w=14,h=14 相对 tabs-icon FRAME top=-7px, right=-7px -->
          <!-- [Style Refine] bg RECTANGLE fills → #f53f3f，cornerRadius=29 -->
          <div class="c-mc-max-1785984937554-3cc58f63-badge">
            <!-- [Style Refine] "6" fills → #ffffff，PingFang SC 12px 500 lineHeight 14px -->
            <span class="c-mc-max-1785984937554-3cc58f63-badge-num">6</span>
          </div>
        </div>
      </div>

      <!-- 图例区域（置于图表上方行内右对齐，对应 Frame 2136637694 bbox y=934） -->
      <!-- [Layout Refine] Frame 2136637694: HORIZONTAL, counterAxisAlignItems=CENTER, h=14, w=89 -->
      <!-- [Style Refine] 红线规则5：Figma 有图例 → 必须生成；此处以 DOM 图例实现 -->
      <div class="c-mc-max-1785984937554-3cc58f63-legend-area">
        <div class="c-mc-max-1785984937554-3cc58f63-legend-item">
          <!-- [Style Refine] Rectangle 346241398 fills → rgb(15,205,125), cornerRadius=1.6, w=14,h=2 -->
          <span class="c-mc-max-1785984937554-3cc58f63-legend-dot"></span>
          <!-- [Style Refine] zk3+785CO浓度 fills → #333333, Source Han Sans CN 9.6px 400 -->
          <span class="c-mc-max-1785984937554-3cc58f63-legend-text">{{ currentTabLabel }}CO浓度</span>
        </div>
      </div>

      <!-- 图表区域 -->
      <!-- [Layout Refine] @echarts/line GROUP: bbox h=113px，HORIZONTAL Y标签列 + 图表容器 -->
      <div class="c-mc-max-1785984937554-3cc58f63-chart-area">
        <!-- [Layout Refine] "辆" + "预警线" 纵向标签列 -->
        <div class="c-mc-max-1785984937554-3cc58f63-chart-y-label">
          <!-- [Style Refine] 辆: fills → #666666, Source Han Sans CN 12px 400 lineHeight 21.6px -->
          <span class="c-mc-max-1785984937554-3cc58f63-chart-unit">辆</span>
          <!-- [Style Refine] 预警线: fills → #d32f2f, Source Han Sans CN 12px 400 lineHeight 21.6px -->
          <span class="c-mc-max-1785984937554-3cc58f63-chart-warn-label">预警线</span>
        </div>
        <!-- [Layout Refine] ECharts 容器 flex:1，min-height:0 防 flex 溢出 -->
        <div ref="chartRef" class="c-mc-max-1785984937554-3cc58f63-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import bg1 from '../resources/images/bg-7880.png'
import bg2 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

// $mcComponentBuilder 初始化（try-catch 防止框架未就绪）
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder({
    componentId: 'mc-max-1785984937554-3cc58f63',
    componentProps: {},
    componentName: 'mc-max-1785984937554-3cc58f63'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[cp-环境监测] $mcComponentBuilder 失败:', e)
}

// Tab 状态
const activeTab = ref('co')
const tabList = [
  { key: 'co', label: '一氧化碳' },
  { key: 'light-in', label: '洞内照明' },
  { key: 'light-out', label: '洞外光强' },
  { key: 'visibility', label: '能见度' }
]

const currentTabLabel = computed(() => {
  const tab = tabList.find(t => t.key === activeTab.value)
  return tab ? tab.label.substring(0, 3) : 'zk3+785'
})

// Mock 数据（按 Tab 切换）
const chartDataMap = {
  'co': {
    xData: ['2','4','6','8','10','12','14','16','18','20','22','24'],
    seriesData: [120, 200, 180, 250, 300, 280, 350, 320, 200, 180, 150, 100],
    warnValue: 400
  },
  'light-in': {
    xData: ['2','4','6','8','10','12','14','16','18','20','22','24'],
    seriesData: [80, 150, 200, 280, 350, 400, 380, 300, 220, 160, 100, 60],
    warnValue: 350
  },
  'light-out': {
    xData: ['2','4','6','8','10','12','14','16','18','20','22','24'],
    seriesData: [50, 100, 200, 400, 500, 550, 480, 380, 200, 100, 60, 30],
    warnValue: 450
  },
  'visibility': {
    xData: ['2','4','6','8','10','12','14','16','18','20','22','24'],
    seriesData: [300, 350, 400, 420, 500, 480, 450, 380, 300, 250, 200, 180],
    warnValue: 300
  }
}

// ECharts 图表
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value] || chartDataMap['co']
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    grid: {
      left: 40,
      right: 10,
      top: 10,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9 }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        data: data.seriesData,
        itemStyle: { color: '#0fcd7d' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ yAxis: data.warnValue }]
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

watch(activeTab, () => {
  updateChart()
})

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
    runtimeBuilder.publishEvent('mc-max-1785984937554-3cc58f63-onload', {
      componentId: 'mc-max-1785984937554-3cc58f63',
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
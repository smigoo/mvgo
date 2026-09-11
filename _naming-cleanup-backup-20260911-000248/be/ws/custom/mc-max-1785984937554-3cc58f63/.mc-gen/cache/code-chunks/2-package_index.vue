<template>
  <base-panel panelKey="default-panel">
    <!-- 标题左侧装饰图标 -->
    <template #title-left>
      <!-- Fixed: 使用 g 图标资源作为标题装饰点（8x8px 装饰元素） -->
      <img :src="icon1" alt="装饰图标" class="c-mc-max-1785984937554-3cc58f63-title-dot" />
    </template>

    <!-- 默认插槽：业务内容区 -->
    <div class="c-mc-max-1785984937554-3cc58f63-content" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <!-- 子标题/Tab 区域 -->
      <div class="c-mc-max-1785984937554-3cc58f63-sub-header">
        <!-- Fixed: 使用 bg2 背景图资源作为 tabs 列表背景 -->
        <div
          class="c-mc-max-1785984937554-3cc58f63-tabs-list"
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div
            v-for="(tab, index) in tabList"
            :key="tab.key"
            class="c-mc-max-1785984937554-3cc58f63-tab-item"
            :class="{ 'c-mc-max-1785984937554-3cc58f63-tab-item--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <!-- Fixed: 激活 tab 使用 bgtabActive 背景图资源 -->
            <div
              v-if="activeTab === tab.key"
              class="c-mc-max-1785984937554-3cc58f63-tab-active-bg"
              :style="{ backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
            ></div>
            <span class="c-mc-max-1785984937554-3cc58f63-tab-label">{{ tab.label }}</span>
          </div>
        </div>

        <!-- tabs 图标区 -->
        <div class="c-mc-max-1785984937554-3cc58f63-tabs-icon-wrapper">
          <!-- Fixed: 使用 icontabsIcon 图标资源 -->
          <img :src="icontabsIcon" alt="tabs-icon" class="c-mc-max-1785984937554-3cc58f63-tabs-icon" />
          <!-- 角标数字 -->
          <div class="c-mc-max-1785984937554-3cc58f63-badge">
            <span class="c-mc-max-1785984937554-3cc58f63-badge-num">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-mc-max-1785984937554-3cc58f63-chart-area">
        <div class="c-mc-max-1785984937554-3cc58f63-chart-y-label">
          <span class="c-mc-max-1785984937554-3cc58f63-chart-unit">辆</span>
          <span class="c-mc-max-1785984937554-3cc58f63-chart-warn-label">预警线</span>
        </div>
        <div ref="chartRef" class="c-mc-max-1785984937554-3cc58f63-chart-container"></div>
      </div>

      <!-- 图例区域 -->
      <div class="c-mc-max-1785984937554-3cc58f63-legend-area">
        <div class="c-mc-max-1785984937554-3cc58f63-legend-item">
          <span class="c-mc-max-1785984937554-3cc58f63-legend-dot"></span>
          <span class="c-mc-max-1785984937554-3cc58f63-legend-text">{{ currentTabLabel }}CO浓度</span>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
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
  const data = chartDataMap[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 40, 80, 0.85)',
      borderColor: 'rgba(85, 158, 255, 0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    grid: {
      left: 36,
      right: 16,
      top: 16,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      axisLine: { lineStyle: { color: 'rgba(85,158,255,0.3)' } },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      interval: 200,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: 'rgba(85,158,255,0.2)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Roboto'
      }
    },
    series: [
      {
        type: 'line',
        data: data.seriesData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.35)' },
            { offset: 1, color: 'rgba(15,205,125,0.02)' }
          ])
        }
      },
      {
        // 预警线
        type: 'line',
        data: data.xData.map(() => data.warnValue),
        symbol: 'none',
        lineStyle: {
          color: '#d32f2f',
          width: 1,
          type: 'dashed'
        },
        z: 10
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

// 监听 chartRef DOM 挂载
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听 Tab 切换，更新图表数据
watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

// onload 事件
const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785984937554-3cc58f63-onload', {
      componentId: 'mc-max-1785984937554-3cc58f63',
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  emitLoadEvent()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-mc-max-1785984937554-3cc58f63-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.c-mc-max-1785984937554-3cc58f63-title-dot {
  width: 8px;
  height: 8px;
  display: block;
  flex-shrink: 0;
}

.c-mc-max-1785984937554-3cc58f63-sub-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 4px 8px;
  height: 32px;
  box-sizing: border-box;
}

.c-mc-max-1785984937554-3cc58f63-tabs-list {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 295px;
  height: 27px;
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}

.c-mc-max-1785984937554-3cc58f63-tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  cursor: pointer;
  z-index: 1;
}

.c-mc-max-1785984937554-3cc58f63-tab-active-bg {
  position: absolute;
  inset: 3px 2px;
  border-radius: 2px;
  z-index: 0;
}

.c-mc-max-1785984937554-3cc58f63-tab-label {
  position: relative;
  z-index: 1;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  white-space: nowrap;

  .c-mc-max-1785984937554-3cc58f63-tab-item--active & {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-mc-max-1785984937554-3cc58f63-tabs-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-mc-max-1785984937554-3cc58f63-tabs-icon {
  width: 52px;
  height: 24px;
  display: block;
}

.c-mc-max-1785984937554-3cc58f63-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-max-1785984937554-3cc58f63-badge-num {
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}

.c-mc-max-1785984937554-3cc58f63-chart-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  padding: 0 8px 4px 8px;
  box-sizing: border-box;
}

.c-mc-max-1785984937554-3cc58f63-chart-y-label {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  flex-shrink: 0;
  padding-bottom: 20px;
  width: 36px;
  box-sizing: border-box;
}

.c-mc-max-1785984937554-3cc58f63-chart-unit {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #666666;
  line-height: 21.6px;
}

.c-mc-max-1785984937554-3cc58f63-chart-warn-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #d32f2f;
  line-height: 21.6px;
}

.c-mc-max-1785984937554-3cc58f63-chart-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.c-mc-max-1785984937554-3cc58f63-legend-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 4px 8px 6px 44px;
  flex-shrink: 0;
}

.c-mc-max-1785984937554-3cc58f63-legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.c-mc-max-1785984937554-3cc58f63-legend-dot {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-mc-max-1785984937554-3cc58f63-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 9.6px;
  font-weight: 400;
  color: #333333;
  line-height: 14.4px;
}
</style>
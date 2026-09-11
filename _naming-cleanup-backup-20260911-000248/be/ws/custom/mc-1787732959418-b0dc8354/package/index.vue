<template>
  <base-panel panelKey="default-panel">
    <!-- 标题栏左侧：三色圆点装饰 + 标题文字 -->
    <template #title_left>
      <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-title">
        <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dots">
          <span class="c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot--black"></span>
          <span class="c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot--blue"></span>
          <span class="c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot c-mc-max-1787729228094-3bd12256-c-env-monitor-title-dot--path"></span>
        </div>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
      </div>
    </template>

    <!-- 主体内容：控制栏 + 图表区 -->
    <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-root">
      <!-- 控制栏 -->
      <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-controls">
        <!-- Tab 切换组 -->
        <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab', { 'c-env-monitor-tab--active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧图标按钮组 -->
        <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-icon-group">
          <div
            class="c-mc-max-1787729228094-3bd12256-c-env-monitor-icon-btn"
            role="button"
            :aria-label="'图表视图'"
            title="图表视图"
            @click="handleViewSwitch('chart')"
          ></div>
          <div
            class="c-env-monitor-icon-btn c-mc-max-1787729228094-3bd12256-c-env-monitor-icon-btn--badge"
            role="button"
            :aria-label="'列表视图'"
            title="列表视图"
            @click="handleViewSwitch('list')"
          >
            <span class="c-mc-max-1787729228094-3bd12256-c-env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-chart-section">
        <!-- 自定义图例（含联动点击） -->
        <div class="c-mc-max-1787729228094-3bd12256-c-env-monitor-chart-legend">
          <span
            class="c-mc-max-1787729228094-3bd12256-c-env-monitor-legend-item"
            :class="{ 'c-env-monitor-legend-item--inactive': !legendVisible }"
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-mc-max-1787729228094-3bd12256-c-env-monitor-legend-dot" style="background: #00B42A;"></i>
            <span class="c-mc-max-1787729228094-3bd12256-c-env-monitor-legend-text">zk3+785CO浓度</span>
          </span>
        </div>

        <!-- ECharts 图表容器（预警线、坐标轴、面积图交由 ECharts 渲染） -->
        <div ref="chartRef" class="c-mc-max-1787729228094-3bd12256-c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 一次调用 $mcComponentBuilder 并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 选项（顺序遵循设计稿 tabs-list 节点：一氧化碳、洞内照明、洞外光强、能见度）
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' },
  { key: 'visibility', label: '能见度' }
]

// 当前激活的 Tab
const activeTab = ref('co')

// 右侧视图切换（图表/列表），当前仅记录状态，不臆造列表内容
const viewMode = ref('chart')

// 自定义图例显示状态
const legendVisible = ref(true)

// Tab 切换处理
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 视图切换处理
const handleViewSwitch = (mode) => {
  viewMode.value = mode
  // 设计稿未提供列表视图内容，此处不补写具体列表
}

// ======== ECharts 图表逻辑 ========
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例联动：点击自定义图例时切换 ECharts 系列显隐
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendVisible.value = !legendVisible.value
}

// X 轴时间点（设计稿文字清单：2/4/6/8/10/12/14/16/18/20/22/24）
const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 不同 Tab 的数据源。
// 仅“一氧化碳”提供趋势演示数据（依据设计稿：14-18 时曲线有轻微隆起，预警线在 30 处）。
// 其余 Tab 使用空数组，避免臆造未在设计稿中出现的具体数值点。
const dataMap = {
  co: [20, 24, 23, 26, 28, 27, 30, 34, 33, 29, 24, 20],
  lighting: [],
  outdoor: [],
  visibility: []
}

// 构建 ECharts 配置
const buildChartOption = () => {
  const currentData = dataMap[activeTab.value] || []

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e5e6eb',
      borderWidth: 1,
      textStyle: { color: '#1a1a2e', fontSize: 12 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: { left: 40, right: 16, top: 20, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: xAxisData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#86909C', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 40,
      interval: 10,
      nameTextStyle: { color: '#666666', fontSize: 10, align: 'right' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#86909C', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e3e9f0', type: 'dashed' } }
    },
    legend: { show: false },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: currentData,
        lineStyle: { color: '#00B42A', width: 2 },
        itemStyle: { color: '#00B42A' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 180, 42, 0.45)' },
            { offset: 1, color: 'rgba(0, 180, 42, 0.02)' }
          ])
        },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#F53F3F', type: 'dashed', width: 1 },
          label: {
            show: true,
            position: 'end',
            color: '#F53F3F',
            fontSize: 10,
            formatter: '预警线'
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  chart.setOption(buildChartOption(), true)
}

// 初始化图表，使用 ResizeObserver 处理容器初始尺寸为 0 的情况
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

// 监听 chartRef 变化，处理面板销毁重建 slot DOM 的场景
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// Tab 切换后更新图表数据
watch(activeTab, () => {
  updateChart()
})

// 窗口尺寸变化时自适应
const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)

  // 触发组件加载完成事件
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
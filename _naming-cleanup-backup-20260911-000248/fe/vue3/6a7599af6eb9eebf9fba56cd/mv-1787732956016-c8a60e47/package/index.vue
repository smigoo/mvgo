<template>
  <div class="env-monitor-root">
    <!-- section-header: 顶部标题区 -->
    <div class="env-header">
      <div class="decoration-group">
        <img :src="icon1" class="deco-icon deco-icon-1" alt="" />
        <img :src="icon2" class="deco-icon deco-icon-2" alt="" />
        <img :src="icon3" class="deco-icon deco-icon-3" alt="" />
      </div>
      <div class="header-title">环境监测</div>
    </div>

    <!-- section-controls: 控制栏（Tab切换与视图按钮） -->
    <div class="env-controls">
      <div class="tab-group">
        <div
          v-for="(tab, index) in tabs"
          :key="tab"
          :class="['tab-item', { active: activeTab === index }]"
          @click="handleTabClick(index)"
        >
          {{ tab }}
        </div>
      </div>
      <div class="icon-group">
        <div class="icon-btn" @click="handleViewSwitch('chart')">
          <img :src="icon4" alt="chart view" />
        </div>
        <div class="icon-btn" @click="handleViewSwitch('list')">
          <img :src="icon5" alt="list view" />
          <span class="badge">6</span>
        </div>
      </div>
    </div>

    <!-- section-chart: 图表/数据可视化区 -->
    <div class="env-chart-section">
      <div class="chart-bg-wrapper" :style="{ backgroundImage: `url(${bg1})` }">
        <div ref="chartRef" class="chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 环境监测面板主组件：包含标题装饰、Tab切换、视图切换及CO浓度趋势面积图
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

// 图片资源变量（由系统自动注入，直接使用，禁止加 .value）
// icon1: circle-7884.png, icon2: circle-7885.png, icon3: path-7886.png
// icon4: icon-7941.png, icon5: icon-7945.png, bg1: bg-7890.png
const icon1 = window.__INJECTED_IMAGES__?.icon1 || ''
const icon2 = window.__INJECTED_IMAGES__?.icon2 || ''
const icon3 = window.__INJECTED_IMAGES__?.icon3 || ''
const icon4 = window.__INJECTED_IMAGES__?.icon4 || ''
const icon5 = window.__INJECTED_IMAGES__?.icon5 || ''
const bg1 = window.__INJECTED_IMAGES__?.bg1 || ''

// #region 1. Props定义
// 本组件为独立面板，暂无外部 props
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-switch'])
// #endregion

// #region 3. 响应式状态
// Tab 切换数据与状态
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const activeTab = ref(0)

// 图表数据（API 绑定槽位，必须用 ref）
const chartData = ref([5, 8, 12, 15, 10, 8, 12, 18, 25, 32, 28, 15])
const xLabels = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '时'])
// #endregion

// #region 4. 计算属性
// 暂无复杂派生状态
// #endregion

// #region 5. 方法
// 处理 Tab 切换，联动刷新图表数据
const handleTabClick = (index) => {
  if (activeTab.value === index) return
  activeTab.value = index
  emit('tab-change', tabs.value[index])
  
  // 模拟切换 Tab 后数据变化
  const mockData = {
    0: [5, 8, 12, 15, 10, 8, 12, 18, 25, 32, 28, 15],
    1: [20, 22, 18, 15, 10, 8, 12, 16, 20, 25, 28, 30],
    2: [30, 32, 35, 38, 40, 38, 35, 30, 25, 20, 15, 10],
    3: [10, 15, 20, 25, 30, 35, 38, 35, 30, 25, 20, 15]
  }
  chartData.value = mockData[index] || mockData[0]
  updateChart()
}

// 处理视图切换按钮点击
const handleViewSwitch = (mode) => {
  emit('view-switch', mode)
}

// 更新图表配置
const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption({
    series: [{
      data: chartData.value
    }]
  })
}
// #endregion

// #region 6. 生命周期与图表初始化
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 构建 ECharts 基础配置
const getChartOption = () => ({
  grid: {
    top: 30,
    right: 20,
    bottom: 30,
    left: 40,
    containLabel: false
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: '#eee',
    textStyle: { color: '#333', fontSize: 12 }
  },
  legend: {
    data: ['zk3+785CO浓度'],
    right: 10,
    top: 10,
    textStyle: { color: '#4E5969', fontSize: 10 },
    icon: 'rect',
    itemWidth: 14,
    itemHeight: 2
  },
  xAxis: {
    type: 'category',
    data: xLabels.value,
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#E5E6EB' } },
    axisTick: { show: false },
    axisLabel: { color: '#86909C', fontSize: 10, interval: 0 }
  },
  yAxis: {
    type: 'value',
    name: '辆',
    nameLocation: 'end',
    nameTextStyle: { color: '#666666', fontSize: 12, align: 'right' },
    nameGap: 10,
    max: 40,
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: '#E5E6EB', type: 'dashed' } },
    axisLabel: { color: '#86909C', fontSize: 10 }
  },
  series: [
    {
      name: 'zk3+785CO浓度',
      type: 'line',
      data: chartData.value,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: '#0fcd7d',
        width: 2
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
          color: '#F53F3F',
          type: 'dashed',
          width: 1
        },
        data: [
          {
            yAxis: 30,
            label: {
              formatter: '预警线',
              color: '#F53F3F',
              fontSize: 10,
              position: 'end'
            }
          }
        ]
      }
    }
  ]
})

onMounted(async () => {
  // 必须等待 DOM 更新且 flex 布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(getChartOption())
      
      // 监听容器尺寸变化，自适应 resize
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理资源，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';</style>
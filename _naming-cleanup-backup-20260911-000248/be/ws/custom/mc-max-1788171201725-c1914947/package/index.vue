<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1788171201725-c1914947-c-env-monitor-root">
      <!-- 指标切换与工具栏：监测指标 Tab + 视图切换图标 -->

      <!-- 浓度趋势图区域 -->
      <EnvMonitorChart
        class="c-mc-max-1788171201725-c1914947-c-env-monitor-chart-block"
        :active-tab="activeTab"
        :chart-data="chartData"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

import EnvMonitorChart from './components/EnvMonitorChart.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 监测指标 Tab（文案严格取自设计稿文字清单） ===
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活指标（默认「一氧化碳」选中）
const activeTab = ref('co')

// 视图切换（图表视图 / 列表视图），默认图表视图
const activeView = ref('chart')

// 列表视图图标上的角标（设计稿角标数字为 6）
const viewBadge = ref(6)
// === X 轴时间刻度（取自设计稿：2~24 时） ===
const timeAxis = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
// === 各指标对应的趋势数据（Mock，切换 Tab 时联动更新） ===
const dataMap = {
  co: [12, 18, 22, 15, 20, 28, 32, 26, 19, 24, 30, 21],
  visibility: [30, 28, 25, 22, 26, 31, 34, 29, 24, 27, 33, 30],
  lighting: [8, 10, 14, 20, 26, 30, 28, 24, 18, 12, 9, 7],
  outdoor: [5, 9, 16, 24, 32, 36, 34, 28, 20, 13, 8, 6]
}
// === 传给图表子组件的数据 ===
const chartData = ref({
  xAxis: timeAxis,
  seriesName: 'zk3+785CO浓度',
  warningValue: 30,
  values: dataMap[activeTab.value]
})
// === 构建指定指标的图表数据 ===
const buildChartData = (tabValue) => ({
  xAxis: timeAxis,
  seriesName: 'zk3+785CO浓度',
  warningValue: 30,
  values: dataMap[tabValue] || dataMap.co
})
// === Tab 切换：更新激活态并联动图表数据 ===
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}
// === 视图切换：图表视图 / 列表视图 ===
const handleViewChange = (view) => {
  activeView.value = view
}

// 监听指标切换，刷新图表数据
watch(activeTab, (newTab) => {
  chartData.value = buildChartData(newTab)
})
// === 触发组件加载完成事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
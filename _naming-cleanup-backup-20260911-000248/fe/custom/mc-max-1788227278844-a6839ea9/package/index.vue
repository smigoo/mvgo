<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-root">
      <div class="c-env-monitor-tabs" style="display:flex;gap:8px;margin-bottom:12px;">
        <div
          v-for="tab in tabList"
          :key="tab.value"
          class="c-mc-max-1788227278844-a6839ea9-c-env-monitor-tab-item"
          :class="{ 'is-active': activeTab === tab.value }"
          :style="activeTab === tab.value ? 'background:var(--mc-primary,#2f6bff);color:#fff;' : 'background:rgba(255,255,255,0.08);color:#fff;'"
          @click="handleTabChange(tab.value)"
          style="padding:4px 12px;border-radius:4px;cursor:pointer;font-size:14px;line-height:20px;"
        >{{ tab.label }}</div>
      </div>
      <SectionChart
        :chart-data="chartData"
        :active-tab="activeTab"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

import SectionChart from './components/SectionChart.vue'
// === $mcComponentBuilder 初始化（只调用一次，直接解构避免 TDZ） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 监测项 Tab 列表（文案逐字来自设计稿文字清单） ===
const tabList = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting-in' },
  { label: '洞外光强', value: 'light-out' }
])
// === 当前激活的监测项（默认选中「一氧化碳」） ===
const activeTab = ref('co')
// === X 轴时间刻度（设计稿：2 ~ 24） ===
const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
// === 各监测项对应的趋势数据（Mock，用于演示 Tab 切换联动） ===
const seriesDataMap = {
  co: [8, 12, 16, 22, 27, 33, 29, 24, 20, 17, 13, 10],
  visibility: [14, 18, 21, 25, 31, 28, 24, 22, 19, 16, 12, 9],
  'lighting-in': [10, 13, 18, 24, 29, 35, 31, 26, 21, 18, 15, 11],
  'light-out': [6, 9, 14, 19, 26, 32, 36, 30, 23, 18, 14, 8]
}
// === 图表数据（供 SectionChart 渲染 echarts） ===
const chartData = ref({
  legend: 'zk3+785CO浓度', // 图例文字，来自设计稿
  seriesColor: '#0fcd7d', // Figma Vector 1304 渐变色值
  yAxisUnit: '辆', // Y 轴单位
  xAxisUnit: '时', // X 轴单位
  yAxisTicks: [0, 10, 20, 30, 40], // Y 轴刻度（设计稿 40/30/20/10/0）
  yAxisMax: 40,
  warningLine: { value: 30, label: '预警线', color: '#d32f2f' },
  xAxisData,
  seriesData: seriesDataMap[activeTab.value]
})
// === 刷新图表数据 ===
const updateChartData = (tabValue) => {
  chartData.value = {
    ...chartData.value,
    seriesData: seriesDataMap[tabValue] || []
  }
}
// === Tab 切换（样式 + 数据同时联动） ===
const handleTabChange = (value) => {
  if (!value || activeTab.value === value) return
  activeTab.value = value
}
// === 监听激活项变化，驱动图表数据更新 ===
watch(activeTab, (newTab) => {
  updateChartData(newTab)
})
// === 组件加载完成事件 ===
onMounted(() => {
  updateChartData(activeTab.value)
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
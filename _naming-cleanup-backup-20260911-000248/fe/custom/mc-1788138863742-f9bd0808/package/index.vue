<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1788133479203-d7449268-c-env-monitor-root">
      <!-- Tab切换栏 -->

      <!-- 统计数值区 -->

      <!-- 面积图区域 -->
      <ChartArea 
        :chart-data="chartData"
        :active-tab="activeTab"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === Tab 切换栏（一氧化碳为激活态） ===
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
])

const activeTab = ref('co')
// === 统计数值区（zk3+785 CO浓度 / 预警线） ===
const statsData = ref({
  value: 'zk3+785',
  unit: 'CO浓度',
  label: '预警线'
})
// === 面积图数据（CO浓度 0-24 时变化，Y轴 0-40，预警线 30） ===
const chartData = ref({
  seriesName: 'CO浓度',
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  xAxisName: '时',
  yAxisName: '辆',
  yMax: 40,
  warningLine: 30,
  data: [15, 18, 17, 21, 25, 23, 20, 24, 28, 22, 19, 16]
})
// === Tab 切换处理 ===
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}
// === 组件加载完成事件 ===
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
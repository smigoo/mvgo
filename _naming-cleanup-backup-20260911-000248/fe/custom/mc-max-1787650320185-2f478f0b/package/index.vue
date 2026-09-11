<template>
  <base-panel panelKey="default-panel">
    <template #title_right>
      <span class="c-mc-max-1787650320185-2f478f0b-c-monitor-header-tip">*数据实时更新</span>
    </template>
    <div class="c-mc-max-1787650320185-2f478f0b-c-monitor-root">
      <TotalTraffic />
      <TunnelChart />
      <BridgeChart />
      <VehicleType />
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {defineAsyncComponent, ref, reactive, computed, watch, provide} from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 异步加载子组件 ===
const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
const TunnelChart = defineAsyncComponent(() => import('./components/TunnelChart.vue'))
const BridgeChart = defineAsyncComponent(() => import('./components/BridgeChart.vue'))
const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))
const FlowPrediction = defineAsyncComponent(() => import('./components/FlowPrediction.vue'))
// === 全局状态 ===
// 流量预测地点切换
const predictionLocation = ref('江阴靖江长江隧道')
const predictionLocations = [
  { label: '江阴靖江长江隧道', value: '江阴靖江长江隧道' },
  { label: '江阴大桥', value: '江阴大桥' }
]

// 当日总流量时间选择
const timeRange = ref('24小时')

// 图例状态（隧道/大桥柱状图）
const tunnelLegendState = reactive({
  beijing: true,
  shanghai: true
})

const bridgeLegendState = reactive({
  beijing: true,
  shanghai: true
})

// 预测图例状态
const predictionLegendState = reactive({
  c-mc-max-1787650320185-2f478f0b-actual: true,
  forecast: true
})
// === 提供全局状态给子组件 ===
provide('predictionLocation', predictionLocation)
provide('timeRange', timeRange)
provide('componentApi', componentApi)
provide('runtimeBuilder', runtimeBuilder)
// === 工具函数 ===
const handleHolidayClick = () => {
  runtimeBuilder.publishEvent('holiday-prediction-click', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

import {onMounted, onUnmounted} from 'vue'

// 组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载清理
onUnmounted(() => {
  // 清理全局事件监听或定时器（如有）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
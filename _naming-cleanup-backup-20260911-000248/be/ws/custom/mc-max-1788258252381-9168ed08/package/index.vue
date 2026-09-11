<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-monitor-header-diamond"></div>
    </template>
    <div class="c-monitor-root">
      <DailyTotalFlow />
      <TunnelHourlyFlow />
      <BridgeHourlyFlow />
      <VehicleTypeDistribution />
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 全局注入，直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 生命周期钩子
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理工作（如果需要的话）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

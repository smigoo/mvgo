<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <DailyTotal />
      <TunnelHourly />
      <BridgeHourly />
      <VehicleDistribution />
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourly from './components/TunnelHourly.vue'
import BridgeHourly from './components/BridgeHourly.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（仅一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})


// 获取微码组件构建器实例（只调用一次）


// 发布组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

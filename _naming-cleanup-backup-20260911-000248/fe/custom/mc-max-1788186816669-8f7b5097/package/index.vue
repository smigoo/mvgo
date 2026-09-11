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

// 组件挂载完成：发布 onload 事件（微码框架约定）
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

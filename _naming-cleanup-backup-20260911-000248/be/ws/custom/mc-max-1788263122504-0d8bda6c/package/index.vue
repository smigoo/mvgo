<template>
  <base-panel class="c-mc-max-1788263122504-0d8bda6c" panelKey="default-panel">
    <div class="c-monitor-root">
      <DailyTotalFlow class="c-monitor-section" />
      <TunnelHourlyChart class="c-monitor-section" />
      <BridgeHourlyChart class="c-monitor-section" />
      <VehicleTypeDistribution class="c-monitor-section" />
      <FlowPrediction class="c-monitor-section" />
    </div>
  </base-panel>
</template>

<script setup>
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

import {onMounted, onUnmounted} from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===

// === 生命周期 ===
onMounted(() => {
  // 触发组件加载完成事件
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理工作（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
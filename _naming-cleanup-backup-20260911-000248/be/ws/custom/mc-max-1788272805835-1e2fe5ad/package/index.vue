<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <DailyTotalFlow />
      <HourlyFlowTunnel />
      <HourlyFlowBridge />
      <VehicleDistribution />
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import HourlyFlowTunnel from './components/HourlyFlowTunnel.vue'
import HourlyFlowBridge from './components/HourlyFlowBridge.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 调用（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onMounted 生命周期 ===
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 主组件无需额外清理，子组件自行管理其图表和定时器
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
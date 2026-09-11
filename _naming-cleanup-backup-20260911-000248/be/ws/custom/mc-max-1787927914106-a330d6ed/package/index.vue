<template>
  <base-panel panelKey="default-panel">
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
// === $mcComponentBuilder 初始化（只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件加载完成事件发布（在 onMounted 中调用） ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[流量监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
  console.log('[流量监测] 发布 monitor-onload 事件')
}
// === 生命周期：组件挂载后发布事件 ===
onMounted(() => {
  emitLoadEvent()
})

// 生命周期钩子
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理工作（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow />
      
      <!-- 江阴靖江长江隧道小时流量 -->
      <HourlyFlowTunnel />
      
      <!-- 江阴大桥小时流量 -->
      <HourlyFlowBridge />
      
      <!-- 车型分布 -->
      <VehicleTypeDistribution />
      
      <!-- 流量预测 -->
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'

const DailyTotalFlow = defineAsyncComponent(() => import('./components/DailyTotalFlow.vue'))
const HourlyFlowTunnel = defineAsyncComponent(() => import('./components/HourlyFlowTunnel.vue'))
const HourlyFlowBridge = defineAsyncComponent(() => import('./components/HourlyFlowBridge.vue'))
const VehicleTypeDistribution = defineAsyncComponent(() => import('./components/VehicleTypeDistribution.vue'))
const FlowPrediction = defineAsyncComponent(() => import('./components/FlowPrediction.vue'))

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}
</style>
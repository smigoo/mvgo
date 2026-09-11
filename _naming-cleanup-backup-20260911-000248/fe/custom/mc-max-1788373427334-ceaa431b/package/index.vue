<template>
  <base-panel class="c-mc-max-1788373427334-ceaa431b" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow class="c-monitor-section" />
      
      <!-- 江阴靖江长江隧道小时流量 -->
      <HourlyFlowTunnel class="c-monitor-section" />
      
      <!-- 江阴大桥小时流量 -->
      <HourlyFlowBridge class="c-monitor-section" />
      
      <!-- 车型分布 -->
      <VehicleTypeDistribution class="c-monitor-section" />
      
      <!-- 流量预测 -->
      <FlowPrediction class="c-monitor-section" />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import HourlyFlowTunnel from './components/HourlyFlowTunnel.vue'
import HourlyFlowBridge from './components/HourlyFlowBridge.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
import {onUnmounted} from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
// === 组件加载完成事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[流量监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onUnmounted(() => {
  // 主组件清理（子组件各自管理自身生命周期）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
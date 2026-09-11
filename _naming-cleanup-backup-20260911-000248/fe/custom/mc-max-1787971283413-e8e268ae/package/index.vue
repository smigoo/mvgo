<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-root">
      <!-- 1. 当日总流量 -->
      <DailyTotal class="c-monitor-section-daily" />
      
      <!-- 2. 江阴靖江长江隧道小时流量 -->
      <TunnelFlowChart class="c-monitor-section-tunnel" />
      
      <!-- 3. 江阴大桥小时流量 -->
      <BridgeFlowChart class="c-monitor-section-bridge" />
      
      <!-- 4. 车型分布 -->
      <VehicleDistribution class="c-monitor-section-vehicle" />
      
      <!-- 5. 流量预测 -->
      <FlowPrediction class="c-mc-max-1787971283413-e8e268ae-c-monitor-section-prediction" />
    </div>
  </base-panel>
</template>

<script setup>
import bg5 from '../resources/images/bg-3525.png'


// 子组件引入
import DailyTotal from './components/DailyTotal.vue'
import TunnelFlowChart from './components/TunnelFlowChart.vue'
import BridgeFlowChart from './components/BridgeFlowChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

// === 生命周期与事件处理 ===
// 组件加载完成后触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载时清理资源
onUnmounted(() => {
  // 主组件无需清理，子组件各自管理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
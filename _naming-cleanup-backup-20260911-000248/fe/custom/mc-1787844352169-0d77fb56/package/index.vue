<template>
  <base-panel panelKey="default-panel" :style="{ ...{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <div class="c-mc-1787844352169-0d77fb56-c-monitor-root">
      <TotalTraffic />
      <HourlyTunnelFlow />
      <HourlyBridgeFlow />
      <VehicleDistribution />
      <TrafficPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import bg4 from '../resources/images/bg-_m-35.png'
import bg5 from '../resources/images/bg-3525.png'


import HourlyTunnelFlow from './components/HourlyTunnelFlow.vue'
import HourlyBridgeFlow from './components/HourlyBridgeFlow.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficPrediction from './components/TrafficPrediction.vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构（const 解构=声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 在 onMounted 中触发 onload 事件（框架强制要求）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

// === 生命周期与事件处理（第 2/3 部分） ===
// 发布组件加载事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

// 挂载时触发加载事件
onMounted(() => {
  emitLoadEvent()
})

// 卸载时清理资源
onUnmounted(() => {
  // 子组件内部自行处理图表销毁和监听器清理
  // 主组件无需额外清理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
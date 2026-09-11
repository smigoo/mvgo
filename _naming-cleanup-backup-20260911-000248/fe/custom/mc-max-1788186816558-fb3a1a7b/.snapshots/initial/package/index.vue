<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 江阴靖江长江隧道小时流量 -->
      <TunnelHourlyChart />

      <!-- 江阴大桥小时流量 -->
      <BridgeHourlyChart />

      <!-- 车型分布 -->
      <VehicleTypeDistribution />

      <!-- 流量预测 -->
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（只调用一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件挂载完成：发布 onload 事件（微码框架约定）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载：主组件无独立监听器与图表资源需要清理
// 各图表子组件（TunnelHourlyChart / BridgeHourlyChart / FlowPrediction 等）在各自的 onUnmounted 中释放 echarts 实例与 ResizeObserver
onUnmounted(() => {
  // 无清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

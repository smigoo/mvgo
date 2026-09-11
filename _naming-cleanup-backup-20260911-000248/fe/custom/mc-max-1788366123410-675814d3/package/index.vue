<template>
  <base-panel class="c-mc-max-1788366123410-675814d3" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow class="c-monitor-section" />

      <!-- 江阴靖江长江隧道24小时流量 -->
      <TunnelHourlyFlow class="c-monitor-section" />

      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyFlow class="c-monitor-section" />

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
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
onMounted(() => {
  emitLoadEvent()
})
import {onUnmounted} from 'vue'
// $mcComponentBuilder 解构（声明+赋值一体，只能调用一次）
// 触发组件加载完成事件
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
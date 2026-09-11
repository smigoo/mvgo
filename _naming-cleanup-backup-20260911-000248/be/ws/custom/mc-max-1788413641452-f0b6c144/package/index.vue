<template>
  <base-panel class="c-mc-max-1788413641452-f0b6c144" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotal />
      <!-- 江阴靖江长江隧道小时流量 -->
      <HourlyFlowTunnel />
      <!-- 江阴大桥小时流量 -->
      <HourlyFlowBridge />
      <!-- 车型分布 -->
      <VehicleType />
      <!-- 流量预测 -->
      <FlowForecast />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted, defineAsyncComponent} from 'vue'

// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）===

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// === 子组件异步导入 ===

const DailyTotal = defineAsyncComponent(() => import('./components/DailyTotal.vue'))

const HourlyFlowTunnel = defineAsyncComponent(() => import('./components/HourlyFlowTunnel.vue'))

const HourlyFlowBridge = defineAsyncComponent(() => import('./components/HourlyFlowBridge.vue'))

const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))

const FlowForecast = defineAsyncComponent(() => import('./components/FlowForecast.vue'))

// === 生命周期：触发 onload 事件 ===

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

import {onUnmounted} from 'vue'

// $mcComponentBuilder 解构（只调用一次）
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
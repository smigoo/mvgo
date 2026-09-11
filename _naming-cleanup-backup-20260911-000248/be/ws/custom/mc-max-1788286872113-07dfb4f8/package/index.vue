<template>
  <base-panel class="c-mc-max-1788286872113-07dfb4f8" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotal />

      <!-- 江阴靖江长江隧道小时流量 -->
      <TunnelHourlyChart />

      <!-- 江阴大桥小时流量 -->
      <BridgeHourlyChart />

      <!-- 车型分布 -->
      <VehicleDistribution />

      <!-- 流量预测 -->
      <FlowPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（仅此一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

import {onUnmounted} from 'vue'

// $mcComponentBuilder 已在第 1 部分解构，直接使用
// 

// 发布组件加载完成事件
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

// 生命周期：组件挂载
onMounted(() => {
  emitLoadEvent()
})

// 生命周期：组件卸载
onUnmounted(() => {
  // 主组件无全局监听器需清理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
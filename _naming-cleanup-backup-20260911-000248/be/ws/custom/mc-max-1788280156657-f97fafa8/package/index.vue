<template>
  <base-panel class="c-mc-max-1788280156657-f97fafa8" panelKey="default-panel">
    <div class="c-monitor-root">
      <SectionDailyTotal class="c-monitor-section-daily-total" />
      <SectionChartTunnel class="c-monitor-section-chart-tunnel" />
      <SectionChartBridge class="c-monitor-section-chart-bridge" />
      <SectionVehicleType class="c-monitor-section-vehicle-type" />
      <SectionForecast class="c-monitor-section-forecast" />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted, onUnmounted} from 'vue'

import SectionDailyTotal from './components/SectionDailyTotal.vue'

import SectionChartTunnel from './components/SectionChartTunnel.vue'

import SectionChartBridge from './components/SectionChartBridge.vue'

import SectionVehicleType from './components/SectionVehicleType.vue'

import SectionForecast from './components/SectionForecast.vue'

// $mcComponentBuilder 调用（仅一次）

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如需）
})

// 已在第1部分声明，此处直接引用

//

// 触发组件加载事件

const emitLoadEvent = () => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

// 生命周期

onUnmounted(() => {
  // 组件卸载清理（子组件各自清理图表实例）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1787736422136-74deb182-c-monitor-root">
      <SectionDailyTotal />
      <SectionTunnelChart />
      <SectionBridgeChart />
      <SectionVehicleType />
      <SectionForecast />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionTunnelChart from './components/SectionTunnelChart.vue'
import SectionBridgeChart from './components/SectionBridgeChart.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// 一次调用 $mcComponentBuilder 并直接解构，禁止重复调用
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件发布函数（后续在 onMounted 中调用）
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

// 生命周期与事件（第 2/3 部分）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
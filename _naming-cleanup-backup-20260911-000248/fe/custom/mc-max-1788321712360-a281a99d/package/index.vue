<template>
  <base-panel class="c-mc-max-1788321712360-a281a99d" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <TotalFlow />
      <!-- 江阴靖江长江隧道流量 -->
      <ChartTunnel />
      <!-- 江阴大桥流量 -->
      <ChartBridge />
      <!-- 车型分布 -->
      <VehicleType />
      <!-- 流量预测 -->
      <Prediction />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
import TotalFlow from './components/TotalFlow.vue'
import ChartTunnel from './components/ChartTunnel.vue'
import ChartBridge from './components/ChartBridge.vue'
import VehicleType from './components/VehicleType.vue'
import Prediction from './components/Prediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()


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
<template>
  <base-panel panelKey="default-panel" :style="{ ...{ ...{ ...{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-root">
      <!-- 当日总流量 -->
      <DailyTotalFlow />

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
import bg2 from '../resources/images/bg-_m-36.png'
import bg3 from '../resources/images/bg-3475.png'
import bg4 from '../resources/images/bg-_m-35.png'
import bg5 from '../resources/images/bg-3525.png'


import FlowPrediction from './components/FlowPrediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

import {onMounted, onUnmounted} from 'vue'
// === 生命周期钩子 ===
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
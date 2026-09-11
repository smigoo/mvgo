<template>
  <base-panel class="c-mc-max-1788252098143-12469472" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量 -->
      <!-- 江阴靖江长江隧道24小时流量 -->
      <!-- 江阴大桥24小时流量 -->
      <BridgeHourlyChart class="c-monitor-section c-monitor-section-bridge" />
      <!-- 车型分布 -->
      <!-- 流量预测 -->
      <FlowPrediction class="c-monitor-section c-monitor-section-prediction" />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'

import BridgeHourlyChart from './components/BridgeHourlyChart.vue'

import FlowPrediction from './components/FlowPrediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

import {onUnmounted} from 'vue'

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 组件卸载时的清理工作
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
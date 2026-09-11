<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-layout">
      <!-- 顶部标题 -->
      <div class="c-monitor-header">
        <span class="c-monitor-title">流量监测</span>
        <span class="c-monitor-subtitle">*数据实时更新</span>
      </div>

      <!-- 当日总流量区块 -->
      <div class="c-section-daily">
        <TotalTraffic />
        <TrafficTrend />
      </div>

      <!-- 车型分布区块 -->
      <div class="c-section-vehicle">
        <VehicleDistribution />
      </div>

      <!-- 流量预测区块 -->
      <div class="c-section-prediction">
        <FlowPrediction />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'

// --- 子组件异步加载 ---
const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
const TrafficTrend = defineAsyncComponent(() => import('./components/TrafficTrend.vue'))
const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))
const FlowPrediction = defineAsyncComponent(() => import('./components/FlowPrediction.vue'))

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
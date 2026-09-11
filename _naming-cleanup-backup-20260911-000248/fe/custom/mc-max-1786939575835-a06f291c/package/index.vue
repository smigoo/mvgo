<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <DeviceSummaryCards class="c-device-monitor-summary" />
      <div class="c-device-monitor-main">
        <div class="c-device-monitor-trend-section">
          <DeviceTrendChart />
        </div>
        <div class="c-device-monitor-type-section">
          <DeviceTypeChart />
        </div>
      </div>
      <DeviceStatusTable class="c-device-monitor-status" />
    </div>
  </base-panel>
</template>
<script setup>
import { onMounted, onUnmounted, provide } from 'vue'
import DeviceSummaryCards from './components/DeviceSummaryCards.vue'
import DeviceTrendChart from './components/DeviceTrendChart.vue'
import DeviceTypeChart from './components/DeviceTypeChart.vue'
import DeviceStatusTable from './components/DeviceStatusTable.vue'

let runtimeBuilder = null
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
    componentApi = builder.componentApi || null
  }
} catch (e) {
  console.warn('[device-monitor] $mcComponentBuilder 初始化失败:', e)
}

if (componentApi) {
  provide('componentApi', componentApi)
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'device-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 暂无需要清理的监听
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
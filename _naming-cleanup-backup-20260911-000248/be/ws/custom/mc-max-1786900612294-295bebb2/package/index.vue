<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <DeviceOverview />
      <TrendChart />
      <DeviceList />
    </div>
  </base-panel>
</template>

<script setup>
import { provide, onMounted, onUnmounted } from 'vue'
import DeviceOverview from './components/DeviceOverview.vue'
import TrendChart from './components/TrendChart.vue'
import DeviceList from './components/DeviceList.vue'

let runtimeBuilder = null
let componentApi = null
let componentId = 'c-device-monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentApi = builder?.componentApi || null
  componentId = builder?.componentId || 'c-device-monitor'
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 失败:', e)
}

if (componentApi) {
  provide('componentApi', componentApi)
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId,
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 保留清理钩子，子组件各自管理自己的图表与监听
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
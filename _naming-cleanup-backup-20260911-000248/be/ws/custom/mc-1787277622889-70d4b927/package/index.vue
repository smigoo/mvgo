<template>
  <base-panel panelKey="default-panel">
    <div class="c-traffic-monitor-root">
      <TotalTraffic />
      <VehicleDistribution />
      <TrafficForecast />
    </div>
  </base-panel>
</template>

<script setup>
import {defineAsyncComponent, provide} from 'vue'

// --- $mcComponentBuilder 初始化 ---

let businessProps = null

let componentProps = null

let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentProps = builder?.componentProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 依赖注入 ---

if (componentApi) {
  provide('componentApi', componentApi)
}

// --- 子组件异步引入 ---

const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))

const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))

const TrafficForecast = defineAsyncComponent(() => import('./components/TrafficForecast.vue'))

// 第 2/2 部分：行为逻辑

let runtimeBuilder = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[traffic-monitor] $mcComponentBuilder 失败:', e)
}

const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 本组件无额外定时器或监听需清理，预留扩展位
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
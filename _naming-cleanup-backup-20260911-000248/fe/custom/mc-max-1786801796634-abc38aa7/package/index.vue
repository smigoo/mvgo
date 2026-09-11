<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-root" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-monitor-content">
        <div class="c-monitor-header-section">
          <SummaryStats />
        </div>
        
        <div class="c-monitor-section">
          <SummaryStats />
          <FlowTrend />
        </div>
        
        <div class="c-monitor-section">
          <VehicleDistribution />
        </div>
        
        <div class="c-monitor-section">
          <TrafficForecast />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'


import FlowTrend from './components/FlowTrend.vue'

import VehicleDistribution from './components/VehicleDistribution.vue'

import TrafficForecast from './components/TrafficForecast.vue'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

import {onMounted, onUnmounted, provide} from 'vue'

let runtimeBuilder = null

let componentProps = {}

let componentApi = null

let componentId = 'monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  componentApi = builder?.componentApi
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

if (componentApi) {
  provide('componentApi', componentApi)
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: componentId,
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 组件卸载时的清理工作
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
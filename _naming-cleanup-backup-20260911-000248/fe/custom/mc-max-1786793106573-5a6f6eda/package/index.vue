<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-global-header">
        <div class="c-global-header-left">
          <img :src="headerIcon" class="c-global-header-icon" />
          <span class="c-global-header-title">流量监测</span>
        </div>
        <span class="c-global-header-right">*数据实时更新</span>
      </div>
      <div class="c-monitor-content">
        <MonitorStats />
        <VehicleType />
        <FlowTrend />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import headerIcon from '../resources/images/icon-3561.png'


// --- 框架初始化 ---

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 子组件引入 ---

import {onMounted, onUnmounted, provide} from 'vue'

import declareJson from '../declare.json'

const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))

const FlowTrend = defineAsyncComponent(() => import('./components/FlowTrend.vue'))

const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))

let runtimeBuilder = null

let componentApi = null

let componentProps = {}

let businessProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentApi = builder?.componentApi
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 失败:', e)
}

if (componentApi) {
  provide('componentApi', componentApi)
}

const declareDefaults = {}

if (declareJson?.businessConfig && Array.isArray(declareJson.businessConfig)) {
  declareJson.businessConfig.forEach((item) => {
    if (item?.key && item.default !== undefined) {
      declareDefaults[item.key] = item.default
    }
  })
}

function getConfig(key, defaultValue) {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) {
    return value
  }
  if (declareDefaults[key] !== undefined && declareDefaults[key] !== null) {
    return declareDefaults[key]
  }
  return defaultValue
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: componentProps?.componentId || 'monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
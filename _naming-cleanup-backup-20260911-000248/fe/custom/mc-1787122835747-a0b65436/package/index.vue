<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <TotalTraffic />
      <HourlyFlowChart />
      <VehicleTypeDistribution />
      <FlowForecast />
    </div>
  </base-panel>
</template>

<script setup>
import TotalTraffic from './components/TotalTraffic.vue'

import HourlyFlowChart from './components/HourlyFlowChart.vue'

import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'

import FlowForecast from './components/FlowForecast.vue'

try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- $mcComponentBuilder 初始化（try-catch 兜底，防止框架未就绪导致组件不可见） ---

let runtimeBuilder = null

let businessProps = null

let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
  businessProps = {}
  componentApi = null
}

// 向子组件注入数据请求 API（子组件如需调用接口，通过 inject 获取）

if (componentApi) {
  provide('componentApi', componentApi)
}

// --- 组件加载完成事件 ---

const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

// --- 生命周期 ---

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 主组件无独立定时器/全局监听；子组件各自负责自身的清理
  runtimeBuilder = null
  businessProps = null
  componentApi = null
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
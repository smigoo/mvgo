<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <TotalTraffic />
      <TunnelFlowChart />
      <BridgeFlowChart />
      <VehicleDistribution />
      <TrafficPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {defineAsyncComponent, provide} from 'vue'

const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))

const TunnelFlowChart = defineAsyncComponent(() => import('./components/TunnelFlowChart.vue'))

const BridgeFlowChart = defineAsyncComponent(() => import('./components/BridgeFlowChart.vue'))

const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))

const TrafficPrediction = defineAsyncComponent(() => import('./components/TrafficPrediction.vue'))

let componentProps = {}

let componentApi = null

let businessProps = {}

let componentId = 'c-monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
    componentProps = builder.componentProps || {}
    componentApi = builder.componentApi || null
    businessProps = builder.businessProps || {}
    componentId = builder.componentId || 'c-monitor'
  }
} catch (e) {
  console.warn('[cp-流量监测] $mcComponentBuilder 初始化失败:', e)
}

if (componentApi) {
  provide('componentApi', componentApi)
}

const EVENT_ONLOAD = 'monitor-onload'

const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(EVENT_ONLOAD, {
      componentId: componentId,
      timestamp: Date.now()
    })
  }
}

// ==================== 第二部分：行为逻辑 ====================

// 初始化 $mcComponentBuilder（必须 try-catch 包裹，避免框架未就绪时报错）

let runtimeBuilder = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// 组件加载完成事件

const emitMonitorLoad = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  emitMonitorLoad()
})

onUnmounted(() => {
  // 预留：如有需要清理的监听或定时器，在此处执行
  // 当前无额外监听，保留空钩子以保证后续扩展性
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
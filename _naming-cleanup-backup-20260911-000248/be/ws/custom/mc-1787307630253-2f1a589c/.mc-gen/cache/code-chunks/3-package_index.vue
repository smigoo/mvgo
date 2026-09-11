<script setup>
import { defineAsyncComponent, provide } from 'vue'

const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
const TunnelFlowChart = defineAsyncComponent(() => import('./components/TunnelFlowChart.vue'))
const BridgeFlowChart = defineAsyncComponent(() => import('./components/BridgeFlowChart.vue'))
const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))
const TrafficPrediction = defineAsyncComponent(() => import('./components/TrafficPrediction.vue'))

let runtimeBuilder = null
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
</script>
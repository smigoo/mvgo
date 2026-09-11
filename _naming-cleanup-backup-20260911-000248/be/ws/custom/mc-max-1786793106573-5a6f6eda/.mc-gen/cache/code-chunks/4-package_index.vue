<script setup>
import { onMounted, onUnmounted, provide, defineAsyncComponent } from 'vue'
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
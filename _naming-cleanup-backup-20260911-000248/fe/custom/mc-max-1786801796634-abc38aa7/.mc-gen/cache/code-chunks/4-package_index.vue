<script setup>
import { onMounted, onUnmounted, provide } from 'vue'
import SummaryStats from './components/SummaryStats.vue'
import FlowTrend from './components/FlowTrend.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficForecast from './components/TrafficForecast.vue'

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
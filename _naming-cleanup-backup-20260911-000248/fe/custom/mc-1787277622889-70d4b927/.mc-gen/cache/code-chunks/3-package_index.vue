<script setup>
import { defineAsyncComponent, provide } from 'vue'

// --- $mcComponentBuilder 初始化 ---
let runtimeBuilder = null
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
</script>
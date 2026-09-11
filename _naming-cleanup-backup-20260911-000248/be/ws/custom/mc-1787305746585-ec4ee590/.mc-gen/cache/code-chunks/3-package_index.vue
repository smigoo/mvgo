<script setup>
import { defineAsyncComponent, computed, provide } from 'vue'
// === 异步加载子组件 ===
const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))
const FlowForecast = defineAsyncComponent(() => import('./components/FlowForecast.vue'))
// === $mcComponentBuilder 初始化 ===
let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}
// === 提供给子组件 ===
if (componentApi) {
  provide('componentApi', componentApi)
}
provide('businessProps', businessProps)
// === 响应式状态 ===
const theme = computed(() => componentProps?.themeType || 'light')
</script>
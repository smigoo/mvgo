<script setup>
import { defineAsyncComponent } from 'vue'

// --- 框架初始化 ---
let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 子组件引入 ---
const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
const FlowTrend = defineAsyncComponent(() => import('./components/FlowTrend.vue'))
const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))
</script>
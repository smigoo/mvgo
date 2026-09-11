<script setup>
import { defineAsyncComponent } from 'vue'

// --- 子组件异步加载 ---
const TotalStats = defineAsyncComponent(() => import('./components/TotalStats.vue'))
const FlowTrend = defineAsyncComponent(() => import('./components/FlowTrend.vue'))
const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))

// --- 框架初始化 ---
const componentId = 'c-monitor'
let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}
</script>
<script setup>
import { onMounted, onUnmounted } from 'vue'
import TotalStats from './components/TotalStats.vue'
import FlowTrend from './components/FlowTrend.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'

let runtimeBuilder = null
let componentId = 'monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(`${componentId}-onload`, {
      componentId,
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 组件卸载时的清理逻辑
})
</script>
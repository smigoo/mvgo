<script setup>
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'

// --- 子组件异步加载 ---
const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
const TrafficTrend = defineAsyncComponent(() => import('./components/TrafficTrend.vue'))
const VehicleDistribution = defineAsyncComponent(() => import('./components/VehicleDistribution.vue'))

// --- 框架初始化 ---
let runtimeBuilder = null
let componentProps = {}
let businessProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const timeTabs = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])

const activeTime = ref('24h')

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>
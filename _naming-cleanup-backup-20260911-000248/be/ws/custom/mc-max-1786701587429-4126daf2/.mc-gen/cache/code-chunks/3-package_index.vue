<script setup>
import { ref, watch, defineAsyncComponent } from 'vue'

// --- 子组件引入 ---
const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
const MonitorTrend = defineAsyncComponent(() => import('./components/MonitorTrend.vue'))
const MonitorDistribution = defineAsyncComponent(() => import('./components/MonitorDistribution.vue'))

// --- 框架初始化 ---
let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const activeTimeFilter = ref('24h')

const timeFilterOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

// --- 工具函数 ---
const handleTimeFilterChange = (value) => {
  if (activeTimeFilter.value === value) return
  activeTimeFilter.value = value
}

const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
  }
}

// --- 监听器 ---
watch(activeTimeFilter, (newVal) => {
  console.log('[c-monitor] 时间维度切换:', newVal)
})
</script>
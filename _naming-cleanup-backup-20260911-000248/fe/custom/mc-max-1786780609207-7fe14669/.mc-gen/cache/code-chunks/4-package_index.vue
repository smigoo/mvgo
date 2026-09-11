<script setup>
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'

// --- 子组件异步加载 ---
const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
const MonitorTrend = defineAsyncComponent(() => import('./components/MonitorTrend.vue'))
const MonitorDistribution = defineAsyncComponent(() => import('./components/MonitorDistribution.vue'))

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式数据 ---
const timeTabs = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])
const activeTimeTab = ref('24h')

const statsData = ref([
  { label: '总流量', value: '12,450', unit: '辆' },
  { label: '客车流量', value: '8,320', unit: '辆' },
  { label: '货车流量', value: '4,130', unit: '辆' }
])

const trendRef = ref(null)
const distributionRef = ref(null)

// --- 事件处理 ---
const handleTabChange = (value) => {
  if (activeTimeTab.value === value) return
  activeTimeTab.value = value
}

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
  // 清理定时器或事件监听
})
</script>
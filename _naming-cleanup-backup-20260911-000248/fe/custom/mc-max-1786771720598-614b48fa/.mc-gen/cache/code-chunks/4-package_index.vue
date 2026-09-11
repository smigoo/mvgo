<script setup>
import { ref, watch, onMounted, onUnmounted, provide, defineAsyncComponent } from 'vue'

// --- 子组件引入 ---
const TrafficStatCards = defineAsyncComponent(() => import('./components/TrafficStatCards.vue'))
const TrafficTrendChart = defineAsyncComponent(() => import('./components/TrafficTrendChart.vue'))

// --- 框架初始化 ---
let runtimeBuilder = null
let componentId = 'traffic-monitor'
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'traffic-monitor'
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[traffic-monitor] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const timeTabs = ref([
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
])

const activeTab = ref('24h')

// --- 依赖注入 ---
provide('activeTab', activeTab)
provide('runtimeBuilder', runtimeBuilder)

// --- 数据联动 ---
const loadData = () => {
  // 根据 activeTab 加载对应维度的数据
  // 实际业务中通过 componentApi 获取，此处触发子组件更新
  console.log(`[traffic-monitor] 加载数据: ${activeTab.value}`)
}

watch(activeTab, () => {
  loadData()
})

// --- 生命周期 ---
onMounted(() => {
  loadData()
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId,
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理定时器或事件监听
})
</script>
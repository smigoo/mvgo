<script setup>
import { ref, watch, provide, defineAsyncComponent } from 'vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// --- 子组件引入 ---
const TrafficStatCards = defineAsyncComponent(() => import('./components/TrafficStatCards.vue'))
const TrafficTrendChart = defineAsyncComponent(() => import('./components/TrafficTrendChart.vue'))

// --- 响应式状态 ---
const activeTab = ref('24h')

// --- 常量定义 ---
const timeTabs = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
]

// --- 依赖注入 ---
provide('activeTab', activeTab)
provide('runtimeBuilder', runtimeBuilder)

// --- 监听器 ---
watch(activeTab, (newVal, oldVal) => {
  // 时间维度切换逻辑预留
})
</script>
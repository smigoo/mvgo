<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import MonitorStats from './components/MonitorStats.vue'
import MonitorTrend from './components/MonitorTrend.vue'
import MonitorDistribution from './components/MonitorDistribution.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
let componentId = 'monitor'
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const activeTime = ref('24h')

// 向子组件提供当前时间筛选状态，以便子组件根据时间维度刷新数据
provide('activeTime', activeTime)

// --- 事件处理 ---
const handleTimeChange = (value) => {
  if (activeTime.value === value) return
  activeTime.value = value
}

// --- 生命周期 ---
onMounted(() => {
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
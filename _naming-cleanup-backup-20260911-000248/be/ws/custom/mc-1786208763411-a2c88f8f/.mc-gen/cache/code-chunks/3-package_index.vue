<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import EnvMetrics from './components/EnvMetrics.vue'
import EnvTrend from './components/EnvTrend.vue'
import EnvDevices from './components/EnvDevices.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[ff0ff1] $mcComponentBuilder 初始化失败:', e)
}

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('ff0ff1-onload', {
      componentId: 'ff0ff1',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听和定时器
})
</script>
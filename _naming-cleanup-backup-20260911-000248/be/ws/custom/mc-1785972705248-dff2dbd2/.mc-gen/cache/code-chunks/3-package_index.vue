<script setup>
import { onMounted } from 'vue'

// 1. 调用 $mcComponentBuilder 并解构 runtimeBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// 2. 在 onMounted 中触发 onload 事件
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785972203029-cf5fa0f8-onload', {
      componentId: 'mc-max-1785972203029-cf5fa0f8',
      timestamp: Date.now()
    })
  }
})
</script>
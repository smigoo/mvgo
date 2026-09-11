<script setup>
// 第 2/2 部分：行为逻辑

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[traffic-monitor] $mcComponentBuilder 失败:', e)
}

const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 本组件无额外定时器或监听需清理，预留扩展位
})
</script>
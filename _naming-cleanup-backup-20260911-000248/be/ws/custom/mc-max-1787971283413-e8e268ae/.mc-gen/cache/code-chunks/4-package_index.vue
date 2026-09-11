<script setup>
// === 生命周期与事件处理 ===
// 组件加载完成后触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载时清理资源
onUnmounted(() => {
  // 主组件无需清理，子组件各自管理
})
</script>

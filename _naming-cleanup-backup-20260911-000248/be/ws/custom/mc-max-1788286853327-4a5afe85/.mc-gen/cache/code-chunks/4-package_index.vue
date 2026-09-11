<script setup>
// === 生命周期与事件处理 ===
// onMounted - 组件挂载后触发
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// onUnmounted - 组件卸载时清理
onUnmounted(() => {
  // 当前主组件无需特殊清理
  // 子组件各自负责清理自己的资源
})
</script>

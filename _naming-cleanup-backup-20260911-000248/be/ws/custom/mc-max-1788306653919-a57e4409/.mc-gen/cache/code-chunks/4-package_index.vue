<script setup>
// 生命周期：组件挂载后发布 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 生命周期：组件卸载清理
onUnmounted(() => {
  // 主组件无需清理（子组件各自处理）
})
</script>

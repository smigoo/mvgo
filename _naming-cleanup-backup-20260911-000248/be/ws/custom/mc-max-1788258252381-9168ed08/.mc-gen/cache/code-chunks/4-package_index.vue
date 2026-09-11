<script setup>
// 生命周期钩子
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理工作（如果需要的话）
})
</script>

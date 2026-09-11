<script setup>
// 生命周期钩子
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理逻辑（如有）
})
</script>

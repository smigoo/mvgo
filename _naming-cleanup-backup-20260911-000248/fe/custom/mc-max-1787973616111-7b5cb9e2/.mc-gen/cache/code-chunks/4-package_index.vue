<script setup>
// 生命周期钩子
onMounted(() => {
  // 触发组件加载完成事件（businessEvents中声明的onload事件）
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // index.vue无需清理（图表清理由各子组件自行处理）
})
</script>

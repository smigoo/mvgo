<script setup>
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-traffic-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 预留清理逻辑：父组件无监听及定时器，后续如需清理可在此补充
})
</script>
<script setup>
// ===== 生命周期 =====
// 组件挂载完成：发布 onload 事件（微码框架约定）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载：主组件无独立监听器与图表资源需要清理
// 各图表子组件（TunnelHourlyChart / BridgeHourlyChart / FlowPrediction 等）在各自的 onUnmounted 中释放 echarts 实例与 ResizeObserver
onUnmounted(() => {
  // 无清理逻辑
})
</script>
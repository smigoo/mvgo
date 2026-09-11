<script setup>
// ========== 第二部分：生命周期与事件处理 ==========

/**
 * 组件挂载完成后触发
 * - 发布组件加载完成事件，通知微码平台组件已就绪
 */
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

/**
 * 组件卸载前清理
 * - 主组件仅负责组合子组件，无自身监听器与定时器需要清理
 * - 各子组件（流量统计/小时流量/车型分布/流量预测）的生命周期管理
 *   已在各自组件内部实现，由 Vue 框架自动调用其 onUnmounted
 */
onUnmounted(() => {
  // 无主组件级资源需要清理
})
</script>
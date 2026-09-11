<script setup>
// ==================== 生命周期与组件级事件 ====================

/**
 * 组件挂载完成
 * 1. 向微码框架发布 monitor-onload 事件（对应 declare.json businessEvents）
 * 2. 图表初始化由各子组件（TrafficBarSection / ForecastSection 等）在各自 onMounted 中完成
 */
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

/**
 * 组件卸载
 * 1. 当前组件未注册组件级全局监听/定时器，无需额外释放
 * 2. 子组件的 ECharts 实例 / ResizeObserver / 事件监听由各子组件自身的 onUnmounted 负责销毁
 */
onUnmounted(() => {
  // 预留清理入口：若后续增加全局监听/定时器，在此统一释放
})
</script>
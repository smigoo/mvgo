<script setup>
// === 生命周期与事件处理（第 2/3 部分） ===
// 发布组件加载事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

// 挂载时触发加载事件
onMounted(() => {
  emitLoadEvent()
})

// 卸载时清理资源
onUnmounted(() => {
  // 子组件内部自行处理图表销毁和监听器清理
  // 主组件无需额外清理
})
</script>
```
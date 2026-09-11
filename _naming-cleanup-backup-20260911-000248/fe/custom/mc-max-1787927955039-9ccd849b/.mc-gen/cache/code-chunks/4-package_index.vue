<script setup>
// ==================== 第 2/3 部分：生命周期与事件 ====================
// === 生命周期钩子 ===
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
  
  console.log('[设备监测] 组件已加载')
})

onUnmounted(() => {
  console.log('[设备监测] 组件已卸载')
})
// === 事件处理函数 ===
// 本组件为容器组件，所有交互逻辑在子组件内部处理
// index.vue 只负责组合子组件，不包含业务事件处理
</script>

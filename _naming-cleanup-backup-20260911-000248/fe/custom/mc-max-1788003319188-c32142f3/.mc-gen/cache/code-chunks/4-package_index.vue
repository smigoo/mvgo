<script setup>
// onMounted: 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// onUnmounted: 清理资源（子组件各自清理图表）
onUnmounted(() => {
  // 主组件无需额外清理，子组件自行处理 echarts dispose
})
// === 事件处理函数 ===
// 流量预测地点切换（江阴靖江长江隧道 <-> 江阴大桥）
const handleLocationChange = (location) => {
  activeLocation.value = location
  // 子组件 FlowPrediction 会根据 activeLocation 更新图表数据
}
</script>

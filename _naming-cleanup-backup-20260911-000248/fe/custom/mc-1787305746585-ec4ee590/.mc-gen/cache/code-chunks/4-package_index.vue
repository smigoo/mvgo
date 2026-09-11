<script setup>
// ==================== 运行时初始化（$mcComponentBuilder） ====================
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder({
    componentId: 'monitor',
    componentProps: typeof componentProps !== 'undefined' ? componentProps : {},
    componentName: 'monitor'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// ==================== 生命周期 ====================
onMounted(() => {
  // 通知框架：组件已完成挂载
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理轮询定时器 / 全局监听（如有）
})
</script>
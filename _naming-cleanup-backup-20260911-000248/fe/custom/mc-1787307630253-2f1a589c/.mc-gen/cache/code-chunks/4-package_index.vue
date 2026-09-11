<script setup>
// ==================== 第二部分：行为逻辑 ====================

// 初始化 $mcComponentBuilder（必须 try-catch 包裹，避免框架未就绪时报错）
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// 组件加载完成事件
const emitMonitorLoad = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  emitMonitorLoad()
})

onUnmounted(() => {
  // 预留：如有需要清理的监听或定时器，在此处执行
  // 当前无额外监听，保留空钩子以保证后续扩展性
})
</script>
<script setup>
// --- 运行时构建器初始化（try-catch 防止框架未就绪） ---
let runtimeBuilder = null;
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null;
  runtimeBuilder = builder?.runtimeBuilder || null;
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e);
}

// --- 生命周期钩子 ---
onMounted(() => {
  // 触发组件加载完成事件（供框架或外部监听）
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    });
  }
});

onUnmounted(() => {
  // 根组件无全局监听需要清理，保留空实现以符合规范
});
</script>
<script setup>
import { onMounted, onUnmounted } from 'vue'

// 组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载清理
onUnmounted(() => {
  // 清理全局事件监听或定时器（如有）
})
</script>
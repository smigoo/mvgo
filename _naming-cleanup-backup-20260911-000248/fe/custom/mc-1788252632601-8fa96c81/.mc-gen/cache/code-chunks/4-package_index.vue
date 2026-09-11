<script setup>
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 组件卸载时的清理工作
})
</script>
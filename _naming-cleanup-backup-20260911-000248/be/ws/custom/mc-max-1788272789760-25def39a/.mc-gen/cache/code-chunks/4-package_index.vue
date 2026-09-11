<script setup>
import { onMounted, onUnmounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import CategoryTabs from './components/CategoryTabs.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 解构（引用第1部分已声明的变量） ===
// const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// 已在第1部分声明，此处直接使用
// === 生命周期：组件挂载 ===
onMounted(() => {
  // 触发 onload 事件（业务事件规范要求）
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
})
// === 生命周期：组件卸载 ===
onUnmounted(() => {
  // 主组件无需清理资源（无定时器、无图表、无事件监听）
  // 子组件各自处理清理逻辑
})
</script>

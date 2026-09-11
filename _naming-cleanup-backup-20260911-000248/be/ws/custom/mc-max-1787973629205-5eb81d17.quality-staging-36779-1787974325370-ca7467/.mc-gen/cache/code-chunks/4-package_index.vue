<script setup>
import { onMounted, onUnmounted } from 'vue'

// runtimeBuilder 已在第 1 部分通过 $mcComponentBuilder() 解构
// 直接使用第 1 部分声明的 runtimeBuilder

// ============================================================
// 生命周期：组件加载完成事件
// ============================================================
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }

  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  // 触发组件加载完成事件
  emitLoadEvent()
})

onUnmounted(() => {
  // 主组件无需清理资源（子组件各自管理）
})
</script>

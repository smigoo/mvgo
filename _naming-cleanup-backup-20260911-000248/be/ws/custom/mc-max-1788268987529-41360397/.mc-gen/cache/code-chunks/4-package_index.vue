<script setup>
// ========================================
// 第 2/3 部分：生命周期与事件处理
// ========================================
// 注：import / $mcComponentBuilder / ref 等已在第 1 部分定义
// 注：图表初始化逻辑在第 3 部分生成

import { onMounted, onUnmounted } from 'vue'

// 生命周期：组件加载完成
onMounted(() => {
  // 发布组件加载事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 生命周期：组件卸载清理
onUnmounted(() => {
  // 清理逻辑（如有监听器）由子组件各自处理
})
</script>

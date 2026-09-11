<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-env-monitor-verify-r5-c-env-monitor-root">
      <!-- 指标切换tabs区域 -->
      
      <!-- 统计指标区 -->
      
      <!-- 面积图区域 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 在 onMounted 中触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理资源（子组件各自处理自己的清理逻辑）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
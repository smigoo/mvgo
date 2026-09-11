<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1788176720155-9560d082-c-env-monitor-root">
      <!-- 环境类型切换区 -->
      
      <!-- 统计指标区 -->
      
      <!-- 趋势图表区 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onload 事件触发 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[env-monitor] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
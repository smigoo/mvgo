<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-env-monitor-verify-r6-c-env-monitor-root">
      <!-- 指标切换tabs -->
      <TabSwitch />
      
      <!-- 统计指标区 -->
      <StatsIndicator />
      
      <!-- 面积图区域 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import TabSwitch from './components/TabSwitch.vue'
import StatsIndicator from './components/StatsIndicator.vue'
import ChartArea from './components/ChartArea.vue'

// ===== $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） =====
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ===== 主组件状态 =====
// 注：各 section 的具体状态（activeTab、chartRef、legendState 等）由子组件自行管理
// index.vue 仅负责组合子组件，不持有子组件内部的图表/交互状态

// ===== onload 事件触发 =====
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[env-monitor] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

// ===== 生命周期 =====
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 主组件清理逻辑（如有全局监听器需在此移除）
  // 子组件内部的清理由各子组件自行处理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
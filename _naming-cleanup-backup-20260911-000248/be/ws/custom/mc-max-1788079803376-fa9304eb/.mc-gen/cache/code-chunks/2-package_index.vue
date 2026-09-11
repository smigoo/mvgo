<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 标签页切换区 -->
      <TabsSection />
      
      <!-- 图表数据区 -->
      <ChartSection />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import TabsSection from './components/TabsSection.vue'
import ChartSection from './components/ChartSection.vue'

// 🔴 $mcComponentBuilder 直接解构（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 🔴 onload 事件触发
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
  // 清理逻辑（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
</style>

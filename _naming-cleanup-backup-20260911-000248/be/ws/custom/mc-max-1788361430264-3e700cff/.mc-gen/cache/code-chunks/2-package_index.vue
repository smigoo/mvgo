<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <TabsSection />
      <ChartSection />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import TabsSection from './components/TabsSection.vue'
import ChartSection from './components/ChartSection.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

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
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  overflow: hidden;
}
</style>

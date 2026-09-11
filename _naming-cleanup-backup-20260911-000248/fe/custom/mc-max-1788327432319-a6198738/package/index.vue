<template>
  <base-panel class="c-mc-max-1788327432319-a6198738" panelKey="default-panel">
    <template #title_left>
      <SectionHeader />
    </template>

    <div class="c-env-monitor-root">
      <TabsTools />
      <ConcentrationChart />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import TabsTools from './components/TabsTools.vue'
import ConcentrationChart from './components/ConcentrationChart.vue'
// === $mcComponentBuilder 初始化（声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 触发组件加载完成事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
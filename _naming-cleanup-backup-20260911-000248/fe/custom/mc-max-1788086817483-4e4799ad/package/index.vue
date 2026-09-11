<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>
    <div class="c-monitor-body">
      <AlertCards />
      <DeviceGrid />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import AlertCards from './components/AlertCards.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 触发组件加载完成事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-root">
      <TopStats />
      <CategoryStats />
      <DeviceList />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import TopStats from './components/TopStats.vue'
import CategoryStats from './components/CategoryStats.vue'
import DeviceList from './components/DeviceList.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 向子组件提供 API 与事件总线能力 ===
if (componentApi) {
  provide('componentApi', componentApi)
}
if (runtimeBuilder) {
  provide('runtimeBuilder', runtimeBuilder)
}
// === 全局状态（供子组件注入或 Props 传递） ===
const loading = ref(false)
const error = ref(null)
// === 组件加载完成事件 ===
const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: componentProps?.componentId || 'monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 预留清理逻辑入口
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
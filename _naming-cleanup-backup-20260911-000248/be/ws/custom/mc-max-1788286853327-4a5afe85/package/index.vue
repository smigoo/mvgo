<template>
  <base-panel class="c-mc-max-1788286853327-4a5afe85" panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>

    <div class="c-monitor-root">
      <LeftNav />
      
      <div class="c-monitor-main-content">
        <FeaturedDevices />
        <DeviceGrid />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted} from 'vue'

// 子组件引入
import HeaderStats from './components/HeaderStats.vue'
import LeftNav from './components/LeftNav.vue'
import FeaturedDevices from './components/FeaturedDevices.vue'
import DeviceGrid from './components/DeviceGrid.vue'

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

// === $mcComponentBuilder 初始化（已在第 1 部分解构） ===
// 
// === 生命周期：onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
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
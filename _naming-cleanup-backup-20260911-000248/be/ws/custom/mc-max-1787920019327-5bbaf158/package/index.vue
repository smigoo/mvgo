<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <template #header_right>
      <HeaderStats />
    </template>

    <div class="c-mc-max-1787920019327-5bbaf158-c-monitor-root">
      <CategoryTabs class="c-mc-max-1787920019327-5bbaf158-c-monitor-category" />
      <DeviceGrid class="c-mc-max-1787920019327-5bbaf158-c-monitor-grid" />
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-8788.png'


import HeaderStats from './components/HeaderStats.vue'

import CategoryTabs from './components/CategoryTabs.vue'

import DeviceGrid from './components/DeviceGrid.vue'

// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// === 触发 onload 事件 ===

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

import {onUnmounted} from 'vue'

// === 生命周期钩子 ===

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理工作（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
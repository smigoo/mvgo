<template>
  <base-panel class="c-mc-max-1788306653919-a57e4409" panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>

    <div class="c-monitor-root">
      <!-- 左侧导航菜单 -->
      <LeftNav class="c-monitor-left-nav-wrapper" />

      <!-- 主体内容区 -->
      <div class="c-monitor-main-content"><img :src="icon2" class="auto-mounted-icon" alt="icon" /><img :src="icon1" class="auto-mounted-icon" alt="icon" />
        <!-- 设备类型网格 -->
        <DeviceGrid />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon2 from '../resources/images/icon-8817.png'
import icon1 from '../resources/images/icon-8798.png'


import HeaderStats from './components/HeaderStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
import LeftNav from './components/LeftNav.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onMounted 生命周期 ===
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

// 生命周期：组件挂载后发布 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 生命周期：组件卸载清理
onUnmounted(() => {
  // 主组件无需清理（子组件各自处理）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
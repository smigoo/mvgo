<template>
  <base-panel class="c-mc-max-1787845880584-5585e53c" panelKey="default-panel">
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-root">
      <!-- 头部区域 -->
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-header">
        <HeaderTabs />
        <HeaderRightControls />
      </div>

      <!-- 图表区域 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import HeaderRightControls from './components/HeaderRightControls.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
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
<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderTabs />
      <ChartControls />
    </template>
    
    <div class="c-env-monitor-root">
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import ChartControls from './components/ChartControls.vue'
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

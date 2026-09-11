<template>
  <base-panel class="c-mc-max-1788330634941-53e4d387" panelKey="default-panel">
    <template #title_left>
      <SectionHeader />
    </template>
    <div class="c-env-monitor-root">
      <SectionToolbar />
      <SectionChart />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionToolbar from './components/SectionToolbar.vue'
import SectionChart from './components/SectionChart.vue'

// 一次调用 $mcComponentBuilder 并直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件（环境监测 onload）
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
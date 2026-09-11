<template>
  <base-panel class="c-mc-max-1787845880584-5585e53c" panelKey="default-panel">
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-root">
      <!-- Section 1: 面板标题 -->
      <TitleSection />

      <!-- Section 2: 监测指标切换栏 -->
      <TabsSection />

      <!-- Section 3: CO浓度趋势图 -->
      <ChartSection />
    </div>
  </base-panel>
</template>
<script setup>
import { onMounted } from 'vue'
import TitleSection from './components/TitleSection.vue'
import TabsSection from './components/TabsSection.vue'
import ChartSection from './components/ChartSection.vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
})
</script>



<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
<template>
  <base-panel class="c-mc-max-1788320154844-b1606ec4" panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 标题区 -->
      <SectionHeader />
      <!-- Tab切换与工具栏 -->
      <SectionControls />
      <!-- 浓度趋势图 -->
      <SectionChart />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
// 引入三个分区子组件（标题区 / Tab切换与工具栏 / 浓度趋势图）
import SectionHeader from './components/SectionHeader.vue'
import SectionControls from './components/SectionControls.vue'
import SectionChart from './components/SectionChart.vue'

// 微码组件构建器：直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成后触发 onload 业务事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
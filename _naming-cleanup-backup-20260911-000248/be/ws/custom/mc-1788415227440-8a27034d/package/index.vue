<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value c-monitor-header-stat-value--primary">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <HeaderStatsBanner />
      <div class="c-monitor-content-wrapper">
        <DeviceCategoryTabs />
        <MainContent />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderStatsBanner from './components/HeaderStatsBanner.vue'
import DeviceCategoryTabs from './components/DeviceCategoryTabs.vue'
import MainContent from './components/MainContent.vue'

// $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 在 onMounted 中触发 onload 事件
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
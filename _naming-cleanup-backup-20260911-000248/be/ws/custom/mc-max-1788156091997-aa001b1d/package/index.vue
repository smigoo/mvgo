<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-mc-max-1788156091997-aa001b1d-c-env-monitor-header-icons">
        <img class="c-mc-max-1788156091997-aa001b1d-c-env-monitor-icon" alt="图表图标" />
        <img class="c-mc-max-1788156091997-aa001b1d-c-env-monitor-icon" alt="文档图标" />
      </div>
    </template>

    <div class="c-mc-max-1788156091997-aa001b1d-c-env-monitor-root">
      <!-- 1. 指标切换tabs区 -->

      <!-- 2. 面积图区域 -->
      <ChartArea
        :chart-type="activeTab"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 调用（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 当前激活的 tab
const activeTab = ref('co')

// Tab 切换处理
const handleTabChange = (tabValue) => {
  activeTab.value = tabValue
}

// onload 事件
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
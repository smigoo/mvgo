<template>
  <base-panel class="c-mc-max-1788413658506-08ed48ff" panelKey="default-panel">
    <template #header-right>
      <HeaderStats />
    </template>

    <!-- 默认插槽：主体内容区 -->
    <div class="c-monitor-body">
      <SummaryCards />
      <MainContent />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import MainContent from './components/MainContent.vue'

// 唯一调用 $mcComponentBuilder，直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

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
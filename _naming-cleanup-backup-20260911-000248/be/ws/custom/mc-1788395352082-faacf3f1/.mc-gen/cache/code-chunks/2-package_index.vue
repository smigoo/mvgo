<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>
    
    <div class="c-monitor-root">
      <SummaryCards />
      <MainContent />
    </div>
  </base-panel>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'

const HeaderStats = defineAsyncComponent(() => import('./components/HeaderStats.vue'))
const SummaryCards = defineAsyncComponent(() => import('./components/SummaryCards.vue'))
const MainContent = defineAsyncComponent(() => import('./components/MainContent.vue'))
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
</style>
<template>
  <div class="c-monitor-main-content">
    <TabSidebar />
    <DeviceGrid />
  </div>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'

const TabSidebar = defineAsyncComponent(() => import('./TabSidebar.vue'))
const DeviceGrid = defineAsyncComponent(() => import('./DeviceGrid.vue'))
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
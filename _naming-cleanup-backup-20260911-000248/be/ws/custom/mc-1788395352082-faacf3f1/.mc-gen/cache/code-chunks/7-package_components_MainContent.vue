<template>
  <div class="c-monitor-main-content">
    <TabSidebar :active-tab="activeTab" @change="handleTabChange" />
    <DeviceGrid :active-tab="activeTab" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TabSidebar from './TabSidebar.vue'
import DeviceGrid from './DeviceGrid.vue'

const activeTab = ref('monitor')

const handleTabChange = (tabValue) => {
  activeTab.value = tabValue
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-content {
  display: flex;
  flex-direction: row;
  gap: 0;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}
</style>

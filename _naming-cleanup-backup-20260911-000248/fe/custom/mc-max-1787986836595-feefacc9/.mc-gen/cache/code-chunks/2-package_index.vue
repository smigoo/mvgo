<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value c-monitor-header-stat-value-good">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <SectionStatsCards :business-config="businessConfig" />
      <SectionDeviceGrid :business-config="businessConfig" />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import SectionStatsCards from './components/SectionStatsCards.vue'
import SectionDeviceGrid from './components/SectionDeviceGrid.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const businessConfig = computed(() => ({
  dataRefreshInterval: businessProps?.dataRefreshInterval ?? 60000,
  showTimeSelector: businessProps?.showTimeSelector !== false
}))

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('c-monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>

<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stats">
        <div class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat">
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-label">设备类型</span>
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat">
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-label">设备总数</span>
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat">
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-label">完好率</span>
          <span class="c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-value c-mc-max-1787986836595-feefacc9-c-monitor-header-stat-value-normal">98%</span>
        </div>
      </div>
    </template>

    <div class="c-mc-max-1787986836595-feefacc9-c-monitor-root">
      <SectionStatsCards />
      <SectionDeviceGrid />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionStatsCards from './components/SectionStatsCards.vue'
import SectionDeviceGrid from './components/SectionDeviceGrid.vue'

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
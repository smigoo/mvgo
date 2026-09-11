<template>
  <base-panel class="c-mc-max-1787814814517-5a36c1ea" panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>
    
    <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-body">
      <SummaryCards />
      <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-list-wrapper">
        <Nav />
        <DeviceListArea />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import Nav from './components/Nav.vue'
import DeviceListArea from './components/DeviceListArea.vue'

const { runtimeBuilder } = $mcComponentBuilder()

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
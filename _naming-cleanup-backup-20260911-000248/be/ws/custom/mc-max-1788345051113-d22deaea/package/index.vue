<template>
  <base-panel class="c-mc-max-1788345051113-d22deaea" panelKey="default-panel">
    <div class="c-env-monitor-root">
      <SectionHeader />
      <SectionControls />
      <SectionChart />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionControls from './components/SectionControls.vue'
import SectionChart from './components/SectionChart.vue'

const { runtimeBuilder } = $mcComponentBuilder()

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
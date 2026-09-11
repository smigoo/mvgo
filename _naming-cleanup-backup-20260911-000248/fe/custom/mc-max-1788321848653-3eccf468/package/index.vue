<template>
  <base-panel class="c-mc-max-1788321848653-3eccf468" panelKey="default-panel">
    <template #title_left>
      <SectionHeader />
    </template>

    <SectionContent />
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionContent from './components/SectionContent.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

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
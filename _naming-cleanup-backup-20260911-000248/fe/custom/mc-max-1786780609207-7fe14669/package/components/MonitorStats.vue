<template>
  <div class="c-monitor-stats-container">
    <div v-for="(stat, index) in stats" :key="stat.label" class="c-monitor-stats-item">
      <div class="c-monitor-stats-label">{{ stat.label }}</div>
      <div class="c-monitor-stats-value-wrapper">
        <span class="c-monitor-stats-value">{{ stat.value }}</span>
        <span v-if="stat.unit" class="c-monitor-stats-unit">{{ stat.unit }}</span>
      </div>
    </div>
    <div v-if="icons[2]" class="c-monitor-stats-center" aria-hidden="true">
      <img :src="icons[2]" alt="" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  stats: { type: Array, default: () => [] },
  icons: { type: Array, default: () => [] }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>

<template>
  <div class="c-monitor-stats-container">
    <div v-for="(stat, index) in stats" :key="index" class="c-monitor-stats-item">
      <div class="c-monitor-stats-label">{{ stat.label }}</div>
      <div class="c-monitor-stats-value-wrapper">
        <span class="c-monitor-stats-value">{{ stat.value }}</span>
        <span v-if="stat.unit" class="c-monitor-stats-unit">{{ stat.unit }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stats: {
    type: Array,
    default: () => []
  },
  icons: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
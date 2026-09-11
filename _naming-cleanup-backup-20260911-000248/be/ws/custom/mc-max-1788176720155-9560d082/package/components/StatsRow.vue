<template>
  <div class="c-mc-max-1788176720155-9560d082-c-env-monitor-stats-row">
<div v-for="(stat, index) in stats" :key="index" class="c-env-monitor-stat-item" >
      <span class="c-mc-max-1788176720155-9560d082-c-env-monitor-stat-label">{{ stat.label }}</span>
      <span class="c-mc-max-1788176720155-9560d082-c-env-monitor-stat-value">{{ stat.value }}</span>
      <span v-if="stat.unit" class="c-mc-max-1788176720155-9560d082-c-env-monitor-stat-unit">{{ stat.unit }}</span>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

defineProps({
  stats: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
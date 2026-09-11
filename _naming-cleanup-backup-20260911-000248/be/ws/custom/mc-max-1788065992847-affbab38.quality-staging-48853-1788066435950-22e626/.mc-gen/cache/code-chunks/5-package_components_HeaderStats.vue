<template>
  <div class="c-monitor-header-stats" :style="{ backgroundImage: `url(${bg2})` }">
    <div
      v-for="(stat, index) in stats"
      :key="index"
      class="c-monitor-stat-item"
    >
      <span class="c-monitor-stat-label">{{ stat.label }}</span>
      <span
        class="c-monitor-stat-value"
        :style="{ color: stat.valueColor }"
      >{{ stat.value }}</span>
    </div>
  </div>
</template>

<script setup>
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
<template>
  <div class="c-device-monitor-line2">
    <span class="c-device-monitor-summary-label">异常数:</span>
    <span class="c-device-monitor-summary-value-error">{{ anomalyCount }}</span>
  </div>
</template>

<script setup>
defineProps({
  anomalyCount: {
    type: [String, Number],
    default: '3'
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}
</style>
<template>
  <div class="c-env-monitor-stats-value">
    <div class="c-env-monitor-value-group">
      <span class="c-env-monitor-value-text">{{ statsData.value }}</span>
      <span class="c-env-monitor-value-unit">{{ statsData.unit }}</span>
    </div>
    <div class="c-env-monitor-warning-line">{{ statsData.warningLabel }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  statsData: {
    type: Object,
    required: true,
    default: () => ({
      value: '2k3+785',
      unit: 'CO浓度',
      warningLabel: '预警线'
    })
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-value {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 0;
  min-height: 0;
}

.c-env-monitor-value-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-env-monitor-value-text {
  font-size: calc(@fontSize * 0.857); // 12px
  color: rgba(0, 0, 0, 0.85);
  font-weight: normal;
  line-height: 1;
}

.c-env-monitor-value-unit {
  font-size: calc(@fontSize * 0.857); // 12px
  color: rgba(0, 0, 0, 0.65);
  font-weight: normal;
  line-height: 1;
}

.c-env-monitor-warning-line {
  font-size: calc(@fontSize * 0.857); // 12px
  color: rgba(245, 34, 45, 1);
  font-weight: normal;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>

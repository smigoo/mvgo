<template>
  <div class="c-env-monitor-stats-overview">
    <div class="c-env-monitor-stats-item">
      <img 
        v-if="pointIcon" 
        :src="pointIcon" 
        class="c-env-monitor-stats-icon" 
        alt="监测点位" 
      />
      <div class="c-env-monitor-stats-info">
        <span class="c-env-monitor-stats-label">监测点位</span>
        <span class="c-env-monitor-stats-value">{{ pointCount }}</span>
      </div>
    </div>
    
    <div class="c-env-monitor-stats-item">
      <img 
        v-if="alarmIcon" 
        :src="alarmIcon" 
        class="c-env-monitor-stats-icon" 
        alt="当前告警" 
      />
      <div class="c-env-monitor-stats-info">
        <span class="c-env-monitor-stats-label">当前告警</span>
        <span class="c-env-monitor-stats-value c-env-monitor-stats-value--danger">{{ alarmCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// --- 组件属性 ---
const props = defineProps({
  pointIcon: {
    type: String,
    default: ''
  },
  alarmIcon: {
    type: String,
    default: ''
  },
  pointCount: {
    type: Number,
    default: 0
  },
  alarmCount: {
    type: Number,
    default: 0
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-overview {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
}

.c-env-monitor-stats-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-stats-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-env-monitor-stats-info {
  display: flex;
  flex-direction: column;
}

.c-env-monitor-stats-label {
  font-size: 12px;
  color: #666666;
  line-height: 16px;
}

.c-env-monitor-stats-value {
  font-size: 18px;
  font-weight: 600;
  color: #333333;
  line-height: 24px;

  &--danger {
    color: #f53f3f;
  }
}
</style>
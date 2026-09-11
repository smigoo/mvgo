<template>
  <div class="c-monitor-alert-cards">
    <div
      v-for="(card, index) in cards"
      :key="index"
      class="c-monitor-alert-card"
      :style="{ backgroundImage: `url(${card.bg})` }"
    >
      <img :src="card.icon" class="c-monitor-alert-icon" />
      <div class="c-monitor-alert-content">
        <div class="c-monitor-alert-label">{{ card.label }}</div>
        <div class="c-monitor-alert-stats">
          <div class="c-monitor-alert-stat-item">
            <span class="c-monitor-alert-stat-label">总数:</span>
            <span class="c-monitor-alert-stat-value">{{ card.total }}</span>
          </div>
          <div class="c-monitor-alert-stat-item">
            <span class="c-monitor-alert-stat-label">异常数:</span>
            <span class="c-monitor-alert-stat-value c-monitor-alert-stat-value--error">{{ card.abnormal }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const cards = ref([
  {
    label: '隧道设备',
    total: 56302,
    abnormal: 3,
    icon: icon1,
    bg: bg3
  },
  {
    label: '房屋建筑设备',
    total: 1280,
    abnormal: 3,
    icon: icon2,
    bg: bg4
  }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-alert-cards {
height: 100%;

  display: flex;
  gap: 12px;
  width: 100%;
  margin-bottom: 12px;
}

.c-monitor-alert-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 8px;
  min-height: 64px;
}

.c-monitor-alert-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
}

.c-monitor-alert-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-alert-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.c-monitor-alert-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-alert-stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-monitor-alert-stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.c-monitor-alert-stat-value {
  font-size: 20px;
  font-weight: bold;
  color: rgba(255, 255, 255, 1);
}

.c-monitor-alert-stat-value--error {
  color: rgba(255, 77, 79, 1);
}
</style>

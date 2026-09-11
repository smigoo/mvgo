<template>
  <div class="c-monitor-total-traffic">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrap">
        <img :src="icon1" class="c-monitor-section-icon" alt="icon" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-time-select">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">本周</a-select-option>
        <a-select-option value="30d">本月</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片 -->
    <div class="c-monitor-stats-container" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">34,620</div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-monitor-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-time-select {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

:deep(.ant-select-selection-item) {
  color: #333333;
  font-size: 14px;
}

.c-monitor-stats-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  height: 91px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 0 40px;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.c-monitor-stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-stat-value {
  font-size: 24px;
  font-weight: 900;
  color: #1990ff;
  line-height: 1.2;
}
</style>
```
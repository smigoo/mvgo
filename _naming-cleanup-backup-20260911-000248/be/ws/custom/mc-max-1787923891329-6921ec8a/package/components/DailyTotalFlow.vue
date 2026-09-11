<template>
  <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-daily-total-flow">
    <!-- 标题栏 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-header">
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-title-group" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '426px 91px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <img :src="icon1" class="c-mc-max-1787923891329-6921ec8a-c-monitor-title-icon" alt="" />
        <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-title">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-mc-max-1787923891329-6921ec8a-c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片区域 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stats-container" :style="{ backgroundImage: `url(${bg1})` }">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-card">
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-value">34,620</div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-card">
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-label">江阴大桥</div>
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-stat-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

// 时间范围
const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total-flow {
height: 100%;

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

.c-monitor-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-time-selector {
  width: 100px;

  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    height: 30px;
    padding: 0 8px;
  }

  :deep(.ant-select-selection-item) {
    font-size: 14px;
    color: #333333;
    line-height: 28px;
  }

  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-stats-container {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 60px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  position: relative;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-align: center;
}

.c-monitor-stat-value {
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  text-align: center;
}

.c-monitor-stat-card:first-child .c-monitor-stat-value {
  color: #006fe3;
}

.c-monitor-stat-card:last-child .c-monitor-stat-value {
  color: #0c9dbe;
}
</style>
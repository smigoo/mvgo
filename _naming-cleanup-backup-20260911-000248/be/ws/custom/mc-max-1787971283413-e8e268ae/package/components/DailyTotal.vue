<template>
  <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-total">
    <!-- 头部：标题 + 时间选择器 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-header"><img :src="icon2" class="auto-mounted-icon" alt="icon" />
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-title">
        <img :src="icon1" class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-icon" alt="icon" />
        <span class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-mc-max-1787971283413-e8e268ae-c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">本周</a-select-option>
        <a-select-option value="30d">本月</a-select-option>
      </a-select>
    </div>

    <!-- 数据卡片区：背景图 + 3个统计项 -->
    <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-daily-body" :style="{ backgroundImage: `url(${bg1})` }">
      <!-- 左侧：江阴靖江长江隧道 -->
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-stat-card">
        <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-stat-value">34,620</div>
      </div>

      <!-- 中间：装饰图标（地图图标） -->
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-decoration-icon">
        <img :src="bgm" alt="decoration" class="c-mc-max-1787971283413-e8e268ae-c-monitor-decoration-img" />
      </div>

      <!-- 右侧：江阴大桥 -->
      <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-stat-card">
        <div class="c-mc-max-1787971283413-e8e268ae-c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value c-mc-max-1787971283413-e8e268ae-c-monitor-stat-value-secondary">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

// 资源变量（系统注入，不要手写 import）
// icon1, bg1, bgm 已由系统注入

// 时间范围选择
const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@color-text-title: #333333;

@import '../../resources/styles/index.less';

.c-monitor-daily-total {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-daily-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-title-text {
  font-size: 16px;
  font-weight: 500;
  color: @color-text-title;
  line-height: 24px;
}

.c-monitor-time-selector {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  height: 30px;
}

:deep(.ant-select-selection-item) {
  font-size: 14px;
  color: #333333;
  line-height: 22px;
}

:deep(.ant-select-arrow) {
  color: #a8abb2;
}

.c-monitor-daily-body {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
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
  color: #333333;
  line-height: 24px;
}

.c-monitor-stat-value {
  font-size: 24px;
  font-weight: 900;
  color: #006fe3;
  line-height: 28px;
  font-family: Roboto, sans-serif;
}

.c-monitor-stat-value-secondary {
  color: #0c9dbe;
}

.c-monitor-decoration-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 62px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-decoration-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
<template>
  <div class="c-monitor-daily-total">
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon5" class="c-monitor-daily-title-icon" alt="标题图标" />
        <span class="c-monitor-daily-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-daily-select">
        <a-select
          v-model:value="selectedTime"
          :options="timeOptions"
          class="c-monitor-daily-select-trigger"
          popupClassName="c-monitor-daily-select-popup"
        >
          <template #suffixIcon>
            <img :src="icon4" class="c-monitor-daily-select-arrow" alt="下拉箭头" />
          </template>
        </a-select>
      </div>
    </div>
    <div class="c-monitor-daily-body" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-stat-card c-monitor-stat-card--left">
        <span class="c-monitor-stat-label">江阴大桥</span>
        <span class="c-monitor-stat-value c-monitor-stat-value--bridge">82,379</span>
      </div>
      <div class="c-monitor-stat-card c-monitor-stat-card--right">
        <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-stat-value c-monitor-stat-value--tunnel">34,620</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量 bg1, icon4, icon5 由系统自动注入，无需 import

const selectedTime = ref('24小时')
const timeOptions = [
  { label: '24小时', value: '24小时' }
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  width: 100%;
  flex-shrink: 0;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-daily-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-daily-select {
  margin-left: auto;
}

.c-monitor-daily-select-trigger {
  width: 100px;

  :deep(.ant-select-selector) {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    height: 30px;
    line-height: 30px;
    display: flex;
    align-items: center;
    justify-content: flex-end;

    .ant-select-selection-item {
      font-family: 'Source Han Sans CN', sans-serif;
      font-size: 14px;
      line-height: 22px;
      color: #333333;
      margin-right: 6px;
    }
  }

  :deep(.ant-select-arrow) {
    display: none;
  }
}

.c-monitor-daily-select-arrow {
  width: 8px;
  height: 4px;
  display: block;
}

.c-monitor-daily-body {
  width: 100%;
  height: 91px;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-sizing: border-box;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 52px;

  &--left {
    align-items: flex-start;
  }

  &--right {
    align-items: flex-end;
  }
}

.c-monitor-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;

  &--bridge {
    color: #0c9dbe;
  }

  &--tunnel {
    color: #006fe3;
  }
}
</style>
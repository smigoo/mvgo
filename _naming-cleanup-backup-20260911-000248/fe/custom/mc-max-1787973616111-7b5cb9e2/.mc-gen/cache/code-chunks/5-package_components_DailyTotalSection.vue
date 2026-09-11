<template>
  <div class="c-monitor-daily-total">
    <!-- 头部：标题 + 时间选择下拉框 -->
    <div class="c-monitor-daily-total-header">
      <div class="c-monitor-daily-total-title">
        <img :src="icon1" class="c-monitor-daily-total-icon" />
        <span class="c-monitor-daily-total-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-daily-total-select" :bordered="false">
        <a-select-option value="24h">24小时</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片区域（带背景图） -->
    <div class="c-monitor-daily-total-stats" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }">
      <div class="c-monitor-daily-total-stat-item">
        <div class="c-monitor-daily-total-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-daily-total-stat-value tunnel">34,620</div>
      </div>
      <div class="c-monitor-daily-total-stat-item">
        <div class="c-monitor-daily-total-stat-label">江阴大桥</div>
        <div class="c-monitor-daily-total-stat-value bridge">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 时间范围选择
const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-daily-total-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-total-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-daily-total-select {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    height: 30px !important;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: 14px;
    color: #333333;
    line-height: 30px !important;
  }
  
  :deep(.ant-select-arrow) {
    color: #333333;
  }
}

.c-monitor-daily-total-stats {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  overflow: hidden;
}

.c-monitor-daily-total-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-total-stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-daily-total-stat-value {
  font-size: 24px;
  font-weight: 900;
  font-family: 'Roboto', sans-serif;
  
  &.tunnel {
    color: #006fe3;
  }
  
  &.bridge {
    color: #0c9dbe;
  }
}
</style>
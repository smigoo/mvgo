<template>
  <div class="c-monitor-daily-total-flow">
    <!-- 标题栏 -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <a-select
        v-model:value="timeRange"
        class="c-monitor-time-selector"
        :options="timeOptions"
        @change="handleTimeChange"
      />
    </div>

    <!-- 统计数据区 -->
    <div
      class="c-monitor-stats-container"
      :style="{ backgroundImage: `url(${bgm})` }"
    >
      <div class="c-monitor-stat-card c-monitor-stat-tunnel">
        <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-stat-value">34,620</span>
      </div>
      <div class="c-monitor-stat-card c-monitor-stat-bridge">
        <span class="c-monitor-stat-label">江阴大桥</span>
        <span class="c-monitor-stat-value">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 时间范围选项
const timeOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

// 当前选中的时间范围
const timeRange = ref('24h')

// 时间范围切换处理
const handleTimeChange = (value) => {
  console.log('[DailyTotalFlow] 时间范围切换:', value)
  // 后续可在此处调用 API 刷新数据
}
</script>

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-daily-total-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
}

.c-monitor-time-selector {
  width: 100px;

  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
  }

  :deep(.ant-select-selection-item) {
    font-size: 14px;
    color: #333333;
  }

  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-stats-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  height: 91px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  padding: 0 24px;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-stat-tunnel {
  align-items: flex-end;
}

.c-monitor-stat-bridge {
  align-items: flex-start;
}

.c-monitor-stat-label {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
}

.c-monitor-stat-value {
  font-family: Roboto, sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  color: #006fe3;
}

.c-monitor-stat-tunnel .c-monitor-stat-value {
  color: #006fe3;
}

.c-monitor-stat-bridge .c-monitor-stat-value {
  color: #0c9dbe;
}
</style>
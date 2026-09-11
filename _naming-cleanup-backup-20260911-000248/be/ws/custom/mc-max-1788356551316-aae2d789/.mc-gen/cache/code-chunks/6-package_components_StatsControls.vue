<template>
  <div class="c-env-monitor-stats-controls">
    <!-- 当前数值区域 -->
    <div class="c-env-monitor-stat-group">
      <span class="c-env-monitor-stat-label">当前</span>
      <span class="c-env-monitor-stat-value">{{ currentValue }}</span>
    </div>

    <!-- 阈值信息区域 -->
    <div class="c-env-monitor-stat-range">
      <span class="c-env-monitor-stat-location">{{ thresholdInfo.location }}</span>
      <span class="c-env-monitor-stat-threshold">{{ thresholdInfo.label }}</span>
    </div>

    <!-- 视图切换按钮区域 -->
    <div class="c-env-monitor-view-toggle">
      <img
        :src="icon2"
        class="c-env-monitor-toggle-icon"
        :class="{ 'c-env-monitor-toggle-icon-active': viewMode === 'chart' }"
        alt="图表视图"
        title="图表视图"
        @click="handleViewChange('chart')"
      />
      <img
        :src="icon1"
        class="c-env-monitor-toggle-icon"
        :class="{ 'c-env-monitor-toggle-icon-active': viewMode === 'list' }"
        alt="列表视图"
        title="列表视图"
        @click="handleViewChange('list')"
      />
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

// 系统注入资源变量，禁止手写 import
// icon1 = 列表视图图标（icon-7941.png）
// icon2 = 图表视图图标（icon-7945.png）

const props = defineProps({
  currentValue: {
    type: Number,
    default: 40
  },
  thresholdInfo: {
    type: Object,
    default: () => ({
      location: 'zk3+785CO浓度',
      label: '预警线'
    })
  },
  viewMode: {
    type: String,
    default: 'chart'
  }
})

const emit = defineEmits(['view-change'])

const handleViewChange = (mode) => {
  emit('view-change', mode)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 4px 8px;
  box-sizing: border-box;
  width: 100%;
}

.c-env-monitor-stat-group {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
}

.c-env-monitor-stat-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(153, 153, 153, 1);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-stat-value {
  font-size: calc(@fontSize * 1.714);
  font-weight: 700;
  color: rgba(0, 0, 0, 0.85);
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-stat-range {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: 1;
  min-width: 0;
  padding: 0 8px;
}

.c-env-monitor-stat-location {
  font-size: calc(@fontSize * 0.857);
  color: rgba(153, 153, 153, 1);
  white-space: nowrap;
  text-align: right;
}

.c-env-monitor-stat-threshold {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 77, 79, 1);
  white-space: nowrap;
  text-align: right;
}

.c-env-monitor-view-toggle {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-env-monitor-toggle-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-toggle-icon-active {
  opacity: 1;
}
</style>
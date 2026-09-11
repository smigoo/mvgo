<template>
  <div class="c-monitor-header-stats-banner">
    <div class="c-monitor-header-stat-title">设备监测</div>
    
    <div class="c-monitor-header-stats-group">
      <div class="c-monitor-header-stat-item">
        <img :src="icon1" class="c-monitor-header-stat-icon" alt="" />
        <span class="c-monitor-header-stat-label">设备类型</span>
        <span class="c-monitor-header-stat-value">28</span>
      </div>
      
      <div class="c-monitor-header-stat-item">
        <img :src="icon1" class="c-monitor-header-stat-icon" alt="" />
        <span class="c-monitor-header-stat-label">设备总数</span>
        <span class="c-monitor-header-stat-value">68562</span>
      </div>
      
      <div class="c-monitor-header-stat-item">
        <span class="c-monitor-header-stat-label">完好率</span>
        <span class="c-monitor-header-stat-value c-monitor-header-stat-value--primary">98%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'

const icon1 = inject('icon1', null)
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats-banner {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  flex-shrink: 0;
}

.c-monitor-header-stat-title {
  font-size: calc(@fontSize * 1.14);
  font-weight: @fontWeightStrong;
  color: @color-primary;
}

.c-monitor-header-stats-group {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-left: auto;
}

.c-monitor-header-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-header-stat-label {
  font-size: @fontSize;
  color: @color-text-base;
}

.c-monitor-header-stat-value {
  font-size: calc(@fontSize * 1.14);
  font-weight: @fontWeightStrong;
  color: @color-primary;
}

.c-monitor-header-stat-value--primary {
  color: @color-success;
}
</style>

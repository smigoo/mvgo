<template>
  <div class="c-monitor-header-stats">
    <!-- 设备监测图标 -->
    <div class="c-monitor-header-item c-monitor-header-device">
      <img :src="icon1" class="c-monitor-header-icon" alt="设备监测" />
      <span class="c-monitor-header-label">设备监测</span>
    </div>

    <!-- 设备类型统计 -->
    <div class="c-monitor-header-item c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value">28</span>
    </div>

    <!-- 设备总数统计 -->
    <div class="c-monitor-header-item c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value c-monitor-header-stat-value-primary">68562</span>
    </div>

    <!-- 完好率统计 -->
    <div class="c-monitor-header-item c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value c-monitor-header-stat-value-accent">98%</span>
    </div>
  </div>
</template>

<script setup>
// 图标资源由系统自动注入，无需手动 import
// icon1 对应设备监测图标
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 16px;
}

.c-monitor-header-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-header-device {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-header-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.c-monitor-header-label {
  font-size: 14px;
  color: @color-text-base;
  white-space: nowrap;
}

.c-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-label {
  font-size: 14px;
  color: @color-text-secondary;
  white-space: nowrap;
}

.c-monitor-header-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  color: @color-text-base;
}

.c-monitor-header-stat-value-primary {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.c-monitor-header-stat-value-accent {
  color: @color-accent;
}
</style>
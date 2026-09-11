<template>
  <div class="c-monitor-header-stats">
    <!-- 设备监测统计 -->
    <div class="c-monitor-stat-group">
      <span class="c-monitor-stat-label">设备监测</span>
      <div class="c-monitor-stat-items">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">设备类型</span>
          <span class="c-monitor-stat-item-value">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">设备总数</span>
          <span class="c-monitor-stat-item-value">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">完好率</span>
          <span class="c-monitor-stat-item-value c-monitor-stat-value-success">98%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 无需额外逻辑，纯静态展示
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 24px;
}

.c-monitor-stat-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 1);
  font-weight: 700;
  color: @color-text-primary;
}

.c-monitor-stat-items {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-item-label {
  font-size: calc(@fontSize * 1);
  color: @color-text-secondary;
}

.c-monitor-stat-item-value {
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  color: @color-primary;
}

.c-monitor-stat-value-success {
  color: @color-success;
}
</style>

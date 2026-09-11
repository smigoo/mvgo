<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value">28</span>
    </div>
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value">68562</span>
    </div>
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value c-monitor-header-stat-value--success">98%</span>
    </div>
  </div>
</template>

<script setup>
// 面板头部统计指标：设备类型 / 设备总数 / 完好率
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.c-monitor-header-stat {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-header-stat-label {
  font-size: @fontSize;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  line-height: 21px;
}

.c-monitor-header-stat-value {
  font-size: (@fontSize + 6px);
  font-weight: 700;
  color: rgba(25, 144, 255, 1);
  line-height: 23px;
}

.c-monitor-header-stat-value--success {
  color: rgba(8, 163, 165, 1);
}
</style>
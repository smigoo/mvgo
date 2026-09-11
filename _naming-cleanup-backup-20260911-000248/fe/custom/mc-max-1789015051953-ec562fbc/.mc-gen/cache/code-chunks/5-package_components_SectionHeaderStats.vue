<template>
  <div class="c-device-monitor-header-stats">
    <!-- 设备类型 -->
    <div class="c-device-monitor-frame-2136638825">
      <span class="c-device-monitor-stat-label">设备类型</span>
      <span class="c-device-monitor-stat-value-primary">28</span>
    </div>
    <!-- 设备总数 -->
    <div class="c-device-monitor-frame-2136638826">
      <span class="c-device-monitor-stat-label">设备总数</span>
      <span class="c-device-monitor-stat-value-primary">68562</span>
    </div>
    <!-- 完好率 -->
    <div class="c-device-monitor-frame-2136638827">
      <span class="c-device-monitor-stat-label">完好率</span>
      <span class="c-device-monitor-stat-value-success">98%</span>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-header-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.c-device-monitor-frame-2136638825,
.c-device-monitor-frame-2136638826,
.c-device-monitor-frame-2136638827 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
}

.c-device-monitor-stat-value-primary {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  color: var(--colorPrimary, #1990ff);
  white-space: nowrap;
}

.c-device-monitor-stat-value-success {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  color: var(--colorSuccess, #08a3a5);
  white-space: nowrap;
}
</style>
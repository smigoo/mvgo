<template>
  <div class="c-device-monitor-frame-2136638825">
    <span class="c-device-monitor-stat-label">设备类型</span>
    <span class="c-device-monitor-stat-value-primary">28</span>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-frame-2136638825 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  width: 80px;
  height: 23px;
  flex-shrink: 0;
}

.c-device-monitor-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  line-height: 21px;
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-stat-value-primary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  line-height: 23px;
  color: var(--colorPrimary, #1990ff);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
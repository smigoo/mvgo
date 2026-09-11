<template>
  <div class="c-device-monitor-line1">
    <span class="c-device-monitor-summary-label">总数:</span>
    <span class="c-device-monitor-summary-value-primary">1280</span>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-line1 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  line-height: 21px;
  color: var(--colorTextBase, #333333);
}

.c-device-monitor-summary-value-primary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  line-height: 23px;
  color: var(--colorPrimary, #1990ff);
}
</style>
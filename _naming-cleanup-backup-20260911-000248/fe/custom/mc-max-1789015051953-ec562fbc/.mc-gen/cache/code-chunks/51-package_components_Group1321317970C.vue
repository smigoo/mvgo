<template>
  <div class="c-device-monitor-group-1321317970">
    <div class="c-device-monitor-ellipse-container">
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970 {
  width: 22px;
  height: 16px;
  position: relative;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-container {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
}

.c-device-monitor-ellipse {
  display: inline-block;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-sm {
  width: calc(@fontSize * 0.046);
  height: calc(@fontSize * 0.046);
  min-width: 1px;
  min-height: 1px;
  background: currentColor;
  opacity: 0.5;
}

.c-device-monitor-ellipse-md {
  width: calc(@fontSize * 0.092);
  height: calc(@fontSize * 0.092);
  min-width: 2px;
  min-height: 2px;
  background: currentColor;
  opacity: 0.7;
}
</style>
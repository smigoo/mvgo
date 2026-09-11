<template>
  <div class="c-device-monitor-group-1321317970-j">
    <div class="c-device-monitor-ellipse-group">
      <span class="c-device-monitor-ellipse-dot c-device-monitor-ellipse-dot-sm"></span>
      <span class="c-device-monitor-ellipse-dot c-device-monitor-ellipse-dot-lg"></span>
      <span class="c-device-monitor-ellipse-dot c-device-monitor-ellipse-dot-sm"></span>
      <span class="c-device-monitor-ellipse-dot c-device-monitor-ellipse-dot-lg"></span>
      <span class="c-device-monitor-ellipse-dot c-device-monitor-ellipse-dot-lg"></span>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-j {
  width: 22px;
  height: 17px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-group {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
}

.c-device-monitor-ellipse-dot {
  border-radius: 50%;
  background: var(--colorPrimary, #1990ff);
  flex-shrink: 0;
}

.c-device-monitor-ellipse-dot-sm {
  width: 1px;
  height: 1px;
}

.c-device-monitor-ellipse-dot-lg {
  width: calc(@fontSize * 0.09);
  height: calc(@fontSize * 0.09);
  min-width: 1px;
  min-height: 1px;
}
</style>
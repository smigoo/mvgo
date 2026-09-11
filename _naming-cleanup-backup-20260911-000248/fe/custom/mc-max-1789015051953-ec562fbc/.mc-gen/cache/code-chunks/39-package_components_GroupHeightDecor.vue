<template>
  <div class="c-device-monitor-group-height-decor">
    <!-- 此子组件为高度装饰占位组件，对应 Group 1321317970 系列节点 -->
    <!-- 这些节点在 Figma 中是装饰性椭圆组合，尺寸约 22x16px -->
    <div class="c-device-monitor-group-1321317970">
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot-sm"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot-lg"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot-sm"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot-lg"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot-lg"></span>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-height-decor {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 16px;
  flex-shrink: 0;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  align-items: center;
  gap: 1px;
  width: 100%;
  height: 100%;
}

.c-device-monitor-group-1321317970-dot {
  display: inline-block;
  border-radius: 50%;
  background: @color-primary;
  flex-shrink: 0;
}

.c-device-monitor-group-1321317970-dot-sm {
  width: calc(@fontSize * 0.45);
  height: calc(@fontSize * 0.45);
  opacity: 0.6;
}

.c-device-monitor-group-1321317970-dot-lg {
  width: calc(@fontSize * 0.9);
  height: calc(@fontSize * 0.9);
  opacity: 0.9;
}
</style>
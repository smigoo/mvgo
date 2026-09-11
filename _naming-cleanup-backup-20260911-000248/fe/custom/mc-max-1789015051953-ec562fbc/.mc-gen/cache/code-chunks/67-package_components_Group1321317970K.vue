<template>
  <div class="c-device-monitor-group-1321317970-k">
    <div class="c-device-monitor-ellipse-container">
      <div class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></div>
      <div class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></div>
      <div class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></div>
      <div class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></div>
      <div class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></div>
    </div>
  </div>
</template>

<script setup>
// 此组件对应 Figma Group 1321317970，为设备卡片图标区域的装饰性椭圆点组
// 按 Figma 数据：5个椭圆，小圆0.65px，大圆1.29px，总尺寸约22×16px
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-k {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 17px;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-container {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
}

.c-device-monitor-ellipse {
  border-radius: 50%;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-sm {
  width: 1px;
  height: 1px;
  background: @color-primary;
  opacity: 0.6;
}

.c-device-monitor-ellipse-md {
  width: 2px;
  height: 2px;
  background: @color-primary;
  opacity: 0.8;
}
</style>
<template>
  <div class="c-device-monitor-group-light-decor">
    <!-- 装饰性光效组件，渲染设备类型监测网格中的装饰椭圆群 -->
    <div class="c-device-monitor-group-1321317970">
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-sm"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
      <span class="c-device-monitor-ellipse c-device-monitor-ellipse-md"></span>
    </div>
  </div>
</template>

<script setup>
// 装饰性光效子组件，无业务逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-light-decor {
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

.c-device-monitor-ellipse {
  display: inline-block;
  border-radius: 50%;
  background: var(--colorPrimary, #1990ff);
  opacity: 0.6;
  flex-shrink: 0;
}

.c-device-monitor-ellipse-sm {
  width: calc(@fontSize * 0.46);
  height: calc(@fontSize * 0.46);
}

.c-device-monitor-ellipse-md {
  width: calc(@fontSize * 0.92);
  height: calc(@fontSize * 0.92);
}
</style>
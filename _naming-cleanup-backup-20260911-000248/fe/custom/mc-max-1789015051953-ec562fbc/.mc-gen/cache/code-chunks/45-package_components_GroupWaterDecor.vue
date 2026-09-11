<template>
  <div class="c-device-monitor-group-water-decor">
    <!-- 这是一个装饰性占位组件，对应 Group 1321317970 水波/装饰图形节点 -->
    <!-- 该节点包含若干小椭圆装饰点（Ellipse 4789/4790/4791/4792/4793），纯装饰用途 -->
    <div class="c-device-monitor-group-1321317970">
      <span class="c-device-monitor-decor-dot c-device-monitor-decor-dot--sm"></span>
      <span class="c-device-monitor-decor-dot c-device-monitor-decor-dot--md"></span>
      <span class="c-device-monitor-decor-dot c-device-monitor-decor-dot--sm"></span>
      <span class="c-device-monitor-decor-dot c-device-monitor-decor-dot--md"></span>
      <span class="c-device-monitor-decor-dot c-device-monitor-decor-dot--md"></span>
    </div>
  </div>
</template>

<script setup>
// 纯装饰组件，无业务逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-water-decor {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 17px;
  flex-shrink: 0;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
}

.c-device-monitor-decor-dot {
  display: inline-block;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-device-monitor-decor-dot--sm {
  width: 1px;
  height: 1px;
  background: @color-primary;
  opacity: 0.6;
}

.c-device-monitor-decor-dot--md {
  width: 2px;
  height: 2px;
  background: @color-primary;
  opacity: 0.8;
}
</style>
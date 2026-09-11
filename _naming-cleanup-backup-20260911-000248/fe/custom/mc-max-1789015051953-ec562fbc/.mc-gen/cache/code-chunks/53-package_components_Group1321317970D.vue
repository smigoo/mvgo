<template>
  <div class="c-device-monitor-group-1321317970-d">
    <slot />
  </div>
</template>

<script setup>
// Group 1321317970D — 第4个同名分组，作为装饰性椭圆点阵容器
// 对应 Figma 节点 2:8692，包含两个装饰性椭圆元素
defineProps({
  items: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-d {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  width: 22px;
  height: 16px;
  flex-shrink: 0;
}
</style>
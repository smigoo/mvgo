<template>
  <div class="c-device-monitor-group-wind-decor">
    <slot />
  </div>
</template>

<script setup>
// 风速风向仪设备卡片装饰容器组件
// 对应 Figma 节点: Group 1321317970 (风速风向仪区域的装饰元素组)
defineProps({
  // 暂无外部属性，作为纯布局装饰容器使用
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-wind-decor {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 16px;
  flex-shrink: 0;
}
</style>
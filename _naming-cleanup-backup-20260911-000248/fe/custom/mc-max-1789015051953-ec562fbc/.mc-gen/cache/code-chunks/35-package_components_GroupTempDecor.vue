<template>
  <div class="c-device-monitor-group-temp-decor">
    <!-- 此组件为临时装饰占位组件，对应 section 2:8692 Group 1321317970 -->
    <!-- 该 section 为设备监测卡片区域的装饰性元素组 -->
    <slot />
  </div>
</template>

<script setup>
// 装饰性占位组件，用于组装 section 2:8692 (Group 1321317970)
// 该 section 含 2 个装饰元素，作为设备监测卡片的装饰层
defineProps({
  items: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-temp-decor {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-width: 0;
}
</style>
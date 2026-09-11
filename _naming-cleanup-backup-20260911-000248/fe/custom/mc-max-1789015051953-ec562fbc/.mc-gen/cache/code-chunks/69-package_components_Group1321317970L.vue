<template>
  <div class="c-device-monitor-group-1321317970">
    <slot />
  </div>
</template>

<script setup>
// 通用占位子组件，作为 Group 1321317970 系列的最后一个实例（第41个 section）
// 对应 figma 节点 2:8779，含 2 个元素（装饰性椭圆节点组）
defineProps({
  items: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  width: 100%;
}
</style>
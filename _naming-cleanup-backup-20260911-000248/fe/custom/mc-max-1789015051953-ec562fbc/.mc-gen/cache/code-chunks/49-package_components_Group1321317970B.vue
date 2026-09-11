<template>
  <div class="c-device-monitor-group-1321317970-b">
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-b {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-width: 0;
}
</style>
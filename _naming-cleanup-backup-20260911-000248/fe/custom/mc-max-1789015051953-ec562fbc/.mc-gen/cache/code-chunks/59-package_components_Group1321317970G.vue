<template>
  <div class="c-device-monitor-group-1321317970-g">
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-g {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}
</style>
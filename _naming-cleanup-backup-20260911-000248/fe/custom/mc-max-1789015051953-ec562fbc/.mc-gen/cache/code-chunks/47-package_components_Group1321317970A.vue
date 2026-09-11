<template>
  <div class="c-device-monitor-group-1321317970-a">
    <slot />
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: [String, Number, Boolean, Object, Array],
    default: null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-1321317970-a {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-width: 0;
}
</style>
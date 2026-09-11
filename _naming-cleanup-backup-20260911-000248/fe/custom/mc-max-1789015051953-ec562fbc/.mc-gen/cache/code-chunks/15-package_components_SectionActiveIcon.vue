<template>
  <div class="c-device-monitor-active-icon-wrap">
    <img :src="icon1" class="c-device-monitor-tab-icon-img" alt="active icon" />
  </div>
</template>

<script setup>
// icon1 由系统自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-active-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  height: 28px;
  flex-shrink: 0;
}

.c-device-monitor-tab-icon-img {
  width: 35px;
  height: 28px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}
</style>
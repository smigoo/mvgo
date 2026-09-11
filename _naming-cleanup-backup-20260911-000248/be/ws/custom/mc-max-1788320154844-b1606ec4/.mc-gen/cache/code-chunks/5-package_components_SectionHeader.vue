<template>
  <div class="c-env-monitor-header-section">
    <img :src="icon1" class="c-env-monitor-header-icon" alt="signal" />
    <div class="c-env-monitor-header-line"></div>
  </div>
</template>

<script setup>
// icon1 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 28px;
  flex-shrink: 0;
}

.c-env-monitor-header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.c-env-monitor-header-line {
  flex: 1;
  height: 6px;
  background: #559eff;
  margin-left: 8px;
}
</style>
<template>
  <div class="c-env-monitor-section-header">
    <div class="c-env-monitor-header-dot">
      <span class="c-env-monitor-header-dot-outer"></span>
      <span class="c-env-monitor-header-dot-inner"></span>
      <span class="c-env-monitor-header-dot-highlight"></span>
    </div>
  </div>
</template>

<script setup>
// SectionHeader 仅承载标题栏左侧装饰圆点，无业务逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-section-header {
width: 100%;

  display: flex;
  align-items: center;
  flex: 1 1 0;
}

.c-env-monitor-header-dot {
  position: relative;
  width: 8px;
  height: 8px;
  flex-shrink: 0;

  &-outer {
    position: absolute;
    top: 0;
    left: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #000000; /* Figma fills[0].;color: SOLID #000000 */;
  }

  &-inner {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: linear-gradient(180deg, #1252fa 0%, #d6effc 100%); /* Figma GRADIENT_LINEAR #1252fa → #d6effc */;
  }

  &-highlight {
    position: absolute;
    top: 2.2px;
    left: 2.2px;
    width: 2.4px;
    height: 2.4px;
    border-radius: 50%;
    background: #559eff; /* Figma fills[0].;color: SOLID #559eff */;
  }
}
</style>
<template>
  <div class="c-env-monitor-header-decor">
    <span class="c-env-monitor-header-dot"></span>
    <span class="c-env-monitor-header-line"></span>
  </div>
</template>

<script setup>
// SectionHeader 仅渲染标题栏左侧装饰元素，标题文字由 base-panel 自动展示
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-decor {
  display: flex;
  align-items: center;
  width: 100%;
  /* 不设置 background/border/border-radius，保持透明容器 */
}

.c-env-monitor-header-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  background: linear-gradient(#1252fa 0%, #d6effc 100%);
  border-radius: 50%;
  /* 圆点渐变来自 Figma: GRADIENT_LINEAR #1252fa → #d6effc */
}

.c-env-monitor-header-line {
  flex: 1;
  height: 6px;
  background: #559eff;
  /* 装饰线颜色来自 Figma: GRADIENT_LINEAR #559eff 0% → #559eff 100%（两色标相同视为纯色） */
}
</style>
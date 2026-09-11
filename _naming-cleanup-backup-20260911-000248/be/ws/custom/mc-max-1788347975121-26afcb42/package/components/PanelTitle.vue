<template>
  <div class="c-env-monitor-panel-title">
    <div class="c-env-monitor-panel-title__indicator">
      <span class="c-env-monitor-panel-title__indicator-ring"></span>
      <span class="c-env-monitor-panel-title__indicator-core"></span>
    </div>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    <span class="c-env-monitor-panel-title__bar"></span>
  </div>
</template>

<script setup>
// 面板标题子组件：装饰圆点 + 渐变标题文字 + 渐变装饰条
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  flex-shrink: 0;
  overflow: hidden;
  font-family: 'Noto Sans SC', sans-serif;

  &__indicator {
    position: relative;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
  }

  &__indicator-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 8px;
    height: 8px;
    background: #000000;
    border-radius: 50%;
  }

  &__indicator-core {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 6px;
    height: 6px;
    background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
    border-radius: 50%;
  }

  &__text {
    font-size: calc(var(--fontSize, 14px) * 1.14);
    font-weight: 700;
    line-height: 19px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__bar {
    flex: 1;
    height: 6px;
    background: #559eff;
    border-radius: 3px;
    min-width: 20px;
  }
}
</style>
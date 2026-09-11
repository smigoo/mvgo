<template>
  <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-title-section">
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-title-wrapper">
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-title-icon">
        <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-circle"></div>
      </div>
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-title-line"></div>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    </div>
  </div>
</template>

<script setup>
// 标题组件无需额外逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-title-section {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 28px;
  margin-bottom: 8px;
}

.c-env-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.c-env-monitor-title-icon {
  position: relative;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.c-env-monitor-icon-circle {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(180deg, #1252fa 0%, #d6effc 100%);
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2.4px;
    height: 2.4px;
    background: #559eff;
    border-radius: 50%;
  }
}

.c-env-monitor-title-line {
  flex: 1;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
  border-radius: 3px;
  min-width: 0;
}

.c-env-monitor-title-text {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
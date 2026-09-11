<template>
  <div class="c-env-monitor-section-header" aria-hidden="true">
    <span class="c-env-monitor-header-icon"></span>
  </div>
</template>

<script setup>
// 标题栏左侧装饰图标：对应 Figma header.g 节点（8×8 渐变同心圆）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-section-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 100%;
  line-height: 1;
}

// 8×8 外层圆形（Figma fills[0]: SOLID #000000）
.c-env-monitor-header-icon {
  position: relative;
  display: inline-block;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #000000;

  // 内层 6×6 蓝色渐变圆
  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
    transform: translate(-50%, -50%);
  }

  // 中心高光点 2×2（Figma path：SOLID #559eff）
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: #559eff;
    transform: translate(-50%, -50%);
  }
}
</style>
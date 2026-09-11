<template>
  <div class="c-device-monitor-header">
    <!-- 左侧：菱形装饰 + 标题 -->
    <div class="c-device-monitor-header-left">
      <div class="c-device-monitor-header-diamond"></div>
      <span class="c-device-monitor-header-title">设备监测</span>
    </div>
    <!-- 底部蓝色渐变分隔线通过伪元素实现 -->
  </div>
</template>

<script setup>
// SectionHeader 组件：展示面板标题栏（菱形装饰 + "设备监测" 标题 + 底部渐变分隔线）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-header {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 30px;
  flex-shrink: 0;
  padding-bottom: 6px;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 362px;
    height: 6px;
    background: linear-gradient(90deg, @color-divider-start 0%, @color-divider-end 100%);
  }
}

.c-device-monitor-header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.c-device-monitor-header-diamond {
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  transform: rotate(45deg);
  flex-shrink: 0;
}

.c-device-monitor-header-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 700;
  line-height: 19px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}
</style>
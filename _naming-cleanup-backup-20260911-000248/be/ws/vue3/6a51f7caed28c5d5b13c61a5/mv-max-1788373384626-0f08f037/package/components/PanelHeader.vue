<template>
  <!-- 面板标题区：左侧装饰图标 + 标题文字 -->
  <div class="panel-header">
    <!-- 装饰图标（8×8 圆形渐变） -->
    <div class="panel-header-icon"></div>
    <!-- 标题文字（蓝色渐变） -->
    <div class="panel-header-title">环境监测</div>
  </div>
</template>

<script setup>
// 纯展示组件，无需响应式数据
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 标题区容器：横向排列图标与文字
.panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

// 装饰图标：8×8 圆形，蓝色渐变填充
.panel-header-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  flex-shrink: 0;
}

// 标题文字：16px 加粗，蓝色渐变
.panel-header-title {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 19px;
}
</style>
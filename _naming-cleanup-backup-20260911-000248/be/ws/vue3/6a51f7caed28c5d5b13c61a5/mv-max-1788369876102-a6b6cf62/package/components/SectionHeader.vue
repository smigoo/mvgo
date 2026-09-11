<template>
  <!-- 环境监测标题栏：渲染标题装饰图标、标题文字、底部渐变分隔线 -->
  <div class="section-header">
    <!-- 标题装饰图标（CSS渐变菱形） -->
    <div class="header-icon"></div>
    <!-- 标题文字 -->
    <div class="header-title">环境监测</div>
    <!-- 底部渐变分隔线 -->
    <div class="header-divider"></div>
  </div>
</template>

<script setup>
// 环境监测标题栏子组件
// 用途：渲染面板顶部标题区域，包含装饰图标、标题文字、底部渐变分隔线
// 数据来源：静态内容，无需外部数据注入
// 关键交互：无交互，纯展示
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 0;
  position: relative;
}

// 标题左侧菱形装饰图标（渐变色）
.header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  border-radius: 2px;
  transform: rotate(45deg);
}

// 标题文字
.header-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 19px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.05em;
}

// 标题下方水平分隔线（渐变）
.header-divider {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: -8px;
  height: 1px;
  background: linear-gradient(90deg, rgba(85, 158, 255, 0.8) 0%, rgba(85, 158, 255, 0) 100%);
}
</style>
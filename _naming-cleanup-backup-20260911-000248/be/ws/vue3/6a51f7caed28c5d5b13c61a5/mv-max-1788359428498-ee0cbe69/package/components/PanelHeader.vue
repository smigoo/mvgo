<template>
  <!-- 面板标题行：左侧标题文字 + 装饰图标，水平布局 -->
  <div class="panel-header">
    <!-- 标题文字，渐变色 -->
    <span class="panel-header__title">环境监测</span>
    <!-- 装饰图标，使用 icon1 变量（系统自动注入） -->
    <img :src="icon1" class="panel-header__icon" alt="" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'


/**
 * PanelHeader 组件
 * 用途：面板标题行，显示"环境监测"标题文字和右侧装饰图标
 * 数据来源：静态文本，icon1 由系统注入
 * 关键交互：无
 */

// icon1 由系统通过 injectResourceImports 自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 面板标题行：水平排列，垂直居中对齐
.panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  // 根据 Figma header 节点高度还原
  height: 28px;

  // 标题文字：渐变色，Figma fills GRADIENT_LINEAR #1990ff → #5a7eff
  &__title {
    font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19px;
    // 渐变文字实现：background-clip: text
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }

  // 装饰图标：8×8px，紧靠标题右侧 4px
  &__icon {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    margin-left: 4px;
    object-fit: contain;
  }
}
</style>
<template>
  <div class="section-header">
    <!-- 左侧装饰图标（CSS 绘制，因原图缺失） -->
    <div class="header-icon"></div>
    <!-- 标题文本，带渐变效果 -->
    <div class="header-title">环境监测</div>
    <!-- 右侧渐变装饰线 -->
    <div class="header-line"></div>
  </div>
  <!-- 底部渐变装饰线 Vector 1484 -->
  <div class="header-bottom-line"></div>
</template>

<script setup>
/**
 * 环境监测面板 - 头部标题区子组件
 * 功能：展示面板标题"环境监测"，包含左侧装饰图标和右侧渐变线条
 * 交互：无（纯展示）
 */
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  padding: 10px 20px 0;
  box-sizing: border-box;
  position: relative;

  // 左侧装饰图标（CSS 伪元素绘制，还原 Figma 中的 g 节点）
  .header-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
    position: relative;
    flex-shrink: 0;
    margin-right: 8px;

    // 中心小圆点
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2.4px;
      height: 2.4px;
      border-radius: 50%;
      background: #559eff;
    }
  }

  // 标题文本（渐变文字，还原 Figma 中的 环境监测 文本节点）
  .header-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 19px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
    flex-shrink: 0;
    margin-right: 12px;
  }

  // 右侧渐变装饰线（还原 Figma 中的 Vector 1476 节点）
  .header-line {
    flex: 1;
    height: 6px;
    background: linear-gradient(90deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0) 100%);
    border-radius: 3px;
  }
}

/* [Style Refine] 添加底部渐变装饰线 Vector 1484 */
.header-bottom-line {
  width: calc(100% - 40px);
  height: 1px;
  margin: 0 20px;
  background: linear-gradient(90deg, rgba(85, 158, 255, 0.3), rgba(85, 158, 255, 0));
}</style>
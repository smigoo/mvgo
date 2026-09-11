<template>
  <div class="panel-header">
    <span class="panel-header__title">环境监测</span>
    <img :src="icon1" class="panel-header__icon" alt="装饰图标" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/g-7883.png'
/**
 * PanelHeader - 环境监测面板顶部标题区
 * 包含渐变标题文本与装饰图标
 */
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 28px;

  &__title {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19.2px;
    // 文本渐变色还原
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  &__icon {
    width: 8px;
    height: 8px;
    margin-left: 8px;
    object-fit: contain;
    flex-shrink: 0;
  }
}</style>
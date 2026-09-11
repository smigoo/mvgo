<template>
  <div class="section-header">
    <!-- 装饰性微元素图标 -->
    <img :src="icon1" class="header-icon" alt="装饰图标" />
    <!-- 面板主标题 -->
    <span class="header-title">流量监测</span>
  </div>
</template>

<script setup>
const icon1 = new URL('../../resources/images/g-3552.png', import .meta.url).href
/**
 * SectionHeader - 面板顶部标题区
 * 包含装饰图标与主标题“流量监测”
 * 图片变量 icon1 由系统自动注入，禁止手写 import
 */
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 顶部标题区容器，横向排列图标与文字
.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

// 装饰性微元素图标，保持原始 8x8 尺寸
.header-icon {
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

// 面板主标题文本样式
.header-title {
  font-size: 16px;
  font-weight: bold;
  color: #333333;
  line-height: 24px;
}</style>
<template>
  <div class="section-header">
    <!-- 标题装饰图标组 -->
    <div class="header-icon-group" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '426px 91px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <img :src="icon1" class="header-icon-dot" alt="" />
      <img :src="icon3" class="header-icon-path" alt="" />
    </div>
    <!-- 面板标题文本 -->
    <span class="header-title">流量监测</span>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/circle-3553.png'
import icon3 from '../../resources/images/path-3555.png'

/**
 * SectionHeader - 面板顶部标题区
 * 包含装饰性图标（圆点+路径）和主标题"流量监测"
 * 图标资源由系统自动注入，直接使用变量名引用
 */

// 图标资源变量（系统自动注入，无需手动 import）
// icon1: circle-3553.png (8x8 装饰圆点)
// icon3: path-3555.png (2x2 装饰路径)

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 顶部标题区容器 - 横向排列图标和标题
.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12px 16px;
  gap: 8px;
}

// 装饰图标组 - 包含圆点和路径微元素
.header-icon-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

// 装饰圆点图标 (8x8)
.header-icon-dot {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

// 装饰路径图标 (2x2)
.header-icon-path {
  width: 2px;
  height: 2px;
  object-fit: contain;
}

// 主标题文本样式
.header-title {
  font-size: 18px;
  font-weight: bold;
  color: #333333;
  line-height: 1.4;
}</style>
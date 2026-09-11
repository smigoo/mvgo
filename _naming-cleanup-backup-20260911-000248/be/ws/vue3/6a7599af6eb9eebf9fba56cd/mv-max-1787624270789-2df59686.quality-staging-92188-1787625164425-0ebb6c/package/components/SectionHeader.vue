<template>
  <div class="section-header">
    <!-- 状态图标：8×8 装饰圆点，使用系统注入的 icon1 变量 -->
    <img :src="icon1" alt="" class="section-header-icon" />
    <!-- 标题文本：渐变文字，逐字符与 Figma 一致 -->
    <span class="section-header-title">环境监测</span>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/g-7883.png'

// 组件用途：环境监测面板标题区，展示状态图标与“环境监测”文本
// 数据来源：静态文案；图标由系统按资源映射自动注入
// 关键交互：无交互，纯展示
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.section-header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
}

.section-header-title {
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  /* Figma 文本填充为线性渐变 #1990ff → #5a7eff，使用 background-clip 还原 */
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}</style>
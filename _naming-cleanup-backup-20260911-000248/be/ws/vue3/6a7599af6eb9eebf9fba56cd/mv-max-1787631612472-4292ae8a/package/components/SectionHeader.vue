<template>
  <div class="section-header">
    <!-- 信号图标：由系统注入 icon1 -->
    <img :src="icon1" class="header-icon" alt="信号图标" />
    <!-- 标题文字：环境监测 -->
    <h1 class="header-title">环境监测</h1>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/g-7883.png'

// 子组件：环境监测面板顶部标题区
// 功能：展示信号图标与标题文字，标题采用渐变文字还原设计稿
// 数据来源：静态展示，无 props / emits
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-header {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  gap: 8px; /* 图标与标题间距 8px，对应 Figma marginRight */;
  padding-bottom: 8px; /* 为底部装饰线预留空间，保证总高度与设计一致 */;

  /* 底部装饰线：还原 Figma 中渐变线条 */
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
    background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
    border-radius: 3px;
  }
}

.header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain; /* 保持图标原始比例，不拉伸 */;
}

.header-title {
  margin: 0;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  /* 标题渐变文字：对应 Figma 中 GRADIENT_LINEAR #1990ff → #5a7eff */
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}</style>
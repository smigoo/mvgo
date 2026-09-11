<template>
  <div class="c-env-monitor-section-header">
<img :src="icon1" class="c-env-monitor-header-icon" alt="信号图标" />
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'


// 资源变量 icon1 由系统自动注入（对应 icon-7941.png）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-section-header {
flex: 1 1 0;

  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.c-env-monitor-header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  display: block;
}

.c-env-monitor-header-title {
  font-size: calc(var(--fontSize, 14px) * 1.143); /* 16px = Figma 标题字号（var(--fontSize, 14px) 默认 14px） */;
  font-weight: 700;
  line-height: 1.2; /* Figma 行高 19.2px / 16px ≈ 1.2 */;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  /* Figma 渐变文字：#1990ff 0% → #5a7eff 100% */
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
</style>
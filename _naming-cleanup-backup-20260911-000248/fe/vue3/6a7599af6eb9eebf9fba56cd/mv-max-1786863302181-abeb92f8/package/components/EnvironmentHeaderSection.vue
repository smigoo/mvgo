<template>
  <section class="environment-header-section">
    <div class="section-debug-title">{{ title }}</div>
    <div class="environment-title-bar">
      <div class="title-line title-line--top"></div>
      <div class="title-content">
        <img class="title-decor-icon" :src="decorIcon" alt="" />
        <span class="title-text">环境监测</span>
      </div>
      <div class="title-line title-line--bottom"></div>
    </div>
  </section>
</template>

<script setup>
// 本子组件负责还原 figma-1 标题区域：包含 headerSlots 的标题文本，以及 Figma 标题栏中的装饰点、渐变线和“环境监测”标题。
// 装饰图标由主组件传入，图片资源变量在主组件中由平台自动注入，当前组件只消费 props，避免手写资源 import。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: 'cp-环境监测' },
  decorIcon: { type: String, default: '' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits([])
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.environment-header-section {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0 20px;
}

.section-debug-title {
  height: 0;
  overflow: hidden;
  font-size: 0;
  line-height: 0;
  color: transparent;
}

.environment-title-bar {
  position: relative;
  width: 100%;
  height: 41px;
  box-sizing: border-box;
  padding-top: 12px;
}

.title-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.title-decor-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
}

.title-text {
  display: inline-block;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', 'PingFang SC', Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: none;
  white-space: nowrap;
}

.title-line {
  position: absolute;
  left: 0;
  right: 3px;
  pointer-events: none;
}

.title-line--top {
  top: 26px;
  height: 1px;
  background: rgba(85, 158, 255, 0.38);
}

.title-line--bottom {
  top: 29px;
  width: calc(100% - 15px);
  height: 6px;
  /* Figma 中 Vector 1476 为蓝色渐变装饰线，使用伪线条还原，不额外引入缺失图片资源。 */
  background: linear-gradient(90deg, rgba(85, 158, 255, 0.9) 0%, rgba(85, 158, 255, 0.12) 100%);
  clip-path: polygon(0 0, 100% 0, 96% 100%, 0 100%);
}</style>
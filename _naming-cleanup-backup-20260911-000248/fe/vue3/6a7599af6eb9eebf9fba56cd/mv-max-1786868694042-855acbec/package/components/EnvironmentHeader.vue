<template>
  <section class="environment-header" :aria-label="title">
    <div class="environment-header__slot-title">{{ title }}</div>

    <div class="environment-header__content">
      <div class="environment-header__line environment-header__line--left"></div>
      <div class="environment-header__main">
        <img
          v-if="decorIcon"
          class="environment-header__decor-icon"
          :src="decorIcon"
          alt=""
        />
        <span v-else class="environment-header__decor-fallback" aria-hidden="true"></span>
        <h2 class="environment-header__display-title">{{ displayTitle }}</h2>
      </div>
      <div class="environment-header__line environment-header__line--right"></div>
    </div>
  </section>
</template>

<script setup>
// 本组件负责还原 Figma 中 figma-1 的标题栏区域：包含 headerSlots 标题、8px 装饰点与“环境监测”主标题。
// 装饰点图片由主组件通过 props 传入，组件内部不手写本地资源 import，确保符合资源注入规则。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: 'cp-环境监测' },
  displayTitle: { type: String, default: '环境监测' },
  decorIcon: { type: String, default: '' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['ready'])
// #endregion

// #region 3. 方法
const notifyReady = () => {
  // 标题组件挂载后向外通知，便于宿主在需要时统计各 section 渲染状态。
  emit('ready', { title: props.title, displayTitle: props.displayTitle })
}
// #endregion

// #region 4. 生命周期
notifyReady()
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.environment-header {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.environment-header__slot-title {
  height: 0;
  overflow: hidden;
  font-size: 0;
  line-height: 0;
}

.environment-header__content {
  width: 100%;
  height: 28.09px;
  position: relative;
  box-sizing: border-box;
}

.environment-header__main {
  position: absolute;
  left: 0;
  top: 8px;
  height: 19.2px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
  min-width: 0;
  z-index: 2;
}

.environment-header__decor-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
  display: block;
}

.environment-header__decor-fallback {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  /* 缺失资源时用 Figma 同色系渐变绘制小圆点，避免挪用其它业务图标。 */
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  position: relative;
}

.environment-header__decor-fallback::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 2.4px;
  height: 2.4px;
  border-radius: 50%;
  background: #559eff;
}

.environment-header__display-title {
  margin: 0;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  white-space: nowrap;
  /* Figma 标注标题为蓝色线性渐变，因此使用文字裁剪渐变真实还原。 */
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.environment-header__line {
  position: absolute;
  left: 0;
  right: 5px;
  bottom: 0;
  height: 6px;
  pointer-events: none;
  /* 标题栏底部线条来自 Vector 1476，按 Figma 蓝色渐变直接绘制。 */
  background: linear-gradient(90deg, rgba(85, 158, 255, 0) 0%, #559eff 7%, #559eff 100%);
  clip-path: polygon(0 50%, 83% 50%, 86% 0, 100% 0, 100% 100%, 0 100%);
  opacity: 0.95;
}

.environment-header__line--left {
  z-index: 1;
}

.environment-header__line--right {
  display: none;
}</style>
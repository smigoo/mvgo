<template>
  <div
    class="c-env-monitor-section-header"
    :style="{
      backgroundImage: `url(${bg1})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div class="c-env-monitor-section-header__main">
      <div class="c-env-monitor-section-header__icon">
        <span class="c-env-monitor-section-header__icon-dot"></span>
        <span class="c-env-monitor-section-header__icon-core"></span>
      </div>
      <span class="c-env-monitor-section-header__title" :style="titleStyle">{{ title }}</span>
    </div>
    <div class="c-env-monitor-section-header__line"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const title = ref('环境监测')

const titleStyle = computed(() => ({
  background: 'linear-gradient(90deg, #1990ff 0%, #5a7eff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text'
}))
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-section-header {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 28px;
  flex-shrink: 0;
  box-sizing: border-box;
  overflow: hidden;
  /* 背景图由模板 :style 绑定，此处不再叠加 background/border/shadow */
}

.c-env-monitor-section-header__main {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  height: 100%;
  flex-shrink: 0;
}

.c-env-monitor-section-header__icon {
  position: relative;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.c-env-monitor-section-header__icon-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #000000;
}

.c-env-monitor-section-header__icon-core {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(180deg, #1252fa 0%, #d6effc 100%);
}

.c-env-monitor-section-header__title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: calc(@fontSize * 1.142857);
  font-weight: 700;
  line-height: calc(@fontSize * 1.371429);
  text-align: left;
  white-space: nowrap;
}

.c-env-monitor-section-header__line {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(85, 158, 255, 0) 0%, #559eff 20%, #559eff 80%, rgba(85, 158, 255, 0) 100%);
  opacity: 0.5;
}
</style>
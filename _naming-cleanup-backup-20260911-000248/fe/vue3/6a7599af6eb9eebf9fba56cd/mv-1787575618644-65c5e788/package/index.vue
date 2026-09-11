<template>
  <div class="info-panel" :style="panelStyle">
    <div class="info-panel__header">
      <img class="info-panel__icon" :src="icon1" alt="icon" />
      <span class="info-panel__title">{{ businessProps.title }}</span>
    </div>
    <div class="info-panel__body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
const icon1 = new URL('../resources/images/g-3552.png', import.meta.url).href
const bg1 = new URL('../resources/images/bg-_m-34.png', import.meta.url).href
import { onMounted, computed} from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const panelStyle = computed(() => ({
  backgroundImage: `url(${bg1})`,
}))

onMounted(() => {
  runtimeBuilder.publishEvent('InfoPanel-onload', {
    title: businessProps.title,
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.info-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--mc-border-color);
  }

  &__icon {
    width: 24px;
    height: 24px;
    margin-right: 8px;
  }

  &__title {
    font-size: 16px;
    font-weight: bold;
    color: var(--mc-text-primary);
  }

  &__body {
    flex: 1;
    padding: 16px;
    overflow: auto;
  }
}</style>